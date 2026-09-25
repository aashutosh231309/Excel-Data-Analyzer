/**
 * Export contracts and data preparation.
 *
 * The renderer builds the rows that are on screen with `buildExportRows` and
 * sends them over the whitelisted bridge; the main process validates them again
 * with `validateExportRequest` before the native save dialog runs and writes the
 * workbook. Nothing here touches the file system, so the exact data that will be
 * exported can be inspected and tested on its own.
 *
 * Only the seven user-facing columns are exported. Internal record ids, vehicle
 * comparison keys and validation metadata never leave the application.
 */
import { isIsoDate, toLocalFileStamp } from './local-date';
import type { TransactionRecord } from './import';

/** Columns of an exported workbook, in the order they appear in the sheet. */
export const EXPORT_COLUMNS = [
  'date',
  'name',
  'vehicleNumber',
  'paymentMode',
  'amount',
  'paymentReason',
  'remark',
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

export const EXPORT_COLUMN_LABELS: Record<ExportColumn, string> = {
  date: 'Date',
  name: 'Name',
  vehicleNumber: 'Vehicle Number',
  paymentMode: 'Payment Mode',
  amount: 'Amount',
  paymentReason: 'Payment Reason',
  remark: 'Remark',
};

/** Worksheet names used for the two export flavours. */
export const EXPORT_SHEET_NAMES = {
  filtered: 'Filtered Data',
  imported: 'Imported Data',
} as const;

export const EXPORT_FILE_STEMS = {
  filtered: 'Filtered_Data',
  imported: 'Imported_Data',
} as const;

/**
 * One exported row.
 *
 * `date` stays an ISO calendar date and `amount` a plain number of rupees: the
 * sheet builder converts them into Excel date serials and numeric cells, so no
 * currency string ever reaches a numeric column.
 */
export interface ExportRow {
  date: string | null;
  name: string;
  vehicleNumber: string;
  paymentMode: string;
  amount: number | null;
  paymentReason: string;
  remark: string;
}

export interface ExportRequest {
  rows: readonly ExportRow[];
  /** Base name offered in the save dialog; the main process sanitizes it. */
  suggestedFileName: string;
  /** True when filters produced the rows, which changes the file name. */
  filtered: boolean;
}

export type ExportStage = 'preparing' | 'awaiting-location' | 'writing';

export interface ExportProgress {
  stage: ExportStage;
  message: string;
}

export const EXPORT_STAGE_MESSAGES: Record<ExportStage, string> = {
  preparing: 'Preparing Excel…',
  'awaiting-location': 'Waiting for a save location…',
  writing: 'Saving file…',
};

export type ExportResult =
  | { status: 'exported'; fileName: string; recordCount: number }
  | { status: 'cancelled' }
  | { status: 'empty' }
  | { status: 'failed'; message: string };

export const EXPORT_EMPTY_MESSAGE = 'No records available to export.';
export const EXPORT_FAILURE_MESSAGE =
  'The filtered data could not be saved. Please choose another location and try again.';
export const EXPORT_INVALID_MESSAGE = 'The export data was not valid, so nothing was written.';
export const EXPORT_SOURCE_FILE_MESSAGE =
  'That is the workbook that is currently loaded. Choose another name so the original file stays untouched.';
export const EXPORT_TOO_LARGE_MESSAGE =
  'This result is too large to export in one file. Filter the records further and try again.';

/** Upper bound of rows a single export may contain. */
export const EXPORT_ROW_LIMIT = 250_000;

/** Longest cell text accepted from the renderer. */
const EXPORT_CELL_LIMIT = 4_000;

/** Excel's 1900 date system: 1970-01-01 is serial 25569. */
const EXCEL_EPOCH_SERIAL = 25_569;
const MS_PER_DAY = 86_400_000;
/** Excel treats 1900 as a leap year, so earlier dates sit one serial lower. */
const EXCEL_LEAP_BUG_CUTOFF_MS = Date.parse('1900-03-01T00:00:00Z');

/**
 * Excel serial number of an ISO calendar date, derived from UTC parts so the
 * value can never shift with the machine's time zone.
 */
export function isoDateToExcelSerial(isoDate: string | null): number | null {
  if (isoDate === null || !isIsoDate(isoDate)) {
    return null;
  }
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(time)) {
    return null;
  }
  const serial = Math.round(time / MS_PER_DAY) + EXCEL_EPOCH_SERIAL;
  return time < EXCEL_LEAP_BUG_CUTOFF_MS ? serial - 1 : serial;
}

/**
 * Integer paise → the number of rupees Excel should store.
 * Invalid amounts stay `null` (a blank cell) instead of becoming 0.
 */
export function exportAmountRupees(amountMinor: number | null): number | null {
  if (amountMinor === null || !Number.isSafeInteger(amountMinor)) {
    return null;
  }
  return amountMinor / 100;
}

/** Builds the export row of one normalized record. */
export function buildExportRow(record: TransactionRecord): ExportRow {
  return {
    date: record.date,
    name: record.name,
    vehicleNumber: record.vehicleNumber,
    paymentMode: record.paymentMode,
    amount: exportAmountRupees(record.amountMinor),
    paymentReason: record.paymentReason,
    remark: record.remark,
  };
}

/**
 * Builds the rows for exactly the records that are passed in — the filtered
 * result set of the interface, in its current order. The records themselves are
 * never modified, and duplicates stay duplicated.
 */
export function buildExportRows(records: readonly TransactionRecord[]): ExportRow[] {
  return records.map(buildExportRow);
}

const UNSAFE_FILE_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F]/g;

/**
 * Makes a file name safe for the save dialog: no path separators or reserved
 * characters, no trailing dots/spaces, a sane length and an `.xlsx` ending.
 */
export function sanitizeExportFileName(name: string): string {
  const withoutExtension = name.replace(/\.xlsx$/i, '');
  const cleaned = withoutExtension
    .replace(UNSAFE_FILE_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .trim();
  const stem = cleaned.length > 0 ? cleaned : EXPORT_FILE_STEMS.filtered;
  return `${stem}.xlsx`;
}

/**
 * File name offered in the save dialog, e.g. `Filtered_Data_25-09-2026.xlsx`.
 *
 * Filtered exports and whole-sheet exports are named differently on purpose, so
 * the file on disk still says which one it is, and the day is the user's local
 * calendar day (the same day the date filter uses).
 */
export function buildExportFileName({
  filtered,
  today = new Date(),
}: {
  filtered: boolean;
  today?: Date;
}): string {
  const stem = filtered ? EXPORT_FILE_STEMS.filtered : EXPORT_FILE_STEMS.imported;
  return sanitizeExportFileName(`${stem}_${toLocalFileStamp(today)}`);
}

export interface ExportValidation {
  request: ExportRequest | null;
  message: string;
  /** Why the payload was refused, so the caller can answer precisely. */
  reason: ExportReason;
}

export type ExportReason = 'empty' | 'invalid' | 'too-large' | null;

function readText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.length > EXPORT_CELL_LIMIT ? value.slice(0, EXPORT_CELL_LIMIT) : value;
}

function readAmount(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function readRow(value: unknown): ExportRow | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = readText(candidate.name);
  const vehicleNumber = readText(candidate.vehicleNumber);
  const paymentMode = readText(candidate.paymentMode);
  const paymentReason = readText(candidate.paymentReason);
  const remark = readText(candidate.remark);
  const amount = readAmount(candidate.amount);
  const date = candidate.date === null || candidate.date === '' ? null : readText(candidate.date);

  if (name === null || vehicleNumber === null || paymentMode === null) {
    return null;
  }
  if (paymentReason === null || remark === null || amount === undefined) {
    return null;
  }
  if (date !== null && !isIsoDate(date)) {
    return null;
  }

  return { date, name, vehicleNumber, paymentMode, amount, paymentReason, remark };
}

/**
 * Validates everything that arrived from the renderer.
 * The renderer is trusted UI, but the main process is the only place that may
 * decide to write a file, so the payload is checked field by field.
 */
export function validateExportRequest(payload: unknown): ExportValidation {
  if (typeof payload !== 'object' || payload === null) {
    return { request: null, message: EXPORT_INVALID_MESSAGE, reason: 'invalid' };
  }

  const candidate = payload as Record<string, unknown>;
  const rawRows = candidate.rows;
  if (!Array.isArray(rawRows)) {
    return { request: null, message: EXPORT_INVALID_MESSAGE, reason: 'invalid' };
  }
  if (rawRows.length === 0) {
    return { request: null, message: EXPORT_EMPTY_MESSAGE, reason: 'empty' };
  }
  if (rawRows.length > EXPORT_ROW_LIMIT) {
    return { request: null, message: EXPORT_TOO_LARGE_MESSAGE, reason: 'too-large' };
  }

  const rows: ExportRow[] = [];
  for (const rawRow of rawRows) {
    const row = readRow(rawRow);
    if (row === null) {
      return { request: null, message: EXPORT_INVALID_MESSAGE, reason: 'invalid' };
    }
    rows.push(row);
  }

  const suggested = typeof candidate.suggestedFileName === 'string' ? candidate.suggestedFileName : '';
  return {
    request: {
      rows,
      suggestedFileName: sanitizeExportFileName(suggested.length > 0 ? suggested : buildExportFileName({ filtered: false })),
      filtered: candidate.filtered === true,
    },
    message: '',
    reason: null,
  };
}

/** True when the two paths point at the same file (Windows-safe comparison). */
export function isSameFilePath(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}
