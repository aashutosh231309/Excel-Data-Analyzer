import { useMemo } from 'react';
import { CircleCheck, Rows3, TriangleAlert, Wallet } from 'lucide-react';
import { StatGrid } from '@/components/ui/StatGrid';
import type { StatCardModel } from '@/components/ui/StatCard';
import { formatAmountMinor, formatCount } from '@/utils/format';
import type { ImportStatistics } from '@shared/import';

interface DatasetStatsProps {
  statistics: ImportStatistics;
}

/** Import quality at a glance: records, valid, invalid and the total amount. */
export function DatasetStats({ statistics }: DatasetStatsProps) {
  const cards = useMemo<StatCardModel[]>(
    () => [
      {
        id: 'records',
        label: 'Records',
        value: statistics.importedRecords,
        hint: statistics.emptyRowsIgnored > 0
          ? `${formatCount(statistics.emptyRowsIgnored)} empty rows were ignored.`
          : 'Rows imported from this worksheet.',
        icon: Rows3,
      },
      {
        id: 'valid',
        label: 'Valid',
        value: statistics.validRecords,
        hint: 'Records where every field could be interpreted.',
        icon: CircleCheck,
        tone: 'success',
      },
      {
        id: 'invalid',
        label: 'Invalid',
        value: statistics.recordsWithIssues,
        hint:
          statistics.recordsWithIssues > 0
            ? 'Records with a date or amount that could not be interpreted.'
            : 'No invalid dates or amounts were found.',
        icon: TriangleAlert,
        tone: statistics.recordsWithIssues > 0 ? 'warning' : 'default',
      },
      {
        id: 'totalAmount',
        label: 'Imported Total',
        value: statistics.totalAmountMinor,
        hint:
          statistics.recordsWithAmount === statistics.importedRecords
            ? 'Sum of every imported record — filters do not change it.'
            : `Excludes ${formatCount(statistics.importedRecords - statistics.recordsWithAmount)} records without a valid amount.`,
        icon: Wallet,
        format: formatAmountMinor,
        tone: 'accent',
      },
    ],
    [statistics],
  );

  return <StatGrid cards={cards} label="Import statistics" />;
}
