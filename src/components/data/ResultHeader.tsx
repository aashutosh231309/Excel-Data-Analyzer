import { FileSpreadsheet } from 'lucide-react';
import { ExportDataButton } from '@/components/data/ExportDataButton';
import { useFilters } from '@/state/FilterProvider';
import { formatCount } from '@/utils/format';

interface ResultHeaderProps {
  /** Name of the source workbook, shown so the export can never be a surprise. */
  fileName: string | null;
}

/**
 * Information area above the results.
 *
 * It states which data is on screen — the filtered matches or the whole imported
 * dataset — and carries the export action, so the button and the numbers always
 * describe the same records.
 */
export function ResultHeader({ fileName }: ResultHeaderProps) {
  const { result, isFiltered, chips } = useFilters();

  const title = isFiltered ? 'Filtered Results' : 'Imported Data';
  const recordsLabel = `${formatCount(result.count)} ${
    result.count === 1 ? 'record' : 'records'
  }`;

  const detail = !isFiltered
    ? `Showing all ${formatCount(result.count)} imported ${
        result.count === 1 ? 'record' : 'records'
      } · No filters applied yet`
    : result.count === 0
      ? 'No matching records · Try changing or clearing one or more filters.'
      : `${recordsLabel} found · Active filters: ${chips.length}`;

  return (
    <header
      aria-label="Result header"
      className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-surface-border bg-surface px-4 py-3 shadow-card"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        <p aria-live="polite" className="text-xs text-content-secondary">
          {detail}
        </p>
        {!isFiltered && (
          <p className="text-[11px] text-content-muted">
            These are the records of the imported dataset, not a filtered subset.
          </p>
        )}
        {fileName && (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-content-muted" title={fileName}>
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="max-w-[22rem] truncate">{fileName}</span>
            <span className="shrink-0">· source workbook</span>
          </p>
        )}
      </div>
      <ExportDataButton />
    </header>
  );
}
