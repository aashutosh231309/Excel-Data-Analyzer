import { StatCard, type StatCardModel } from '@/components/ui/StatCard';
import { cn } from '@/utils/cn';

export type StatGridColumns = 3 | 4 | 5;

/** Column counts that stay readable from a small laptop to a maximized window. */
const COLUMN_CLASSES: Record<StatGridColumns, string> = {
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
};

interface StatGridProps {
  cards: readonly StatCardModel[];
  /** Accessible name of the statistics region. */
  label: string;
  /** Optional footnote under the tiles. */
  footnote?: string;
  /** Tiles per row on wide windows; the grid stacks below `sm` either way. */
  columns?: StatGridColumns;
  className?: string;
}

/** Responsive row of statistic tiles. */
export function StatGrid({ cards, label, footnote, columns = 4, className }: StatGridProps) {
  return (
    <section aria-label={label} className={cn('flex flex-col gap-3', className)}>
      <div className={cn('grid gap-4', COLUMN_CLASSES[columns])}>
        {cards.map((card) => (
          <StatCard key={card.id} {...card} />
        ))}
      </div>
      {footnote && <p className="text-[11px] text-content-muted">{footnote}</p>}
    </section>
  );
}
