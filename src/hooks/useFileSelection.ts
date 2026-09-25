import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import type { ExcelFileSelection } from '@shared/api';
import { formatFileSize } from '@/utils/format';

export type FileSelectionStatus = 'idle' | 'selecting' | 'selected' | 'rejected';

export interface FileSelectionController {
  status: FileSelectionStatus;
  /** Metadata of the accepted spreadsheet; `null` until a valid file is chosen. */
  file: ExcelFileSelection | null;
  isBusy: boolean;
  browse: () => Promise<void>;
  /** Handles a drag & drop gesture coming from the file import card. */
  acceptDroppedFiles: (dropped: FileList | null) => Promise<void>;
  clear: () => void;
}

/**
 * Owns the "which spreadsheet did the user pick?" state for the current session.
 *
 * Only the trusted main process decides whether a file is acceptable; this hook
 * relays the outcome to the UI and turns it into consistent notifications.
 * Workbook parsing is deliberately out of scope for Stage 1.
 */
export function useFileSelection(): FileSelectionController {
  const { notify } = useToast();
  const [status, setStatus] = useState<FileSelectionStatus>('idle');
  const [file, setFile] = useState<ExcelFileSelection | null>(null);

  const applySelection = useCallback(
    (selection: ExcelFileSelection) => {
      setFile(selection);
      setStatus('selected');
      notify({
        variant: 'success',
        title: 'Spreadsheet selected',
        description: `${selection.name} · ${formatFileSize(selection.sizeInBytes)}. Parsing and analysis arrive in a later stage.`,
      });
    },
    [notify],
  );

  const rejectSelection = useCallback(
    (message: string) => {
      setFile(null);
      setStatus('rejected');
      notify({ variant: 'error', title: 'File not accepted', description: message });
    },
    [notify],
  );

  const browse = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge) {
      setStatus(file ? 'selected' : 'idle');
      notify({
        variant: 'warning',
        title: 'Desktop shell unavailable',
        description: 'File selection needs the Electron application. Start it with "npm run dev".',
      });
      return;
    }

    setStatus('selecting');
    try {
      const result = await bridge.excel.browse();
      switch (result.status) {
        case 'selected':
          applySelection(result.file);
          break;
        case 'cancelled':
          setStatus(file ? 'selected' : 'idle');
          break;
        case 'rejected':
          rejectSelection(result.message);
          break;
      }
    } catch {
      setStatus(file ? 'selected' : 'idle');
      notify({
        variant: 'error',
        title: 'File picker failed',
        description: 'The system file dialog could not be opened. Please try again.',
      });
    }
  }, [applySelection, file, notify, rejectSelection]);

  const acceptDroppedFiles = useCallback(
    async (dropped: FileList | null) => {
      const bridge = getDesktopBridge();
      const droppedFiles = dropped ? Array.from(dropped) : [];

      if (droppedFiles.length === 0) {
        notify({
          variant: 'warning',
          title: 'Nothing to analyse',
          description: 'The dropped items did not include a spreadsheet file.',
        });
        return;
      }
      if (droppedFiles.length > 1) {
        notify({
          variant: 'warning',
          title: 'One file at a time',
          description: 'Please drop a single Excel workbook.',
        });
        return;
      }
      if (!bridge) {
        notify({
          variant: 'warning',
          title: 'Desktop shell unavailable',
          description: 'Drag & drop needs the Electron application. Start it with "npm run dev".',
        });
        return;
      }

      const [droppedFile] = droppedFiles;
      if (!droppedFile) {
        return;
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
        return;
      }

      setStatus('selecting');
      try {
        const result = await bridge.excel.validatePath(filePath);
        if (result.status === 'selected') {
          applySelection(result.file);
        } else {
          rejectSelection(result.message);
        }
      } catch {
        setStatus(file ? 'selected' : 'idle');
        notify({
          variant: 'error',
          title: 'File not accepted',
          description: 'The dropped file could not be validated.',
        });
      }
    },
    [applySelection, file, notify, rejectSelection],
  );

  const clear = useCallback(() => {
    setFile(null);
    setStatus('idle');
    notify({ variant: 'info', title: 'Selection cleared' });
  }, [notify]);

  return useMemo(
    () => ({
      status,
      file,
      isBusy: status === 'selecting',
      browse,
      acceptDroppedFiles,
      clear,
    }),
    [status, file, browse, acceptDroppedFiles, clear],
  );
}
