import { useMemo } from 'react';
import { Funnel, ListChecks, TrendingUp, Wallet } from 'lucide-react';
import { StatGrid } from '@/components/ui/StatGrid';
import type { StatCardModel } from '@/components/ui/StatCard';
import { formatAmountMinor, formatCount } from '@/utils/format';
import type { ImportStatistics } from '@shared/import';

interface DashboardStatsProps {
  statistics: ImportStatistics | null;
}

/**
 * Headline figures of the dashboard. Without an imported workbook every tile
 * shows a dash; once data is loaded the numbers come straight from the import
 * statistics produced by the main process.
 */
export function DashboardStats({ statistics }: DashboardStatsProps) {
  const cards = useMemo<StatCardModel[]>(() => {
    const amountHint =
      statistics && statistics.recordsWithAmount > 0
        ? `Sum of ${formatCount(statistics.recordsWithAmount)} records with a valid amount.`
        : 'Sum of the amounts in the imported records.';

    return [
      {
        id: 'totalRecords',
        label: 'Total Records',
        value: statistics?.importedRecords ?? null,
        hint: 'Rows imported from the selected workbook.',
        icon: ListChecks,
      },
      {
        id: 'filteredRecords',
        label: 'Filtered Records',
        value: statistics?.importedRecords ?? null,
        hint: 'No filters applied yet — every imported record is included.',
        icon: Funnel,
      },
      {
        id: 'totalAmount',
        label: 'Total Amount',
        value: statistics?.totalAmountMinor ?? null,
        hint: amountHint,
        icon: Wallet,
        format: formatAmountMinor,
        tone: 'accent',
      },
      {
        id: 'averageAmount',
        label: 'Average Amount',
        value: statistics?.averageAmountMinor ?? null,
        hint: 'Mean amount of the records with a valid amount.',
        icon: TrendingUp,
        format: formatAmountMinor,
      },
    ];
  }, [statistics]);

  return (
    <StatGrid
      cards={cards}
      label="Dataset statistics"
      footnote={
        statistics
          ? 'Filtering and filtered totals arrive in the next stage.'
          : 'Statistics become available once a spreadsheet is imported.'
      }
    />
  );
}
