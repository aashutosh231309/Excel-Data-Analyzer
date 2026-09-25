import { useMemo } from 'react';
import { AnalyticsSection } from '@/components/dashboard/AnalyticsSection';
import { BarList, type BarListEntry } from '@/components/dashboard/BarList';
import { UNKNOWN_PAYMENT_MODE_LABEL, type PaymentModeEntry } from '@/domain/analytics';
import { formatAmountMinor, formatCount, formatPercentage } from '@/utils/format';

interface PaymentModeBreakdownProps {
  entries: readonly PaymentModeEntry[];
  /** True while the breakdown describes the filtered records. */
  isFiltered: boolean;
}

/**
 * How the payments were made.
 *
 * The breakdown always describes the records currently on screen: every imported
 * record without filters, the matches with filters. Records without a payment
 * mode are grouped as `Unknown / Missing` and never dropped, and the modes are
 * ordered by record count.
 */
export function PaymentModeBreakdown({ entries, isFiltered }: PaymentModeBreakdownProps) {
  const bars = useMemo<BarListEntry[]>(
    () =>
      entries.map((entry) => ({
        id: entry.mode === '' ? 'unknown-payment-mode' : entry.mode,
        label: entry.label,
        percentage: entry.percentage,
        figures: `${formatCount(entry.count)} ${entry.count === 1 ? 'record' : 'records'} · ${formatPercentage(entry.percentage)}`,
        detail:
          entry.amountRecords === 0
            ? 'No readable amount in this group.'
            : `Total ${formatAmountMinor(entry.totalAmountMinor)} · ${formatCount(
                entry.amountRecords,
              )} with a valid amount`,
      })),
    [entries],
  );

  return (
    <AnalyticsSection
      id="payment-modes"
      title="Payment Mode Breakdown"
      description={
        isFiltered
          ? 'Payment modes of the records matching the filters.'
          : 'Payment modes across every imported record.'
      }
      footnote={`Records without a payment mode are grouped as ${UNKNOWN_PAYMENT_MODE_LABEL} and are never dropped. Modes are ordered by record count.`}
    >
      <BarList entries={bars} emptyMessage="No records to break down yet." />
    </AnalyticsSection>
  );
}
