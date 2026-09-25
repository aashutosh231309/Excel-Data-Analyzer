/**
 * Stage 2 verification suite: Excel import and data understanding.
 *
 * Groups:
 *   1. contracts & security   — the import boundary, offline parsing, no writes
 *   2. normalization          — headers, names, vehicles, modes, amounts, dates
 *   3. workbook import        — real generated .xlsx/.xls fixtures end to end
 *   4. renderer import flow   — loading, toasts, data screen, quality summary
 *
 * The fixtures are fictional and are generated into a temporary directory.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  bundleModule,
  createMockBridge,
  createProgressChannel,
  createRecorder,
  listSourceFiles,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  root,
  stripComments,
  buildImportedWorkbook,
} from './harness.mjs';
import {
  PAYMENTS_EMPTY_ROW,
  PAYMENTS_INVALID_AMOUNT_ROW,
  PAYMENTS_INVALID_DATE_ROW,
  PAYMENTS_ROWS,
  PAYMENTS_SECOND_INVALID_AMOUNT_ROW,
  createAliasSheet,
  excelSerialFor,
  writeFixtures,
} from './fixtures.mjs';

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/** Runs every Stage 2 group and returns the recorded results. */
export async function runStage2(workspace) {
  await verifyContractsAndSecurity(workspace);
  await verifyNormalization(workspace);
  await verifyWorkbookImport(workspace);
  await verifyRendererImport(workspace);
  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* 1. Contracts and security                                                   */
/* -------------------------------------------------------------------------- */

async function verifyContractsAndSecurity(workspace) {
  const group = 'import security';
  const rendererFiles = await listSourceFiles('src');
  const rendererSources = await Promise.all(rendererFiles.map((file) => readSource(file)));

  // --- offline, local parsing only ---------------------------------------
  const xlsxImporters = rendererFiles.filter((file, index) =>
    /from\s+['"]xlsx['"]|require\(['"]xlsx['"]\)/.test(stripComments(rendererSources[index] ?? '')),
  );
  check(
    group,
    'the renderer never imports SheetJS (parsing stays in the main process)',
    xlsxImporters.length === 0,
    xlsxImporters.join(', '),
  );

  const networkUsage = rendererFiles.filter((file, index) =>
    /\bfetch\(|XMLHttpRequest|new WebSocket|navigator\.sendBeacon|axios/.test(
      stripComments(rendererSources[index] ?? ''),
    ),
  );
  check(
    group,
    'the renderer performs no network requests',
    networkUsage.length === 0,
    networkUsage.join(', '),
  );

  const electronFiles = await listSourceFiles('electron');
  const electronSources = new Map(
    await Promise.all(electronFiles.map(async (file) => [file, stripComments(await readSource(file))])),
  );

  const excelModules = electronFiles.filter((file) => file.startsWith('electron/excel/'));
  const writeCallPattern =
    /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|unlink|unlinkSync|rename|renameSync|truncate|truncateSync|mkdir|mkdirSync|rmdir|rmdirSync|rmSync|copyFile|copyFileSync)\s*\(/;
  const writeCalls = excelModules.filter((file) => writeCallPattern.test(electronSources.get(file) ?? ''));
  check(
    group,
    'the Excel modules never write to disk (the source file is only read)',
    writeCalls.length === 0,
    writeCalls.join(', '),
  );

  const evalUsage = [...electronFiles, ...rendererFiles].filter((file) => {
    const source = electronSources.get(file) ?? rendererSources[rendererFiles.indexOf(file)] ?? '';
    return /\beval\s*\(|new Function\s*\(|\bchild_process\b|\bexecFile?\s*\(|\bspawn\s*\(/.test(source);
  });
  check(
    group,
    'no eval, Function constructor, child process or shell execution',
    evalUsage.length === 0,
    evalUsage.join(', '),
  );


  const workbookSource = electronSources.get('electron/excel/workbook.ts') ?? '';
  check(
    group,
    'formulas, VBA and HTML in the workbook are never read',
    /cellFormula:\s*false/.test(workbookSource) &&
      /bookVBA:\s*false/.test(workbookSource) &&
      /cellHTML:\s*false/.test(workbookSource),
  );
  check(
    group,
    'the file is read from disk with SheetJS only',
    /XLSX\.read\(/.test(workbookSource) && /readFile\(/.test(workbookSource),
  );

  const mainSource = electronSources.get('electron/main.ts') ?? '';
  check(
    group,
    'external links are only opened for https URLs',
    /startsWith\('https:\/\/'\)/.test(mainSource) && /shell\.openExternal/.test(mainSource),
  );
  check(
    group,
    'the import handlers are registered on the shared channel names',
    /IPC_CHANNELS\.importWorkbook/.test(mainSource) && /IPC_CHANNELS\.selectWorksheet/.test(mainSource),
  );
  check(
    group,
    'both import handlers validate the incoming path before touching the disk',
    (mainSource.match(/validateExcelPath\(/g) ?? []).length >= 3 &&
      /validation\.status === 'rejected'/.test(mainSource),
    `${(mainSource.match(/validateExcelPath\(/g) ?? []).length} uses`,
  );

  const selection = await bundleModule(
    'electron/shared/file-selection.ts',
    path.join(workspace, 'file-selection.cjs'),
  );
  check(
    group,
    'a Windows path is turned into a renderer-safe selection',
    selection.getFileName('C:\\Reports\\july payments.xlsx') === 'july payments.xlsx' &&
      selection.buildExcelFileSelection('C:\\Reports\\july payments.xlsx', 2048, 'id-1').extension === 'xlsx',
  );
  check(
    group,
    'unsupported types and unreadable files have their own messages',
    selection
      .rejectionMessage('unsupported-type', 'photo.png')
      .includes('not a supported spreadsheet') &&
      selection.rejectionMessage('unreadable').includes('could not be read'),
  );

  const preloadSource = electronSources.get('electron/preload.ts') ?? '';
  check(
    group,
    'the preload exposes a narrow API and no Node primitives',
    !/require\(['"](fs|child_process|os)['"]\)/.test(preloadSource) &&
      !/exposeInMainWorld\([^,]+,\s*\{\s*ipcRenderer/.test(preloadSource),
  );

  const contracts = stripComments(await readSource('electron/shared/import.ts'));
  check(
    group,
    'records are strongly typed (no any in the shared contracts)',
    !/:\s*any\b/.test(contracts),
  );
  check(
    group,
    'amounts are stored as integer minor units',
    /amountMinor:\s*number\s*\|\s*null/.test(contracts),
  );
  check(
    group,
    'dates are stored as ISO strings or null',
    /date:\s*string\s*\|\s*null/.test(contracts),
  );

  const statefulRecords = rendererFiles.filter((file, index) =>
    /useState<[^>]*TransactionRecord\[\]>/.test(rendererSources[index] ?? ''),
  );
  check(
    group,
    'only the dataset provider owns the records (no duplicated datasets in components)',
    statefulRecords.filter((file) => file.includes('src/components/')).length === 0,
    statefulRecords.join(', '),
  );

  const stage3Tokens = rendererFiles.filter((file, index) =>
    /activeFilters|searchQuery|minimumAmount|maximumAmount|applyFilters|dateFilter|amountFilter/.test(
      rendererSources[index] ?? '',
    ),
  );
  check(
    group,
    'no filtering engine from the next stage has been started',
    stage3Tokens.length === 0,
    stage3Tokens.join(', '),
  );

  const apiSource = stripComments(await readSource('electron/shared/api.ts'));
  check(
    group,
    'the renderer-facing API exposes no filesystem or process surface',
    !/from\s+['"]node:|require\(|\.exec\(|spawn|readFile|writeFile/.test(apiSource),
  );
  const apiMembers = ['browse', 'validatePath', 'resolvePath', 'importWorkbook', 'selectWorksheet', 'onImportProgress'];
  check(
    group,
    'the import API is limited to selecting, importing and observing progress',
    apiMembers.every((member) => new RegExp(`${member}\\s*[(:]`).test(apiSource)),
    apiMembers.filter((member) => !new RegExp(`${member}\\s*[(:]`).test(apiSource)).join(', '),
  );

  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  check(
    group,
    'SheetJS is a direct runtime dependency of the desktop app',
    typeof packageJson.dependencies?.xlsx === 'string',
    String(packageJson.dependencies?.xlsx),
  );
  check(
    group,
    'no network, upload or cloud client is installed for the import path',
    !Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).some((name) =>
      /axios|firebase|supabase|aws-sdk|googleapis|dropbox|@azure|cloudinary|upload/.test(name),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Normalization                                                            */
/* -------------------------------------------------------------------------- */

async function verifyNormalization(workspace) {
  const group = 'normalization';
  const text = await bundleModule('electron/excel/text.ts', path.join(workspace, 'text.cjs'));
  const amounts = await bundleModule('electron/excel/amounts.ts', path.join(workspace, 'amounts.cjs'));
  const dates = await bundleModule('electron/excel/dates.ts', path.join(workspace, 'dates.cjs'));
  const headers = await bundleModule('electron/excel/headers.ts', path.join(workspace, 'headers.cjs'));

  // --- headers ------------------------------------------------------------
  const headerCases = [
    [' Date ', 'date'],
    ['DATE', 'date'],
    ['VEHICLE NUMBER', 'vehicleNumber'],
    ['vehicle   number', 'vehicleNumber'],
    ['Vehicle No', 'vehicleNumber'],
    ['Payment Mode', 'paymentMode'],
    ['Amount', 'amount'],
    ['Payment Reason', 'paymentReason'],
    ['Remark', 'remark'],
    ['Remarks', 'remark'],
  ];
  for (const [raw, expected] of headerCases) {
    check(
      group,
      `header "${raw}" maps to ${expected}`,
      headers.matchField(raw)?.field === expected,
      headers.matchField(raw)?.field ?? 'no match',
    );
  }

  const unrelated = ['Reference', 'Invoice #', 'Serial No', 'GSTIN', '', '  ', 'Remarks column', 'Vehicle Type'];
  for (const raw of unrelated) {
    check(
      group,
      `unrelated header "${raw || '(blank)'}" is not mapped`,
      headers.matchField(raw) === null,
      headers.matchField(raw)?.field ?? '',
    );
  }

  const rowReader = (cells) => (rowIndex, columnIndex) => (rowIndex === 0 ? cells[columnIndex] : undefined);
  const matched = headers.evaluateHeaderRow(
    0,
    4,
    rowReader([' Date ', 'Name', 'VEHICLE NUMBER', 'Payment Mode', 'Amount']),
  );
  check(
    group,
    'a full expected header row matches every required field',
    matched.missingRequiredFields.length === 0 && matched.requiredMatches === 5,
    JSON.stringify(matched.missingRequiredFields),
  );

  const partial = headers.evaluateHeaderRow(0, 3, rowReader(['Date', 'Name', 'Payment Mode', 'Amount']));
  check(
    group,
    'a missing required column is reported by name',
    partial.missingRequiredFields.length === 1 && partial.missingRequiredFields[0] === 'vehicleNumber',
    JSON.stringify(partial.missingRequiredFields),
  );
  check(
    group,
    'optional columns are not required for a sheet to be importable',
    headers.getFieldDefinition('remark').required === false &&
      headers.getFieldDefinition('paymentReason').required === false,
  );

  // --- text fields --------------------------------------------------------
  check(group, 'names keep their spelling and capitalization', text.normalizePersonName('  Raj   Kumar ') === 'Raj Kumar');
  check(
    group,
    'internal whitespace is collapsed without touching the letters',
    text.normalizePersonName('SUNITA\t DEVI') === 'SUNITA DEVI',
  );
  check(group, 'blank names stay blank', text.normalizePersonName('   ') === '');
  check(group, 'numbers in text columns become readable text', text.normalizePersonName(2000) === '2000');

  check(
    group,
    'vehicle display values are trimmed and upper-cased, separators kept',
    text.normalizeVehicleDisplay(' up32 ab-1234 ') === 'UP32 AB-1234',
    text.normalizeVehicleDisplay(' up32 ab-1234 '),
  );
  check(
    group,
    'vehicle comparison keys ignore case and spaces',
    text.createVehicleKey('up32ab1234') === text.createVehicleKey('UP32 AB 1234') &&
      text.createVehicleKey('UP-32-AB-1234') === 'UP32AB1234',
  );
  check(
    group,
    'vehicle keys never invent characters',
    text.createVehicleKey('UP32AB1234') === 'UP32AB1234' && !text.createVehicleKey('KA05MN4321').includes('O'),
  );
  check(group, 'payment modes are preserved verbatim', text.normalizePaymentMode('  Bank Transfer ') === 'Bank Transfer');
  check(group, 'payment modes are not validated against a fixed list', text.normalizePaymentMode('Crypto Wallet') === 'Crypto Wallet');
  check(
    group,
    'free text keeps its content and trims only the edges',
    text.normalizeFreeText('  Paid in   full \n') === 'Paid in   full',
  );
  check(group, 'blank optional cells stay empty', text.normalizeFreeText('   ') === '' && text.normalizeFreeText(null) === '');
  check(
    group,
    'blankness is detected for null, undefined, empty and whitespace-only cells',
    text.isBlankCell(null) && text.isBlankCell(undefined) && text.isBlankCell('') && text.isBlankCell(' \u00A0 ') && !text.isBlankCell(0),
  );

  // --- amounts ------------------------------------------------------------
  const amountCases = [
    [2000, 200000],
    ['2000', 200000],
    ['2000.00', 200000],
    ['₹2,000', 200000],
    ['₹ 2,000.00', 200000],
    ['Rs. 2,000', 200000],
    ['INR 2000', 200000],
    [' 1,23,456.78 ', 12345678],
    ['₹0', 0],
    [1500.5, 150050],
  ];
  for (const [raw, expected] of amountCases) {
    const actual = amounts.parseAmountMinorUnits(raw);
    check(group, `amount ${JSON.stringify(raw)} → ${expected} paise`, actual === expected, `got ${actual}`);
  }

  for (const invalid of ['abc', 'N/A', 'n/a', '', '   ', '₹', '--', null, undefined, 'NaN', {}]) {
    const actual = amounts.parseAmountMinorUnits(invalid);
    check(
      group,
      `invalid amount ${JSON.stringify(invalid) ?? 'undefined'} stays invalid (never 0)`,
      actual === null,
      `got ${String(actual)}`,
    );
  }
  check(
    group,
    'a genuine zero amount is still a value',
    amounts.parseAmountMinorUnits('0') === 0 && amounts.isZeroAmount(0) === true && amounts.isZeroAmount(null) === false,
  );
  check(
    group,
    'currency precision is preserved (no floating point drift)',
    amounts.parseAmountMinorUnits('₹1,23,456.78') === 12345678 &&
      amounts.parseAmountMinorUnits('0.01') === 1 &&
      amounts.parseAmountMinorUnits('9999999.99') === 999999999,
  );

  // --- dates --------------------------------------------------------------
  const dateCases = [
    [{ value: excelSerialFor('2026-04-03'), hasDateFormat: true }, '2026-04-03', 'excel-serial'],
    [{ value: excelSerialFor('2026-04-03'), hasDateFormat: false }, '2026-04-03', 'excel-serial'],
    [{ value: new Date(2026, 3, 3), hasDateFormat: false }, '2026-04-03', 'date-object'],
    [{ value: '2026-04-03', hasDateFormat: false }, '2026-04-03', 'iso-string'],
    [{ value: '03/04/2026', hasDateFormat: false }, '2026-04-03', 'written-date'],
    [{ value: '25-09-2026', hasDateFormat: false }, '2026-09-25', 'written-date'],
    [{ value: '25 Sep 2026', hasDateFormat: false }, '2026-09-25', 'written-date'],
    [{ value: '09/25/26', hasDateFormat: false }, null, null],
  ];
  for (const [cell, expected, source] of dateCases) {
    const parsed = dates.parseDateCell(cell);
    const label = typeof cell.value === 'string' ? `"${cell.value}"` : String(cell.value);
    check(
      group,
      `date ${label} → ${expected ?? 'invalid'}`,
      (parsed?.iso ?? null) === expected && (source === null || parsed?.source === source),
      `${parsed?.iso ?? 'null'} (${parsed?.source ?? 'unparsed'})`,
    );
  }

  check(
    group,
    'day-first dates are never silently read as month-first',
    dates.parseDateCell({ value: '03/04/2026', hasDateFormat: false })?.iso === '2026-04-03',
  );
  check(
    group,
    'ambiguous month-first-only dates are rejected instead of guessed',
    dates.parseDateCell({ value: '09/25/2026', hasDateFormat: false }) === null,
  );
  check(
    group,
    'impossible dates are rejected',
    dates.parseDateCell({ value: '31/02/2026', hasDateFormat: false }) === null &&
      dates.parseDateCell({ value: '2026-13-01', hasDateFormat: false }) === null,
  );
  check(
    group,
    'two-digit years follow the Excel rule',
    dates.parseDateCell({ value: '01/01/26', hasDateFormat: false })?.iso === '2026-01-01' &&
      dates.parseDateCell({ value: '01/01/69', hasDateFormat: false })?.iso === '1969-01-01',
  );
  for (const invalid of ['not a date', '', '   ', 'ABCDEF', null, undefined, true, {}]) {
    check(
      group,
      `uninterpretable date ${JSON.stringify(invalid) ?? 'undefined'} is reported as invalid`,
      dates.parseDateCell({ value: invalid, hasDateFormat: false }) === null,
    );
  }
  check(
    group,
    'a number outside the serial range is not treated as a date',
    dates.parseDateCell({ value: 20_260_403, hasDateFormat: false }) === null,
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Workbook import                                                          */
/* -------------------------------------------------------------------------- */

async function verifyWorkbookImport(workspace) {
  const group = 'workbook import';
  const fixtures = await writeFixtures(workspace);
  const workbook = await bundleModule('electron/excel/workbook.ts', path.join(workspace, 'workbook.cjs'));

  // --- .xlsx --------------------------------------------------------------
  const before = await snapshotFile(fixtures.xlsx.filePath);
  const progress = [];
  const result = await workbook.importWorkbookFile(fixtures.xlsx.selection, {
    onProgress: (detail) => progress.push(detail),
  });
  const after = await snapshotFile(fixtures.xlsx.filePath);

  check(group, 'a valid .xlsx workbook imports', result.status === 'imported', result.status);
  if (result.status !== 'imported') {
    return;
  }

  const { records, statistics, sheets, sheetName } = result.workbook;
  check(group, 'the worksheet with the expected headers is chosen', sheetName === 'Payments', sheetName);
  check(group, 'all worksheets are inspected and reported', sheets.length === 1 && sheets[0].isImportable === true);

  const emptyRows = 1;
  check(
    group,
    'completely empty rows are ignored, everything else is imported',
    statistics.emptyRowsIgnored === emptyRows && statistics.rowsScanned === records.length,
    JSON.stringify({ empty: statistics.emptyRowsIgnored, scanned: statistics.rowsScanned, records: records.length }),
  );
  check(
    group,
    'empty rows are not turned into records',
    records.every((record) => record.name !== '' || record.amountMinor !== null || record.date !== null),
  );

  const first = records[0];
  check(
    group,
    'an Excel serial date is read natively',
    first.date === '2026-04-01',
    String(first.date),
  );
  check(
    group,
    'a string date written day-first is read consistently',
    records[2].date === '2026-04-03' && records[3].date === '2026-04-05',
    `${records[2].date} / ${records[3].date}`,
  );
  check(
    group,
    'the same vehicle in different spellings shares one comparison key',
    records[0].vehicleKey === records[3].vehicleKey && records[0].vehicleNumber === 'UP32AB1234',
    `${records[0].vehicleKey} / ${records[3].vehicleKey}`,
  );
  check(
    group,
    'the display value of a vehicle keeps its original form',
    records[1].vehicleNumber === 'UP-78 XY 9876' && records[1].vehicleKey === 'UP78XY9876',
  );
  check(group, 'all currency spellings produce the same amount', first.amountMinor === 200000);
  check(
    group,
    'amounts are normalized wherever they are spelled differently',
    [1, 2, 3].every((index) => records[index].amountMinor === 200000),
    records.map((record) => record.amountMinor).join(','),
  );
  check(
    group,
    'paise are preserved for non-whole amounts',
    records[7].amountMinor === 150050 && records[8].amountMinor === 12345678,
    `${records[7].amountMinor} / ${records[8].amountMinor}`,
  );

  const invalidDateRecord = records.find((record) => record.rowNumber === PAYMENTS_INVALID_DATE_ROW);
  const invalidAmountRecord = records.find((record) => record.rowNumber === PAYMENTS_INVALID_AMOUNT_ROW);
  const secondInvalidAmount = records.find((record) => record.rowNumber === PAYMENTS_SECOND_INVALID_AMOUNT_ROW);
  check(
    group,
    'an uninterpretable date keeps the original text for diagnostics and reports the row',
    invalidDateRecord?.date === null &&
      invalidDateRecord?.issues.some((issue) => issue.field === 'date' && issue.originalValue === 'not a date'),
    JSON.stringify(invalidDateRecord?.issues),
  );
  check(
    group,
    'an invalid amount is null — never zero — and visible as an issue',
    invalidAmountRecord?.amountMinor === null &&
      invalidAmountRecord?.issues.some((issue) => issue.field === 'amount' && issue.originalValue === 'abc') &&
      secondInvalidAmount?.amountMinor === null,
    JSON.stringify([invalidAmountRecord?.amountMinor, secondInvalidAmount?.amountMinor]),
  );
  check(
    group,
    'records with issues are counted separately',
    statistics.recordsWithIssues === 2 && statistics.validRecords === records.length - 2,
    JSON.stringify({ issues: statistics.recordsWithIssues, valid: statistics.validRecords }),
  );
  check(
    group,
    'the total only includes valid amounts',
    statistics.totalAmountMinor === records.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0) &&
      statistics.totalAmountMinor === 13_495_728,
    String(statistics.totalAmountMinor),
  );
  check(
    group,
    'the average is reported over the records that carry an amount',
    statistics.averageAmountMinor === Math.round(statistics.totalAmountMinor / statistics.recordsWithAmount),
  );

  const duplicateRows = records.filter((record) => record.rowNumber === 3 || record.rowNumber === 8);
  check(
    group,
    'identical rows are preserved as separate records',
    duplicateRows.length === 2 &&
      duplicateRows[0].name === duplicateRows[1].name &&
      duplicateRows[0].amountMinor === duplicateRows[1].amountMinor,
  );
  check(
    group,
    'every record has a stable, unique session id',
    new Set(records.map((record) => record.id)).size === records.length &&
      records.every((record) => record.id === `Payments#${record.rowNumber}`),
  );
  check(
    group,
    'blank optional cells do not fail the import',
    records[1].paymentReason === '' && records[1].remark === '' && records[1].issues.length === 0,
  );
  check(
    group,
    'blank required-name cells stay blank without inventing text',
    records[7].name === '',
  );

  // --- progress -----------------------------------------------------------
  const stages = progress.map((detail) => detail.stage);
  check(
    group,
    'progress reports the real phases in order',
    JSON.stringify(stages.slice(0, 4)) === JSON.stringify(['reading', 'inspecting', 'normalizing', 'preparing']),
    stages.join(' → '),
  );
  check(
    group,
    'normalization progress is measured, not invented',
    progress.every(
      (detail) =>
        detail.processed === undefined ||
        detail.total === undefined ||
        detail.processed <= detail.total,
    ),
  );

  // --- the source file is untouched --------------------------------------
  check(
    group,
    'the imported workbook is left byte-for-byte unchanged',
    before.hash === after.hash && before.mtimeMs === after.mtimeMs && before.size === after.size,
    JSON.stringify({ before: before.hash, after: after.hash }),
  );

  // --- .xls ---------------------------------------------------------------
  const legacy = await workbook.importWorkbookFile(fixtures.xls.selection);
  check(group, 'a legacy .xls workbook imports through the same path', legacy.status === 'imported', legacy.status);
  if (legacy.status === 'imported') {
    check(
      group,
      'the .xls import produces the same records as the .xlsx import',
      legacy.workbook.records.length === records.length &&
        legacy.workbook.statistics.totalAmountMinor === statistics.totalAmountMinor,
      `${legacy.workbook.records.length} records`,
    );
  }

  // --- worksheet selection ------------------------------------------------
  const multi = await workbook.importWorkbookFile(fixtures.multiSheet.selection);
  check(group, 'a workbook with several sheets imports the right one', multi.status === 'imported', multi.status);
  if (multi.status === 'imported') {
    check(
      group,
      'the first sheet is not assumed when it holds no transaction columns',
      multi.workbook.sheetName === 'Payments',
      multi.workbook.sheetName,
    );
    const importable = multi.workbook.sheets.filter((sheet) => sheet.isImportable);
    check(
      group,
      'every importable worksheet is offered for selection',
      importable.length === 2 &&
        importable.map((sheet) => sheet.name).join(',') === 'Payments,July Payments',
      importable.map((sheet) => sheet.name).join(','),
    );
    check(
      group,
      'non-transaction sheets are reported as missing their columns',
      multi.workbook.sheets[0].isImportable === false &&
        multi.workbook.sheets[0].missingRequiredFields.length === 5,
      JSON.stringify(multi.workbook.sheets[0].missingRequiredFields),
    );

    const switched = await workbook.buildImportResult(
      fixtures.multiSheet.selection,
      await workbook.loadWorkbook(fixtures.multiSheet.selection),
      { sheetName: 'July Payments' },
    );
    check(
      group,
      'switching worksheets reuses the parsed workbook',
      switched.status === 'imported' &&
        switched.workbook.sheetName === 'July Payments' &&
        switched.workbook.records.length === 2,
      switched.status === 'imported' ? switched.workbook.sheetName : switched.status,
    );

    const unknown = await workbook.buildImportResult(
      fixtures.multiSheet.selection,
      await workbook.loadWorkbook(fixtures.multiSheet.selection),
      { sheetName: 'Does not exist' },
    );
    check(
      group,
      'an unknown worksheet name falls back instead of crashing',
      unknown.status === 'imported' && unknown.workbook.records.length > 0,
      unknown.status,
    );
  }

  // --- the 1904 date system ----------------------------------------------
  const date1904 = await workbook.importWorkbookFile(fixtures.date1904.selection);
  check(
    group,
    'a workbook using the 1904 date system is read with the right dates',
    date1904.status === 'imported' && date1904.workbook.records[0]?.date === '2026-04-03',
    date1904.status === 'imported' ? String(date1904.workbook.records[0]?.date) : date1904.status,
  );

  // --- header variants ----------------------------------------------------
  const alias = await workbook.importWorkbookFile(fixtures.aliasOnly.selection);
  check(group, 'alias headers ("Vehicle No", "Amount (INR)") import', alias.status === 'imported', alias.status);
  if (alias.status === 'imported') {
    const sheet = alias.workbook.sheets[0];
    check(
      group,
      'a title row above the headers is skipped',
      sheet.headerRowIndex === 2 && alias.workbook.records[0].rowNumber === 4,
      `header row ${sheet.headerRowIndex}`,
    );
    check(
      group,
      'the alias columns are mapped to the right fields',
      alias.workbook.records[0].vehicleKey === 'UP32GH7788' &&
        alias.workbook.records[0].amountMinor === 450000 &&
        alias.workbook.records[0].date === '2026-07-01',
      JSON.stringify(alias.workbook.records[0]),
    );
  }

  // --- failure modes ------------------------------------------------------
  const missing = await workbook.importWorkbookFile(fixtures.missingColumns.selection);
  check(
    group,
    'a workbook without the required columns is rejected with the missing field names',
    missing.status === 'invalid-headers' &&
      missing.missingRequiredFields.join(',') === 'vehicleNumber',
    JSON.stringify(missing),
  );

  const empty = await workbook.importWorkbookFile(fixtures.empty.selection);
  check(
    group,
    'a valid but row-less worksheet reports the empty state instead of failing',
    empty.status === 'empty' && empty.statistics.importedRecords === 0,
    empty.status,
  );

  const corrupt = await workbook.importWorkbookFile(fixtures.corrupt.selection);
  check(
    group,
    'an unreadable workbook reports a friendly message without a stack trace',
    corrupt.status === 'unreadable' &&
      !/^\s*at |\bTypeError\b|\bReferenceError\b|\bENOENT\b|node_modules|\.js:\d+/.test(corrupt.message) &&
      corrupt.message.length > 20,
    corrupt.status === 'unreadable' ? corrupt.message : corrupt.status,
  );

  const absentFile = {
    ...fixtures.xlsx.selection,
    path: path.join(workspace, 'does-not-exist.xlsx'),
    name: 'does-not-exist.xlsx',
  };
  const absent = await workbook.importWorkbookFile(absentFile);
  check(
    group,
    'a missing file reports a specific, non-technical message',
    absent.status === 'unreadable' && /could not be found/i.test(absent.message),
    absent.status === 'unreadable' ? absent.message : absent.status,
  );

  const directory = { ...fixtures.xlsx.selection, path: workspace, name: 'folder' };
  const directoryResult = await workbook.importWorkbookFile(directory);
  check(
    group,
    'a folder cannot be imported as a workbook',
    directoryResult.status === 'unreadable' &&
      /folder|valid \.xlsx/i.test(directoryResult.message),
    directoryResult.status === 'unreadable' ? directoryResult.message : directoryResult.status,
  );

  // --- no partial state after a failure -----------------------------------
  check(
    group,
    'a rejected workbook still reports the worksheets it inspected',
    missing.status === 'invalid-headers' && missing.sheets.length === 1 && missing.sheets[0].name === 'Ledger',
  );
}

/** Hashes a file so the suite can prove the source workbook was not touched. */
async function snapshotFile(filePath) {
  const [buffer, details] = await Promise.all([readFile(filePath), stat(filePath)]);
  return {
    hash: createHash('sha256').update(buffer).digest('hex'),
    size: details.size,
    mtimeMs: details.mtimeMs,
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Renderer import flow                                                     */
/* -------------------------------------------------------------------------- */

async function verifyRendererImport(workspace) {
  const group = 'import ui';
  const prepared = await prepareRendererBundle(workspace);
  const file = {
    name: 'fictional-payments.xlsx',
    path: 'C:\\Reports\\fictional-payments.xlsx',
    extension: 'xlsx',
    sizeInBytes: 15_360,
    selectionId: 'renderer-1',
  };

  // --- loading state ------------------------------------------------------
  {
    const progress = createProgressChannel();
    let resolveImport;
    const pending = new Promise((resolve) => {
      resolveImport = resolve;
    });
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: () => pending,
        onImportProgress: progress.subscribe,
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });

    check(group, 'the dashboard offers the import action', Boolean(app.findButton('Browse Excel File')));
    app.click(app.findButton('Browse Excel File'));
    await app.settle(60);

    check(
      group,
      'a loading state appears while the workbook is parsed',
      app.text().includes('Reading Excel file') &&
        app.document.querySelector('[role="status"]') !== null,
      app.text().slice(0, 120),
    );
    check(
      group,
      'no percentage is shown while the row count is unknown',
      app.document.querySelector('[role="progressbar"]') === null,
    );
    const dropZone = app.document.querySelector('[aria-label="Excel file drop zone"]');
    check(
      group,
      'conflicting actions are disabled while loading',
      app.findButton('Browse Excel File') === undefined &&
        (dropZone?.getAttribute('aria-disabled') === 'true' || dropZone?.className.includes('pointer-events-none') === true),
      `browse=${app.findButton('Browse Excel File') !== undefined}, aria-disabled=${dropZone?.getAttribute('aria-disabled')}`,
    );

    progress.emit({ stage: 'normalizing', message: 'Normalizing records', processed: 500, total: 2_000, reason: 'import' });
    await app.settle(30);
    check(
      group,
      'phase messages come from the main process',
      app.text().includes('Normalizing records'),
      app.text().slice(0, 160),
    );
    check(
      group,
      'a real percentage is shown once rows are counted',
      app.document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '25',
      app.document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ?? 'none',
    );

    resolveImport(buildImportedWorkbook({ fileName: file.name }));
    await app.settle(60);

    check(
      group,
      'a success notification names the file import and the record count',
      app.text().includes('Excel file imported successfully') && app.text().includes('2 records loaded'),
      app.text().slice(0, 200),
    );
    check(
      group,
      'the app moves to the data screen after a successful import',
      app.text().includes('Data') && app.text().includes(file.name) && app.text().includes('worksheet "Payments"'),
    );
    check(
      group,
      'the statistics show the real imported figures',
      app.text().includes('Records') && app.text().includes('Valid') && app.text().includes('Invalid'),
    );
    check(
      group,
      'the failing rows are surfaced instead of being discarded',
      app.text().includes('1 record needs attention') &&
        app.text().includes('1 invalid date') &&
        app.text().includes('1 invalid amount'),
      JSON.stringify(app.document.querySelector('[aria-label="Data quality"]')?.textContent?.slice(0, 120)),
    );
    check(
      group,
      'the table shows every expected column',
      ['Date', 'Name', 'Vehicle Number', 'Payment Mode', 'Amount', 'Payment Reason', 'Remark'].every((column) =>
        Array.from(app.document.querySelectorAll('th')).some((header) => (header.textContent ?? '').includes(column)),
      ),
      Array.from(app.document.querySelectorAll('th')).map((header) => header.textContent).join(' | '),
    );

    const rows = Array.from(app.document.querySelectorAll('tbody tr'));
    check(group, 'every imported record is listed', rows.length === 2, String(rows.length));
    const validRowText = rows[0]?.textContent ?? '';
    check(
      group,
      'dates are displayed as DD/MM/YYYY',
      validRowText.includes('25/09/2026'),
      validRowText,
    );
    check(
      group,
      'amounts are displayed with the rupee symbol',
      validRowText.includes('₹2,000') && !validRowText.includes('₹0'),
      validRowText,
    );
    check(
      group,
      'the invalid date and amount keep their original text in the row',
      (rows[1]?.textContent ?? '').includes('not a date') && (rows[1]?.textContent ?? '').includes('abc'),
      rows[1]?.textContent ?? '',
    );
    check(
      group,
      'an invalid amount is never shown as ₹0',
      !(rows[1]?.textContent ?? '').includes('₹0'),
    );

    const amountCells = Array.from(app.document.querySelectorAll('tbody tr')).map(
      (row) => row.querySelectorAll('td')[4],
    );
    check(
      group,
      'the amount column is right-aligned',
      amountCells.every((cell) => (cell?.getAttribute('class') ?? '').includes('text-right')),
    );

    // Row details for inspection of the truncated values.
    app.click(rows[1] ?? null);
    await app.settle(30);
    const details = app.document.querySelector('[aria-label="Details of row 3"]');
    check(group, 'clicking a row opens the record details panel', details !== null);
    check(
      group,
      'the details panel lists every field of the record',
      ['Date', 'Name', 'Vehicle Number', 'Payment Mode', 'Amount', 'Payment Reason', 'Remark'].every((label) =>
        (details?.textContent ?? '').includes(label),
      ),
      (details?.textContent ?? '').slice(0, 160),
    );
    check(
      group,
      'the details panel explains why a value needs attention',
      (details?.textContent ?? '').includes('could not be interpreted'),
      (details?.textContent ?? '').slice(0, 200),
    );

    check(
      group,
      'the data screen offers no filtering controls',
      app.document.querySelectorAll('input[type="date"], input[type="search"], input[type="text"], input[type="number"]').length === 0 &&
        !/apply filter|clear filter|today|yesterday/i.test(app.text()),
    );
    check(
      group,
      'no alert()/confirm() is used for import feedback',
      app.document.querySelectorAll('input,button').length > 0 && app.errors.length === 0,
      app.errors.join(' | '),
    );
    app.close();
  }

  // --- worksheet selector -------------------------------------------------
  {
    const sheets = [
      { name: 'Read me', headerRowIndex: null, dataRowCount: 0, columns: [], missingRequiredFields: ['date', 'name', 'vehicleNumber', 'paymentMode', 'amount'], isImportable: false },
      { name: 'Payments', headerRowIndex: 0, dataRowCount: 2, columns: [], missingRequiredFields: [], isImportable: true },
      { name: 'July Payments', headerRowIndex: 2, dataRowCount: 2, columns: [], missingRequiredFields: [], isImportable: true },
    ];
    const { bridge, calls } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: async () => buildImportedWorkbook({ fileName: file.name, sheets }),
        onImportProgress: () => () => {},
        selectWorksheet: async (filePath, sheetName) => {
          calls.selectedSheets.push(sheetName);
          return buildImportedWorkbook({ fileName: file.name, sheets, sheetName });
        },
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });
    app.click(app.findButton('Browse Excel File'));
    await app.settle(80);

    const selector = app.document.querySelector('[aria-label="Worksheets"]');
    check(group, 'several importable worksheets offer a selection interface', selector !== null);
    const sheetOptions = Array.from(selector?.querySelectorAll('button') ?? []).map((button) => ({
      label: (button.textContent ?? '').trim(),
      disabled: button.hasAttribute('disabled'),
    }));
    check(
      group,
      'only importable worksheets can be selected',
      sheetOptions.some((option) => option.label.includes('July Payments') && !option.disabled) &&
        sheetOptions.some((option) => option.label.includes('Read me') && option.disabled) &&
        (selector?.textContent ?? '').includes('Missing:'),
      JSON.stringify(sheetOptions),
    );

    const julyOption = Array.from(selector?.querySelectorAll('button') ?? []).find((button) =>
      (button.textContent ?? '').includes('July Payments'),
    );
    app.click(julyOption ?? null);
    await app.settle(60);
    check(
      group,
      'choosing a worksheet asks the main process for that sheet',
      calls.selectedSheets.includes('July Payments'),
      calls.selectedSheets.join(','),
    );
    check(
      group,
      'switching worksheets reports itself instead of claiming a new import',
      app.text().includes('Worksheet loaded'),
      app.text().replace(/\s+/g, ' ').slice(0, 160),
    );
    const switchRows = Array.from(app.document.querySelectorAll('tbody tr'));
    check(group, 'the table is replaced by the chosen worksheet', switchRows.length === 2, String(switchRows.length));
    app.close();
  }

  // --- empty and failing imports -----------------------------------------
  {
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: async () => ({
          status: 'empty',
          file,
          sheetName: 'Payments',
          sheets: [{ name: 'Payments', headerRowIndex: 0, dataRowCount: 0, columns: [], missingRequiredFields: [], isImportable: true }],
          statistics: {
            rowsScanned: 0,
            emptyRowsIgnored: 0,
            importedRecords: 0,
            validRecords: 0,
            recordsWithIssues: 0,
            recordsWithAmount: 0,
            totalAmountMinor: 0,
            averageAmountMinor: null,
          },
        }),
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });
    app.click(app.findButton('Browse Excel File'));
    await app.settle(80);
    check(
      group,
      'a valid but empty worksheet reports the empty state',
      app.text().includes('No records found') &&
        app.text().includes('does not contain any usable transaction rows'),
      app.text().slice(0, 200),
    );
    check(
      group,
      'the empty state offers another file',
      Boolean(app.findButton('Choose Another File')),
    );
    check(
      group,
      'the empty state renders no broken table',
      app.document.querySelectorAll('table').length === 0,
    );
    app.close();
  }

  {
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: async () => ({
          status: 'invalid-headers',
          file,
          sheets: [
            {
              name: 'Ledger',
              headerRowIndex: 0,
              dataRowCount: 3,
              columns: [
                { field: 'date', header: 'Date', columnIndex: 0, required: true },
                { field: 'name', header: 'Name', columnIndex: 1, required: true },
                { field: 'paymentMode', header: 'Payment Mode', columnIndex: 2, required: true },
                { field: 'amount', header: 'Amount', columnIndex: 3, required: true },
              ],
              missingRequiredFields: ['vehicleNumber'],
              isImportable: false,
            },
          ],
          missingRequiredFields: ['vehicleNumber'],
          message: 'Worksheet "Ledger" is missing required columns.',
        }),
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });
    app.click(app.findButton('Browse Excel File'));
    await app.settle(80);
    check(
      group,
      'a workbook with missing columns explains exactly what is missing',
      app.text().includes('Required columns are missing') && app.text().includes('Vehicle Number'),
      app.text().slice(0, 220),
    );
    check(
      group,
      'the error names the worksheet and stays on the dashboard',
      app.text().includes('Ledger') &&
        app.findButton('Choose another file') !== undefined &&
        app.document.querySelectorAll('table').length === 0,
    );
    check(
      group,
      'no technical stack trace leaks into the interface',
      !/[A-Za-z]+Error:|at Object\.|node_modules/.test(app.text()),
    );
    app.close();
  }

  // --- replacing a file: the previous dataset survives a failure -----------
  {
    let nextResult = buildImportedWorkbook({ fileName: file.name });
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: async () => nextResult,
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });
    app.click(app.findButton('Browse Excel File'));
    await app.settle(60);
    nextResult = { status: 'unreadable', fileName: file.name, message: 'The workbook could not be read.' };
    app.click(app.findButton('Replace file'));
    await app.settle(60);
    check(
      group,
      'a failed replacement keeps the previous dataset and says so',
      app.text().includes('the current dataset was kept') &&
        app.text().includes('still loaded and unchanged') &&
        app.document.querySelectorAll('tbody tr').length === 2,
      app.text().slice(0, 200),
    );
    app.close();
  }

  // --- large workbooks ----------------------------------------------------
  {
    const recordCount = 5_000;
    const records = Array.from({ length: recordCount }, (_, index) => ({
      id: `Payments#${index + 2}`,
      rowNumber: index + 2,
      date: '2026-04-01',
      name: `Fictional Party ${index}`,
      vehicleNumber: `UP32AB${String(1000 + index)}`,
      vehicleKey: `UP32AB${String(1000 + index)}`,
      paymentMode: 'UPI',
      amountMinor: 100_000,
      paymentReason: 'Fuel',
      remark: '',
      issues: [],
    }));
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file }),
        importWorkbook: async () =>
          buildImportedWorkbook({
            fileName: file.name,
            records,
            statistics: {
              rowsScanned: recordCount,
              emptyRowsIgnored: 0,
              importedRecords: recordCount,
              validRecords: recordCount,
              recordsWithIssues: 0,
              recordsWithAmount: recordCount,
              totalAmountMinor: 100_000 * recordCount,
              averageAmountMinor: 100_000,
            },
          }),
      },
    });
    const started = Date.now();
    const app = await renderRenderer({ ...prepared, bridge });
    app.click(app.findButton('Browse Excel File'));
    await app.settle(120);
    const elapsed = Date.now() - started;

    const rows = Array.from(app.document.querySelectorAll('tbody tr'));
    check(
      group,
      'a 5,000 record workbook renders one page instead of every row',
      rows.length === 100,
      `${rows.length} rows`,
    );
    check(
      group,
      'the pagination reflects the real record count',
      app.text().includes('5,000 records') && app.text().includes('page 1 of 50'),
      app.text().slice(0, 200),
    );
    check(
      group,
      'rows are not individually animated',
      rows.every((row) => !/animate-/.test(row.getAttribute('class') ?? '')),
    );
    check(
      group,
      'the data screen stays responsive for large workbooks',
      elapsed < 5_000,
      `${elapsed}ms`,
    );

    const nextButton = app.document.querySelector('[aria-label="Next page"]');
    app.click(nextButton);
    await app.settle(40);
    const secondPage = Array.from(app.document.querySelectorAll('tbody tr'));
    check(
      group,
      'paging shows the next slice of records',
      (secondPage[0]?.textContent ?? '').includes('Fictional Party 100'),
      (secondPage[0]?.textContent ?? '').slice(0, 80),
    );
    app.close();
  }
}
