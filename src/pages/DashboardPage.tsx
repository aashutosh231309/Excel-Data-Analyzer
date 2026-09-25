import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { FileImportCard } from '@/components/dashboard/FileImportCard';
import { RoadmapCard } from '@/components/dashboard/RoadmapCard';
import { StatsGrid } from '@/components/dashboard/StatsGrid';
import { useFileSelection } from '@/hooks/useFileSelection';

/** Default screen: import a workbook and review the (still empty) statistics. */
export function DashboardPage() {
  const selection = useFileSelection();

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
      <FileImportCard controller={selection} />
      <StatsGrid />
      <RoadmapCard />
    </div>
  );
}
