import { useMemo } from 'react';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/utils/cn';
import { formatCount } from '@/utils/format';
import type { TransactionRecord } from '@shared/import';

/** How many affected rows are listed before the panel summarizes the rest. */
const MAX_LISTED_ROWS = 25;

interface ValidationSummaryProps {
  records: readonly TransactionRecord[];
  onInspectRecord: (record: TransactionRecord) => void;
}

/**
 * Data quality panel.
 *
 * Records that carry an uninterpretable date or amount are kept in the table
 * (nothing is discarded) and listed here so they can be inspected. An invalid
 * amount is never turned into ₹0; it simply stays out of the totals.
 */
export function ValidationSummary({ records, onInspectRecord }: ValidationSummaryProps) {
  const { affected, dateIssues, amountIssues } = useMemo(() => {
    const withIssues: TransactionRecord[] = [];
    let dates = 0;
    let amounts = 0;
    for (const record of records) {
      if (record.issues.length === 0) {
        continue;
      }
      withIssues.push(record);
      for (const issue of record.issues) {
        if (issue.field === 'date') {
          dates += 1;
        } else {
          amounts += 1;
        }
      }
    }
    return { affected: withIssues, dateIssues: dates, amountIssues: amounts };
  }, [records]);

  if (affected.length === 0) {
    return null;
  }

  const listed = affected.slice(0, MAX_LISTED_ROWS);
  const hidden = affected.length - listed.length;

  return (
    <section
      aria-label="Data quality"
      className={cn(
        'animate-fade-up rounded-card border border-warning/30 bg-warning/5 p-4',
        'shadow-[0_0_0_1px_rgba(245,158,11,0.06)]',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-warning/30 bg-warning/10 animate-fade-up">
          <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-content">
            {formatCount(affected.length)} {affected.length === 1 ? 'record needs' : 'records need'}{' '}
            attention
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-content-secondary">
            These rows are kept exactly as imported and shown in the table; they are never deleted and
            invalid values are never replaced with zero. Records with an invalid amount stay out of
            the total.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-[11px]">
            {dateIssues > 0 && (
              <li className="rounded-full border border-surface-border bg-surface px-2.5 py-1 text-content-secondary">
                {formatCount(dateIssues)} invalid {dateIssues === 1 ? 'date' : 'dates'}
              </li>
            )}
            {amountIssues > 0 && (
              <li className="rounded-full border border-surface-border bg-surface px-2.5 py-1 text-content-secondary">
                {formatCount(amountIssues)} invalid {amountIssues === 1 ? 'amount' : 'amounts'}
              </li>
            )}
          </ul>
        </div>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-surface-border/60 border-t border-surface-border/60">
        {listed.map((record) => (
          <li key={record.id}>
            <button
              type="button"
              onClick={() => onInspectRecord(record)}
              className={cn(
                'flex w-full items-center gap-3 px-1 py-2 text-left text-[12px]',
                'transition-colors duration-150 ease-smooth hover:bg-surface-elevated/60',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
              )}
            >
              <span className="w-20 shrink-0 tabular-nums text-content-muted">
                Row {formatCount(record.rowNumber)}
              </span>
              <span className="min-w-0 flex-1 truncate text-content-secondary">
                {record.issues
                  .map((issue) => `${issue.field === 'date' ? 'Date' : 'Amount'}: "${issue.originalValue}"`)
                  .join(' · ')}
              </span>
              <Tooltip label="Inspect this row">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-content-muted">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Tooltip>
            </button>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <p className="mt-2 text-[11px] text-content-muted">
          {formatCount(hidden)} more {hidden === 1 ? 'row' : 'rows'} also need attention — use the
          table to open any row.
        </p>
      )}
    </section>
  );
}
