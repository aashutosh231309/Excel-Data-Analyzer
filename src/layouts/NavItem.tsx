import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface NavItemProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}

/**
 * Sidebar navigation entry. The active section is communicated by a subtle
 * blue-violet background, a gradient accent indicator and a coloured icon.
 */
export function NavItem({ label, icon: Icon, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-[13px] font-medium',
        'transition-colors duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'bg-accent-decorative text-content'
          : 'text-content-muted hover:bg-surface-elevated/70 hover:text-content-secondary',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent-gradient transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
      <Icon
        className={cn(
          'h-4 w-4 shrink-0 transition-colors duration-200',
          active ? 'text-accent' : 'text-content-muted group-hover:text-content-secondary',
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
