import { StatCard, type StatCardModel } from '@/components/ui/StatCard';
import { cn } from '@/utils/cn';

interface StatGridProps {
  cards: readonly StatCardModel[];
  /** Accessible name of the statistics region. */
  label: string;
  /** Optional footnote under the tiles. */
  footnote?: string;
  className?: string;
}

/** Responsive row of statistic tiles. */
export function StatGrid({ cards, label, footnote, className }: StatGridProps) {
  return (
    <section aria-label={label} className={cn('flex flex-col gap-3', className)}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.id} {...card} />
        ))}
      </div>
      {footnote && <p className="text-[11px] text-content-muted">{footnote}</p>}
    </section>
  );
}
