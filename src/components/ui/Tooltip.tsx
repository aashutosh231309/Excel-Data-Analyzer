import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom';
  className?: string;
  children: ReactNode;
}

/**
 * Lightweight CSS tooltip for icon-only controls. The child element keeps its
 * own accessible name (`aria-label`), so screen readers never depend on this.
 */
export function Tooltip({ label, side = 'top', className, children }: TooltipProps) {
  const positionClasses =
    side === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'top-full left-1/2 mt-2 -translate-x-1/2';

  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-control border',
          'border-surface-border bg-surface-elevated px-2 py-1 text-[11px] font-medium text-content-secondary',
          'shadow-raised group-hover/tt:block group-focus-within/tt:block',
          positionClasses,
        )}
      >
        {label}
      </span>
    </span>
  );
}
