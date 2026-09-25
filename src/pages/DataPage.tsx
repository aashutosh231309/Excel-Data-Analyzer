import { Funnel, Search, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tooltip } from '@/components/ui/Tooltip';
import type { AppSection } from '@/lib/navigation';

interface DataPageProps {
  onNavigate: (section: AppSection) => void;
}

/**
 * Placeholder for the record table. The toolbar shows where search and filters
 * will live; both controls are disabled because no data can be loaded yet.
 */
export function DataPage({ onNavigate }: DataPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data"
        description="Imported records will be listed here, with search, filters and totals."
      />

      <section
        aria-label="Record toolbar"
        className="flex flex-wrap items-end gap-3 rounded-panel border border-surface-border bg-surface p-4"
      >
        <div className="w-full max-w-sm">
          <Input
            label="Search records"
            placeholder="Search is enabled once data is imported"
            icon={Search}
            hint="Available in the next stage."
            disabled
          />
        </div>
        <Tooltip label="Available once a spreadsheet is imported">
          <Button variant="secondary" icon={Funnel} disabled>
            Filters
          </Button>
        </Tooltip>
      </section>

      <EmptyState
        icon={Table2}
        title="No data loaded"
        description="Import an Excel spreadsheet from the Dashboard to analyse your records. Nothing is uploaded anywhere: files stay on this computer."
        action={
          <Button variant="secondary" onClick={() => onNavigate('dashboard')}>
            Go to Dashboard
          </Button>
        }
      />
    </div>
  );
}
