import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eraser, FileSpreadsheet, FolderOpen, SearchX, ShieldCheck, Table2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { DatasetStats } from '@/components/data/DatasetStats';
import { FilterPanel } from '@/components/data/FilterPanel';
import { FilteredSummary } from '@/components/data/FilteredSummary';
import { ImportProgressPanel } from '@/components/dashboard/ImportProgressPanel';
import { ImportSummaryPanel } from '@/components/data/ImportSummaryPanel';
import { RecordDetailsPanel } from '@/components/data/RecordDetailsPanel';
import { ValidationSummary } from '@/components/data/ValidationSummary';
import { WorksheetSelector } from '@/components/data/WorksheetSelector';
import { useDataset } from '@/state/DatasetProvider';
import { useFilters } from '@/state/FilterProvider';
import type { AppSection } from '@/lib/navigation';
import { IMPORT_FIELD_LABELS, type TransactionRecord } from '@shared/import';
import { formatCount, formatFileSize } from '@/utils/format';

interface DataPageProps {
  onNavigate: (section: AppSection) => void;
}

/**
 * Data screen: import quality, filters and the filtered records.
 *
 * Every value comes from the dataset provider, which holds the single copy of
 * the records, and from the filter provider, which holds the single filtered
 * result set. Nothing on this screen re-parses, re-reads or transforms the
 * workbook.
 */
export function DataPage({ onNavigate }: DataPageProps) {
  const {
    status,
    file,
    dataset,
    sheets,
    sheetName,
    progress,
    error,
    emptyStatistics,
    isBusy,
    importFromDialog,
    selectWorksheet,
    dismissError,
  } = useDataset();

  const { result, isFiltered, clearFilters } = useFilters();
  const [selectedRecord, setSelectedRecord] = useState<TransactionRecord | null>(null);

  // A row that is no longer part of the result set cannot stay selected.
  useEffect(() => {
    if (selectedRecord && !result.records.some((record) => record.id === selectedRecord.id)) {
      setSelectedRecord(null);
    }
  }, [result.records, selectedRecord]);

  const chooseAnotherFile = useCallback(() => {
    void importFromDialog();
  }, [importFromDialog]);

  const handleSelectRecord = useCallback((record: TransactionRecord) => {
    setSelectedRecord(record);
  }, []);

  const handleSelectWorksheet = useCallback(
    (nextSheet: string) => {
      setSelectedRecord(null);
      void selectWorksheet(nextSheet);
    },
    [selectWorksheet],
  );

  const resultsSummary = useMemo(() => {
    if (!isFiltered) {
      return `Showing all ${formatCount(result.count)} imported records · no filters applied yet`;
    }
    if (result.count === 0) {
      return 'No matching records';
    }
    return `Showing ${formatCount(result.count)} matching ${
      result.count === 1 ? 'record' : 'records'
    } · duplicates preserved`;
  }, [isFiltered, result.count]);

  const subtitle = useMemo(() => {
    if (!file) {
      return 'Import a workbook to filter the records and total the matching amounts.';
    }
    const parts = [file.name];
    if (sheetName) {
      parts.push(`worksheet ${sheetName}`);
    }
    if (dataset) {
      parts.push(`${formatCount(dataset.statistics.importedRecords)} records`);
      parts.push(formatFileSize(file.sizeInBytes));
    }
    return parts.join(' · ');
  }, [dataset, file, sheetName]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data"
        description={subtitle}
        actions={
          <div className="flex items-center gap-2">
            {dataset && (
              <Badge variant="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}>
                Read locally
              </Badge>
            )}
            <Button
              variant="secondary"
              icon={FolderOpen}
              loading={status === 'selecting'}
              disabled={isBusy}
              onClick={chooseAnotherFile}
            >
              {dataset ? 'Replace file' : 'Choose file'}
            </Button>
          </div>
        }
      />

      {/* Importing a file while records are already shown. */}
      {isBusy && (
        <div className="flex items-center justify-center rounded-panel border border-surface-border bg-surface px-6 py-8">
          <ImportProgressPanel progress={progress} selecting={status === 'selecting'} />
        </div>
      )}

      {/* A failed import that kept the previous dataset. */}
      {error && dataset && !isBusy && (
        <ErrorState
          title={`${error.title} — the current dataset was kept`}
          message={`${error.message} Your previously imported records are still loaded and unchanged.`}
          items={error.missingFields.map((field) => IMPORT_FIELD_LABELS[field])}
          itemsLabel="Missing required columns"
          onDismiss={dismissError}
          action={
            <Button variant="secondary" icon={FolderOpen} onClick={chooseAnotherFile}>
              Choose another file
            </Button>
          }
        />
      )}

      {dataset ? (
        <div className="flex animate-fade-up flex-col gap-6">
          <DatasetStats statistics={dataset.statistics} />

          {sheets.length > 1 && (
            <WorksheetSelector
              sheets={sheets}
              activeSheetName={sheetName ?? dataset.sheetName}
              disabled={isBusy}
              onSelect={handleSelectWorksheet}
            />
          )}

          <ImportSummaryPanel
            fileName={file?.name ?? dataset.file.name}
            sheetName={sheetName ?? dataset.sheetName}
            sheets={dataset.sheets}
            columns={dataset.columns}
            statistics={dataset.statistics}
          />

          <ValidationSummary records={dataset.records} onInspectRecord={handleSelectRecord} />

          <FilterPanel />

          <section aria-label="Filtered results" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-content">
                {isFiltered ? 'Filtered results' : 'Imported records'}
                <span aria-live="polite" className="ml-2 text-[11px] font-normal text-content-muted">
                  {resultsSummary}
                </span>
              </h2>
              <p className="text-[11px] text-content-muted">
                {isFiltered
                  ? 'Click a row to see the complete payment reason and remark.'
                  : 'These are the records of the imported dataset, not a filtered subset. Click a row to see the complete payment reason and remark.'}
              </p>
            </div>

            <FilteredSummary result={result} />

            {isFiltered && result.count === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching records"
                description="Try changing or clearing one or more filters."
                className="animate-fade-up"
                action={
                  <Button variant="secondary" icon={Eraser} onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <DataTable
                records={result.records}
                selectedRecordId={selectedRecord?.id ?? null}
                onSelectRecord={handleSelectRecord}
              />
            )}
          </section>
        </div>
      ) : (
        !isBusy && (
          <DataScreenPlaceholder
            status={status}
            error={error}
            fileLabel={file?.name ?? null}
            emptyStatisticsPresent={emptyStatistics !== null}
            sheetName={sheetName}
            recordsScanned={emptyStatistics?.rowsScanned ?? 0}
            onChooseAnotherFile={chooseAnotherFile}
            onOpenDashboard={() => onNavigate('dashboard')}
          />
        )
      )}

      {selectedRecord && (
        <RecordDetailsPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
      )}
    </div>
  );
}

interface DataScreenPlaceholderProps {
  status: ReturnType<typeof useDataset>['status'];
  error: ReturnType<typeof useDataset>['error'];
  fileLabel: string | null;
  emptyStatisticsPresent: boolean;
  sheetName: string | null;
  recordsScanned: number;
  onChooseAnotherFile: () => void;
  onOpenDashboard: () => void;
}

/** Empty, error and idle states of the Data screen. */
function DataScreenPlaceholder({
  status,
  error,
  fileLabel,
  emptyStatisticsPresent,
  sheetName,
  recordsScanned,
  onChooseAnotherFile,
  onOpenDashboard,
}: DataScreenPlaceholderProps) {
  if (error) {
    return (
      <ErrorState
        title={error.title}
        message={error.message}
        items={error.missingFields.map((field) => IMPORT_FIELD_LABELS[field])}
        itemsLabel="Missing required columns"
        onDismiss={undefined}
        action={
          <>
            <Button variant="secondary" icon={FolderOpen} onClick={onChooseAnotherFile}>
              Choose another file
            </Button>
            <Button variant="ghost" onClick={onOpenDashboard}>
              Go to Dashboard
            </Button>
          </>
        }
      />
    );
  }

  if (status === 'empty' || emptyStatisticsPresent) {
    return (
      <EmptyState
        icon={Table2}
        title="No records found"
        description={`${
          fileLabel ? `"${fileLabel}" is a valid workbook` : 'The selected spreadsheet is valid'
        }, but worksheet ${sheetName ?? '—'} does not contain any usable transaction rows (${
          formatCount(recordsScanned)
        } data rows scanned).`}
        action={
          <Button variant="secondary" icon={FolderOpen} onClick={onChooseAnotherFile}>
            Choose Another File
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={FileSpreadsheet}
      title="No data loaded"
      description="Import an Excel spreadsheet from the Dashboard to analyse your records. Nothing is uploaded anywhere: files stay on this computer."
      action={
        <Button variant="secondary" onClick={onOpenDashboard}>
          Go to Dashboard
        </Button>
      }
    />
  );
}
