import { CopyCheck, Info } from 'lucide-react';
import { AnalyticsSection } from '@/components/dashboard/AnalyticsSection';
import { Button } from '@/components/ui/Button';
import { DUPLICATE_NOTICE, type DuplicateSummary } from '@/domain/analytics';
import { formatAmountMinor, formatCount, formatDateIso } from '@/utils/format';

/** How many groups are listed before the panel summarizes the rest. */
const MAX_LISTED_GROUPS = 6;

interface DuplicateInsightsProps {
  summary: DuplicateSummary;
  /** Duplicate group currently shown in the table, if any. */
  activeGroupId: string | null;
  /** Opens one group of identical records in the existing table. */
  onInspectGroup: (groupId: string) => void;
  /** Opens every record that takes part in a duplicate group. */
  onInspectAll: () => void;
}

/**
 * Possible duplicates.
 *
 * Informational only: the panel compares the seven normalized fields exactly,
 * never guesses, never calls a record wrong, and deletes nothing. Inspecting a
 * group simply shows those rows in the existing table.
 */
export function DuplicateInsights({
  summary,
  activeGroupId,
  onInspectGroup,
  onInspectAll,
}: DuplicateInsightsProps) {
  const listed = summary.groups.slice(0, MAX_LISTED_GROUPS);
  const hidden = summary.groups.length - listed.length;

  if (summary.groupCount === 0) {
    return (
      <AnalyticsSection
        id="duplicates"
        title="Possible Duplicates"
        description="Exact matches on all seven normalized fields."
        footnote={DUPLICATE_NOTICE}
      >
        <p className="text-[13px] text-content-secondary">
          No exact duplicate records were found in this dataset.
        </p>
      </AnalyticsSection>
    );
  }

  return (
    <AnalyticsSection
      id="duplicates"
      title="Possible Duplicates"
      description="Exact matches on all seven normalized fields."
      actions={
        <Button variant="secondary" size="sm" icon={CopyCheck} onClick={onInspectAll}>
          Inspect all duplicate records
        </Button>
      }
      footnote={DUPLICATE_NOTICE}
    >
      <p className="flex items-start gap-2 rounded-control border border-surface-border bg-surface-elevated p-3 text-[12px] leading-relaxed text-content-secondary">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-content">
            {formatCount(summary.groupCount)} {summary.groupCount === 1 ? 'group' : 'groups'}
          </strong>{' '}
          contain{' '}
          <strong className="font-semibold text-content">
            {formatCount(summary.recordCount)} {summary.recordCount === 1 ? 'record' : 'records'}
          </strong>{' '}
          that are identical on every field. They are kept exactly as imported: identical rows stay
          separate records in the table, the totals and any export.
        </span>
      </p>

      <ul className="flex flex-col gap-1.5" aria-label="Duplicate groups">
        {listed.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              data-duplicate-group={group.id}
              data-active={activeGroupId === group.id ? 'true' : undefined}
              aria-label={`Inspect duplicate group of ${formatCount(group.count)} records`}
              onClick={() => onInspectGroup(group.id)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-surface-border bg-surface px-3 py-2 text-left transition-colors duration-150 ease-smooth hover:border-accent/40 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="text-[12px] font-medium text-content">
                {formatCount(group.count)} × identical
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-content-secondary">
                {formatDateIso(group.date)} · {group.name || 'No name'} · {group.vehicleNumber || 'No vehicle'} ·{' '}
                {formatAmountMinor(group.amountMinor)}
              </span>
              <span className="text-[11px] text-content-muted">first on row {formatCount(group.firstRowNumber)}</span>
            </button>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="text-[11px] text-content-muted">
          {formatCount(hidden)} further {hidden === 1 ? 'group is' : 'groups are'} not listed here — use
          “Inspect all duplicate records” to see every affected row.
        </p>
      )}
    </AnalyticsSection>
  );
}
