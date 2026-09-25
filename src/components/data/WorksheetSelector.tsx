import { Layers } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';
import { formatCount } from '@/utils/format';
import { IMPORT_FIELD_LABELS, type WorksheetSummary } from '@shared/import';

interface WorksheetSelectorProps {
  sheets: readonly WorksheetSummary[];
  activeSheetName: string;
  disabled: boolean;
  onSelect: (sheetName: string) => void;
}

/**
 * Worksheet switcher.
 *
 * It appears whenever the workbook holds more than one sheet, so the user can
 * see what each sheet contains and pick another one. Switching re-reads the
 * sheet from the workbook that is already in memory; the file is not re-parsed.
 */
export function WorksheetSelector({
  sheets,
  activeSheetName,
  disabled,
  onSelect,
}: WorksheetSelectorProps) {
  if (sheets.length <= 1) {
    return null;
  }

  return (
    <section aria-label="Worksheets" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Layers className="h-3.5 w-3.5 text-content-muted" aria-hidden="true" />
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
          Worksheets
        </h2>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a worksheet">
        {sheets.map((sheet) => {
          const active = sheet.name === activeSheetName;
          const missing = sheet.missingRequiredFields.map((field) => IMPORT_FIELD_LABELS[field]);
          const description = sheet.isImportable
            ? `${formatCount(sheet.dataRowCount)} data rows`
            : `Missing: ${missing.join(', ')}`;

          return (
            <Tooltip key={sheet.name} label={description} side="bottom">
              <button
                type="button"
                disabled={disabled || active || !sheet.isImportable}
                aria-pressed={active}
                onClick={() => onSelect(sheet.name)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-field border px-3 py-2 text-[12px] font-medium',
                  'transition-all duration-200 ease-smooth',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  active
                    ? 'border-accent/40 bg-accent-decorative text-content'
                    : 'border-surface-border bg-surface text-content-secondary hover:border-accent/40 hover:bg-surface-elevated/60 hover:text-content',
                  (disabled || !sheet.isImportable) && !active && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="max-w-[12rem] truncate">{sheet.name}</span>
                <span
                  className={cn(
                    'tabular-nums text-[11px]',
                    sheet.isImportable ? 'text-content-muted' : 'text-warning',
                  )}
                >
                  {sheet.isImportable ? formatCount(sheet.dataRowCount) : 'missing columns'}
                </span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}
