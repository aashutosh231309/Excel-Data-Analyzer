/**
 * Fictional spreadsheet fixtures for the verification suites.
 *
 * Everything here is invented data: no real names, vehicles, amounts or
 * companies. Workbooks are generated in a temporary directory at test time and
 * deleted afterwards, so no spreadsheet binary is ever committed.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

/** Header spellings deliberately messy: casing, padding and a known alias. */
export const MESSY_HEADERS = [
  ' Date ',
  'Name',
  'VEHICLE NUMBER',
  'Payment Mode',
  'Amount',
  'Payment Reason',
  'Remark',
];

/** Alias spellings used by the second worksheet. */
export const ALIAS_HEADERS = ['Date', 'Name', 'Vehicle No', 'Payment Mode', 'Amount (INR)', 'Remark'];

/** Excel epoch arithmetic: serial 1 is 1900-01-01. */
export function excelSerialFor(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const days = (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return Math.round(days);
}

/** Serial for the 1904 date system used by some Mac workbooks. */
export function excelSerialForDate1904(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1904, 0, 1)) / 86_400_000);
}

function buildSheet(rows, options = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (options.dateColumn !== undefined) {
    // Numbers stay numbers; only the format is applied so the reader sees a
    // genuinely date-formatted cell.
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex - 1, c: options.dateColumn });
      const cell = sheet[cellAddress];
      if (cell && typeof cell.v === 'number') {
        cell.z = 'dd/mm/yyyy';
        cell.t = 'n';
      }
    }
  }
  return sheet;
}

function writeWorkbook(sheets, filePath, bookType, { date1904 = false } = {}) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, buildSheet(sheet.rows, sheet.options), sheet.name);
  }
  if (date1904) {
    workbook.Workbook = { WBProps: { date1904: true } };
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType, cellDates: true });
  return writeFile(filePath, buffer);
}

/**
 * The main fixture: mixed date representations, varied currency spellings, two
 * invalid amounts, blank optional cells, a completely empty row and two
 * identical-looking rows that must both survive.
 */
export const PAYMENTS_ROWS = [
  MESSY_HEADERS,
  [excelSerialFor('2026-04-01'), '  Raj   Kumar ', 'up32ab1234', ' UPI ', 2000, 'Fuel', 'Weekly settlement'],
  [new Date(2026, 3, 2), 'Sunita Devi', 'UP-78 XY 9876', 'Cash', '2000.00', '', ''],
  ['03/04/2026', 'Amit Singh', 'DL 01 AB 1234', 'Bank Transfer', '₹2,000', 'Repair', ''],
  ['2026-04-05', 'Neha Verma', 'up32ab1234', 'UPI', '₹ 2,000.00', 'Toll', 'Paid in full'],
  ['not a date', 'Vikram Rao', 'UP32AB9999', 'Cash', 'abc', 'Advance', 'Needs review'],
  [null, null, null, null, null, null, null],
  [new Date(2026, 3, 2), 'Sunita Devi', 'UP-78 XY 9876', 'Cash', '2000.00', '', ''],
  ['2026-04-07', 'Rakesh Gupta', 'UP32CD5678', 'Cheque', 'N/A', 'Parts', ''],
  ['2026-04-08', '  ', 'up32ab1234', 'UPI', 1500.5, 'Fuel', '  '],
  ['2026-04-09', 'Meera Iyer', 'KA 05 MN 4321', 'UPI', '₹1,23,456.78', 'Maintenance', 'Invoice 42'],
];

/** Row indexes (1-based sheet rows) with a deliberately unusable value. */
export const PAYMENTS_INVALID_DATE_ROW = 6;
export const PAYMENTS_INVALID_AMOUNT_ROW = 6;
export const PAYMENTS_SECOND_INVALID_AMOUNT_ROW = 9;
export const PAYMENTS_EMPTY_ROW = 7;

/** Second worksheet: alias headers, a title row above the headers, other figures. */
export function createAliasSheet() {
  return {
    name: 'July Payments',
    rows: [
      ['Fictional July Ledger'],
      ['Prepared for verification only'],
      ALIAS_HEADERS,
      ['01/07/2026', 'Anita Sharma', 'UP32GH7788', 'UPI', 4500, 'Repair'],
      ['02/07/2026', 'Anita Sharma', 'UP32GH7788', 'Cash', 1200, 'Fuel'],
    ],
  };
}

/** A worksheet without the expected columns at all. */
export function createReadmeSheet() {
  return {
    name: 'Read me',
    rows: [
      ['Fictional workbook for automated verification.'],
      ['No transaction columns on this sheet — the importer must not use it.'],
    ],
  };
}

/**
 * Writes every fixture workbook into `directory` and returns a lookup of
 * `ExcelFileSelection` objects, exactly as the picker would produce them.
 */
export async function writeFixtures(directory) {
  const files = {
    xlsx: path.join(directory, 'fictional-payments.xlsx'),
    xls: path.join(directory, 'fictional-payments.xls'),
    multiSheet: path.join(directory, 'fictional-multi-sheet.xlsx'),
    missingColumns: path.join(directory, 'fictional-missing-columns.xlsx'),
    empty: path.join(directory, 'fictional-empty.xlsx'),
    corrupt: path.join(directory, 'fictional-corrupt.xlsx'),
    aliasOnly: path.join(directory, 'fictional-alias-headers.xlsx'),
    date1904: path.join(directory, 'fictional-date1904.xlsx'),
  };

  await writeWorkbook([{ name: 'Payments', rows: PAYMENTS_ROWS }], files.xlsx, 'xlsx');
  await writeWorkbook([{ name: 'Payments', rows: PAYMENTS_ROWS }], files.xls, 'biff8');
  await writeWorkbook(
    [
      createReadmeSheet(),
      { name: 'Payments', rows: PAYMENTS_ROWS },
      createAliasSheet(),
    ],
    files.multiSheet,
    'xlsx',
  );
  await writeWorkbook(
    [
      {
        name: 'Ledger',
        rows: [
          ['Date', 'Name', 'Payment Mode', 'Amount'],
          ['2026-04-01', 'Fictional Vendor', 'UPI', 100],
        ],
      },
    ],
    files.missingColumns,
    'xlsx',
  );
  await writeWorkbook([{ name: 'Payments', rows: [MESSY_HEADERS] }], files.empty, 'xlsx');
  await writeWorkbook([createAliasSheet()], files.aliasOnly, 'xlsx');
  // A workbook saved with the 1904 date system: the same calendar date has a
  // different serial number, so it must not be read with the 1900 offset.
  await writeWorkbook(
    [
      {
        name: 'Payments',
        rows: [
          MESSY_HEADERS,
          [excelSerialForDate1904('2026-04-03'), 'Fictional Person', 'UP32AB1234', 'UPI', 1000, 'Fuel', ''],
        ],
      },
    ],
    files.date1904,
    'xlsx',
    { date1904: true },
  );

  const corruptBuffer = Buffer.from('this is not a spreadsheet at all', 'utf8');
  // A real Zip local-file header makes the path look plausible, which is the
  // most likely real-world failure (a truncated or mislabelled download).
  Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]).copy(corruptBuffer, 0);
  await writeFile(files.corrupt, corruptBuffer);

  const workbookSheets = {
    xlsx: ['Payments'],
    xls: ['Payments'],
    multiSheet: [createReadmeSheet().name, 'Payments', createAliasSheet().name],
    missingColumns: ['Ledger'],
    empty: ['Payments'],
    corrupt: [],
    aliasOnly: [createAliasSheet().name],
    date1904: ['Payments'],
  };

  const selections = {};
  for (const [key, filePath] of Object.entries(files)) {
    const extension = path.extname(filePath).slice(1);
    selections[key] = {
      filePath,
      extension,
      sheetNames: workbookSheets[key],
      selection: {
        name: path.basename(filePath),
        path: filePath,
        extension,
        sizeInBytes: 15_000 + key.length,
        selectionId: `fixture-${key}`,
      },
    };
  }

  return selections;
}
