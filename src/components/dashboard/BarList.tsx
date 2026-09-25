export interface BarListEntry {
  /** Stable identifier: the payment mode, or the amount bucket id. */
  id: string;
  label: string;
  /** Share of the analysed records, in percent (`0`–`100`). */
  percentage: number;
  /** Primary figures, e.g. `12 records · 24.0%`. */
  figures: string;
  /** Secondary line, e.g. `Total ₹2,400`. */
  detail?: string;
}

interface BarListProps {
  entries: readonly BarListEntry[];
  /** Shown when there is nothing to break down. */
  emptyMessage: string;
}

/**
 * Horizontal bar list used by the payment mode and amount distribution cards.
 *
 * Plain elements only — no charting dependency — so the figures stay selectable,
 * readable by assistive technology and exactly the numbers the analytics
 * produced. A non-zero share always keeps a visible bar.
 */
export function BarList({ entries, emptyMessage }: BarListProps) {
  if (entries.length === 0) {
    return <p className="text-[13px] text-content-muted">{emptyMessage}</p>;
  }

  return (
    <ul aria-label="Distribution" className="flex flex-col gap-3.5">
      {entries.map((entry) => {
        const width = entry.percentage <= 0 ? 0 : Math.max(2, Math.min(100, entry.percentage));
        return (
          <li key={entry.id} data-bar={entry.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-[13px] font-medium text-content">{entry.label}</span>
              <span data-bar-figures className="text-[12px] tabular-nums text-content-secondary">
                {entry.figures}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                data-bar-fill
                style={{ width: `${width}%` }}
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-smooth"
              />
            </div>
            {entry.detail && <p className="text-[11px] tabular-nums text-content-muted">{entry.detail}</p>}
          </li>
        );
      })}
    </ul>
  );
}
