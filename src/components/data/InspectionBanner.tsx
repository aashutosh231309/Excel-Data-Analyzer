import { ArrowLeft, CopyCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { InspectionState } from '@/state/AnalyticsProvider';
import { formatCount } from '@/utils/format';

interface InspectionBannerProps {
  inspection: InspectionState;
  /** Leaves the inspection and shows the user's own results again. */
  onReturn: () => void;
}

/**
 * Header of an inspection view.
 *
 * It states unambiguously what is on screen — a data quality check or a
 * duplicate check — how many records it contains, and that leaving it restores
 * exactly the results, filters and export the user had before. No record is
 * edited, deleted or added to a filter by inspecting it.
 */
export function InspectionBanner({ inspection, onReturn }: InspectionBannerProps) {
  const quality = inspection.kind === 'data-quality';
  const label = quality ? 'Data Quality Inspection' : 'Duplicate Inspection';

  return (
    <header
      aria-label={label}
      data-inspection-kind={inspection.kind}
      className="flex animate-fade-up flex-wrap items-start justify-between gap-4 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 shadow-card"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <Badge
            variant="warning"
            icon={
              quality ? (
                <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              ) : (
                <CopyCheck className="h-3 w-3" aria-hidden="true" />
              )
            }
          >
            {label}
          </Badge>
          <span className="text-[11px] tabular-nums text-content-muted">
            {formatCount(inspection.records.length)}{' '}
            {inspection.records.length === 1 ? 'record' : 'records'} shown
          </span>
        </span>
        <h2 className="text-sm font-semibold text-content">{inspection.title}</h2>
        <p aria-live="polite" className="text-xs leading-relaxed text-content-secondary">
          {inspection.description}
        </p>
        <p className="text-[11px] text-content-muted">
          Your filters, the current export and the imported data are unchanged — “Back to results”
          restores exactly the records you had before.
        </p>
      </div>
      <Button variant="secondary" icon={ArrowLeft} onClick={onReturn}>
        Back to results
      </Button>
    </header>
  );
}
