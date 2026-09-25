import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import { PLACEHOLDER_VALUE } from '@/utils/format';

interface StatCardProps {
  label: string;
  /** Data-driven value, or `null` while the metric is not available. */
  value: number | null;
  /** Explains what the metric will show once data is imported. */
  hint: string;
  icon: LucideIcon;
  className?: string;
}

/** Dashboard metric tile. Shows an em dash whenever no dataset is loaded. */
export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  const hasValue = value !== null;

  return (
    <Card interactive padding="lg" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-content-secondary">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-surface-border bg-surface-elevated">
          <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        </span>
      </div>
      <p
        className={cn(
          'text-2xl font-semibold tracking-tight',
          hasValue ? 'text-content' : 'text-content-muted',
        )}
      >
        {hasValue ? value.toLocaleString() : PLACEHOLDER_VALUE}
      </p>
      <p className="text-[11px] leading-relaxed text-content-muted">{hint}</p>
    </Card>
  );
}
