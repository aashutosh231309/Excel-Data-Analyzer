import { useEffect, useRef } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { DATA_COLUMNS } from '@/types/domain';
import { formatAmountMinor, formatCount, formatDateIso } from '@/utils/format';
import type { TransactionRecord } from '@shared/import';

interface RecordDetailsPanelProps {
  record: TransactionRecord;
  onClose: () => void;
}

/**
 * Side panel with the complete content of one record.
 *
 * It is how truncated table cells (payment reason, remark) and the affected
 * rows of the validation summary are inspected in full. Values are read-only:
 * this stage never edits the imported data or the source workbook.
 */
export function RecordDetailsPanel({ record, onClose }: RecordDetailsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the panel so keyboard users land inside the dialog and
  // Escape closes it from anywhere.
  useEffect(() => {
    panelRef.current?.focus();
  }, [record.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close record details"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-background/60 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Details of row ${record.rowNumber}`}
        className="relative flex h-full w-full max-w-md flex-col border-l border-surface-border bg-surface shadow-raised outline-none animate-fade-up"
      >
        <header className="flex items-start justify-between gap-4 border-b border-surface-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-content">Record details</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-content-muted">
              <span>Row {formatCount(record.rowNumber)}</span>
              <span aria-hidden="true">·</span>
              <span>{record.date ? formatDateIso(record.date) : 'No normalized date'}</span>
              {record.issues.length > 0 && (
                <Badge variant="warning" icon={<TriangleAlert className="h-3 w-3" aria-hidden="true" />}>
                  Needs attention
                </Badge>
              )}
            </p>
          </div>
          <Tooltip label="Close">
            <IconButton icon={X} label="Close details" onClick={onClose} />
          </Tooltip>
        </header>

        <div className="scroll-smooth-y flex-1 overflow-y-auto px-4 py-4">
          {record.issues.length > 0 && (
            <div className="mb-4 rounded-control border border-warning/30 bg-warning/5 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-warning">
                Import issues
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {record.issues.map((issue) => (
                  <li key={`${issue.field}-${issue.originalValue}`} className="text-[12px] text-content-secondary">
                    <span className="font-medium text-content">
                      {issue.field === 'date' ? 'Date' : 'Amount'}
                    </span>
                    {': '}
                    {issue.message} Original workbook value:{' '}
                    <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-warning">
                      {issue.originalValue || 'empty'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <dl className="flex flex-col gap-4">
            {DATA_COLUMNS.map((column) => (
              <div key={column.field}>
                <dt className="text-[11px] font-medium uppercase tracking-wider text-content-muted">
                  {column.label}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-[13px] text-content">
                  {formatDetailValue(record, column.field)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 border-t border-surface-border pt-3 text-[11px] leading-relaxed text-content-muted">
            Values are shown exactly as imported. The analyzer never edits records and never writes
            back to the Excel file.
          </p>
        </div>
      </div>
    </div>
  );
}

function formatDetailValue(record: TransactionRecord, field: (typeof DATA_COLUMNS)[number]['field']): string {
  switch (field) {
    case 'date':
      return record.date
        ? formatDateIso(record.date)
        : record.issues.find((issue) => issue.field === 'date')?.originalValue || '—';
    case 'amountMinor':
      return record.amountMinor !== null
        ? formatAmountMinor(record.amountMinor)
        : record.issues.find((issue) => issue.field === 'amount')?.originalValue || '—';
    case 'name':
      return record.name || '—';
    case 'vehicleNumber':
      return record.vehicleNumber || '—';
    case 'paymentMode':
      return record.paymentMode || '—';
    case 'paymentReason':
      return record.paymentReason || '—';
    case 'remark':
      return record.remark || '—';
  }
}
