import type { LucideIcon } from 'lucide-react';
import { Funnel, TrendingUp, Wallet } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import type { FilteredResult } from '@/domain/filtering';
import { PLACEHOLDER_VALUE, formatAmountMinor, formatCount } from '@/utils/format';

interface Metric {
  id: string;
  label: string;
  value: number | null;
  format: (value: number) => string;
  hint: string;
  icon: LucideIcon;
}

interface FilteredSummaryProps {
  result: FilteredResult;
}

/**
 * The three figures of the current result set: how many records match, their
 * total and their average.
 *
 * All of them are derived from the one authoritative filtered result set, so the
 * count, the totals, the table and the pagination can never disagree. Without
 * filters the figures describe the imported dataset and say so.
 */
export function FilteredSummary({ result }: FilteredSummaryProps) {
  const metrics: Metric[] = [
    {
      id: 'filteredRecords',
      label: 'Filtered Records',
      value: result.count,
      format: formatCount,
      hint: result.isFiltered
        ? 'Records matching every applied filter.'
        : 'No filters applied yet — every imported record is included.',
      icon: Funnel,
    },
    {
      id: 'filteredTotal',
      label: 'Total Amount',
      value: result.totalAmountMinor,
      format: formatAmountMinor,
      hint:
        result.amountRecords === 0
          ? 'No matching record carries a readable amount.'
          : `Sum of ${formatCount(result.amountRecords)} matching ${
              result.amountRecords === 1 ? 'record' : 'records'
            } with a valid amount.`,
      icon: Wallet,
    },
    {
      id: 'filteredAverage',
      label: 'Average Amount',
      value: result.averageAmountMinor,
      format: formatAmountMinor,
      hint:
        result.averageAmountMinor === null
          ? 'An average needs at least one matching record with a valid amount.'
          : 'Total divided by the matching records with a valid amount.',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-card border border-surface-border bg-surface-border sm:grid-cols-3">
      {metrics.map((metric) => (
        <MetricCell key={metric.id} metric={metric} />
      ))}
    </div>
  );
}

function MetricCell({ metric }: { metric: Metric }) {
  const animated = useCountUp(metric.value);
  const hasValue = metric.value !== null;
  const Icon = metric.icon;

  return (
    <div data-metric={metric.id} className="flex flex-col gap-1 bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
          {metric.label}
        </span>
      </div>
      <p data-metric-value className="text-xl font-semibold tabular-nums tracking-tight text-content">
        {hasValue && animated !== null ? metric.format(animated) : PLACEHOLDER_VALUE}
      </p>
      <p className="text-[11px] leading-relaxed text-content-muted">{metric.hint}</p>
    </div>
  );
}
