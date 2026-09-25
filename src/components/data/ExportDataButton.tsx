import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { getDesktopBridge } from '@/lib/desktop-bridge';
import { useDataset } from '@/state/DatasetProvider';
import { useFilters } from '@/state/FilterProvider';
import {
  EXPORT_EMPTY_MESSAGE,
  EXPORT_FAILURE_MESSAGE,
  EXPORT_STAGE_MESSAGES,
  buildExportFileName,
  buildExportRows,
  type ExportStage,
} from '@shared/export';
import { cn } from '@/utils/cn';
import { formatCount } from '@/utils/format';

/**
 * Exports exactly the records that are on screen.
 *
 * The rows are prepared here from the authoritative filtered result set and sent
 * through the whitelisted bridge; the destination is chosen in the native save
 * dialog and the file is written in the main process. Cancelling the dialog is a
 * normal outcome — no notification is shown for it.
 */
export function ExportDataButton() {
  const { result, isFiltered } = useFilters();
  const { isBusy } = useDataset();
  const { notify } = useToast();
  const bridge = getDesktopBridge();

  const [stage, setStage] = useState<ExportStage | null>(null);
  const recordCount = result.count;
  const isExporting = stage !== null;
  const isDisabled = recordCount === 0 || isBusy || isExporting;

  // The main process reports which phase it reached; no percentage is invented.
  useEffect(() => {
    if (!bridge || !isExporting) {
      return;
    }
    return bridge.excel.onExportProgress((progress) => setStage(progress.stage));
  }, [bridge, isExporting]);

  const exportData = useCallback(async (): Promise<void> => {
    if (isDisabled) {
      return;
    }
    if (!bridge) {
      notify({
        variant: 'warning',
        title: 'Desktop shell unavailable',
        description: 'Exporting needs the Electron application. Start it with "npm run dev".',
      });
      return;
    }

    setStage('preparing');
    try {
      const outcome = await bridge.excel.exportFilteredData({
        rows: buildExportRows(result.records),
        suggestedFileName: buildExportFileName({ filtered: isFiltered }),
        filtered: isFiltered,
      });

      switch (outcome.status) {
        case 'exported':
          notify({
            variant: 'success',
            title: 'Export completed successfully.',
            description: `${formatCount(outcome.recordCount)} ${
              outcome.recordCount === 1 ? 'record' : 'records'
            } exported to "${outcome.fileName}".`,
          });
          break;
        case 'cancelled':
          // Normal user behaviour: nothing happened, so nothing is announced.
          break;
        case 'empty':
          notify({ variant: 'warning', title: 'Nothing to export', description: EXPORT_EMPTY_MESSAGE });
          break;
        case 'failed':
          notify({ variant: 'error', title: 'Export failed', description: outcome.message });
          break;
      }
    } catch {
      notify({ variant: 'error', title: 'Export failed', description: EXPORT_FAILURE_MESSAGE });
    } finally {
      setStage(null);
    }
  }, [bridge, isDisabled, isFiltered, notify, result.records]);

  const helperText = (() => {
    if (recordCount === 0) {
      return EXPORT_EMPTY_MESSAGE;
    }
    if (stage !== null) {
      return EXPORT_STAGE_MESSAGES[stage];
    }
    if (!isFiltered) {
      return 'No filters applied — exporting all imported records.';
    }
    return `${formatCount(recordCount)} filtered ${
      recordCount === 1 ? 'record' : 'records'
    } will be exported.`;
  })();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        icon={Download}
        loading={isExporting}
        disabled={recordCount === 0 || isBusy}
        onClick={() => void exportData()}
        title={recordCount === 0 ? EXPORT_EMPTY_MESSAGE : undefined}
        aria-describedby="export-helper"
      >
        {isFiltered ? 'Export Excel' : 'Export Data'}
      </Button>
      <p
        id="export-helper"
        aria-live="polite"
        className={cn('text-[11px]', recordCount === 0 ? 'text-warning' : 'text-content-muted')}
      >
        {helperText}
      </p>
    </div>
  );
}
