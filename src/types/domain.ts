import type { TransactionRecord } from '@shared/import';

/**
 * Display schema of the imported data.
 *
 * The record shape itself lives in `@shared/import` because it is produced by
 * the Electron main process; this file only describes how those fields are
 * presented, so the table, the details panel and the roadmap stay in sync.
 */

/** Fields of a record that can be shown in the data table. */
export type DisplayField =
  | 'date'
  | 'name'
  | 'vehicleNumber'
  | 'paymentMode'
  | 'amountMinor'
  | 'paymentReason'
  | 'remark';

export interface DataColumnDefinition {
  field: DisplayField;
  label: string;
  /** Relative column width used by the table layout. */
  width: string;
  align: 'left' | 'right';
  /** Long free-text columns are truncated in the table and shown in the details panel. */
  truncate: boolean;
}

/** Columns of the data preview, in their canonical order. */
export const DATA_COLUMNS: readonly DataColumnDefinition[] = [
  { field: 'date', label: 'Date', width: '10%', align: 'left', truncate: false },
  { field: 'name', label: 'Name', width: '16%', align: 'left', truncate: false },
  { field: 'vehicleNumber', label: 'Vehicle Number', width: '13%', align: 'left', truncate: false },
  { field: 'paymentMode', label: 'Payment Mode', width: '12%', align: 'left', truncate: false },
  { field: 'amountMinor', label: 'Amount', width: '12%', align: 'right', truncate: false },
  { field: 'paymentReason', label: 'Payment Reason', width: '18%', align: 'left', truncate: true },
  { field: 'remark', label: 'Remark', width: '19%', align: 'left', truncate: true },
];

/** Column labels only, used by descriptive UI such as the roadmap card. */
export const RECORD_COLUMNS: readonly string[] = DATA_COLUMNS.map((column) => column.label);

/** The fields shown in the record details panel, in the same order as the table. */
export const DETAIL_FIELDS: readonly DisplayField[] = DATA_COLUMNS.map((column) => column.field);

/**
 * Reads one display field from a record.
 * Kept next to the column definitions so both stay aligned.
 */
export function readDisplayField(record: TransactionRecord, field: DisplayField): string | number | null {
  switch (field) {
    case 'date':
    case 'name':
    case 'vehicleNumber':
    case 'paymentMode':
    case 'amountMinor':
    case 'paymentReason':
    case 'remark':
      return record[field];
  }
}
