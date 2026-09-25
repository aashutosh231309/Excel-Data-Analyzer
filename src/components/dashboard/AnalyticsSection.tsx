import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';

interface AnalyticsSectionProps {
  /** Stable hook for the verification suite. */
  id: string;
  title: string;
  /** One line describing what the section describes. */
  description?: ReactNode;
  /** Trailing controls, e.g. an inspection button. */
  actions?: ReactNode;
  /** Explanatory note under the content. */
  footnote?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Shared frame of an analytics card: white surface, moderate radius, a subtle
 * border and a soft shadow, with the title hierarchy every section repeats.
 */
export function AnalyticsSection({
  id,
  title,
  description,
  actions,
  footnote,
  className,
  children,
}: AnalyticsSectionProps) {
  return (
    <Card data-section={id} padding="lg" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-sm font-semibold text-content">{title}</h2>
          {description && <p className="text-xs text-content-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
      {footnote && (
        <p className="border-t border-surface-border pt-3 text-[11px] leading-relaxed text-content-muted">
          {footnote}
        </p>
      )}
    </Card>
  );
}
