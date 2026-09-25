import { useCallback } from 'react';
import {
  CloudUpload,
  FileSpreadsheet,
  FolderOpen,
  Info,
  Table2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { ImportProgressPanel } from '@/components/dashboard/ImportProgressPanel';
import { useAnalytics, type SessionState } from '@/state/AnalyticsProvider';
import { useDataset } from '@/state/DatasetProvider';
import { EXCEL_EXTENSION_LABEL } from '@/lib/excel';
import type { ExcelFileSelection } from '@shared/api';
import { IMPORT_FIELD_LABELS, type ImportOutcome, type ImportStatistics } from '@shared/import';
import { formatAmountMinor, formatCount, formatDateTimeLocal, formatFileSize } from '@/utils/format';

interface FileImportCardProps {
  /** Called after every import attempt so the page can react (e.g. navigate). */
  onImported?: (outcome: ImportOutcome) => void;
  /** Opens the Data screen; only used once records are available. */
  onOpenData?: () => void;
}

/**
 * Primary import surface.
 *
 * It mirrors the real import state: the loading panel, the loaded file summary,
 * the empty-workbook notice and the validation errors all come from the dataset
 * provider, which only ever receives results from the main process.
 */
export function FileImportCard({ onImported, onOpenData }: FileImportCardProps) {
  const {
    status,
    file,
    dataset,
    sheetName,
    progress,
    error,
    emptyStatistics,
    loadedAt,
    isBusy,
    importFromDialog,
    importDroppedFiles,
    clearDataset,
    dismissError,
  } = useDataset();

  const { session } = useAnalytics();

  const browse = useCallback(async () => {
    const outcome = await importFromDialog();
    onImported?.(outcome);
  }, [importFromDialog, onImported]);

  const drop = useCallback(
    async (files: FileList) => {
      const outcome = await importDroppedFiles(files);
      onImported?.(outcome);
    },
    [importDroppedFiles, onImported],
  );

  const retainedError = error && dataset ? error : null;

  return (
    <div className="flex flex-col gap-4">
      <FileDropZone
        label="Excel file drop zone"
        disabled={isBusy}
        onFilesDropped={(files) => {
          void drop(files);
        }}
      >
        {isBusy ? (
          <ImportProgressPanel progress={progress} selecting={status === 'selecting'} />
        ) : dataset && file ? (
          <LoadedFilePanel
            file={dataset.file}
            sheetName={sheetName ?? dataset.sheetName}
            statistics={dataset.statistics}
            loadedAt={loadedAt}
            session={session}
            isBusy={isBusy}
            onBrowse={browse}
            onClear={clearDataset}
            onOpenData={onOpenData}
          />
        ) : emptyStatistics ? (
          <EmptyWorkbookPanel
            file={file}
            sheetName={sheetName}
            statistics={emptyStatistics}
            onBrowse={browse}
          />
        ) : error ? (
          <ErrorState
            title={error.title}
            message={error.message}
            items={error.missingFields.map((field) => IMPORT_FIELD_LABELS[field])}
            itemsLabel="Missing required columns"
            onDismiss={dismissError}
            action={
              <Button variant="secondary" icon={FolderOpen} onClick={() => void browse()}>
                Choose another file
              </Button>
            }
          />
        ) : (
          <ImportPrompt isBusy={isBusy} onBrowse={browse} />
        )}
      </FileDropZone>

      {retainedError && (
        <ErrorState
          title={`${retainedError.title} — the current dataset was kept`}
          message={`${retainedError.message} Your previously imported records are still loaded and unchanged.`}
          items={retainedError.missingFields.map((field) => IMPORT_FIELD_LABELS[field])}
          itemsLabel="Missing required columns"
          onDismiss={dismissError}
        />
      )}
    </div>
  );
}

interface ImportPromptProps {
  isBusy: boolean;
  onBrowse: () => void;
}

function ImportPrompt({ isBusy, onBrowse }: ImportPromptProps) {
  return (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-card bg-accent-decorative transition-transform duration-200 ease-smooth group-hover/drop:scale-105">
        <CloudUpload className="h-7 w-7 text-accent" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight text-content">Upload your Excel file</h2>
      <p className="text-[13px] text-content-secondary">Drag &amp; drop your spreadsheet here</p>
      <p className="text-[11px] uppercase tracking-wider text-content-muted">or</p>
      <Button icon={FolderOpen} loading={isBusy} onClick={onBrowse}>
        Browse Excel File
      </Button>
      <p className="text-[11px] text-content-muted">Supported formats: {EXCEL_EXTENSION_LABEL}</p>
    </>
  );
}

interface LoadedFilePanelProps {
  file: ExcelFileSelection;
  sheetName: string;
  statistics: ImportStatistics;
  /** When the records currently loaded were read. */
  loadedAt: number | null;
  /** What the user is looking at, so the source card can say it. */
  session: SessionState;
  isBusy: boolean;
  onBrowse: () => void;
  onClear: () => void;
  onOpenData?: () => void;
}

function LoadedFilePanel({
  file,
  sheetName,
  statistics,
  loadedAt,
  session,
  isBusy,
  onBrowse,
  onClear,
  onOpenData,
}: LoadedFilePanelProps) {
  return (
    <div className="w-full text-left" data-source-card data-session-state={session.id}>
      <div className="flex items-center gap-4 rounded-card border border-surface-border bg-surface p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-decorative">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-content" title={file.name}>
            {file.name}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
            <Badge variant={session.tone === 'warning' ? 'warning' : session.tone === 'accent' ? 'accent' : 'neutral'}>
              {session.label}
            </Badge>
            <span>Loaded {formatDateTimeLocal(loadedAt)}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
            <Badge variant="accent">{file.extension.toUpperCase()}</Badge>
            <span>{formatFileSize(file.sizeInBytes)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {formatCount(statistics.importedRecords)}{' '}
              {statistics.importedRecords === 1 ? 'record' : 'records'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatAmountMinor(statistics.totalAmountMinor)}</span>
          </p>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-content-muted">Worksheet</dt>
          <dd className="truncate font-medium text-content-secondary">{sheetName}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-content-muted">Empty rows ignored</dt>
          <dd className="tabular-nums text-content-secondary">
            {formatCount(statistics.emptyRowsIgnored)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-content-muted">Records with a valid amount</dt>
          <dd className="tabular-nums text-content-secondary">
            {formatCount(statistics.recordsWithAmount)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-content-muted">Records needing attention</dt>
          <dd className="tabular-nums text-content-secondary">
            {formatCount(statistics.recordsWithIssues)}
          </dd>
        </div>
      </dl>

      {statistics.recordsWithIssues > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-control border border-warning/30 bg-warning/5 p-2.5 text-[11px] text-content-secondary">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {formatCount(statistics.recordsWithIssues)}{' '}
            {statistics.recordsWithIssues === 1 ? 'record needs' : 'records need'} attention. Open the
            Data screen to review the affected rows.
          </span>
        </p>
      )}

      <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-content-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-muted" aria-hidden="true" />
        <span>
          Choosing another file replaces these records. If the new workbook cannot be read, the
          current dataset stays loaded. The original file is never modified.
        </span>
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onOpenData && (
          <Button icon={Table2} onClick={onOpenData}>
            Open Data screen
          </Button>
        )}
        <Button variant="secondary" icon={FolderOpen} loading={isBusy} onClick={onBrowse}>
          Change Excel File
        </Button>
        <Button variant="ghost" icon={X} onClick={onClear}>
          Clear data
        </Button>
      </div>
    </div>
  );
}

interface EmptyWorkbookPanelProps {
  file: ExcelFileSelection | null;
  sheetName: string | null;
  statistics: ImportStatistics;
  onBrowse: () => void;
}

function EmptyWorkbookPanel({ file, sheetName, statistics, onBrowse }: EmptyWorkbookPanelProps) {
  return (
    <div className="w-full max-w-xl text-left">
      <div className="flex items-center gap-4 rounded-card border border-surface-border bg-surface-elevated p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-decorative">
          <FileSpreadsheet className="h-5 w-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-content" title={file?.name}>
            {file?.name ?? 'Workbook'}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
            <Badge variant="warning">No records</Badge>
            <span>Worksheet {sheetName ?? '—'}</span>
            <span aria-hidden="true">·</span>
            <span>{formatCount(statistics.rowsScanned)} data rows scanned</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-content-muted">
        The workbook has the expected columns but no transaction rows below the header, so nothing
        was imported.
      </p>
      <div className="mt-4">
        <Button variant="secondary" icon={FolderOpen} onClick={onBrowse}>
          Choose another file
        </Button>
      </div>
    </div>
  );
}
