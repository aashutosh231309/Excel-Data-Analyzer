import { ShieldCheck } from 'lucide-react';
import { NAVIGATION_ITEMS, type AppSection } from '@/lib/navigation';
import { NavItem } from '@/layouts/NavItem';

interface SidebarProps {
  activeSection: AppSection;
  onSelect: (section: AppSection) => void;
}

/** Slim left navigation with the application's primary sections. */
export function Sidebar({ activeSection, onSelect }: SidebarProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-56 shrink-0 flex-col justify-between gap-4 border-r border-surface-border bg-background-secondary/70 px-3 py-4"
    >
      <ul className="flex flex-col gap-1">
        {NAVIGATION_ITEMS.map((item) => (
          <li key={item.id}>
            <NavItem
              label={item.label}
              icon={item.icon}
              active={item.id === activeSection}
              onSelect={() => onSelect(item.id)}
            />
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2.5 rounded-card border border-surface-border bg-surface/60 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="text-[11px] font-medium text-content-secondary">Offline &amp; local</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-content-muted">
            Spreadsheets are processed on this computer only.
          </p>
        </div>
      </div>
    </nav>
  );
}
