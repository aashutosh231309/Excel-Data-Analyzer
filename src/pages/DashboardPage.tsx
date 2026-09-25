import { useCallback } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { FileImportCard } from '@/components/dashboard/FileImportCard';
import { RoadmapCard } from '@/components/dashboard/RoadmapCard';
import { useDataset } from '@/state/DatasetProvider';
import type { AppSection } from '@/lib/navigation';
import type { ImportOutcome } from '@shared/import';

interface DashboardPageProps {
  onNavigate: (section: AppSection) => void;
}

/** Default screen: import a workbook and review the headline figures. */
export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { statistics } = useDataset();

  const handleImportOutcome = useCallback(
    (outcome: ImportOutcome) => {
      // Successful imports and valid-but-empty workbooks both have something to
      // show on the Data screen; failures stay on the dashboard with the error.
      if (outcome === 'imported' || outcome === 'empty') {
        onNavigate('data');
      }
    },
    [onNavigate],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Excel Data Analyzer"
        description="Analyze, filter and export your Excel data"
        actions={
          <Badge variant="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}>
            Local processing
          </Badge>
        }
      />
      <FileImportCard onImported={handleImportOutcome} onOpenData={() => onNavigate('data')} />
      <DashboardStats statistics={statistics} />
      <RoadmapCard />
    </div>
  );
}
