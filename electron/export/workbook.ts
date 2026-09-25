import * as XLSX from 'xlsx';
import {
  EXPORT_COLUMNS,
  EXPORT_COLUMN_LABELS,
  EXPORT_SHEET_NAMES,
  isoDateToExcelSerial,
  type ExportRow,
} from '../shared/export';

/**
 * Excel export (writing).
 *
 * Kept out of `electron/excel/`: everything under that folder only ever *reads*
 * a workbook, which is what makes the "the source file is never written to"
 * guarantee easy to audit. Writing an export lives here and only ever touches
 * the path the user picked in the native save dialog.

 *
 * The sheet is built with the community build of SheetJS and contains exactly
 * the seven user-facing columns, in their fixed order. Amounts are written as
 * numbers (never as ₹-strings) and dates as real Excel dates with a `dd/mm/yyyy`
 * number format, so the exported file stays usable for calculations, sorting and
 * filtering in Excel.
 */

export const EXPORT_DATE_FORMAT = 'dd/mm/yyyy';
export const EXPORT_AMOUNT_FORMAT = '#,##0.00';

/** Column widths (characters) that keep the export readable when it opens. */
const EXPORT_COLUMN_WIDTHS: Record<(typeof EXPORT_COLUMNS)[number], number> = {
  date: 12,
  name: 24,
  vehicleNumber: 18,
  paymentMode: 15,
  amount: 14,
  paymentReason: 32,
  remark: 36,
};

const DATE_COLUMN_INDEX = EXPORT_COLUMNS.indexOf('date');
const AMOUNT_COLUMN_INDEX = EXPORT_COLUMNS.indexOf('amount');

/** Header row followed by one row per record, in the canonical column order. */
export function buildExportWorksheet(rows: readonly ExportRow[]): XLSX.WorkSheet {
  const header = EXPORT_COLUMNS.map((column) => EXPORT_COLUMN_LABELS[column]);
  const body = rows.map((row) =>
    EXPORT_COLUMNS.map((column) => {
      switch (column) {
        case 'date':
          // A real Excel date serial: sortable and filterable in Excel.
          return isoDateToExcelSerial(row.date);
        case 'amount':
          // A plain number, so the column can be summed in Excel.
          return row.amount;
        case 'name':
          return row.name;
        case 'vehicleNumber':
          return row.vehicleNumber;
        case 'paymentMode':
          return row.paymentMode;
        case 'paymentReason':
          return row.paymentReason;
        case 'remark':
          return row.remark;
      }
    }),
  );

  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);

  sheet['!cols'] = EXPORT_COLUMNS.map((column) => ({ wch: EXPORT_COLUMN_WIDTHS[column] }));

  // The date and amount cells keep their numeric value and gain the display
  // format the user expects; a blank stays blank.
  for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: DATE_COLUMN_INDEX })];
    if (dateCell) {
      dateCell.t = 'n';
      dateCell.z = EXPORT_DATE_FORMAT;
    }
    const amountCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: AMOUNT_COLUMN_INDEX })];
    if (amountCell) {
      amountCell.t = 'n';
      amountCell.z = EXPORT_AMOUNT_FORMAT;
    }
  }

  // An AutoFilter over the header makes the exported sheet immediately usable.
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: range.e }) };

  return sheet;
}

export function buildExportWorkbook(rows: readonly ExportRow[], filtered: boolean): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    buildExportWorksheet(rows),
    filtered ? EXPORT_SHEET_NAMES.filtered : EXPORT_SHEET_NAMES.imported,
  );
  return workbook;
}

/**
 * Writes the workbook to the path chosen in the native save dialog.
 * Throws when the destination cannot be written; the caller turns that into the
 * user-facing message and logs the technical detail.
 */
export function writeExportWorkbook(
  rows: readonly ExportRow[],
  filtered: boolean,
  filePath: string,
): void {
  XLSX.writeFile(buildExportWorkbook(rows, filtered), filePath, {
    bookType: 'xlsx',
    compression: true,
  });
}
