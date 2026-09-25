import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, TriangleAlert } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { DATA_COLUMNS, type DataColumnDefinition } from '@/types/domain';
import { cn } from '@/utils/cn';
import { PLACEHOLDER_VALUE, formatAmountMinor, formatCount, formatDateIso } from '@/utils/format';
import type { TransactionRecord } from '@shared/import';

const PAGE_SIZE_OPTIONS = [50, 100, 250] as const;
const DEFAULT_PAGE_SIZE = 100;

interface DataTableProps {
  records: readonly TransactionRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (record: TransactionRecord) => void;
}

/**
 * Data preview of the imported records.
 *
 * The table renders one page at a time inside its own scroll container, so a
 * workbook with tens of thousands of rows stays responsive without pulling in a
 * virtualization library. Rows keep the workbook order and are never merged:
 * two identical-looking rows are two transactions.
 */
export function DataTable({ records, selectedRecordId, onSelectRecord }: DataTableProps) {
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);

  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));

  // A new dataset (or a different page size) always starts at the first page.
  useEffect(() => {
    setPageIndex(0);
  }, [records, pageSize]);

  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageRecords = useMemo(() => {
    const start = safePageIndex * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, pageSize, safePageIndex]);

  const firstRowNumber = records.length === 0 ? 0 : safePageIndex * pageSize + 1;
  const lastRowNumber = Math.min(records.length, (safePageIndex + 1) * pageSize);

  return (
    <div className="overflow-hidden rounded-panel border border-surface-border bg-background-secondary">
      <div className="max-h-[58vh] overflow-auto scroll-smooth-y">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <colgroup>
            {DATA_COLUMNS.map((column) => (
              <col key={column.field} style={{ width: column.width }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-surface-border">
              {DATA_COLUMNS.map((column) => (
                <th
                  key={column.field}
                  scope="col"
                  className={cn(
                    'select-none px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-content-muted',
                    column.align === 'right' && 'text-right',
                  )}
                >
                  {column.field === 'date' ? (
                    <Tooltip label="Written dates are read day first (DD/MM/YYYY)" side="bottom">
                      <span className="cursor-help underline decoration-dotted underline-offset-4">
                        {column.label}
                      </span>
                    </Tooltip>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRecords.map((record) => (
              <DataRow
                key={record.id}
                record={record}
                selected={record.id === selectedRecordId}
                onSelect={onSelectRecord}
              />
            ))}
          </tbody>
        </table>
      </div>

      <PaginationFooter
        totalRecords={records.length}
        firstRowNumber={firstRowNumber}
        lastRowNumber={lastRowNumber}
        pageIndex={safePageIndex}
        pageCount={pageCount}
        pageSize={pageSize}
        onPageChange={setPageIndex}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

interface DataRowProps {
  record: TransactionRecord;
  selected: boolean;
  onSelect: (record: TransactionRecord) => void;
}

function DataRow({ record, selected, onSelect }: DataRowProps) {
  const dateIssue = record.issues.find((issue) => issue.field === 'date');
  const amountIssue = record.issues.find((issue) => issue.field === 'amount');
  const hasIssues = record.issues.length > 0;

  return (
    <tr
      tabIndex={0}
      aria-label={`Row ${record.rowNumber}${hasIssues ? ' — needs attention' : ''}. Open details.`}
      onClick={() => onSelect(record)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(record);
        }
      }}
      className={cn(
        'cursor-pointer border-b border-surface-border/60 transition-colors duration-150 ease-smooth',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
        selected ? 'bg-accent/10' : 'hover:bg-surface-elevated/60',
      )}
    >
      <td className="px-3 py-2 align-top tabular-nums">
        {record.date ? (
          <span className="text-content-secondary">{formatDateIso(record.date)}</span>
        ) : dateIssue ? (
          <InvalidCell value={dateIssue.originalValue} title={`Unrecognized date: ${dateIssue.originalValue}`} />
        ) : (
          <span className="text-content-muted">{PLACEHOLDER_VALUE}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <span className="block truncate font-medium text-content" title={record.name || undefined}>
          {record.name || <span className="font-normal text-content-muted">{PLACEHOLDER_VALUE}</span>}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        {record.vehicleNumber ? (
          <span
            className="block truncate font-medium tracking-wide text-content-secondary"
            title={record.vehicleNumber}
          >
            {record.vehicleNumber}
          </span>
        ) : (
          <span className="text-content-muted">{PLACEHOLDER_VALUE}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <span className="block truncate text-content-secondary" title={record.paymentMode || undefined}>
          {record.paymentMode || <span className="text-content-muted">{PLACEHOLDER_VALUE}</span>}
        </span>
      </td>
      <td className="px-3 py-2 text-right align-top tabular-nums">
        {record.amountMinor !== null ? (
          <span className="font-medium text-content">{formatAmountMinor(record.amountMinor)}</span>
        ) : amountIssue ? (
          <InvalidCell
            value={amountIssue.originalValue}
            title={`Not a valid amount: ${amountIssue.originalValue} — excluded from the totals`}
            align="right"
          />
        ) : (
          <span className="text-content-muted">{PLACEHOLDER_VALUE}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <span className="block truncate text-content-secondary" title={record.paymentReason || undefined}>
          {record.paymentReason || <span className="text-content-muted">{PLACEHOLDER_VALUE}</span>}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="block truncate text-content-muted" title={record.remark || undefined}>
          {record.remark || PLACEHOLDER_VALUE}
        </span>
      </td>
    </tr>
  );
}

/** Shows the original workbook text for a value that could not be interpreted. */
function InvalidCell({
  value,
  title,
  align = 'left',
}: {
  value: string;
  title: string;
  align?: 'left' | 'right';
}) {
  return (
    <span
      className={cn('flex items-center gap-1.5 text-warning', align === 'right' && 'justify-end')}
      title={title}
    >
      <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{value || 'empty'}</span>
      <span className="sr-only">needs attention</span>
    </span>
  );
}

interface PaginationFooterProps {
  totalRecords: number;
  firstRowNumber: number;
  lastRowNumber: number;
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function PaginationFooter({
  totalRecords,
  firstRowNumber,
  lastRowNumber,
  pageIndex,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border bg-surface px-3 py-2.5">
      <p className="text-[11px] tabular-nums text-content-muted">
        Showing {formatCount(firstRowNumber)}–{formatCount(lastRowNumber)} of{' '}
        {formatCount(totalRecords)} records · page {pageIndex + 1} of {pageCount}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[11px] text-content-muted">
          Rows per page
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className={cn(
              'h-8 rounded-control border border-surface-border bg-surface-elevated px-2 text-[11px] text-content-secondary',
              'transition-colors duration-150 hover:border-accent/40 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30',
            )}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <PageButton label="First page" icon={ChevronsLeft} disabled={pageIndex === 0} onClick={() => onPageChange(0)} />
          <PageButton
            label="Previous page"
            icon={ChevronLeft}
            disabled={pageIndex === 0}
            onClick={() => onPageChange(pageIndex - 1)}
          />
          <PageButton
            label="Next page"
            icon={ChevronRight}
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onPageChange(pageIndex + 1)}
          />
          <PageButton
            label="Last page"
            icon={ChevronsRight}
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onPageChange(pageCount - 1)}
          />
        </div>
      </div>
    </div>
  );
}

interface PageButtonProps {
  label: string;
  icon: typeof ChevronLeft;
  disabled: boolean;
  onClick: () => void;
}

function PageButton({ label, icon: Icon, disabled, onClick }: PageButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-control text-content-muted',
          'transition-colors duration-150 ease-smooth',
          'hover:bg-surface-elevated hover:text-content disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

export type { DataColumnDefinition };
