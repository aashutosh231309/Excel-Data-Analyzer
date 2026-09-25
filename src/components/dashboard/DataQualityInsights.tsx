import { CheckCircle2, ChevronRight } from 'lucide-react';
import { AnalyticsSection } from '@/components/dashboard/AnalyticsSection';
import type { DataQualityCategoryId, DataQualitySummary } from '@/domain/analytics';
import { cn } from '@/utils/cn';
import { formatCount, formatPercentage } from '@/utils/format';

interface DataQualityInsightsProps {
  summary: DataQualitySummary;
  /** Category currently shown in the table, if any. */
  activeCategoryId: string | null;
  /** Opens the records of one category in the existing table. */
  onInspect: (categoryId: DataQualityCategoryId) => void;
}

/**
 * Data quality panel.
 *
 * The counters reuse exactly the import rules — a blank field, an unreadable
 * date or an unreadable amount — and never contradict the table: an affected
 * record is counted once here even when it has several problems, which the
 * summary says in words as well.
 *
 * Selecting a category never edits a record, never removes it and never applies a
 * permanent filter: it opens those records in the table as an inspection the user
 * can leave again.
 */
export function DataQualityInsights({ summary, activeCategoryId, onInspect }: DataQualityInsightsProps) {
  const clean = summary.affectedRecords === 0;

  return (
    <AnalyticsSection
      id="data-quality"
      title="Data Quality Insights"
      description="Counts of missing fields and values that could not be interpreted during import."
      footnote="A record with several problems is counted once in “Records with at least one issue”. The category counts below are independent of each other, so they do not add up to that figure."
    >
      <dl className="grid gap-3 sm:grid-cols-3" aria-label="Data quality summary">
        <SummaryFigure label="Imported records" value={formatCount(summary.totalRecords)} />
        <SummaryFigure
          label="Records with at least one issue"
          value={formatCount(summary.affectedRecords)}
          tone={clean ? 'success' : 'warning'}
        />
        <SummaryFigure
          label="Share of the import"
          value={formatPercentage(summary.affectedPercentage)}
          tone={clean ? 'success' : 'warning'}
        />
      </dl>

      {clean ? (
        <p className="flex items-center gap-2 rounded-control border border-success/30 bg-success/5 p-3 text-[12px] text-content-secondary">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          Every imported record has all seven fields in a readable form.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="Data quality categories">
          {summary.categories.map((category) => {
            const empty = category.count === 0;
            const active = activeCategoryId === category.id;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  data-quality-category={category.id}
                  data-active={active ? 'true' : undefined}
                  disabled={empty}
                  aria-label={
                    empty
                      ? `${category.label}: no record affected`
                      : `Inspect ${formatCount(category.count)} records with ${category.label}`
                  }
                  onClick={() => onInspect(category.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control border px-3 py-2 text-left',
                    'transition-colors duration-150 ease-smooth',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                    empty
                      ? 'cursor-not-allowed border-surface-border bg-surface text-content-muted'
                      : 'border-surface-border bg-surface hover:border-accent/40 hover:bg-surface-elevated',
                    active && 'border-accent/60 bg-accent-decorative',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-content">
                    {category.label}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-content-secondary">
                    {formatCount(category.count)}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-content-muted">
                    {formatPercentage(category.percentage)}
                  </span>
                  <ChevronRight
                    className={cn('h-3.5 w-3.5 shrink-0', empty ? 'text-content-muted' : 'text-accent')}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!clean && (
        <p className="text-[11px] leading-relaxed text-content-muted">
          Selecting a category shows those records in the table on the Data screen. Nothing is edited,
          deleted or filtered out of your results.
        </p>
      )}
    </AnalyticsSection>
  );
}

interface SummaryFigureProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}

function SummaryFigure({ label, value, tone = 'default' }: SummaryFigureProps) {
  return (
    <div
      data-quality-summary
      className={cn(
        'flex flex-col gap-1 rounded-control border p-3',
        tone === 'warning'
          ? 'border-warning/30 bg-warning/5'
          : tone === 'success'
            ? 'border-success/30 bg-success/5'
            : 'border-surface-border bg-surface-elevated',
      )}
    >
      <dt className="text-[11px] text-content-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-content">{value}</dd>
    </div>
  );
}
