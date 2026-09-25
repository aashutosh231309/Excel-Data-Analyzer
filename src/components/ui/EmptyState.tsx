import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional call to action rendered underneath the copy. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-surface-border',
        'bg-background-secondary/40 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-card bg-accent-decorative">
        <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-content">{title}</p>
      {description && <p className="max-w-md text-xs leading-relaxed text-content-muted">{description}</p>}
      {action}
    </div>
  );
}
