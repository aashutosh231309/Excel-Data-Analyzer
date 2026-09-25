/**
 * Domain model for the spreadsheet the application analyses.
 *
 * Stage 1 does not parse workbooks yet, but the record shape is fixed here so
 * later stages (parsing by date/name/vehicle number/amount, filtering, totals,
 * export) can be built on top without restructuring.
 */

/** Column headers expected in the imported workbook, in their canonical order. */
export const RECORD_COLUMNS = [
  'Date',
  'Name',
  'Vehicle Number',
  'Payment Mode',
  'Amount',
  'Payment Reason',
  'Remark',
] as const;

/**
 * A single normalised payment entry coming from the workbook.
 * This is the contract the parsing stage will produce.
 */
export interface PaymentRecord {
  date: string;
  name: string;
  vehicleNumber: string;
  paymentMode: string;
  amount: number;
  paymentReason: string;
  remark: string;
}

/** Aggregate figures shown by the dashboard statistic cards. */
export interface DatasetSummary {
  totalRecords: number;
  filteredRecords: number;
  totalAmount: number;
  averageAmount: number;
}
