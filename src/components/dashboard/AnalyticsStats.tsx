import { useMemo } from 'react';
import { CircleCheck, ListChecks, Rows3, TrendingUp, TriangleAlert, Wallet } from 'lucide-react';
import { StatGrid } from '@/components/ui/StatGrid';
import type { StatCardModel } from '@/components/ui/StatCard';
import type { AnalyticsSummary } from '@/domain/analytics';
import { formatAmountMinor, formatCount } from '@/utils/format';

interface AnalyticsStatsProps {
  summary: AnalyticsSummary;
  /** False while no workbook is loaded: every tile then shows a dash. */
  loaded: boolean;
}

/**
 * The five headline figures of the imported dataset.
 *
 * They always describe the whole import — never the filtered result set, which
 * has its own section. A dataset without a readable amount shows a dash with an
 * explanation instead of a ₹0 total, and an average is only shown when at least
 * one record carries a valid amount.
 */
export function AnalyticsStats({ summary, loaded }: AnalyticsStatsProps) {
  const cards = useMemo<StatCardModel[]>(() => {
    const hasAmounts = summary.validAmountRecords > 0;

    return [
      {
        id: 'importedRecords',
        label: 'Imported Records',
        value: loaded ? summary.importedRecords : null,
        hint: 'Rows read from the selected worksheet.',
        icon: ListChecks,
      },
      {
        id: 'validAmountRecords',
        label: 'Valid Amount Records',
        value: loaded ? summary.validAmountRecords : null,
        hint:
          loaded && summary.invalidAmountRecords > 0
            ? `${formatCount(summary.invalidAmountRecords)} records carry no readable amount.`
            : 'Records with an amount that could be read.',
        icon: CircleCheck,
        tone: 'success',
      },
      {
        id: 'totalAmount',
        label: 'Total Amount',
        value: loaded && hasAmounts ? summary.totalAmountMinor : null,
        hint:
          loaded && !hasAmounts
            ? 'No record carries a readable amount, so there is no total to show.'
            : `Sum of the ${formatCount(summary.validAmountRecords)} records with a valid amount.`,
        icon: Wallet,
        format: formatAmountMinor,
        tone: 'accent',
      },
      {
        id: 'averageAmount',
        label: 'Average Amount',
        value: loaded ? summary.averageAmountMinor : null,
        hint:
          loaded && !hasAmounts
            ? 'An average needs at least one record with a valid amount.'
            : 'Total divided by the records with a valid amount.',
        icon: TrendingUp,
        format: formatAmountMinor,
      },
      {
        id: 'incompleteRecords',
        label: 'Invalid / Incomplete Records',
        value: loaded ? summary.incompleteRecords : null,
        hint: loaded
          ? summary.incompleteRecords > 0
            ? 'Records with a missing field or a value that could not be interpreted.'
            : 'Every record has all seven fields in a readable form.'
          : 'Missing fields and unreadable dates or amounts are reported here.',
        icon: TriangleAlert,
        tone: summary.incompleteRecords > 0 ? 'warning' : 'default',
      },
    ];
  }, [loaded, summary]);

  return (
    <StatGrid
      cards={cards}
      label="Dataset statistics"
      columns={5}
      footnote={
        loaded
          ? 'These figures describe every imported record; the filtered figures are shown separately below.'
          : 'Statistics become available once a spreadsheet is imported.'
      }
    />
  );
}

export { Rows3 };
