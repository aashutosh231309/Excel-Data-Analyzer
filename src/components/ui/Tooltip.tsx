import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface TooltipProps {
  label: string;
  side?: 'top' | 'bottom';
  /**
   * Wraps long values (payment reasons, remarks) instead of forcing them onto a
   * single very wide line.
   */
  wrap?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Lightweight CSS tooltip for icon-only controls. The child element keeps its
 * own accessible name (`aria-label`), so screen readers never depend on this.
 */
export function Tooltip({ label, side = 'top', wrap = false, className, children }: TooltipProps) {
  const positionClasses =
    side === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'top-full left-1/2 mt-2 -translate-x-1/2';

  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 hidden rounded-control border',
          'border-surface-border bg-surface-elevated px-2 py-1 text-[11px] font-medium text-content-secondary',
          'shadow-raised group-hover/tt:block group-focus-within/tt:block',
          wrap ? 'w-64 max-w-[16rem] whitespace-normal break-words leading-relaxed' : 'whitespace-nowrap',
          positionClasses,
        )}
      >
        {label}
      </span>
    </span>
  );
}
