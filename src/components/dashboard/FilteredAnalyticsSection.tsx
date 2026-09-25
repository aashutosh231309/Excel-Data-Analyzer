import { useMemo } from 'react';
import { Funnel, ListChecks, TrendingUp, Wallet } from 'lucide-react';
import { StatGrid } from '@/components/ui/StatGrid';
import type { StatCardModel } from '@/components/ui/StatCard';
import type { AnalyticsSummary } from '@/domain/analytics';
import { formatAmountMinor, formatCount } from '@/utils/format';

interface FilteredAnalyticsSectionProps {
  /** Figures of the whole import. */
  datasetSummary: AnalyticsSummary;
  /** Figures of the records currently shown on the Data screen. */
  activeSummary: AnalyticsSummary;
  isFiltered: boolean;
}

/**
 * Imported figures next to the current filtered figures.
 *
 * Both sets are always visible and always labelled: the imported numbers are
 * never relabelled as filtered, and while filters are active the two filtered
 * tiles carry the stronger hierarchy.
 */
export function FilteredAnalyticsSection({
  datasetSummary,
  activeSummary,
  isFiltered,
}: FilteredAnalyticsSectionProps) {
  const cards = useMemo<StatCardModel[]>(() => {
    const noMatches = isFiltered && activeSummary.importedRecords === 0;
    const activeHasAmounts = activeSummary.validAmountRecords > 0;

    return [
      {
        id: 'importedRecordsCompared',
        label: 'Imported Records',
        value: datasetSummary.importedRecords,
        hint: 'Every record read from the workbook.',
        icon: ListChecks,
      },
      {
        id: 'filteredRecordsCompared',
        label: 'Filtered Records',
        value: activeSummary.importedRecords,
        hint: isFiltered
          ? 'Records matching the filters applied on the Data screen.'
          : 'No filters applied yet — every imported record is included.',
        icon: Funnel,
        tone: isFiltered ? 'accent' : 'default',
        emphasis: isFiltered,
      },
      {
        id: 'filteredTotalCompared',
        label: 'Filtered Total Amount',
        value: noMatches || !activeHasAmounts ? null : activeSummary.totalAmountMinor,
        hint: noMatches
          ? 'No matching records, so there is no filtered total to show.'
          : activeHasAmounts
            ? isFiltered
              ? `Sum of the ${formatCount(activeSummary.validAmountRecords)} matching records with a valid amount.`
              : 'Sum of the imported records with a valid amount.'
            : 'None of the matching records carries a readable amount.',
        icon: Wallet,
        format: formatAmountMinor,
        tone: isFiltered ? 'accent' : 'default',
        emphasis: isFiltered,
      },
      {
        id: 'filteredAverageCompared',
        label: 'Filtered Average Amount',
        value: noMatches ? null : activeSummary.averageAmountMinor,
        hint: noMatches
          ? 'No matching records, so there is no filtered average to show.'
          : activeSummary.averageAmountMinor === null
            ? 'An average needs at least one matching record with a valid amount.'
            : isFiltered
              ? 'Filtered total divided by the matching records with a valid amount.'
              : 'Mean of the imported records with a valid amount.',
        icon: TrendingUp,
        format: formatAmountMinor,
        tone: isFiltered ? 'accent' : 'default',
        emphasis: isFiltered,
      },
    ];
  }, [activeSummary, datasetSummary, isFiltered]);

  return (
    <StatGrid
      cards={cards}
      label="Imported and filtered analytics"
      columns={4}
      footnote={
        isFiltered
          ? 'Filtered Records, Filtered Total Amount and Filtered Average Amount follow the filters applied on the Data screen; Imported Records always describes the whole workbook.'
          : 'No filters are applied, so the filtered figures equal the imported ones.'
      }
    />
  );
}
