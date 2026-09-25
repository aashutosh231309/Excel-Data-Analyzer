#!/usr/bin/env node
/**
 * Builds the fictional workbooks used by the manual Windows release checks.
 *
 * These files exist so the Windows run in `docs/WINDOWS_RELEASE_CHECKLIST.md`
 * imports a workbook whose every figure has already been calculated by hand and
 * written down in `validation/EXPECTED_RESULTS.md`. Nothing here is application
 * code: the script only writes spreadsheets. It never reads the application, and
 * the application never reads it.
 *
 * Usage:
 *   node scripts/validation/windows-fixture.mjs [--out <dir>] [--dated-today]
 *
 *   --out <dir>      output directory (default: `validation/`)
 *   --dated-today    add two records dated today and yesterday, so the Today and
 *                    Yesterday filter checks have data on the day of the run
 *
 * All data is invented. No real person, vehicle or payment appears here.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The seven canonical columns, in the order the export must reproduce them. */
const HEADERS = ['Date', 'Name', 'Vehicle Number', 'Payment Mode', 'Amount', 'Payment Reason', 'Remark'];

/** Local calendar date, so the serial written into the file is the intended day. */
function date(year, month, day) {
  return new Date(year, month - 1, day);
}

function localIsoDate(value) {
  const pad = (part) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* Payments September — the main validation sheet (31 records)                 */
/* -------------------------------------------------------------------------- */

/**
 * Group A — the nine bucket boundary values of `AMOUNT_BUCKETS`.
 * Amounts are whole rupees, so minor units are exactly `amount * 100`.
 */
const BOUNDARY_ROWS = [
  ['Aarti Devi', 'UP32AB1234', 'Cash', 0, 'Advance', 'Bucket boundary 0'],
  ['Bimal Singh', 'UP65CD2345', 'UPI', 499, 'Fuel', 'Bucket boundary 499'],
  ['Chetan Rao', 'UP32EF3456', 'Bank Transfer', 500, 'Toll', 'Bucket boundary 500'],
  ['Divya Menon', 'UP65GH4567', 'Cheque', 999, 'Parking', 'Bucket boundary 999'],
  ['Ehsan Ali', 'UP32IJ5678', 'UPI', 1000, 'Fuel', 'Bucket boundary 1000'],
  ['Farida Khan', 'UP65KL6789', 'Cash', 4999, 'Advance', 'Bucket boundary 4999'],
  ['Ganesh Patil', 'UP32MN7890', 'Bank Transfer', 5000, 'Fuel', 'Bucket boundary 5000'],
  ['Hina Verma', 'UP65OP8901', 'UPI', 9999, 'Advance', 'Bucket boundary 9999'],
  ['Irfan Sheikh', 'UP32QR9012', 'Cheque', 10000, 'Toll', 'Bucket boundary 10000'],
].map(([name, vehicle, mode, amount, reason, remark], index) => ({
  date: date(2026, 9, index + 1),
  name,
  vehicle,
  mode,
  amount,
  reason,
  remark,
}));

/**
 * Group B — the data quality cases: one record per quality category, plus one
 * record that carries several problems at once.
 */
const QUALITY_ROWS = [
  { date: date(2026, 9, 10), name: '', vehicle: 'UP65ST0123', mode: 'UPI', amount: 1500, reason: 'Fuel', remark: 'Missing name' },
  { date: date(2026, 9, 11), name: 'Jaya Nair', vehicle: '', mode: 'Cash', amount: 1500, reason: 'Toll', remark: 'Missing vehicle number' },
  { date: date(2026, 9, 12), name: 'Kiran Bose', vehicle: 'UP32UV1234', mode: '', amount: 1500, reason: 'Parking', remark: 'Missing payment mode' },
  { date: date(2026, 9, 13), name: 'Lalita Joshi', vehicle: 'UP65WX2345', mode: 'UPI', amount: '', reason: 'Fuel', remark: 'Blank amount' },
  { date: date(2026, 9, 14), name: 'Mohan Das', vehicle: 'UP32YZ3456', mode: 'Cash', amount: 'N/A', reason: 'Advance', remark: 'Unreadable amount' },
  { date: '', name: 'Nisha Gupta', vehicle: 'UP65AB4567', mode: 'UPI', amount: 2000, reason: 'Fuel', remark: 'Blank date' },
  { date: date(2026, 9, 16), name: 'Ojas Kulkarni', vehicle: 'UP32CD5678', mode: 'Cheque', amount: 2000, reason: '', remark: 'Missing payment reason' },
  { date: date(2026, 9, 17), name: 'Priya Sharma', vehicle: 'UP65EF6789', mode: 'UPI', amount: 2000, reason: 'Fuel', remark: '' },
  { date: 'not a date', name: '', vehicle: '', mode: '', amount: 'abc', reason: '', remark: '' },
];

/**
 * Group C — one exact duplicate: three records identical in all seven fields.
 * The remark is part of the duplicate signature, so it is the same on all three.
 */
const DUPLICATE_ROWS = [1, 2, 3].map(() => ({
  date: date(2026, 9, 19),
  name: 'Sana Qureshi',
  vehicle: 'UP32GH7890',
  mode: 'Cash',
  amount: 2500,
  reason: 'Fuel',
  remark: 'Exact duplicate row',
}));

/**
 * Group D — near duplicates. Every row is the same record, and each one changes
 * exactly one thing, so the run shows which fields the duplicate rule ignores
 * (vehicle separators, name case and spacing) and which ones it does not
 * (amount, payment reason, a different registration).
 *
 * The shared remark is deliberate: a different remark would make every row a
 * different record and the test would prove nothing.
 */
const NEAR_DUPLICATE_REMARK = 'Near duplicate comparison row';

const NEAR_DUPLICATE_ROWS = [
  { date: date(2026, 9, 20), name: 'Tanvi Desai', vehicle: 'UP65IJ8901', mode: 'UPI', amount: 3000, reason: 'Fuel', remark: NEAR_DUPLICATE_REMARK },
  { date: date(2026, 9, 20), name: 'Tanvi Desai', vehicle: 'UP65IJ8901', mode: 'UPI', amount: 3001, reason: 'Fuel', remark: NEAR_DUPLICATE_REMARK },
  { date: date(2026, 9, 20), name: 'Tanvi Desai', vehicle: 'UP65IJ8901', mode: 'UPI', amount: 3000, reason: 'Seal repair', remark: NEAR_DUPLICATE_REMARK },
  { date: date(2026, 9, 20), name: 'Tanvi Desai', vehicle: 'UP65IJ8902', mode: 'UPI', amount: 3000, reason: 'Fuel', remark: NEAR_DUPLICATE_REMARK },
  { date: date(2026, 9, 20), name: 'Tanvi Desai', vehicle: 'UP-65-IJ-8901', mode: 'UPI', amount: 3000, reason: 'Fuel', remark: NEAR_DUPLICATE_REMARK },
  { date: date(2026, 9, 20), name: 'tanvi   desai', vehicle: 'UP65IJ8901', mode: 'UPI', amount: 3000, reason: 'Fuel', remark: NEAR_DUPLICATE_REMARK },
];

/** Group E — one vehicle written three ways, to exercise the Stage 2 rules. */
const VEHICLE_ROWS = [
  { date: date(2026, 9, 21), name: 'Usha Rani', vehicle: 'UP32XY4321', mode: 'Cash', amount: 750, reason: 'Toll', remark: 'Vehicle written plainly' },
  { date: date(2026, 9, 22), name: 'Vikram Seth', vehicle: 'up32 xy 4321', mode: 'UPI', amount: 750, reason: 'Toll', remark: 'Vehicle in lower case with spaces' },
  { date: date(2026, 9, 23), name: 'Wasim Akram', vehicle: 'UP-32-XY-4321', mode: 'Bank Transfer', amount: 750, reason: 'Toll', remark: 'Vehicle with separators' },
];

/**
 * Group F — a written date whose day is greater than 12. Reading it as
 * month-first is impossible, so the record proves the day-first rule.
 */
const WRITTEN_DATE_ROWS = [
  { date: '25/09/2026', name: 'Zoya Mirza', vehicle: 'UP65MN3456', mode: 'Bank Transfer', amount: 1200, reason: 'Fuel', remark: 'Date written as text: 25/09/2026' },
];

/** Two records dated today and yesterday, added only by `--dated-today`. */
function datedTodayRows(now = new Date()) {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return [
    {
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      name: 'Validation Today',
      vehicle: 'UP32TD0001',
      mode: 'Cash',
      amount: 1111,
      reason: 'Fuel',
      remark: 'Imported for the Today filter check',
    },
    {
      date: yesterday,
      name: 'Validation Yesterday',
      vehicle: 'UP32TD0002',
      mode: 'UPI',
      amount: 2222,
      reason: 'Toll',
      remark: 'Imported for the Yesterday filter check',
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Payments October — a second importable sheet (4 records)                    */
/* -------------------------------------------------------------------------- */

const OCTOBER_ROWS = [
  { date: date(2026, 10, 1), name: 'Aarav Bhatt', vehicle: 'UP32ZZ1111', mode: 'UPI', amount: 1200, reason: 'Fuel', remark: 'Second worksheet' },
  { date: date(2026, 10, 2), name: 'Bhavna Rao', vehicle: 'UP32ZZ2222', mode: 'Cash', amount: 800, reason: 'Toll', remark: 'Second worksheet' },
  { date: date(2026, 10, 3), name: 'Chirag Jain', vehicle: 'UP32ZZ3333', mode: 'Cheque', amount: 25000, reason: 'Advance', remark: 'Second worksheet' },
  { date: date(2026, 10, 4), name: 'Dia Kapoor', vehicle: 'UP32ZZ4444', mode: 'Bank Transfer', amount: 450, reason: 'Parking', remark: 'Second worksheet' },
];

/* -------------------------------------------------------------------------- */
/* Pagination workbook — 130 records                                           */
/* -------------------------------------------------------------------------- */

/**
 * The interface offers page sizes of 50, 100 and 250, so a 31 record sheet is
 * always a single page. This workbook holds 130 records — three pages at 50 per
 * page, two at 100 — which makes the next, previous and boundary behaviour
 * observable. Amounts are `index * 100`, so every figure below is trivial to
 * check by hand, and three dates cycle so a filtered count is exercisable too.
 */
const PAGINATION_RECORD_COUNT = 130;
const PAGINATION_DATES = [date(2026, 9, 28), date(2026, 9, 29), date(2026, 9, 30)];
const PAGINATION_MODES = ['Cash', 'UPI', 'Bank Transfer'];

function paginationRows() {
  return Array.from({ length: PAGINATION_RECORD_COUNT }, (_, index) => {
    const number = index + 1;
    return {
      date: PAGINATION_DATES[index % PAGINATION_DATES.length],
      name: `Pagination Record ${String(number).padStart(3, '0')}`,
      vehicle: `UP99PG${String(number).padStart(4, '0')}`,
      mode: PAGINATION_MODES[index % PAGINATION_MODES.length],
      amount: number * 100,
      reason: 'Pagination check',
      remark: 'Fictional record for the pagination checks',
    };
  });
}

/* -------------------------------------------------------------------------- */
/* The legacy workbook (.xls) — 7 records                                      */
/* -------------------------------------------------------------------------- */

const LEGACY_ROWS = [
  { date: date(2026, 9, 5), name: 'Legacy One', vehicle: 'UP32LG1001', mode: 'Cash', amount: 100, reason: 'Fuel', remark: 'Legacy workbook row' },
  { date: date(2026, 9, 6), name: 'Legacy Two', vehicle: 'UP32LG1002', mode: 'UPI', amount: 200, reason: 'Toll', remark: 'Legacy workbook row' },
  { date: '13/09/2026', name: 'Legacy Three', vehicle: 'UP32LG1003', mode: 'Cheque', amount: 300, reason: 'Parking', remark: 'Written date, day 13' },
  { date: date(2026, 9, 7), name: 'Legacy Four', vehicle: 'UP32LG1004', mode: '', amount: 400, reason: 'Fuel', remark: 'Missing payment mode' },
  { date: date(2026, 9, 8), name: 'Legacy Five', vehicle: 'UP32LG1005', mode: 'UPI', amount: '', reason: 'Fuel', remark: 'Blank amount' },
  { date: date(2026, 9, 9), name: 'Legacy Six', vehicle: 'UP32LG1006', mode: 'Cash', amount: 500, reason: 'Toll', remark: 'Exact duplicate row' },
  { date: date(2026, 9, 9), name: 'Legacy Six', vehicle: 'UP32LG1006', mode: 'Cash', amount: 500, reason: 'Toll', remark: 'Exact duplicate row' },
];

/* -------------------------------------------------------------------------- */
/* Sheet helpers                                                               */
/* -------------------------------------------------------------------------- */

function toRow(record) {
  return [
    record.date,
    record.name,
    record.vehicle,
    record.mode,
    record.amount,
    record.reason,
    record.remark,
  ];
}

/** Long prose, so no cell of the cover sheet can ever match a column header. */
function coverSheet(recordCount, datedToday, generatedOn) {
  return [
    ['Excel Data Analyzer — Windows validation workbook'],
    [],
    ['Fictional data. Every name, vehicle number, amount and remark on the following sheets was invented for testing.'],
    ['These are not real people, real vehicles or real payments.'],
    [],
    [`Generated by scripts/validation/windows-fixture.mjs on ${generatedOn}.`],
    [],
    ['Worksheets in this file:'],
    [`  • Cover — this sheet. It has no transaction columns, so the application must not import it.`],
    [`  • Payments September — the main validation sheet, ${recordCount} records${datedToday ? ' including the two dated today and yesterday' : ''}.`],
    ['  • Payments October — a second importable sheet, 4 records.'],
    [],
    ['The application should select "Payments September" by default, because it holds the most data rows.'],
    ['Expected figures for every sheet are written down in validation/EXPECTED_RESULTS.md.'],
  ];
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

function buildMainWorkbook(records, datedToday, generatedOn) {
  const workbook = XLSX.utils.book_new();

  const cover = XLSX.utils.aoa_to_sheet(coverSheet(records.length, datedToday, generatedOn));
  cover['!cols'] = [{ wch: 96 }];
  XLSX.utils.book_append_sheet(workbook, cover, 'Cover');

  const september = XLSX.utils.aoa_to_sheet([HEADERS, ...records.map(toRow)]);
  september['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(workbook, september, 'Payments September');

  const october = XLSX.utils.aoa_to_sheet([HEADERS, ...OCTOBER_ROWS.map(toRow)]);
  october['!cols'] = september['!cols'];
  XLSX.utils.book_append_sheet(workbook, october, 'Payments October');

  return workbook;
}

/** The same seven columns without `Vehicle Number`, so the import must refuse. */
function buildMissingColumnWorkbook() {
  const headers = HEADERS.filter((header) => header !== 'Vehicle Number');
  const rows = [
    ['01/09/2026', 'Missing Column One', 'Cash', 100, 'Fuel', 'Fictional'],
    ['02/09/2026', 'Missing Column Two', 'UPI', 200, 'Toll', 'Fictional'],
    ['03/09/2026', 'Missing Column Three', 'Cheque', 300, 'Advance', 'Fictional'],
  ];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'No Vehicle Column');
  return workbook;
}

function buildPaginationWorkbook() {
  const rows = paginationRows();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...rows.map(toRow)]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Pagination');
  return workbook;
}

function buildLegacyWorkbook() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([HEADERS, ...LEGACY_ROWS.map(toRow)]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Legacy Payments');
  return workbook;
}

function parseArgs(argv) {
  const options = { out: 'validation', datedToday: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--out') {
      options.out = argv[index + 1] ?? options.out;
      index += 1;
    } else if (argument === '--dated-today') {
      options.datedToday = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/validation/windows-fixture.mjs [--out <dir>] [--dated-today]');
    return;
  }

  const outDir = path.resolve(repoRoot, options.out);
  await mkdir(outDir, { recursive: true });
  const generatedOn = localIsoDate(new Date());

  const september = [
    ...BOUNDARY_ROWS,
    ...QUALITY_ROWS,
    ...DUPLICATE_ROWS,
    ...NEAR_DUPLICATE_ROWS,
    ...VEHICLE_ROWS,
    ...WRITTEN_DATE_ROWS,
  ];
  const records = options.datedToday ? [...september, ...datedTodayRows()] : september;

  const mainPath = path.join(outDir, 'Excel Data Analyzer - Validation Data.xlsx');
  XLSX.writeFile(buildMainWorkbook(records, options.datedToday, generatedOn), mainPath, { bookType: 'xlsx' });

  const missingPath = path.join(outDir, 'Excel Data Analyzer - Missing Vehicle Column.xlsx');
  XLSX.writeFile(buildMissingColumnWorkbook(), missingPath, { bookType: 'xlsx' });

  const paginationPath = path.join(outDir, 'Excel Data Analyzer - Pagination Data.xlsx');
  XLSX.writeFile(buildPaginationWorkbook(), paginationPath, { bookType: 'xlsx' });

  const legacyPath = path.join(outDir, 'Excel Data Analyzer - Legacy Validation Data.xls');
  XLSX.writeFile(buildLegacyWorkbook(), legacyPath, { bookType: 'biff8' });

  const corruptPath = path.join(outDir, 'Excel Data Analyzer - Corrupt Workbook.xlsx');
  await writeFile(corruptPath, Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from('this archive is truncated on purpose')]));

  const notAWorkbookPath = path.join(outDir, 'Excel Data Analyzer - Not a Workbook.xlsx');
  await writeFile(
    notAWorkbookPath,
    'This is a plain text file. It has no worksheets, no columns and no records.\n',
    'utf8',
  );

  console.log('Windows validation fixtures written to', path.relative(repoRoot, outDir) || outDir);
  console.log(`  Excel Data Analyzer - Validation Data.xlsx            ${records.length} records on "Payments September"${options.datedToday ? ' (includes today and yesterday)' : ''}`);
  console.log('  Excel Data Analyzer - Missing Vehicle Column.xlsx     no "Vehicle Number" column — the import must refuse it');
  console.log(`  Excel Data Analyzer - Pagination Data.xlsx            ${PAGINATION_RECORD_COUNT} records — three pages at 50, two at 100`);
  console.log(`  Excel Data Analyzer - Legacy Validation Data.xls      ${LEGACY_ROWS.length} records, BIFF8 .xls`);
  console.log('  Excel Data Analyzer - Corrupt Workbook.xlsx           truncated archive — the import must fail cleanly');
  console.log('  Excel Data Analyzer - Not a Workbook.xlsx             plain text with a workbook extension');
  console.log('');
  console.log('Expected figures: validation/EXPECTED_RESULTS.md');
  if (!options.datedToday) {
    console.log('Re-run with --dated-today on the test machine so the Today and Yesterday filter checks have data.');
  }
}

await main();
