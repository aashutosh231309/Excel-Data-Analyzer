import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/utils/cn';
import { PLACEHOLDER_VALUE, formatCount } from '@/utils/format';

export type StatTone = 'default' | 'success' | 'warning' | 'accent';

const TONE_VALUE_CLASSES: Record<StatTone, string> = {
  default: 'text-content',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-content',
};

const TONE_ICON_CLASSES: Record<StatTone, string> = {
  default: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent-violet',
};

export interface StatCardModel {
  id: string;
  label: string;
  /** Numeric value, or `null` while no dataset is loaded. */
  value: number | null;
  hint: string;
  icon: LucideIcon;
  /** Formats the animated numeric value; defaults to a grouped count. */
  format?: (value: number) => string;
  tone?: StatTone;
}

/**
 * Dashboard statistic tile.
 *
 * The number animates once when it first appears or changes; React re-renders
 * never restart the animation. Without a dataset the tile shows a dash, so the
 * interface never invents figures.
 */
export function StatCard({ label, value, hint, icon: Icon, format = formatCount, tone = 'default' }: StatCardModel) {
  const animatedValue = useCountUp(value);
  const hasValue = value !== null;

  return (
    <Card interactive padding="lg" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-content-secondary">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-surface-border bg-surface-elevated">
          <Icon className={cn('h-4 w-4', TONE_ICON_CLASSES[tone])} aria-hidden="true" />
        </span>
      </div>
      <p
        className={cn(
          'text-2xl font-semibold tracking-tight tabular-nums',
          hasValue ? TONE_VALUE_CLASSES[tone] : 'text-content-muted',
        )}
      >
        {hasValue && animatedValue !== null ? format(animatedValue) : PLACEHOLDER_VALUE}
      </p>
      <p className="text-[11px] leading-relaxed text-content-muted">{hint}</p>
    </Card>
  );
}
