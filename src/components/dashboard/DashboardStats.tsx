import { useMemo } from 'react';
import { Funnel, ListChecks, TrendingUp, Wallet } from 'lucide-react';
import { StatGrid } from '@/components/ui/StatGrid';
import type { StatCardModel } from '@/components/ui/StatCard';
import { useFilters } from '@/state/FilterProvider';
import { formatAmountMinor, formatCount } from '@/utils/format';
import type { ImportStatistics } from '@shared/import';

interface DashboardStatsProps {
  statistics: ImportStatistics | null;
}

/**
 * Headline figures of the dashboard. Without an imported workbook every tile
 * shows a dash; once data is loaded the numbers come from the import statistics
 * produced by the main process, or from the filtered result set while filters
 * are applied on the Data screen.
 */
export function DashboardStats({ statistics }: DashboardStatsProps) {
  const { result, isFiltered } = useFilters();

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
        value: isFiltered ? result.count : statistics?.importedRecords ?? null,
        hint: isFiltered
          ? 'Records matching the filters applied on the Data screen.'
          : 'No filters applied yet — every imported record is included.',
        icon: Funnel,
        tone: isFiltered ? 'accent' : 'default',
      },
      {
        id: 'totalAmount',
        label: 'Total Amount',
        value: isFiltered ? result.totalAmountMinor : statistics?.totalAmountMinor ?? null,
        hint: isFiltered
          ? result.amountRecords === 0
            ? 'No matching record carries a readable amount.'
            : `Sum of ${formatCount(result.amountRecords)} matching records with a valid amount.`
          : amountHint,
        icon: Wallet,
        format: formatAmountMinor,
        tone: 'accent',
      },
      {
        id: 'averageAmount',
        label: 'Average Amount',
        value: isFiltered ? result.averageAmountMinor : statistics?.averageAmountMinor ?? null,
        hint: isFiltered
          ? result.averageAmountMinor === null
            ? 'An average needs at least one matching record with a valid amount.'
            : 'Total of the matching records divided by those with a valid amount.'
          : 'Mean amount of the imported records with a valid amount.',
        icon: TrendingUp,
        format: formatAmountMinor,
      },
    ];
  }, [statistics, result, isFiltered]);

  return (
    <StatGrid
      cards={cards}
      label="Dataset statistics"
      footnote={
        statistics
          ? isFiltered
            ? 'Filtered Records, Total Amount and Average Amount follow the filters applied on the Data screen.'
            : 'No filters applied yet — these figures describe the imported dataset.'
          : 'Statistics become available once a spreadsheet is imported.'
      }
    />
  );
}
