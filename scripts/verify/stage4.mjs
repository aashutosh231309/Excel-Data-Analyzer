/**
 * Stage 4 verification suite: filtered Excel export and production UX.
 *
 *   1. export rows      — pure data preparation (what is exported, and as what)
 *   2. export workbook  — the real .xlsx written by SheetJS, re-read and checked
 *   3. export main      — the native save dialog, the write and every failure path
 *   4. export ui        — the button, its states, the notifications, the payload
 *   5. resilience       — failed replacement, error boundary, invalid filters
 *   6. ux               — chips, collapse, table and pagination polish
 *
 * Electron itself cannot run here: the main process is exercised through an
 * injected mock of the `electron` module, and the Windows picker, the packaged
 * application and `npm run dev` remain manual checks (see README).
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import * as esbuild from 'esbuild';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import {
  Module,
  buildImportedWorkbook,
  buildRecord,
  bundleModule,
  createMockBridge,
  createRecorder,
  listSourceFiles,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  requireFromHarness,
  root,
  stripComments,
} from './harness.mjs';

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** The four-row dataset of the Stage 4 specification. */
const SPEC_ROWS = [
  {
    rowNumber: 2,
    date: '2026-09-25',
    name: 'Raj Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'Cash',
    amountMinor: 200000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  {
    rowNumber: 3,
    date: '2026-09-25',
    name: 'Raj Kumar',
    vehicleNumber: 'UP32CD5678',
    paymentMode: 'UPI',
    amountMinor: 150000,
    paymentReason: 'Repair',
    remark: '',
  },
  {
    rowNumber: 4,
    date: '2026-09-25',
    name: 'Amit',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'Cash',
    amountMinor: 300000,
    paymentReason: 'Toll',
    remark: '',
  },
  {
    rowNumber: 5,
    date: '2026-09-26',
    name: 'Raj Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'Cash',
    amountMinor: 50000,
    paymentReason: 'Fuel',
    remark: '',
  },
];

const EXPORT_HEADERS = [
  'Date',
  'Name',
  'Vehicle Number',
  'Payment Mode',
  'Amount',
  'Payment Reason',
  'Remark',
];

const ROW_FIELDS = [
  'amount',
  'date',
  'name',
  'paymentMode',
  'paymentReason',
  'remark',
  'vehicleNumber',
].sort();

const EXPORT_FILE = {
  name: 'transactions_september.xlsx',
  path: 'C:\\Reports\\transactions_september.xlsx',
  extension: 'xlsx',
  sizeInBytes: 15_360,
  selectionId: 'stage4-1',
};

function specRecords(rows = SPEC_ROWS) {
  return rows.map((row) =>
    buildRecord({
      id: `Payments#${row.rowNumber}`,
      issues: [],
      ...row,
    }),
  );
}

/** Statistics of a record list, computed the way the importer would. */
function statisticsFor(records) {
  const withAmount = records.filter((record) => record.amountMinor !== null);
  const totalAmountMinor = withAmount.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0);
  return {
    rowsScanned: records.length,
    emptyRowsIgnored: 0,
    importedRecords: records.length,
    validRecords: records.filter((record) => record.issues.length === 0).length,
    recordsWithIssues: records.filter((record) => record.issues.length > 0).length,
    recordsWithAmount: withAmount.length,
    totalAmountMinor,
    averageAmountMinor:
      withAmount.length === 0 ? null : Math.round(totalAmountMinor / withAmount.length),
  };
}

const pad = (value) => String(value).padStart(2, '0');
/** Today in the tester's local calendar, computed independently of the app. */
function localTodayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function localDateStamp(now = new Date()) {
  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                       */
/* -------------------------------------------------------------------------- */

export async function runStage4(workspace) {
  const modules = {
    client: await bundleModule(
      'electron/shared/export.ts',
      path.join(workspace, 'export-shared.cjs'),
    ),
    writer: await bundleModule(
      'electron/export/workbook.ts',
      path.join(workspace, 'export-writer.cjs'),
    ),
  };
  const xlsx = requireFromHarness('xlsx');

  await verifyExportRows(modules, workspace);
  await verifyExportWorkbook(modules, workspace, xlsx);
  await verifyExportMainProcess(modules, workspace, xlsx);
  await verifyExportUi(workspace);
  await verifyResilience(workspace);
  await verifyUx(workspace);
  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* 1. Export rows                                                              */
/* -------------------------------------------------------------------------- */

const GROUP_ROWS = 'export rows';

async function verifyExportRows(modules, workspace) {
  const { client } = modules;
  const records = specRecords();

  const rows = client.buildExportRows(records);
  check(GROUP_ROWS, 'one export row per record', rows.length === records.length);
  check(
    GROUP_ROWS,
    'a row carries exactly the seven exported fields',
    rows.every((row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(ROW_FIELDS)),
    JSON.stringify(rows[0]),
  );
  check(
    GROUP_ROWS,
    'internal identifiers and comparison keys never reach the file',
    !JSON.stringify(rows).includes('Payments#') && !JSON.stringify(rows).includes('vehicleKey'),
  );
  check(
    GROUP_ROWS,
    'amounts are converted from paise to plain numbers',
    rows[0].amount === 2000 && typeof rows[0].amount === 'number',
    String(rows[0].amount),
  );
  check(
    GROUP_ROWS,
    'a half-rupee amount keeps its paise',
    client.exportAmountRupees(150050) === 1500.5,
    String(client.exportAmountRupees(150050)),
  );
  check(
    GROUP_ROWS,
    'an unreadable amount stays empty instead of becoming ₹0',
    client.exportAmountRupees(null) === null,
  );
  check(
    GROUP_ROWS,
    'a genuine zero amount stays zero',
    client.exportAmountRupees(0) === 0,
  );
  check(
    GROUP_ROWS,
    'dates stay ISO in the payload and become serials only when written',
    rows[0].date === '2026-09-25' && rows.every((row) => row.date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.date)),
  );
  check(GROUP_ROWS, 'an unreadable date stays empty', client.buildExportRows([buildRecord({ id: 'x' })])[0].date === null);
  check(
    GROUP_ROWS,
    'duplicates are exported as separate rows',
    client.buildExportRows(specRecords([SPEC_ROWS[0], { ...SPEC_ROWS[0], rowNumber: 9 }])).length === 2,
  );

  // Building the rows must never touch the dataset the interface is showing.
  const snapshot = JSON.stringify(records);
  const order = records.map((record) => record.id).join('|');
  client.buildExportRows(records);
  check(
    GROUP_ROWS,
    'preparing an export never modifies the in-memory records',
    JSON.stringify(records) === snapshot && records.map((record) => record.id).join('|') === order,
  );

  // Excel serial numbers, checked against constants that are not derived here.
  const serials = [
    ['1900-01-01', 1],
    ['1970-01-01', 25569],
    ['2026-04-03', 46115],
    ['2026-09-25', 46290],
    ['2026-12-31', 46387],
  ];
  check(
    GROUP_ROWS,
    'dates become the exact Excel serial numbers',
    serials.every(([iso, serial]) => client.isoDateToExcelSerial(iso) === serial),
    serials.map(([iso]) => `${iso}=${client.isoDateToExcelSerial(iso)}`).join(' '),
  );
  check(
    GROUP_ROWS,
    'an empty or invalid date has no serial',
    client.isoDateToExcelSerial(null) === null && client.isoDateToExcelSerial('25/09/2026') === null,
  );

  // File names.
  check(
    GROUP_ROWS,
    'the filtered file name carries the date and the format',
    /^Filtered_Data_\d{2}-\d{2}-\d{4}\.xlsx$/.test(client.buildExportFileName({ filtered: true })),
    client.buildExportFileName({ filtered: true }),
  );
  check(
    GROUP_ROWS,
    'the unfiltered export is named differently on purpose',
    /^Imported_Data_\d{2}-\d{2}-\d{4}\.xlsx$/.test(client.buildExportFileName({ filtered: false })),
    client.buildExportFileName({ filtered: false }),
  );
  check(
    GROUP_ROWS,
    'the file name uses the local calendar day, not UTC',
    client.buildExportFileName({ filtered: true, today: new Date(2026, 11, 31, 23, 30) }) ===
      'Filtered_Data_31-12-2026.xlsx' &&
      client.buildExportFileName({ filtered: true, today: new Date(2026, 8, 25, 0, 30) }) ===
        'Filtered_Data_25-09-2026.xlsx',
    client.buildExportFileName({ filtered: true, today: new Date(2026, 11, 31, 23, 30) }),
  );
  check(
    GROUP_ROWS,
    'unsafe file name characters are removed',
    client.sanitizeExportFileName('a/b\\c:d*e?f"g<h>i|j.xlsx') === 'a-b-c-d-e-f-g-h-i-j.xlsx',
    client.sanitizeExportFileName('a/b\\c:d*e?f"g<h>i|j.xlsx'),
  );
  check(
    GROUP_ROWS,
    'a path or extension cannot be smuggled through the suggested name',
    !client.sanitizeExportFileName('..\\Windows\\System32\\evil.exe').includes('\\') &&
      client.sanitizeExportFileName('report.xls').endsWith('.xlsx'),
    client.sanitizeExportFileName('..\\Windows\\System32\\evil.exe'),
  );
  check(
    GROUP_ROWS,
    'an empty suggested name falls back to a safe default',
    client.sanitizeExportFileName('   ') === 'Filtered_Data.xlsx',
    client.sanitizeExportFileName('   '),
  );
  check(
    GROUP_ROWS,
    'a very long name stays inside the file-system limit',
    client.sanitizeExportFileName('n'.repeat(400)).length <= 110,
  );

  // Payload validation on the trusted side.
  const validRequest = {
    rows: client.buildExportRows(records),
    suggestedFileName: client.buildExportFileName({ filtered: false }),
    filtered: false,
  };
  const validated = client.validateExportRequest(validRequest);
  check(
    GROUP_ROWS,
    'a valid payload passes validation with its rows intact',
    validated.request !== null &&
      validated.request.rows.length === 4 &&
      validated.reason === null &&
      validated.message === '',
  );
  check(
    GROUP_ROWS,
    'an empty payload is refused with the empty-result message',
    client.validateExportRequest({ rows: [], suggestedFileName: 'x' }).reason === 'empty' &&
      client.validateExportRequest({ rows: [] }).message === client.EXPORT_EMPTY_MESSAGE,
  );
  check(
    GROUP_ROWS,
    'a non-array payload is refused',
    client.validateExportRequest({ rows: 'nope' }).request === null &&
      client.validateExportRequest(null).message === client.EXPORT_INVALID_MESSAGE,
  );
  const brokenRows = [
    { ...validRequest.rows[0], amount: 'two thousand' },
    { ...validRequest.rows[0], date: '25/09/2026' },
    { ...validRequest.rows[0], name: 42 },
    { ...validRequest.rows[0], paymentReason: null },
  ];
  check(
    GROUP_ROWS,
    'each malformed field is refused instead of being guessed',
    brokenRows.every(
      (row) => client.validateExportRequest({ rows: [row] }).request === null,
    ),
  );
  check(
    GROUP_ROWS,
    'an oversized payload is refused before anything is written',
    client.validateExportRequest({
      rows: Array.from({ length: client.EXPORT_ROW_LIMIT + 1 }, () => validRequest.rows[0]),
    }).message === client.EXPORT_TOO_LARGE_MESSAGE,
  );
  check(
    GROUP_ROWS,
    'unknown extra fields are dropped, not exported',
    (() => {
      const result = client.validateExportRequest({
        rows: [{ ...validRequest.rows[0], id: 'Payments#2', vehicleKey: 'UP32AB1234' }],
      });
      return (
        result.request !== null &&
        JSON.stringify(Object.keys(result.request.rows[0]).sort()) === JSON.stringify(ROW_FIELDS)
      );
    })(),
  );

  // Path comparison used by the source-file guard.
  check(
    GROUP_ROWS,
    'the same file is recognised through case and separators',
    client.isSameFilePath('C:\\Reports\\payments.xlsx', 'c:/reports/payments.xlsx') &&
      !client.isSameFilePath('C:\\Reports\\payments.xlsx', 'C:\\Reports\\payments (1).xlsx'),
  );

  // The renderer-facing module stays free of privileged code.
  const shared = stripComments(await readSource('electron/shared/export.ts'));
  check(
    GROUP_ROWS,
    'the shared export module imports no file system or Electron API',
    !/from 'node:|from "node:|from 'fs|require\(|from 'electron'/.test(shared),
  );
  const writerSource = stripComments(await readSource('electron/export/workbook.ts'));
  check(
    GROUP_ROWS,
    'writing happens in one reviewed module, away from the read-only importer',
    /XLSX\.writeFile/.test(writerSource) && !existsSync(path.join(workspace, 'electron/excel/export.ts')),
  );
  const excelSources = await listSourceFiles('electron/excel');
  const excelCode = await Promise.all(excelSources.map((file) => readSource(file)));
  check(
    GROUP_ROWS,
    'nothing under electron/excel ever writes to disk',
    excelCode.every((source) => !/writeFile|writeFileSync|unlink|rename\(/.test(source)),
    excelSources.join(', '),
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Export workbook                                                          */
/* -------------------------------------------------------------------------- */

const GROUP_WORKBOOK = 'export workbook';

async function verifyExportWorkbook(modules, workspace, xlsx) {
  const { client, writer } = modules;
  const records = specRecords();
  const rows = client.buildExportRows(records);

  const sheet = writer.buildExportWorksheet(rows);
  const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true });
  check(
    GROUP_WORKBOOK,
    'the header row is exactly the seven columns in order',
    JSON.stringify(matrix[0]) === JSON.stringify(EXPORT_HEADERS),
    JSON.stringify(matrix[0]),
  );
  check(
    GROUP_WORKBOOK,
    'the sheet holds one header row plus one row per record',
    matrix.length === 5 && String(sheet['!ref']).startsWith('A1:G5'),
    String(sheet['!ref']),
  );
  check(
    GROUP_WORKBOOK,
    'no cell is written outside the seven exported columns',
    Object.keys(sheet)
      .filter((key) => !key.startsWith('!'))
      .every((key) => /^[A-G][0-9]+$/.test(key)),
    Object.keys(sheet)
      .filter((key) => !key.startsWith('!') && !/^[A-G][0-9]+$/.test(key))
      .join(', '),
  );

  const firstDataRow = 1;
  const dateCell = sheet[xlsx.utils.encode_cell({ r: firstDataRow, c: 0 })];
  const amountCell = sheet[xlsx.utils.encode_cell({ r: firstDataRow, c: 4 })];
  check(
    GROUP_WORKBOOK,
    'the amount is a real number Excel can calculate with',
    amountCell.t === 'n' && amountCell.v === 2000,
    JSON.stringify({ t: amountCell.t, v: amountCell.v }),
  );
  check(
    GROUP_WORKBOOK,
    'the amount column carries a clean number format',
    amountCell.z === '#,##0.00',
    String(amountCell.z),
  );
  check(
    GROUP_WORKBOOK,
    'the date is a real Excel date with a dd/mm/yyyy format',
    dateCell.t === 'n' && dateCell.v === 46290 && dateCell.z === 'dd/mm/yyyy',
    JSON.stringify({ t: dateCell.t, v: dateCell.v, z: dateCell.z }),
  );
  check(
    GROUP_WORKBOOK,
    'an unreadable amount leaves the cell empty instead of writing ₹0',
    (() => {
      const rowWithIssue = client.buildExportRows([
        buildRecord({ id: 'Payments#9', name: 'Sunita', vehicleNumber: 'UP78XY9876', paymentMode: 'Cash' }),
      ]);
      const partial = writer.buildExportWorksheet(rowWithIssue);
      return partial[xlsx.utils.encode_cell({ r: 1, c: 4 })] === undefined;
    })(),
  );
  check(
    GROUP_WORKBOOK,
    'the filtered sheet is named for what it contains',
    writer.buildExportWorkbook(rows, true).SheetNames.join('|') === 'Filtered Data' &&
      writer.buildExportWorkbook(rows, false).SheetNames.join('|') === 'Imported Data',
  );

  // --- the real file -------------------------------------------------------
  const outDir = path.join(workspace, 'export-out');
  await mkdir(outDir, { recursive: true });
  const target = path.join(outDir, 'round-trip.xlsx');
  const before = new Date();
  writer.writeExportWorkbook(rows, true, target);
  const info = await stat(target);
  check(
    GROUP_WORKBOOK,
    'the workbook is written to the requested path as a real xlsx',
    info.size > 0 && info.mtimeMs >= before.getTime() - 1000,
    `${info.size} bytes`,
  );
  check(
    GROUP_WORKBOOK,
    'the file starts with the zip signature Excel expects',
    (await readFile(target)).subarray(0, 2).toString('utf8') === 'PK',
  );

  const readBack = xlsx.readFile(target);
  const roundTrip = xlsx.utils.sheet_to_json(readBack.Sheets[readBack.SheetNames[0]], {
    header: 1,
    raw: true,
  });
  check(
    GROUP_WORKBOOK,
    'Excel sees the same seven headers after the round trip',
    JSON.stringify(roundTrip[0]) === JSON.stringify(EXPORT_HEADERS),
  );
  check(
    GROUP_WORKBOOK,
    'the amount column sums to the filtered total in Excel',
    roundTrip.slice(1).reduce((sum, row) => sum + (row[4] ?? 0), 0) === 7000,
    String(roundTrip.slice(1).reduce((sum, row) => sum + (row[4] ?? 0), 0)),
  );
  const serialBack = roundTrip[1][0];
  const dateBack = new Date(Date.UTC(1899, 11, 30) + serialBack * 86_400_000);
  check(
    GROUP_WORKBOOK,
    'the day and month survive the round trip (25 September, not 9 May)',
    dateBack.getUTCFullYear() === 2026 &&
      dateBack.getUTCMonth() === 8 &&
      dateBack.getUTCDate() === 25,
    dateBack.toISOString(),
  );
  check(
    GROUP_WORKBOOK,
    'Excel reads the date back as 25/09/2026 and the amount as a number',
    readBack.Sheets[readBack.SheetNames[0]][xlsx.utils.encode_cell({ r: 1, c: 0 })].w ===
      '25/09/2026' &&
      readBack.Sheets[readBack.SheetNames[0]][xlsx.utils.encode_cell({ r: 1, c: 4 })].w ===
        '2,000.00',
    JSON.stringify({
      date: readBack.Sheets[readBack.SheetNames[0]][xlsx.utils.encode_cell({ r: 1, c: 0 })],
      amount: readBack.Sheets[readBack.SheetNames[0]][xlsx.utils.encode_cell({ r: 1, c: 4 })],
    }),
  );
  check(
    GROUP_WORKBOOK,
    'the written file contains no internal identifiers',
    !JSON.stringify(roundTrip).includes('Payments#') &&
      !JSON.stringify(Object.keys(readBack.Sheets[readBack.SheetNames[0]])).includes('vehicleKey'),
  );
  check(
    GROUP_WORKBOOK,
    'a destination that cannot be written raises instead of failing silently',
    (() => {
      try {
        writer.writeExportWorkbook(rows, true, path.join(workspace, 'missing-folder', 'x.xlsx'));
        return false;
      } catch {
        return true;
      }
    })(),
  );
  check(
    GROUP_WORKBOOK,
    'exporting never touches the workbook it was read from',
    (() => {
      const source = path.join(workspace, 'source-guard.xlsx');
      writer.writeExportWorkbook(rows, true, source);
      const snapshot = requireFromHarness('node:fs').readFileSync(source);
      writer.writeExportWorkbook(rows.slice(0, 1), false, path.join(workspace, 'other.xlsx'));
      return Buffer.compare(snapshot, requireFromHarness('node:fs').readFileSync(source)) === 0;
    })(),
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Export through the main process                                          */
/* -------------------------------------------------------------------------- */

const GROUP_MAIN = 'export main process';

/**
 * Minimal stand-in for the `electron` module: only what the export handler and
 * the window bootstrap touch. `saveDialog` decides what the native dialog
 * answers, so every branch of the export flow can be driven from a test.
 */
function createElectronMock() {
  const state = {
    handlers: new Map(),
    windows: [],
    saveDialogCalls: [],
    saveDialogAnswer: { canceled: true, filePath: undefined },
    openDialogAnswer: { canceled: true, filePaths: [] },
    sent: [],
    schemeHandlers: new Map(),
    privileged: [],
    consoleErrors: [],
  };

  class FakeWebContents {
    constructor() {
      this.sent = [];
    }
    send(channel, payload) {
      this.sent.push({ channel, payload });
      state.sent.push({ channel, payload });
    }
    setWindowOpenHandler() {}
    on() {}
  }

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = new FakeWebContents();
      state.windows.push(this);
    }
    loadURL(url) {
      this.url = url;
      return Promise.resolve();
    }
    loadFile() {
      return Promise.resolve();
    }
    once() {}
    on() {}
    show() {}
    focus() {}
    isDestroyed() {
      return false;
    }
    static fromWebContents(sender) {
      return state.windows.find((window) => window.webContents === sender) ?? null;
    }
    static getAllWindows() {
      return state.windows;
    }
  }

  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      on: () => {},
      quit: () => {},
      getVersion: () => '0.2.0',
      getAppPath: () => process.cwd(),
      isPackaged: false,
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: { handle: (channel, handler) => state.handlers.set(channel, handler) },
    dialog: {
      showOpenDialog: async (...args) => {
        state.saveDialogCalls.push({ kind: 'open', options: args[args.length - 1] });
        return state.openDialogAnswer;
      },
      showSaveDialog: async (...args) => {
        state.saveDialogCalls.push({ kind: 'save', options: args[args.length - 1] });
        return state.saveDialogAnswer;
      },
    },
    session: { defaultSession: { setPermissionRequestHandler: () => {} } },
    protocol: {
      registerSchemesAsPrivileged: (schemes) => state.privileged.push(...schemes),
      handle: (scheme, handler) => state.schemeHandlers.set(scheme, handler),
    },
    net: { fetch: async () => new Response('', { status: 200 }) },
    nativeTheme: { themeSource: 'dark' },
    shell: { openExternal: async () => {} },
  };

  return { state, electron, window: null };
}

async function loadMainProcess(bundlePath) {
  const mock = createElectronMock();
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return mock.electron;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete requireFromHarness.cache[bundlePath];
    requireFromHarness(bundlePath);
  } finally {
    Module._load = originalLoad;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  const [window] = mock.state.windows;
  return { ...mock, window };
}

async function verifyExportMainProcess(modules, workspace, xlsx) {
  const { client } = modules;
  // The real built main-process bundle, loaded with a mocked Electron module.
  const bundlePath = path.join(root, 'dist-electron/main.js');
  if (!existsSync(bundlePath)) {
    throw new Error('dist-electron/main.js is missing — run "npm run build" before "npm run verify".');
  }
  const main = await loadMainProcess(bundlePath);
  const exportHandler = main.state.handlers.get('excel:export-filtered-data');
  const importHandler = main.state.handlers.get('excel:import-workbook');

  check(GROUP_MAIN, 'the main process registers the export channel', typeof exportHandler === 'function');
  check(
    GROUP_MAIN,
    'the export channel is invoked by the renderer and never pushed',
    !main.state.handlers.has('excel:export-progress') &&
      main.state.sent.every((entry) => entry.channel !== 'excel:export-filtered-data'),
  );
  if (typeof exportHandler !== 'function') {
    return;
  }

  const event = { sender: main.window.webContents };
  const outDir = path.join(workspace, 'main-export');
  await mkdir(outDir, { recursive: true });
  const rows = client.buildExportRows(specRecords());
  const payload = {
    rows,
    suggestedFileName: client.buildExportFileName({ filtered: true }),
    filtered: true,
  };

  // --- the happy path ------------------------------------------------------
  const target = path.join(outDir, 'Filtered_Data_25-09-2026.xlsx');
  main.state.saveDialogAnswer = { canceled: false, filePath: target };
  const exported = await exportHandler(event, payload);
  check(
    GROUP_MAIN,
    'a chosen location writes the workbook and reports it',
    exported.status === 'exported' &&
      exported.recordCount === 4 &&
      exported.fileName === 'Filtered_Data_25-09-2026.xlsx',
    JSON.stringify(exported),
  );
  check(GROUP_MAIN, 'the file really exists on disk', existsSync(target));
  const sheet = xlsx.readFile(target);
  check(
    GROUP_MAIN,
    'the written file holds the filtered records and the seven headers',
    JSON.stringify(
      xlsx.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1, raw: true })[0],
    ) === JSON.stringify(EXPORT_HEADERS),
  );

  const saveCall = main.state.saveDialogCalls.filter((call) => call.kind === 'save').at(-1);
  check(
    GROUP_MAIN,
    'the save dialog offers an editable, safe default name',
    saveCall.options.defaultPath === payload.suggestedFileName,
    String(saveCall.options.defaultPath),
  );
  check(
    GROUP_MAIN,
    'the save dialog is limited to xlsx files and can create a folder',
    JSON.stringify(saveCall.options.filters[0].extensions) === JSON.stringify(['xlsx']) &&
      saveCall.options.properties.includes('createDirectory') &&
      saveCall.options.properties.includes('showOverwriteConfirmation'),
  );
  check(
    GROUP_MAIN,
    'the renderer never chooses the destination itself',
    !('filePath' in payload) &&
      exported.fileName === path.basename(target),
  );

  const progress = main.state.sent
    .filter((entry) => entry.channel === 'excel:export-progress')
    .map((entry) => entry.payload.stage);
  check(
    GROUP_MAIN,
    'the export reports preparing, waiting and saving in order',
    JSON.stringify(progress) === JSON.stringify(['preparing', 'awaiting-location', 'writing']),
    progress.join(' → '),
  );
  check(
    GROUP_MAIN,
    'no invented percentage is reported',
    main.state.sent
      .filter((entry) => entry.channel === 'excel:export-progress')
      .every((entry) => !('percent' in entry.payload) && typeof entry.payload.message === 'string'),
  );

  // --- cancelling ----------------------------------------------------------
  const before = await readdir(outDir);
  main.state.saveDialogAnswer = { canceled: true, filePath: undefined };
  const cancelled = await exportHandler(event, payload);
  const after = await readdir(outDir);
  check(
    GROUP_MAIN,
    'cancelling the dialog reports a cancellation, not a failure',
    cancelled.status === 'cancelled',
    JSON.stringify(cancelled),
  );
  check(
    GROUP_MAIN,
    'cancelling writes nothing at all',
    JSON.stringify(before) === JSON.stringify(after) &&
      !main.state.sent
        .filter((entry) => entry.channel === 'excel:export-progress')
        .slice(-1)
        .some((entry) => entry.payload.stage === 'writing'),
  );
  const emptyPath = await exportHandler(event, {
    ...payload,
    // An empty path from the dialog is a cancellation too.
  });
  check(GROUP_MAIN, 'an empty dialog result is treated as a cancellation', emptyPath.status === 'cancelled');
  main.state.saveDialogAnswer = { canceled: false, filePath: '' };
  const blankPath = await exportHandler(event, payload);
  check(GROUP_MAIN, 'a blank path is refused instead of writing to the working directory', blankPath.status === 'cancelled');

  // --- the extension, and a payload that tries to choose the path ----------
  main.state.saveDialogAnswer = { canceled: false, filePath: path.join(outDir, 'report') };
  const noExtension = await exportHandler(event, payload);
  check(
    GROUP_MAIN,
    'the xlsx extension is added when the user leaves it out',
    noExtension.status === 'exported' && existsSync(path.join(outDir, 'report.xlsx')),
    JSON.stringify(noExtension),
  );

  const attackerTarget = path.join(outDir, 'chosen-by-payload.xlsx');
  main.state.saveDialogAnswer = { canceled: false, filePath: path.join(outDir, 'dialog-wins.xlsx') };
  const forced = await exportHandler(event, {
    ...payload,
    filePath: attackerTarget,
    path: attackerTarget,
  });
  check(
    GROUP_MAIN,
    'a path inside the payload is ignored: the dialog decides',
    forced.status === 'exported' &&
      existsSync(path.join(outDir, 'dialog-wins.xlsx')) &&
      !existsSync(attackerTarget),
    JSON.stringify(forced),
  );

  // --- refusing to overwrite the loaded workbook ---------------------------
  const sourcePath = path.join(workspace, 'source-workbook.xlsx');
  const sourceBook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    sourceBook,
    xlsx.utils.aoa_to_sheet([
      EXPORT_HEADERS,
      ['25/09/2026', 'Raj Kumar', 'UP32AB1234', 'Cash', 2000, 'Fuel', 'Weekly settlement'],
      ['25/09/2026', 'Raj Kumar', 'UP32CD5678', 'UPI', 1500, 'Repair', ''],
      ['25/09/2026', 'Amit', 'UP32AB1234', 'Cash', 3000, 'Toll', ''],
      ['26/09/2026', 'Raj Kumar', 'UP32AB1234', 'Cash', 500, 'Fuel', ''],
    ]),
    'Payments',
  );
  xlsx.writeFile(sourceBook, sourcePath);
  const imported = typeof importHandler === 'function' ? await importHandler(event, sourcePath) : null;
  check(
    GROUP_MAIN,
    'the fixture workbook imports through the real import handler',
    imported?.status === 'imported' && imported.workbook.records.length === 4,
    JSON.stringify(imported && imported.status),
  );
  const sourceBytes = await readFile(sourcePath);
  main.state.saveDialogAnswer = { canceled: false, filePath: sourcePath };
  const blocked = await exportHandler(event, payload);
  check(
    GROUP_MAIN,
    'the export refuses to overwrite the workbook it was read from',
    blocked.status === 'failed' && blocked.message === client.EXPORT_SOURCE_FILE_MESSAGE,
    JSON.stringify(blocked),
  );
  check(
    GROUP_MAIN,
    'the source workbook is byte-identical after the refusal',
    Buffer.compare(sourceBytes, await readFile(sourcePath)) === 0,
  );
  main.state.saveDialogAnswer = { canceled: false, filePath: sourcePath.toUpperCase() };
  const blockedCase = await exportHandler(event, payload);
  check(
    GROUP_MAIN,
    'the same file is refused through case and separator differences',
    blockedCase.status === 'failed',
    JSON.stringify(blockedCase),
  );

  // --- invalid payloads ----------------------------------------------------
  const dialogCalls = main.state.saveDialogCalls.length;
  const invalid = await exportHandler(event, { rows: 'nope' });
  const empty = await exportHandler(event, { rows: [] });
  check(
    GROUP_MAIN,
    'an invalid payload fails before the dialog is ever opened',
    invalid.status === 'failed' &&
      invalid.message === client.EXPORT_INVALID_MESSAGE &&
      main.state.saveDialogCalls.length === dialogCalls,
  );
  check(
    GROUP_MAIN,
    'an empty payload reports "nothing to export" without opening the dialog',
    empty.status === 'empty' && main.state.saveDialogCalls.length === dialogCalls,
    JSON.stringify(empty),
  );

  // --- a write failure -----------------------------------------------------
  const failing = path.join(workspace, 'no-such-folder', 'x.xlsx');
  main.state.saveDialogAnswer = { canceled: false, filePath: failing };
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  let failed;
  try {
    failed = await exportHandler(event, payload);
  } finally {
    console.error = originalError;
  }
  check(
    GROUP_MAIN,
    'a destination that cannot be written fails with the user-facing message',
    failed.status === 'failed' && failed.message === client.EXPORT_FAILURE_MESSAGE,
    JSON.stringify(failed),
  );
  check(
    GROUP_MAIN,
    'the technical detail is logged for development, not shown to the user',
    logged.some((line) => line.includes('no-such-folder')) &&
      !client.EXPORT_FAILURE_MESSAGE.includes('ENOENT'),
    logged.join(' | ').slice(0, 160),
  );

  // --- the dialog itself can fail -----------------------------------------
  const originalSaveDialog = main.electron.dialog.showSaveDialog;
  main.electron.dialog.showSaveDialog = async () => {
    throw new Error('dialog exploded');
  };
  let dialogFailure;
  try {
    dialogFailure = await exportHandler(event, payload);
  } finally {
    main.electron.dialog.showSaveDialog = originalSaveDialog;
  }
  check(
    GROUP_MAIN,
    'a dialog that cannot open is reported as a failed export, not a crash',
    dialogFailure.status === 'failed' && dialogFailure.message === client.EXPORT_FAILURE_MESSAGE,
    JSON.stringify(dialogFailure),
  );

  // --- the preload contract -----------------------------------------------
  const preload = stripComments(await readSource('electron/preload.ts'));
  check(
    GROUP_MAIN,
    'the renderer reaches the export only through the named preload method',
    /exportFilteredData:\s*\(request/.test(preload) &&
      /ipcRenderer\.invoke\(IPC_CHANNELS\.exportFilteredData/.test(preload),
  );
  check(
    GROUP_MAIN,
    'the preload still exposes no generic ipcRenderer, shell or fs',
    !/exposeInMainWorld\([^)]*ipcRenderer/.test(preload) &&
      !/\bshell\b|child_process|require\('fs'\)/.test(preload),
  );
  // The packaged bundles are what actually ships, so the export must be in them.
  const packagedPreload = await readSource('dist-electron/preload.js');
  check(
    GROUP_MAIN,
    'the packaged preload ships the export method',
    packagedPreload.includes('export-filtered-data') &&
      packagedPreload.includes('exportFilteredData'),
  );
  const packagedMain = await readSource('dist-electron/main.js');
  check(
    GROUP_MAIN,
    'the packaged main bundle ships the export handler and the xlsx writer',
    packagedMain.includes('excel:export-filtered-data') &&
      /dd\/mm\/yyyy/.test(packagedMain) &&
      packagedMain.includes('showSaveDialog'),
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Export in the interface                                                  */
/* -------------------------------------------------------------------------- */

const GROUP_UI = 'export ui';

/** Writes into a React-controlled input the way a user would. */
function typeInto(app, element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(app.window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

const byId = (app, id) => app.document.querySelector(`#${id}`);
const tableRows = (app) => Array.from(app.document.querySelectorAll('tbody tr'));
const metricText = (app, id) => app.document.querySelector(`[data-metric="${id}"]`)?.textContent ?? '';
const figure = (app, id) =>
  (app.document.querySelector(`[data-metric="${id}"] [data-metric-value]`)?.textContent ?? '').trim();
const toastText = (app) =>
  Array.from(app.document.querySelectorAll('[role="status"], [role="alert"]'))
    .map((toast) => toast.textContent ?? '')
    .join(' | ');

/**
 * Opens the Data screen with the four-record fixture and a configurable export
 * bridge. `exportImpl` decides what the main process would answer.
 */
async function openExportScreen(prepared, { exportImpl, rows = SPEC_ROWS } = {}) {
  const records = specRecords(rows);
  const calls = { browse: 0, imported: [], exported: [], progressSubscribers: 0 };
  const progressListeners = new Set();
  const { bridge } = createMockBridge({
    excel: {
      browse: async () => {
        calls.browse += 1;
        return { status: 'selected', file: EXPORT_FILE };
      },
      importWorkbook: async (filePath) => {
        calls.imported.push(filePath);
        return buildImportedWorkbook({
          records,
          statistics: statisticsFor(records),
          fileName: EXPORT_FILE.name,
        });
      },
      exportFilteredData: async (request) => {
        calls.exported.push(request);
        if (exportImpl) {
          return exportImpl(request);
        }
        return {
          status: 'exported',
          fileName: `Filtered_Data_${localDateStamp()}.xlsx`,
          recordCount: request.rows.length,
        };
      },
      onExportProgress: (listener) => {
        calls.progressSubscribers += 1;
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      },
    },
  });

  const app = await renderRenderer({ ...prepared, bridge });
  app.click(app.findButton('Browse Excel File'));
  await app.settle(80);
  return {
    app,
    calls,
    records,
    emitProgress: (stage) => {
      for (const listener of progressListeners) {
        listener({ stage, message: `stage:${stage}` });
      }
    },
  };
}

async function verifyExportUi(workspace) {
  const prepared = await prepareRendererBundle(workspace);
  const session = await openExportScreen(prepared);
  const { app, calls } = session;

  // --- unfiltered ----------------------------------------------------------
  check(GROUP_UI, 'the results header carries the export action', app.findButton('Export Data') !== undefined);
  check(
    GROUP_UI,
    'the export action is keyboard reachable and never icon-only',
    (() => {
      const button = app.findButton('Export Data');
      return (
        button?.tagName === 'BUTTON' &&
        (button.className ?? '').includes('focus-visible:ring-2') &&
        (button.textContent ?? '').includes('Export Data')
      );
    })(),
  );
  check(
    GROUP_UI,
    'without filters the wording says the whole import will be exported',
    app.text().includes('No filters applied — exporting all imported records.'),
  );
  check(
    GROUP_UI,
    'the header states that these are the imported records, not a filtered subset',
    app.text().includes('Imported Data') && app.text().includes('No filters applied yet'),
  );

  app.click(app.findButton('Export Data'));
  await app.settle(80);
  const unfilteredRequest = calls.exported[0];
  check(
    GROUP_UI,
    'the export payload is exactly the four records on screen',
    unfilteredRequest?.rows.length === 4 &&
      unfilteredRequest.rows[0].name === 'Raj Kumar' &&
      unfilteredRequest.rows[3].amount === 500,
    JSON.stringify(unfilteredRequest?.rows?.[0]),
  );
  check(
    GROUP_UI,
    'the payload carries only the seven exported fields',
    unfilteredRequest.rows.every(
      (row) => JSON.stringify(Object.keys(row).sort()) === JSON.stringify(ROW_FIELDS),
    ) && !JSON.stringify(unfilteredRequest).includes('Payments#'),
  );
  check(
    GROUP_UI,
    'amounts leave the interface as numbers, not formatted strings',
    unfilteredRequest.rows.every((row) => typeof row.amount === 'number' || row.amount === null) &&
      unfilteredRequest.rows[0].amount === 2000,
  );
  check(
    GROUP_UI,
    'an unfiltered export is flagged as unfiltered and named accordingly',
    unfilteredRequest.filtered === false &&
      /^Imported_Data_\d{2}-\d{2}-\d{4}\.xlsx$/.test(unfilteredRequest.suggestedFileName),
    unfilteredRequest.suggestedFileName,
  );
  check(
    GROUP_UI,
    'a successful export announces the record count',
    toastText(app).includes('Export completed successfully.') &&
      toastText(app).includes('4 records exported'),
    toastText(app),
  );
  check(
    GROUP_UI,
    'the success notification uses the success accent, not a banner',
    (() => {
      const icon = app.document.querySelector('[role="status"] svg.text-success');
      return icon !== null;
    })(),
  );
  check(GROUP_UI, 'exporting never re-reads the workbook', calls.imported.length === 1 && calls.browse === 1);

  // --- filtered ------------------------------------------------------------
  typeInto(app, byId(app, 'filter-name'), 'Raj Kumar');
  await app.settle(20);
  app.click(app.findButton('Filter Data'));
  await app.settle(40);
  typeInto(app, byId(app, 'filter-date'), '2026-09-25');
  await app.settle(20);
  app.click(app.findButton('Filter Data'));
  await app.settle(40);
  check(
    GROUP_UI,
    'the filtered result is the two matching records',
    figure(app, 'filteredRecords') === '2' && figure(app, 'filteredTotal') === '₹3,500',
    `${figure(app, 'filteredRecords')} / ${figure(app, 'filteredTotal')}`,
  );
  check(
    GROUP_UI,
    'with filters applied the action is labelled Export Excel',
    app.findButton('Export Excel') !== undefined && app.text().includes('2 filtered records will be exported.'),
  );
  check(
    GROUP_UI,
    'the header reports the state of the filtered result',
    app.text().includes('Filtered Results') &&
      app.text().includes('2 records found') &&
      app.text().includes('Active filters: 2'),
    app.text().slice(0, 200),
  );

  app.click(app.findButton('Export Excel'));
  await app.settle(80);
  const filteredRequest = calls.exported.at(-1);
  check(
    GROUP_UI,
    'only the visible filtered records are exported',
    filteredRequest.rows.length === 2 &&
      filteredRequest.rows.every((row) => row.name === 'Raj Kumar' && row.date === '2026-09-25') &&
      filteredRequest.rows.map((row) => row.amount).join('|') === '2000|1500',
    JSON.stringify(filteredRequest.rows.map((row) => row.amount)),
  );
  check(
    GROUP_UI,
    'the exported set never includes records the filters excluded',
    filteredRequest.rows.every(
      (row) =>
        row.name === 'Raj Kumar' &&
        row.date === '2026-09-25' &&
        row.amount !== 3000 &&
        row.amount !== 500,
    ) &&
      !JSON.stringify(filteredRequest.rows).includes('Amit') &&
      !JSON.stringify(filteredRequest.rows).includes('2026-09-26'),
    JSON.stringify(filteredRequest.rows.map((row) => [row.name, row.date, row.amount])),
  );
  check(
    GROUP_UI,
    'a filtered export is flagged and dated',
    filteredRequest.filtered === true &&
      filteredRequest.suggestedFileName === `Filtered_Data_${localDateStamp()}.xlsx`,
    filteredRequest.suggestedFileName,
  );
  check(
    GROUP_UI,
    'the filtered totals still match the exported rows',
    filteredRequest.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0) * 100 === 350000,
  );

  // --- an empty result -----------------------------------------------------
  typeInto(app, byId(app, 'filter-name'), 'Nobody');
  await app.settle(20);
  app.click(app.findButton('Filter Data'));
  await app.settle(40);
  const beforeEmpty = calls.exported.length;
  const disabledButton = app.findButton('Export Excel') ?? app.findButton('Export Data');
  check(
    GROUP_UI,
    'an empty result disables the export and says why',
    disabledButton?.disabled === true &&
      app.text().includes('No records available to export.') &&
      app.text().includes('No matching records'),
    Boolean(disabledButton?.disabled),
  );
  app.click(disabledButton);
  await app.settle(40);
  check(GROUP_UI, 'clicking a disabled export sends nothing', calls.exported.length === beforeEmpty);

  // --- loading states and duplicate clicks ---------------------------------
  let slowResolve;
  const slow = await openExportScreen(prepared, {
    exportImpl: () =>
      new Promise((resolve) => {
        slowResolve = resolve;
      }),
  });
  typeInto(slow.app, byId(slow.app, 'filter-name'), 'Raj Kumar');
  await slow.app.settle(20);
  slow.app.click(slow.app.findButton('Filter Data'));
  await slow.app.settle(40);
  slow.app.click(slow.app.findButton('Export Excel'));
  await slow.app.settle(40);
  const busyButton = slow.app.findButton('Export Excel');
  check(
    GROUP_UI,
    'while the export runs the action is blocked and reports progress',
    busyButton?.disabled === true &&
      busyButton?.getAttribute('aria-busy') === 'true' &&
      slow.app.text().includes('Preparing Excel'),
    `${busyButton?.getAttribute('aria-busy')} / ${slow.app.text().slice(0, 120)}`,
  );
  slow.app.click(busyButton);
  slow.app.click(busyButton);
  await slow.app.settle(40);
  check(
    GROUP_UI,
    'duplicate clicks cannot start a second export',
    slow.calls.exported.length === 1,
    String(slow.calls.exported.length),
  );
  slow.emitProgress('writing');
  await slow.app.settle(40);
  check(GROUP_UI, 'the saving phase is reported when it starts', slow.app.text().includes('Saving file'));
  slowResolve({ status: 'exported', fileName: 'Filtered_Data.xlsx', recordCount: 2 });
  await slow.app.settle(80);
  check(
    GROUP_UI,
    'the action becomes usable again after the export finishes',
    slow.app.findButton('Export Excel')?.disabled === false &&
      toastText(slow.app).includes('Export completed successfully.'),
  );

  // --- cancelling ----------------------------------------------------------
  const cancelled = await openExportScreen(prepared, {
    exportImpl: async () => ({ status: 'cancelled' }),
  });
  typeInto(cancelled.app, byId(cancelled.app, 'filter-name'), 'Raj Kumar');
  await cancelled.app.settle(20);
  cancelled.app.click(cancelled.app.findButton('Filter Data'));
  await cancelled.app.settle(40);
  const rowsBeforeCancel = tableRows(cancelled.app).length;
  const textBeforeCancel = toastText(cancelled.app);
  cancelled.app.click(cancelled.app.findButton('Export Excel'));
  await cancelled.app.settle(80);
  check(
    GROUP_UI,
    'cancelling the save dialog is silent: no success and no error',
    toastText(cancelled.app) === textBeforeCancel && !cancelled.app.text().includes('Export failed'),
    toastText(cancelled.app),
  );
  check(
    GROUP_UI,
    'cancelling leaves the dataset and the result set untouched',
    tableRows(cancelled.app).length === rowsBeforeCancel &&
      tableRows(cancelled.app).length === 3 &&
      figure(cancelled.app, 'filteredRecords') === '3' &&
      cancelled.app.findButton('Export Excel')?.disabled === false,
  );

  // --- failing -------------------------------------------------------------
  const failing = await openExportScreen(prepared, {
    exportImpl: async () => ({ status: 'failed', message: 'The filtered data could not be saved. Please choose another location and try again.' }),
  });
  typeInto(failing.app, byId(failing.app, 'filter-name'), 'Raj Kumar');
  await failing.app.settle(20);
  failing.app.click(failing.app.findButton('Filter Data'));
  await failing.app.settle(40);
  failing.app.click(failing.app.findButton('Export Excel'));
  await failing.app.settle(80);
  check(
    GROUP_UI,
    'a failed export explains itself without technical detail',
    toastText(failing.app).includes('Export failed') &&
      toastText(failing.app).includes('could not be saved') &&
      !/Error:|stack|ENOENT|at \w+ \(/.test(failing.app.text()),
    toastText(failing.app),
  );
  check(
    GROUP_UI,
    'a failed export leaves the data and the notification accent correct',
    tableRows(failing.app).length === 3 &&
      failing.app.document.querySelector('[role="alert"] svg.text-danger') !== null &&
      failing.app.findButton('Export Excel')?.disabled === false,
  );
  typeInto(failing.app, byId(failing.app, 'filter-name'), 'Amit');
  await failing.app.settle(20);
  failing.app.click(failing.app.findButton('Filter Data'));
  await failing.app.settle(40);
  check(
    GROUP_UI,
    'the screen stays usable after a failed export',
    tableRows(failing.app).length === 1 && figure(failing.app, 'filteredRecords') === '1',
  );

  // --- rejection thrown by the bridge -------------------------------------
  const throwing = await openExportScreen(prepared, {
    exportImpl: async () => {
      throw new Error('ipc channel exploded');
    },
  });
  throwing.app.click(throwing.app.findButton('Export Data'));
  await throwing.app.settle(80);
  check(
    GROUP_UI,
    'a transport failure is reported as an export failure',
    toastText(throwing.app).includes('Export failed') && !throwing.app.text().includes('ipc channel exploded'),
    toastText(throwing.app),
  );

  // --- the renderer stays sandboxed ---------------------------------------
  const rendererSources = await listSourceFiles('src');
  const sources = await Promise.all(
    rendererSources.map(async (file) => stripComments(await readSource(file))),
  );
  check(
    GROUP_UI,
    'no renderer module imports Node, Electron or a file system API',
    sources.every(
      (source) =>
        !/from 'node:|from "node:|require\('/.test(source) &&
        !/ipcRenderer|child_process|\bshell\./.test(source),
    ),
    rendererSources.filter((file, index) => /ipcRenderer|child_process|from 'node:|require\(/.test(sources[index])).join(', '),
  );
  const exportButtonSource = stripComments(await readSource('src/components/data/ExportDataButton.tsx'));
  check(
    GROUP_UI,
    'the export button uses the whitelisted bridge and no file system call',
    /bridge\.excel\.exportFilteredData\(/.test(exportButtonSource) &&
      !/writeFile|fs\.|dialog/.test(exportButtonSource),
  );
  check(
    GROUP_UI,
    'the export surfaces contain no emoji',
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(
      (await readSource('electron/shared/export.ts')) + exportButtonSource,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Resilience                                                               */
/* -------------------------------------------------------------------------- */

const GROUP_RESILIENCE = 'resilience';

async function verifyResilience(workspace) {
  const prepared = await prepareRendererBundle(workspace);

  // --- a replacement import that fails -------------------------------------
  const records = specRecords();
  let nextImport = async () =>
    buildImportedWorkbook({
      records,
      statistics: statisticsFor(records),
      fileName: EXPORT_FILE.name,
    });
  const { bridge } = createMockBridge({
    excel: {
      browse: async () => ({ status: 'selected', file: EXPORT_FILE }),
      importWorkbook: async () => nextImport(),
    },
  });
  const app = await renderRenderer({ ...prepared, bridge });
  app.click(app.findButton('Browse Excel File'));
  await app.settle(80);
  check(GROUP_RESILIENCE, 'the first import loads the data', tableRows(app).length === 4);

  nextImport = async () => ({
    status: 'unreadable',
    fileName: 'broken.xlsx',
    message: '"broken.xlsx" could not be read. The file may be damaged or password protected.',
  });
  app.click(app.findButton('Change Excel File'));
  await app.settle(80);
  check(
    GROUP_RESILIENCE,
    'a failed replacement is reported and keeps the previous dataset',
    app.text().includes('broken.xlsx') &&
      tableRows(app).length === 4 &&
      figure(app, 'filteredRecords') === '4' &&
      app.text().includes('transactions_september.xlsx'),
    app.text().slice(0, 200),
  );
  check(
    GROUP_RESILIENCE,
    'the screen is never blank after a failed replacement',
    app.text().includes('Imported Data') && app.text().includes('Showing all 4 imported records'),
  );
  nextImport = async () =>
    buildImportedWorkbook({
      records: specRecords([SPEC_ROWS[0]]),
      statistics: statisticsFor(specRecords([SPEC_ROWS[0]])),
      fileName: 'smaller.xlsx',
    });
  app.click(app.findButton('Change Excel File'));
  await app.settle(80);
  check(
    GROUP_RESILIENCE,
    'a later successful import does replace the dataset',
    tableRows(app).length === 1 &&
      app.text().includes('Showing all 1 imported record') &&
      figure(app, 'filteredRecords') === '1',
    `${tableRows(app).length} rows / ${figure(app, 'filteredRecords')}`,
  );

  // --- invalid filter state carried over -----------------------------------
  const invalid = await openExportScreen(prepared);
  typeInto(invalid.app, byId(invalid.app, 'filter-name'), 'Raj Kumar');
  await invalid.app.settle(20);
  invalid.app.click(invalid.app.findButton('Filter Data'));
  await invalid.app.settle(40);
  typeInto(invalid.app, byId(invalid.app, 'filter-amount-exact'), 'abc');
  await invalid.app.settle(20);
  invalid.app.click(invalid.app.findButton('Filter Data'));
  await invalid.app.settle(40);
  check(
    GROUP_RESILIENCE,
    'an unreadable amount is rejected inline and never becomes ₹0',
    invalid.app.text().includes('is not a valid amount') &&
      figure(invalid.app, 'filteredRecords') === '3' &&
      figure(invalid.app, 'filteredTotal') === '₹4,000',
    `${figure(invalid.app, 'filteredTotal')} / ${invalid.app.text().slice(0, 120)}`,
  );
  invalid.app.click(invalid.app.findButton('Dashboard'));
  await invalid.app.settle(60);
  invalid.app.click(invalid.app.findButton('Data'));
  await invalid.app.settle(60);
  check(
    GROUP_RESILIENCE,
    'invalid input survives navigation without filtering anything',
    byId(invalid.app, 'filter-amount-exact')?.value === 'abc' &&
      figure(invalid.app, 'filteredRecords') === '3' &&
      tableRows(invalid.app).length === 3,
    `${byId(invalid.app, 'filter-amount-exact')?.value} / ${tableRows(invalid.app).length}`,
  );
  invalid.app.click(invalid.app.findButton('Clear Filters'));
  await invalid.app.settle(40);
  check(
    GROUP_RESILIENCE,
    'clearing the filters recovers from the invalid input',
    byId(invalid.app, 'filter-amount-exact')?.value === '' &&
      figure(invalid.app, 'filteredRecords') === '4',
  );

  // --- the error boundary --------------------------------------------------
  // The boundary is mounted for real (React + react-dom in a DOM), with a child
  // that throws once. Everything the test needs is exposed by the bundle, so the
  // test and the components share one React instance.
  const boundaryBundle = path.join(workspace, 'error-boundary.cjs');
  await esbuild.build({
    stdin: {
      contents: `
        import { createElement, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ErrorBoundary } from ${JSON.stringify(path.join(root, 'src/components/ui/ErrorBoundary.tsx'))};

        let recover = () => {};

        function Harness() {
          const [shouldThrow, setShouldThrow] = useState(true);
          recover = () => setShouldThrow(false);
          const Flaky = () => {
            if (shouldThrow) {
              throw new Error('render exploded at ObscureFile.tsx:42');
            }
            return createElement('p', null, 'recovered content');
          };
          return createElement(
            ErrorBoundary,
            { resetKey: 'data', onGoToDashboard: () => {} },
            createElement(Flaky),
          );
        }

        export function mount(container) {
          const root = createRoot(container);
          root.render(createElement(Harness));
          return { recover: () => recover(), unmount: () => root.unmount() };
        }
      `,
      resolveDir: root,
      loader: 'tsx',
    },
    outfile: boundaryBundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'silent',
    jsx: 'automatic',
  });
  const boundary = requireFromHarness(boundaryBundle);

  const { JSDOM } = requireFromHarness('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  // `navigator` is getter-only on modern Node, so the globals are installed
  // through descriptors and removed afterwards.
  const globalsToRestore = ['window', 'document', 'navigator'];
  const setGlobal = (name, value) => {
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      // Nothing to do: this Node build does not allow overriding the global.
    }
  };
  setGlobal('window', dom.window);
  setGlobal('document', dom.window.document);
  setGlobal('navigator', dom.window.navigator);

  const container = dom.window.document.getElementById('root');
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  let handle;
  try {
    handle = boundary.mount(container);
    await new Promise((resolve) => setTimeout(resolve, 120));
  } finally {
    console.error = originalError;
  }

  const boundaryText = () => dom.window.document.body.textContent ?? '';
  check(
    GROUP_RESILIENCE,
    'an unexpected render error shows the recovery screen instead of a blank page',
    boundaryText().includes('Something went wrong') &&
      boundaryText().includes('The application encountered an unexpected error.') &&
      boundaryText().includes('Try Again'),
    boundaryText().slice(0, 200),
  );
  check(
    GROUP_RESILIENCE,
    'the recovery screen leaks no stack trace or internal file path',
    !/ObscureFile|render exploded|at \w+ \(/.test(boundaryText()),
    boundaryText().slice(0, 120),
  );
  check(
    GROUP_RESILIENCE,
    'the technical detail is logged for the developer instead',
    logged.some((line) => line.includes('render exploded')),
    logged.join(' | ').slice(0, 160),
  );
  check(
    GROUP_RESILIENCE,
    'the recovery screen offers a way back to a working screen',
    boundaryText().includes('Go to Dashboard'),
  );

  handle?.recover();
  const retry = Array.from(dom.window.document.querySelectorAll('button')).find((button) =>
    (button.textContent ?? '').includes('Try Again'),
  );
  retry?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 120));
  check(
    GROUP_RESILIENCE,
    'Try Again recovers the screen without deleting anything',
    boundaryText().includes('recovered content'),
    boundaryText().slice(0, 120),
  );
  handle?.unmount();
  for (const name of globalsToRestore) {
    try {
      delete globalThis[name];
    } catch {
      // Leave the global as it is when it cannot be removed.
    }
  }

  // --- the toast system ----------------------------------------------------
  const toastSource = await readSource('src/components/ui/Toast.tsx');
  check(
    GROUP_RESILIENCE,
    'all four notification kinds share one coordinated system',
    ['success', 'error', 'warning', 'info'].every((variant) => toastSource.includes(`${variant}:`)) &&
      toastSource.includes('CircleCheck') &&
      toastSource.includes('CircleX') &&
      toastSource.includes('TriangleAlert') &&
      toastSource.includes('Info'),
  );
  check(
    GROUP_RESILIENCE,
    'notifications enter and leave with a short fade, never a bounce',
    /animate-toast-in/.test(toastSource) &&
      /animate-toast-out/.test(toastSource) &&
      !/bounce|animate-bounce/.test(toastSource),
  );
}

/* -------------------------------------------------------------------------- */
/* 6. UX polish                                                                */
/* -------------------------------------------------------------------------- */

const GROUP_UX = 'ux polish';

async function verifyUx(workspace) {
  const prepared = await prepareRendererBundle(workspace);
  const session = await openExportScreen(prepared);
  const { app } = session;

  // --- chips ---------------------------------------------------------------
  const filterBy = async (app_, name, date) => {
    typeInto(app_, byId(app_, 'filter-name'), name);
    await app_.settle(20);
    if (date) {
      typeInto(app_, byId(app_, 'filter-date'), date);
      await app_.settle(20);
    }
    app_.click(app_.findButton('Filter Data'));
    await app_.settle(40);
  };
  await filterBy(app, 'Raj Kumar', '2026-09-25');
  const chipButtons = () => Array.from(app.document.querySelectorAll('[aria-label="Active filters"] button'));
  check(
    GROUP_UX,
    'each applied filter is a quiet, removable chip with an unambiguous name',
    chipButtons().map((chip) => chip.textContent?.replace('remove', '')).join('|') ===
      'Date: 25/09/2026|Name: Raj Kumar' &&
      app.document.querySelector('[aria-label="Remove filter Name: Raj Kumar"]') !== null &&
      (app.document.querySelector('[aria-label="Active filters"]')?.getAttribute('role') ?? '') === 'group',
    chipButtons()
      .map((chip) => chip.getAttribute('aria-label'))
      .join(' | '),
  );
  check(
    GROUP_UX,
    'chips are muted so the table stays the focus',
    chipButtons().every(
      (chip) =>
        (chip.className ?? '').includes('border-accent/30') &&
        (chip.className ?? '').includes('bg-accent/10'),
    ),
  );
  check(
    GROUP_UX,
    'the chips do not repeat the results as loud as the statistics',
    figure(app, 'filteredRecords') === '2' && tableRows(app).length === 2,
  );
  app.click(app.document.querySelector('[aria-label="Remove filter Date: 25/09/2026"]'));
  await app.settle(40);
  check(
    GROUP_UX,
    'removing one chip updates the result immediately',
    figure(app, 'filteredRecords') === '3' &&
      chipButtons().length === 1 &&
      byId(app, 'filter-date')?.value === '',
    `${figure(app, 'filteredRecords')} / ${chipButtons().length}`,
  );

  // --- collapsing ----------------------------------------------------------
  await filterBy(app, 'Raj Kumar', '2026-09-25');
  app.click(app.findButton('Collapse'));
  await app.settle(40);
  const body = app.document.querySelector('#filter-body');
  check(
    GROUP_UX,
    'the panel can be collapsed without hiding which filters are active',
    app.text().includes('2 active filters') &&
      app.text().includes('Date') &&
      app.text().includes('Name'),
    app.text().slice(0, 200),
  );
  check(
    GROUP_UX,
    'a collapsed panel gives the table the vertical space back',
    (body?.hasAttribute('hidden') ?? false) === true &&
      app.document.querySelector('#filter-date')?.closest('[hidden]') !== null,
  );
  const collapsedRows = tableRows(app).length;
  app.click(app.findButton('Expand'));
  await app.settle(40);
  check(
    GROUP_UX,
    'expanding restores the inputs with the same values',
    app.document.querySelector('#filter-body')?.hasAttribute('hidden') === false &&
      byId(app, 'filter-name')?.value === 'Raj Kumar' &&
      byId(app, 'filter-date')?.value === '2026-09-25' &&
      tableRows(app).length === collapsedRows,
  );
  app.click(app.findButton('Clear Filters'));
  await app.settle(40);

  // --- the table -----------------------------------------------------------
  const headerCells = Array.from(app.document.querySelectorAll('thead th'));
  check(
    GROUP_UX,
    'the table header stays readable and never wraps mid-label',
    headerCells.length === 7 &&
      headerCells.every(
        (cell) =>
          (cell.className ?? '').includes('uppercase') &&
          (cell.className ?? '').includes('whitespace-nowrap') &&
          (cell.className ?? '').includes('text-content-secondary'),
      ),
  );
  const firstRow = app.document.querySelector('tbody tr');
  check(
    GROUP_UX,
    'rows respond to hover with a subtle colour change only',
    (firstRow?.className ?? '').includes('hover:bg-surface-elevated/70') &&
      (firstRow?.className ?? '').includes('transition-colors duration-150') &&
      !/scale|translate|shadow/.test(firstRow?.className ?? ''),
    firstRow?.className ?? '',
  );
  check(
    GROUP_UX,
    'the table can be scrolled horizontally instead of squeezing the columns',
    (app.document.querySelector('table')?.className ?? '').includes('min-w-') &&
      (app.document.querySelector('table')?.parentElement?.className ?? '').includes('overscroll-contain'),
  );
  check(
    GROUP_UX,
    'genuinely empty optional values are shown as a dash',
    app.document.querySelectorAll('tbody tr').length > 0 &&
      app.document.querySelectorAll('tbody tr')[1].textContent.includes('—'),
  );

  const longSession = await openExportScreen(prepared, {
    rows: [
      {
        ...SPEC_ROWS[0],
        remark:
          'Advance settlement against September trips, adjusted for the diesel rate revision and the toll reimbursements pending from the previous cycle.',
      },
      {
        rowNumber: 3,
        date: '2026-09-25',
        name: 'Sunita Devi',
        vehicleNumber: 'UP78XY9876',
        paymentMode: 'Cash',
        amountMinor: null,
        paymentReason: '',
        remark: '',
        issues: [
          { field: 'amount', originalValue: 'abc', message: 'Amount is not a valid number.' },
        ],
      },
    ],
  });
  const longRows = Array.from(longSession.app.document.querySelectorAll('tbody tr'));
  const remarkCell = longRows[0].querySelectorAll('td')[6];
  check(
    GROUP_UX,
    'long free text is truncated in the cell and readable in a tooltip',
    Array.from(remarkCell.querySelectorAll('span')).some((span) =>
      (span.className ?? '').includes('truncate'),
    ) &&
      (remarkCell.querySelector('[role="tooltip"]')?.textContent ?? '').includes('diesel rate revision'),
    remarkCell.textContent.slice(0, 80),
  );
  const invalidAmountCell = longRows[1].querySelectorAll('td')[4];
  check(
    GROUP_UX,
    'an unreadable amount is never replaced by a dash',
    invalidAmountCell.textContent.includes('abc') &&
      invalidAmountCell.querySelector('.sr-only')?.textContent === 'needs attention' &&
      !invalidAmountCell.textContent.includes('—'),
    invalidAmountCell.textContent,
  );
  check(
    GROUP_UX,
    'an empty remark is a dash, not a warning',
    longRows[1].querySelectorAll('td')[6].textContent.trim() === '—',
    longRows[1].querySelectorAll('td')[6].textContent,
  );

  // --- pagination ----------------------------------------------------------
  const many = Array.from({ length: 250 }, (_unused, index) => ({
    ...SPEC_ROWS[index % SPEC_ROWS.length],
    rowNumber: index + 2,
    name: index % 2 === 0 ? 'Raj Kumar' : 'Amit',
  }));
  const paged = await openExportScreen(prepared, { rows: many });
  check(
    GROUP_UX,
    'the footer counts the rows that are actually on screen',
    paged.app.text().includes('Showing 1–100 of 250 imported records') &&
      paged.app.text().includes('page 1 of 3') &&
      tableRows(paged.app).length === 100,
    paged.app.text().slice(0, 200),
  );
  check(
    GROUP_UX,
    'only a compact set of page buttons is rendered',
    Array.from(paged.app.document.querySelectorAll('button'))
      .filter((button) => /^Page \d+/.test(button.getAttribute('aria-label') ?? ''))
      .length === 3,
  );
  const previous = paged.app.document.querySelector('button[aria-label="Previous page"]');
  check(
    GROUP_UX,
    'Previous is disabled on the first page',
    previous?.disabled === true && previous !== null,
  );
  typeInto(paged.app, byId(paged.app, 'filter-name'), 'Raj Kumar');
  await paged.app.settle(20);
  paged.app.click(paged.app.findButton('Filter Data'));
  await paged.app.settle(40);
  check(
    GROUP_UX,
    'the count text names the filtered dataset, not the import',
    paged.app.text().includes('of 125 matching records') &&
      paged.app.text().includes('page 1 of 2') &&
      figure(paged.app, 'filteredRecords') === '125',
    paged.app.text().slice(0, 200),
  );
  paged.app.click(paged.app.document.querySelector('button[aria-label="Page 2"]'));
  await paged.app.settle(40);
  check(
    GROUP_UX,
    'moving to another page keeps the filtered label and count',
    paged.app.text().includes('Showing 101–125 of 125 matching records') &&
      paged.app.text().includes('page 2 of 2'),
    paged.app.text().slice(0, 200),
  );
  check(
    GROUP_UX,
    'Next is disabled on the last page',
    paged.app.document.querySelector('button[aria-label="Next page"]')?.disabled === true,
  );
  const pageSizeSelect = Array.from(paged.app.document.querySelectorAll('select')).find((select) =>
    Array.from(select.options).some((option) => option.value === '250'),
  );
  check(
    GROUP_UX,
    'the page size choices stay the documented ones',
    JSON.stringify(Array.from(pageSizeSelect?.options ?? []).map((option) => Number(option.value))) ===
      JSON.stringify([50, 100, 250]),
    JSON.stringify(Array.from(pageSizeSelect?.options ?? []).map((option) => option.value)),
  );
  check(
    GROUP_UX,
    'changing the page size returns to the first page',
    (() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        paged.app.window.HTMLSelectElement.prototype,
        'value',
      );
      descriptor?.set?.call(pageSizeSelect, '50');
      pageSizeSelect?.dispatchEvent(new paged.app.window.Event('change', { bubbles: true }));
      return true;
    })(),
  );
  await paged.app.settle(40);
  check(
    GROUP_UX,
    'the smaller page shows the first rows again',
    paged.app.text().includes('Showing 1–50 of 125 matching records') &&
      paged.app.text().includes('page 1 of 3'),
    paged.app.text().slice(0, 200),
  );
  // --- motion and noise ----------------------------------------------------
  const tailwind = await readSource('tailwind.config.ts');
  check(
    GROUP_UX,
    'the notification exit animation stays inside the allowed timing',
    /toast-out/.test(tailwind) && /220ms/.test(tailwind) && !/bounce/.test(tailwind),
  );
  const motionSources = await Promise.all(
    (
      await listSourceFiles('src')
    ).map((file) => readSource(file)),
  );
  check(
    GROUP_UX,
    'no new animation runs forever or per row',
    // `animate-pulse` is allowed only as the indeterminate import progress bar.
    motionSources.every(
      (source) =>
        !/animate-\[/.test(source) &&
        !/animate-bounce|animate-ping/.test(source) &&
        !/transition-all duration-(?:300|500|700)/.test(source),
    ),
  );
  check(
    GROUP_UX,
    'nothing uses a blocking browser dialog for feedback',
    motionSources.every((source) => !/\balert\(|\bconfirm\(|\bprompt\(/.test(source)),
  );
  check(
    GROUP_UX,
    'the interface no longer advertises the export as an upcoming stage',
    motionSources.every((source) => !/export[^.\n]{0,60}(later|next) stage/i.test(source)) &&
      (await readSource('src/components/dashboard/RoadmapCard.tsx')).includes('Export the results'),
  );
}
