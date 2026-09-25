import { ChevronDown, Columns3 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { DATA_COLUMNS } from '@/types/domain';
import { cn } from '@/utils/cn';
import { formatCount } from '@/utils/format';
import {
  IMPORT_FIELD_LABELS,
  OPTIONAL_IMPORT_FIELDS,
  type ColumnMapping,
  type ImportStatistics,
  type WorksheetSummary,
} from '@shared/import';

interface ImportSummaryPanelProps {
  fileName: string;
  sheetName: string;
  sheets: readonly WorksheetSummary[];
  columns: readonly ColumnMapping[];
  statistics: ImportStatistics;
}

/**
 * How the workbook was interpreted: which worksheet was read, which spreadsheet
 * column feeds each field, and what was skipped. Nothing is mapped silently —
 * every recognized column is listed with the header it came from.
 */
export function ImportSummaryPanel({
  fileName,
  sheetName,
  sheets,
  columns,
  statistics,
}: ImportSummaryPanelProps) {
  const missingOptional = OPTIONAL_IMPORT_FIELDS.filter(
    (field) => !columns.some((column) => column.field === field),
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <details className="group">
        <summary
          className={cn(
            'flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-3',
            'transition-colors duration-150 ease-smooth hover:bg-surface-elevated/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          )}
        >
          <span className="flex min-w-0 items-center gap-3">
            <Columns3 className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-content">Import summary</span>
              <span className="block truncate text-[11px] text-content-muted">
                {fileName} · worksheet {sheetName} · {formatCount(statistics.rowsScanned)} data rows ·{' '}
                {formatCount(statistics.emptyRowsIgnored)} empty rows ignored
              </span>
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-content-muted transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="grid gap-4 border-t border-surface-border px-4 py-4 lg:grid-cols-2">
          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
              Recognized columns
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {DATA_COLUMNS.map((column) => {
                const mapping = columns.find((entry) => entry.field === column.field);
                return (
                  <li key={column.field} className="flex items-center justify-between gap-4 text-[12px]">
                    <span className="text-content-secondary">{column.label}</span>
                    <span className="truncate text-content-muted" title={mapping?.header}>
                      {mapping ? `← "${mapping.header}"` : 'not found'}
                    </span>
                  </li>
                );
              })}
            </ul>
            {missingOptional.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-content-muted">
                {missingOptional.map((field) => IMPORT_FIELD_LABELS[field]).join(' and ')}{' '}
                {missingOptional.length === 1 ? 'is' : 'are'} optional and left empty.
              </p>
            )}
          </section>

          <section>
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
              Worksheets in this workbook
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {sheets.map((sheet) => (
                <li key={sheet.name} className="flex items-center justify-between gap-4 text-[12px]">
                  <span className={cn('truncate', sheet.name === sheetName ? 'text-content' : 'text-content-muted')}>
                    {sheet.name}
                    {sheet.name === sheetName && <span className="ml-2 text-[11px] text-accent">in use</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-content-muted">
                    {sheet.isImportable
                      ? `${formatCount(sheet.dataRowCount)} rows`
                      : `${sheet.missingRequiredFields.length} required columns missing`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </Card>
  );
}
