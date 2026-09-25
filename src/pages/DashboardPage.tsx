import { useCallback } from 'react';
import { BarChart3, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/ui/PageHeader';
import { AnalyticsStats } from '@/components/dashboard/AnalyticsStats';
import { AmountDistribution } from '@/components/dashboard/AmountDistribution';
import { DataQualityInsights } from '@/components/dashboard/DataQualityInsights';
import { DuplicateInsights } from '@/components/dashboard/DuplicateInsights';
import { FileImportCard } from '@/components/dashboard/FileImportCard';
import { FilteredAnalyticsSection } from '@/components/dashboard/FilteredAnalyticsSection';
import { PaymentModeBreakdown } from '@/components/dashboard/PaymentModeBreakdown';
import { RoadmapCard } from '@/components/dashboard/RoadmapCard';
import { EMPTY_ANALYTICS, type DataQualityCategoryId } from '@/domain/analytics';
import { useAnalytics } from '@/state/AnalyticsProvider';
import { useDataset } from '@/state/DatasetProvider';
import { formatCount } from '@/utils/format';
import type { AppSection } from '@/lib/navigation';
import type { ImportOutcome } from '@shared/import';

interface DashboardPageProps {
  onNavigate: (section: AppSection) => void;
}

/**
 * Overview screen.
 *
 * After a successful import it becomes the analytics workspace: the source card,
 * the figures of the imported dataset, the imported-versus-filtered comparison,
 * the payment mode breakdown, the amount distribution, the data quality panel
 * and the duplicate panel. Every figure comes from the one analytics layer, so no
 * card can disagree with another.
 *
 * Without a workbook the same screen is the welcome state: the import card and
 * the tiles, each showing a dash instead of an invented zero.
 */
export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { dataset } = useDataset();
  const {
    datasetReport,
    activeReport,
    isFiltered,
    error,
    session,
    inspection,
    inspectQualityCategory,
    inspectDuplicateGroup,
  } = useAnalytics();

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

  // Inspecting never edits the data and never applies a filter: it opens the
  // affected records in the table on the Data screen and can be left again.
  const inspectOnDataScreen = useCallback(() => onNavigate('data'), [onNavigate]);

  const handleInspectCategory = useCallback(
    (categoryId: DataQualityCategoryId) => {
      inspectQualityCategory(categoryId);
      inspectOnDataScreen();
    },
    [inspectOnDataScreen, inspectQualityCategory],
  );

  const handleInspectGroup = useCallback(
    (groupId: string) => {
      inspectDuplicateGroup(groupId);
      inspectOnDataScreen();
    },
    [inspectDuplicateGroup, inspectOnDataScreen],
  );

  const handleInspectAllGroups = useCallback(() => {
    inspectDuplicateGroup(null);
    inspectOnDataScreen();
  }, [inspectDuplicateGroup, inspectOnDataScreen]);

  // The loaded workbook, never the file whose import just failed.
  const fileName = dataset?.file.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Excel Data Analyzer"
        description={
          dataset && fileName
            ? `${formatCount(dataset.statistics.importedRecords)} records loaded from ${fileName}`
            : 'Analyze, filter and export your Excel data'
        }
        actions={
          <>
            <Badge
              variant={
                session.tone === 'warning' ? 'warning' : session.tone === 'accent' ? 'accent' : 'neutral'
              }
              icon={<BarChart3 className="h-3 w-3" aria-hidden="true" />}
            >
              {session.label}
            </Badge>
            <Badge variant="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}>
              Local processing
            </Badge>
          </>
        }
      />

      <FileImportCard onImported={handleImportOutcome} onOpenData={() => onNavigate('data')} />

      {error && (
        <ErrorState
          title="Analytics unavailable"
          message={`${error} The imported records are unchanged and the Data screen still works.`}
        />
      )}

      {dataset ? (
        <div className="flex animate-fade-up flex-col gap-6" data-analytics-workspace>
          <AnalyticsStats summary={datasetReport.summary} loaded />
          <FilteredAnalyticsSection
            datasetSummary={datasetReport.summary}
            activeSummary={activeReport.summary}
            isFiltered={isFiltered}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            <PaymentModeBreakdown entries={activeReport.paymentModes} isFiltered={isFiltered} />
            <AmountDistribution
              buckets={activeReport.amountBuckets}
              isFiltered={isFiltered}
              validAmountRecords={activeReport.summary.validAmountRecords}
            />
          </div>
          <DataQualityInsights
            summary={datasetReport.dataQuality}
            activeCategoryId={inspection?.kind === 'data-quality' ? inspection.key : null}
            onInspect={handleInspectCategory}
          />
          <DuplicateInsights
            summary={datasetReport.duplicates}
            activeGroupId={inspection?.kind === 'duplicates' ? inspection.key : null}
            onInspectGroup={handleInspectGroup}
            onInspectAll={handleInspectAllGroups}
          />
        </div>
      ) : (
        <>
          <AnalyticsStats summary={EMPTY_ANALYTICS.summary} loaded={false} />
          <Card padding="lg" className="flex flex-col gap-3" data-section="welcome">
            <h2 className="text-sm font-semibold text-content">Nothing is loaded yet</h2>
            <p className="text-[13px] leading-relaxed text-content-secondary">
              {session.description}
            </p>
            <p className="text-[11px] leading-relaxed text-content-muted">
              After an import this screen shows the totals of the workbook, how the payments were
              made, which amount ranges they fall into, and which rows need attention — all computed
              locally from the file you selected.
            </p>
          </Card>
        </>
      )}

      <RoadmapCard />
    </div>
  );
}
