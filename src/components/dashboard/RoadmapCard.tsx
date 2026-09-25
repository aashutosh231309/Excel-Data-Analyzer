import { Download, FileSpreadsheet, Funnel, Sigma, Sparkles, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { RECORD_COLUMNS } from '@/types/domain';
import { cn } from '@/utils/cn';

interface PlannedCapability {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Already delivered by the current stage. */
  done?: boolean;
}

const PLANNED_CAPABILITIES: readonly PlannedCapability[] = [
  {
    icon: FileSpreadsheet,
    title: 'Import & normalise workbooks',
    description: 'SheetJS parsing, column detection and safe normalization.',
    done: true,
  },
  {
    icon: Funnel,
    title: 'Filter the records',
    description: 'Filter by date, name, vehicle number and amount.',
  },
  {
    icon: Sigma,
    title: 'Automatic totals',
    description: 'Total and average amount of the filtered records.',
  },
  {
    icon: Download,
    title: 'Export the results',
    description: 'Save the filtered dataset back to a spreadsheet.',
  },
];

/** Communicates the staged delivery plan without implying finished features. */
export function RoadmapCard() {
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-violet" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Planned for the next stages</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-content-muted">Expected columns</span>
        {RECORD_COLUMNS.map((column) => (
          <Badge key={column}>{column}</Badge>
        ))}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {PLANNED_CAPABILITIES.map((capability) => (
          <li key={capability.title} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
                capability.done
                  ? 'border-success/30 bg-success/10'
                  : 'border-surface-border bg-surface-elevated',
              )}
            >
              <capability.icon
                className={cn('h-4 w-4', capability.done ? 'text-success' : 'text-content-muted')}
                aria-hidden="true"
              />
            </span>
            <div>
              <p className="text-[13px] font-medium text-content-secondary">
                {capability.title}
                {capability.done && <span className="ml-2 text-[11px] text-success">available</span>}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-content-muted">
                {capability.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-surface-border pt-3 text-[11px] text-content-muted">
        Workbooks are parsed locally in the main process and only normalised records reach the
        interface. Filtering and exports follow in the next stages.
      </p>
    </Card>
  );
}
