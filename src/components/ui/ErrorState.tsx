import { CircleAlert, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';

interface ErrorStateProps {
  title: string;
  message: string;
  /** Optional bullet list, e.g. the required columns that are missing. */
  items?: readonly string[];
  itemsLabel?: string;
  /** Optional call to action rendered underneath the copy. */
  action?: ReactNode;
  icon?: LucideIcon;
  onDismiss?: () => void;
  className?: string;
}

/** Reusable error surface: readable message first, details second. */
export function ErrorState({
  title,
  message,
  items,
  itemsLabel,
  action,
  icon: Icon = CircleAlert,
  onDismiss,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-3 rounded-card border border-danger/40 bg-danger/5 p-4',
        'animate-fade-up',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-danger/30 bg-danger/10">
          <Icon className="h-4 w-4 text-danger" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-content">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-content-secondary">{message}</p>
        </div>
        {onDismiss && (
          <Tooltip label="Dismiss">
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={onDismiss}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-control text-content-muted',
                'transition-colors duration-150 hover:bg-surface-elevated hover:text-content',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>

      {items && items.length > 0 && (
        <div className="pl-11">
          {itemsLabel && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
              {itemsLabel}
            </p>
          )}
          <ul className="mt-1.5 flex flex-col gap-1">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs text-content-secondary">
                <span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-danger" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {action && <div className="flex flex-wrap items-center gap-2 pl-11">{action}</div>}
    </div>
  );
}
