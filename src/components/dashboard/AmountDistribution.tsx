import { useMemo } from 'react';
import { AnalyticsSection } from '@/components/dashboard/AnalyticsSection';
import { BarList, type BarListEntry } from '@/components/dashboard/BarList';
import { AMOUNT_BUCKETS_NOTE, type AmountBucketEntry } from '@/domain/analytics';
import { formatAmountMinor, formatCount, formatPercentage } from '@/utils/format';

interface AmountDistributionProps {
  buckets: readonly AmountBucketEntry[];
  /** True while the distribution describes the filtered records. */
  isFiltered: boolean;
  /** Records with a valid amount in the analysed set. */
  validAmountRecords: number;
}

/**
 * Shape of the amounts in fixed analytical ranges.
 *
 * Only records with a valid amount are counted, and the ranges are
 * application-defined: they describe the data without classifying it. Unreadable
 * amounts stay in the data quality panel instead of being counted as ₹0.
 */
export function AmountDistribution({
  buckets,
  isFiltered,
  validAmountRecords,
}: AmountDistributionProps) {
  const bars = useMemo<BarListEntry[]>(
    () =>
      buckets.map((bucket) => ({
        id: bucket.id,
        label: bucket.label,
        percentage: bucket.percentage,
        figures: `${formatCount(bucket.count)} ${bucket.count === 1 ? 'record' : 'records'} · ${formatPercentage(bucket.percentage)}`,
        detail: bucket.count === 0 ? undefined : `Volume ${formatAmountMinor(bucket.totalAmountMinor)}`,
      })),
    [buckets],
  );

  const empty = validAmountRecords === 0;

  return (
    <AnalyticsSection
      id="amount-distribution"
      title="Amount Distribution"
      description={
        isFiltered
          ? 'Amount ranges of the records matching the filters.'
          : 'Amount ranges across every imported record.'
      }
      footnote={AMOUNT_BUCKETS_NOTE}
    >
      <BarList
        entries={empty ? [] : bars}
        emptyMessage={
          isFiltered
            ? 'No matching record carries a valid amount, so there is nothing to distribute.'
            : 'No imported record carries a valid amount, so there is nothing to distribute.'
        }
      />
    </AnalyticsSection>
  );
}
