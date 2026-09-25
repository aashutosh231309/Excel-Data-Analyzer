import { Download, FileSpreadsheet, Funnel, Sigma, Sparkles, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { RECORD_COLUMNS } from '@/types/domain';

interface PlannedCapability {
  icon: LucideIcon;
  title: string;
  description: string;
}

const PLANNED_CAPABILITIES: readonly PlannedCapability[] = [
  {
    icon: FileSpreadsheet,
    title: 'Import & normalise workbooks',
    description: 'Read the payment records below from the selected spreadsheet.',
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
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-surface-border bg-surface-elevated">
              <capability.icon className="h-4 w-4 text-content-muted" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-content-secondary">{capability.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-content-muted">
                {capability.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-surface-border pt-3 text-[11px] text-content-muted">
        Stage 1 delivers the desktop shell, the design system, secure file selection and reusable
        UI foundations.
      </p>
    </Card>
  );
}
