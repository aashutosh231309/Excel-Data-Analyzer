import { ListChecks, Funnel, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import type { DatasetSummary } from '@/types/domain';

/** Every tile maps to one field of the summary the analysis stage will produce. */
interface StatDefinition {
  id: keyof DatasetSummary;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const STAT_DEFINITIONS: readonly StatDefinition[] = [
  {
    id: 'totalRecords',
    label: 'Total Records',
    hint: 'Rows imported from the selected workbook.',
    icon: ListChecks,
  },
  {
    id: 'filteredRecords',
    label: 'Filtered Records',
    hint: 'Rows matching the active filters.',
    icon: Funnel,
  },
  {
    id: 'totalAmount',
    label: 'Total Amount',
    hint: 'Sum of the amounts in the filtered records.',
    icon: Wallet,
  },
  {
    id: 'averageAmount',
    label: 'Average Amount',
    hint: 'Mean amount of the filtered records.',
    icon: TrendingUp,
  },
];

/**
 * Statistic tiles of the dashboard.
 *
 * Stage 1 intentionally renders empty placeholders: no spreadsheet has been
 * parsed yet, so there is no value to show.
 */
export function StatsGrid() {
  return (
    <section aria-label="Dataset statistics" className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_DEFINITIONS.map((definition) => (
          <StatCard
            key={definition.id}
            label={definition.label}
            value={null}
            hint={definition.hint}
            icon={definition.icon}
          />
        ))}
      </div>
      <p className="text-[11px] text-content-muted">
        Statistics become available once a spreadsheet is imported in a later stage.
      </p>
    </section>
  );
}
