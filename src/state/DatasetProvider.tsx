import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import { formatCount } from '@/utils/format';
import type { ExcelFileSelection } from '@shared/api';
import type {
  ImportField,
  ImportOutcome,
  ImportProgress,
  ImportResult,
  ImportStatistics,
  ImportedWorkbook,
  WorksheetSummary,
} from '@shared/import';

/**
 * Central source of truth for everything related to the imported workbook.
 *
 * Only this provider holds the records; screens read them through `useDataset`,
 * so the dataset is never duplicated across components. Parsing itself happens
 * in the Electron main process — the renderer only ever receives the
 * normalized result of an import that succeeded.
 */

export type DatasetStatus = 'idle' | 'selecting' | 'importing' | 'ready' | 'empty' | 'error';

export interface DatasetError {
  title: string;
  message: string;
  /** Present when required columns are missing. */
  missingFields: ImportField[];
  /** Per-worksheet detail of the workbook that failed to import. */
  sheets: WorksheetSummary[];
  /** True while a previously imported dataset is still loaded. */
  datasetRetained: boolean;
}

export interface DatasetContextValue {
  status: DatasetStatus;
  /** File currently loaded, or the last file whose import failed. */
  file: ExcelFileSelection | null;
  /** Records and metadata of the last successful import. */
  dataset: ImportedWorkbook | null;
  /** Worksheets of the loaded workbook, for the worksheet selector. */
  sheets: WorksheetSummary[];
  sheetName: string | null;
  statistics: ImportStatistics | null;
  progress: ImportProgress | null;
  error: DatasetError | null;
  /** Statistics of a valid workbook that carried no usable rows. */
  emptyStatistics: ImportStatistics | null;
  isBusy: boolean;
  importFromDialog: () => Promise<ImportOutcome>;
  importDroppedFiles: (files: FileList | null) => Promise<ImportOutcome>;
  selectWorksheet: (sheetName: string) => Promise<ImportOutcome>;
  dismissError: () => void;
  clearDataset: () => void;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const { notify } = useToast();
  const [status, setStatus] = useState<DatasetStatus>('idle');
  const [file, setFile] = useState<ExcelFileSelection | null>(null);
  const [dataset, setDataset] = useState<ImportedWorkbook | null>(null);
  const [sheets, setSheets] = useState<WorksheetSummary[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<DatasetError | null>(null);
  const [emptyStatistics, setEmptyStatistics] = useState<ImportStatistics | null>(null);

  // Only one import runs at a time; the ref also guards against stale results.
  const importToken = useRef(0);

  const bridge = getDesktopBridge();

  /* ---------------------------------------------------------------------- */
  /* Import progress stream                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!bridge) {
      return;
    }
    const unsubscribe = bridge.excel.onImportProgress((next) => {
      setProgress((current) => {
        // Progress messages arrive per processed chunk; skipping the ones that
        // carry no new information keeps re-renders minimal.
        if (current && current.stage === next.stage && current.processed === next.processed) {
          return current;
        }
        return next;
      });
    });
    return unsubscribe;
  }, [bridge]);

  /* ---------------------------------------------------------------------- */
  /* Result handling                                                         */
  /* ---------------------------------------------------------------------- */

  const applyResult = useCallback(
    (result: ImportResult, token: number): ImportOutcome => {
      if (token !== importToken.current) {
        return 'failed';
      }
      setProgress(null);

      switch (result.status) {
        case 'imported': {
          const { workbook } = result;
          setDataset(workbook);
          setSheets(workbook.sheets);
          setSheetName(workbook.sheetName);
          setEmptyStatistics(null);
          setError(null);
          setStatus('ready');
          notify({
            variant: workbook.statistics.recordsWithIssues > 0 ? 'warning' : 'success',
            title: 'Excel file imported successfully',
            description: buildImportDescription(workbook.statistics, workbook.sheetName),
          });
          return 'imported';
        }

        case 'empty': {
          setDataset(null);
          setSheets(result.sheets);
          setSheetName(result.sheetName);
          setEmptyStatistics(result.statistics);
          setError(null);
          setStatus('empty');
          notify({
            variant: 'warning',
            title: 'No records found',
            description: `Worksheet "${result.sheetName}" is valid but contains no transaction rows.`,
          });
          return 'empty';
        }

        case 'invalid-headers': {
          setError({
            title: 'Required columns are missing',
            message: result.message,
            missingFields: result.missingRequiredFields,
            sheets: result.sheets,
            datasetRetained: dataset !== null,
          });
          setStatus(dataset ? 'ready' : 'error');
          notify({
            variant: 'error',
            title: 'Required columns are missing',
            description: dataset
              ? 'The current dataset is unchanged.'
              : `Worksheet "${result.sheets[0]?.name ?? 'unknown'}" does not contain the expected columns.`,
          });
          return 'invalid-headers';
        }

        case 'unreadable': {
          setError({
            title: 'Unable to read this Excel file',
            message: result.message,
            missingFields: [],
            sheets: [],
            datasetRetained: dataset !== null,
          });
          setStatus(dataset ? 'ready' : 'error');
          notify({
            variant: 'error',
            title: 'Import failed',
            description: dataset ? `${result.message} The current dataset is unchanged.` : result.message,
          });
          return 'unreadable';
        }
      }
    },
    [dataset, notify],
  );

  const runImport = useCallback(
    async (path: string, selection: ExcelFileSelection): Promise<ImportOutcome> => {
      if (!bridge) {
        notify({
          variant: 'warning',
          title: 'Desktop shell unavailable',
          description: 'Importing spreadsheets needs the Electron application. Start it with "npm run dev".',
        });
        return 'failed';
      }

      importToken.current += 1;
      const token = importToken.current;
      setFile(selection);
      setStatus('importing');
      setProgress({ stage: 'reading', message: 'Reading Excel file', reason: 'import' });

      try {
        const result = await bridge.excel.importWorkbook(path);
        return applyResult(result, token);
      } catch {
        setProgress(null);
        setError({
          title: 'Import failed',
          message: 'The workbook could not be processed. Please try again.',
          missingFields: [],
          sheets: [],
          datasetRetained: dataset !== null,
        });
        setStatus(dataset ? 'ready' : 'error');
        notify({
          variant: 'error',
          title: 'Import failed',
          description: 'The workbook could not be processed. Please try again.',
        });
        return 'failed';
      }
    },
    [applyResult, bridge, dataset, notify],
  );

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                 */
  /* ---------------------------------------------------------------------- */

  const importFromDialog = useCallback(async (): Promise<ImportOutcome> => {
    if (!bridge) {
      notify({
        variant: 'warning',
        title: 'Desktop shell unavailable',
        description: 'File selection needs the Electron application. Start it with "npm run dev".',
      });
      return 'failed';
    }

    setStatus(dataset ? 'ready' : 'idle');
    try {
      const browsed = await bridge.excel.browse();
      if (browsed.status === 'cancelled') {
        return 'cancelled';
      }
      if (browsed.status === 'rejected') {
        setError({
          title: 'File not accepted',
          message: browsed.message,
          missingFields: [],
          sheets: [],
          datasetRetained: dataset !== null,
        });
        setStatus(dataset ? 'ready' : 'error');
        notify({ variant: 'error', title: 'File not accepted', description: browsed.message });
        return 'failed';
      }
      return await runImport(browsed.file.path, browsed.file);
    } catch {
      notify({
        variant: 'error',
        title: 'File picker failed',
        description: 'The system file dialog could not be opened. Please try again.',
      });
      return 'failed';
    }
  }, [bridge, dataset, notify, runImport]);

  const importDroppedFiles = useCallback(
    async (dropped: FileList | null): Promise<ImportOutcome> => {
      const droppedFiles = dropped ? Array.from(dropped) : [];

      if (droppedFiles.length === 0) {
        notify({
          variant: 'warning',
          title: 'Nothing to analyse',
          description: 'The dropped items did not include a spreadsheet file.',
        });
        return 'failed';
      }
      if (droppedFiles.length > 1) {
        notify({
          variant: 'warning',
          title: 'One file at a time',
          description: 'Please drop a single Excel workbook.',
        });
        return 'failed';
      }
      if (!bridge) {
        notify({
          variant: 'warning',
          title: 'Desktop shell unavailable',
          description: 'Drag & drop needs the Electron application. Start it with "npm run dev".',
        });
        return 'failed';
      }

      const [droppedFile] = droppedFiles;
      if (!droppedFile) {
        return 'failed';
      }

      let filePath: string;
      try {
        filePath = bridge.excel.resolvePath(droppedFile);
      } catch {
        notify({
          variant: 'error',
          title: 'File not accepted',
          description: 'Only files stored on this computer can be analysed.',
        });
        return 'failed';
      }

      const validated = await bridge.excel.validatePath(filePath);
      if (validated.status === 'rejected') {
        setError({
          title: 'File not accepted',
          message: validated.message,
          missingFields: [],
          sheets: [],
          datasetRetained: dataset !== null,
        });
        setStatus(dataset ? 'ready' : 'error');
        notify({ variant: 'error', title: 'File not accepted', description: validated.message });
        return 'failed';
      }

      return runImport(validated.file.path, validated.file);
    },
    [bridge, dataset, notify, runImport],
  );

  const selectWorksheet = useCallback(
    async (nextSheetName: string): Promise<ImportOutcome> => {
      if (!bridge || !file || nextSheetName === sheetName) {
        return 'cancelled';
      }

      importToken.current += 1;
      const token = importToken.current;
      setStatus('importing');
      setProgress({
        stage: 'reading',
        message: 'Reading worksheet',
        reason: 'sheet',
      });

      try {
        const result = await bridge.excel.selectWorksheet(file.path, nextSheetName);
        return applyResult(result, token);
      } catch {
        setProgress(null);
        setStatus(dataset ? 'ready' : 'error');
        notify({
          variant: 'error',
          title: 'Worksheet could not be read',
          description: 'The previous worksheet stays loaded.',
        });
        return 'failed';
      }
    },
    [applyResult, bridge, dataset, file, notify, sheetName],
  );

  const dismissError = useCallback(() => {
    setError(null);
    setStatus((current) => (current === 'error' ? 'idle' : current));
  }, []);

  const clearDataset = useCallback(() => {
    importToken.current += 1;
    setDataset(null);
    setFile(null);
    setSheets([]);
    setSheetName(null);
    setEmptyStatistics(null);
    setError(null);
    setProgress(null);
    setStatus('idle');
    notify({ variant: 'info', title: 'Dataset cleared' });
  }, [notify]);


  const statistics = useMemo(() => dataset?.statistics ?? null, [dataset]);

  const value = useMemo<DatasetContextValue>(
    () => ({
      status,
      file,
      dataset,
      sheets,
      sheetName,
      statistics,
      progress,
      error,
      emptyStatistics,
      isBusy: status === 'importing' || status === 'selecting',
      importFromDialog,
      importDroppedFiles,
      selectWorksheet,
      dismissError,
      clearDataset,
    }),
    [
      status,
      file,
      dataset,
      sheets,
      sheetName,
      statistics,
      progress,
      error,
      emptyStatistics,
      importFromDialog,
      importDroppedFiles,
      selectWorksheet,
      dismissError,
      clearDataset,
    ],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset(): DatasetContextValue {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error('useDataset must be used inside <DatasetProvider>.');
  }
  return context;
}

/** Human readable import notification, e.g. "1,250 records loaded · Sheet1". */
function buildImportDescription(statistics: ImportStatistics, sheetName: string): string {
  const parts = [
    `${formatCount(statistics.importedRecords)} ${statistics.importedRecords === 1 ? 'record' : 'records'} loaded`,
    `worksheet "${sheetName}"`,
  ];
  if (statistics.recordsWithIssues > 0) {
    parts.push(
      `${formatCount(statistics.recordsWithIssues)} ${
        statistics.recordsWithIssues === 1 ? 'record needs' : 'records need'
      } attention`,
    );
  }
  return parts.join(' · ');
}
