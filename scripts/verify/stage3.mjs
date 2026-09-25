/**
 * Stage 3 verification suite: filtering and automatic transaction totals.
 *
 * Groups:
 *   1. filter engine — validation, matching, totals, chips and the date policy
 *   2. filter ui     — the panel, the name selector, chips, results, pagination
 *
 * The engine is exercised directly through the real `src/domain/filtering.ts`
 * module; the interface runs the real renderer bundle in a DOM with a mocked
 * preload bridge. The datasets are fictional.
 */
import path from 'node:path';
import {
  buildImportedWorkbook,
  buildRecord,
  bundleModule,
  createMockBridge,
  createRecorder,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  stripComments,
} from './harness.mjs';

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/** Runs every Stage 3 group and returns the recorded results. */
export async function runStage3(workspace) {
  await verifyFilterEngine(workspace);
  await verifyFilterUi(workspace);
  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* Datasets                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The example dataset of the specification: two records dated 25/09/2026 with
 * the same name, three vehicles and four amounts.
 */
const SPEC_ROWS = [
  { rowNumber: 2, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000, paymentMode: 'Cash' },
  { rowNumber: 3, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32CD5678', amountMinor: 150_000, paymentMode: 'UPI' },
  { rowNumber: 4, date: '2026-09-25', name: 'Amit', vehicleNumber: 'UP32AB1234', amountMinor: 300_000, paymentMode: 'Cash' },
  { rowNumber: 5, date: '2026-09-26', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 50_000, paymentMode: 'Cash' },
];

function buildRecords(rows) {
  return rows.map((row, index) =>
    buildRecord({
      id: `Payments#${row.rowNumber ?? index + 2}`,
      ...row,
    }),
  );
}

function specRecords() {
  return buildRecords(SPEC_ROWS);
}

/** Local calendar date, written out independently of the code under test. */
function localIso(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localToday() {
  return localIso(new Date());
}

function localYesterday() {
  const now = new Date();
  return localIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** Indian-grouped rupee text for integer paise, formatted independently here. */
function rupees(minorUnits) {
  const sign = minorUnits < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(minorUnits));
  const whole = new Intl.NumberFormat('en-IN').format(Math.trunc(absolute / 100));
  const paise = absolute % 100;
  return paise === 0 ? `${sign}₹${whole}` : `${sign}₹${whole}.${String(paise).padStart(2, '0')}`;
}

/** Total of a fixture row list, in integer paise. */
function totalOf(rows) {
  return rows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
}

/** DD/MM/YYYY, as the interface and the chips display a date. */
function localDayFirst(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/* -------------------------------------------------------------------------- */
/* 1. Filter engine                                                             */
/* -------------------------------------------------------------------------- */

async function verifyFilterEngine(workspace) {
  const group = 'filter engine';
  const filtering = await bundleModule('src/domain/filtering.ts', path.join(workspace, 'filtering.cjs'));
  const dates = await bundleModule('electron/excel/dates.ts', path.join(workspace, 'dates.cjs'));

  /** Validates a partial filter state on top of the empty state. */
  const validate = (partial) =>
    filtering.validateFilterState({ ...filtering.createEmptyFilterState(), ...partial });

  /** Runs the real pipeline: validate → single authoritative result set. */
  const run = (records, partial) => filtering.deriveFilteredResult(records, validate(partial).values);

  const records = specRecords();

  // --- one category at a time ---------------------------------------------
  const byDate = run(records, { date: '2026-09-25' });
  check(
    group,
    'a date filter matches only that calendar day',
    byDate.count === 3 && byDate.amountRecords === 3 && byDate.totalAmountMinor === 650_000,
    `${byDate.count} records / ${byDate.totalAmountMinor}`,
  );
  check(
    group,
    'the date filter is a single day, not a range',
    byDate.records.every((record) => record.date === '2026-09-25') &&
      !byDate.records.some((record) => record.date === '2026-09-26'),
  );

  const byName = run(records, { name: 'Raj Kumar' });
  check(
    group,
    'a name filter matches the normalized name',
    byName.count === 3 && byName.totalAmountMinor === 400_000,
    `${byName.count} records / ${byName.totalAmountMinor}`,
  );
  check(
    group,
    'names ignore surrounding case and repeated whitespace',
    run(records, { name: '  raj   KUMAR ' }).count === 3,
  );
  check(
    group,
    'a partial name is not a fuzzy match',
    run(records, { name: 'Raj' }).count === 0 && run(records, { name: 'raj kumarr' }).count === 0,
  );

  const vehicleVariants = ['UP32AB1234', 'up32ab1234', 'UP-32-AB-1234', 'UP 32 AB 1234'];
  check(
    group,
    'the vehicle filter ignores case and separators',
    vehicleVariants.every((vehicleNumber) => run(records, { vehicleNumber }).count === 3),
    vehicleVariants
      .map((vehicleNumber) => `${vehicleNumber}:${run(records, { vehicleNumber }).count}`)
      .join(' '),
  );
  check(
    group,
    'the vehicle filter never invents characters',
    run(records, { vehicleNumber: 'UP 32 AB 123' }).count === 0 &&
      run(records, { vehicleNumber: 'UP32AB12345' }).count === 0,
  );

  const byExact = run(records, { amountMode: 'exact', exactAmount: '2000' });
  check(
    group,
    'the specification example: exact ₹2,000 matches one record',
    byExact.count === 1 && byExact.totalAmountMinor === 200_000 && byExact.records[0]?.id === 'Payments#2',
    `${byExact.count} records / ${byExact.totalAmountMinor}`,
  );

  // --- combinations --------------------------------------------------------
  const dateAndName = run(records, { date: '2026-09-25', name: 'Raj Kumar' });
  check(
    group,
    'the specification example: 25/09/2026 + Raj Kumar → 2 records, ₹3,500, ₹1,750 each',
    dateAndName.count === 2 &&
      dateAndName.totalAmountMinor === 350_000 &&
      dateAndName.averageAmountMinor === 175_000,
    `${dateAndName.count} records / ${dateAndName.totalAmountMinor} / ${dateAndName.averageAmountMinor}`,
  );
  check(
    group,
    'the specification example: UP32AB1234 → 3 records, ₹5,500',
    run(records, { vehicleNumber: 'UP32AB1234' }).count === 3 &&
      run(records, { vehicleNumber: 'UP32AB1234' }).totalAmountMinor === 550_000,
  );

  const nameAndVehicle = run(records, { name: 'Raj Kumar', vehicleNumber: 'UP32AB1234' });
  check(
    group,
    'name + vehicle are combined with AND',
    nameAndVehicle.count === 2 && nameAndVehicle.totalAmountMinor === 250_000,
    `${nameAndVehicle.count} records / ${nameAndVehicle.totalAmountMinor}`,
  );

  const vehicleAndAmount = run(records, {
    vehicleNumber: 'UP32AB1234',
    amountMode: 'range',
    minAmount: '1000',
    maxAmount: '3000',
  });
  check(
    group,
    'vehicle + amount range are combined with AND',
    vehicleAndAmount.count === 2 && vehicleAndAmount.totalAmountMinor === 500_000,
    `${vehicleAndAmount.count} records / ${vehicleAndAmount.totalAmountMinor}`,
  );

  const allFour = run(records, {
    date: '2026-09-25',
    name: 'Raj Kumar',
    vehicleNumber: 'up-32-ab-1234',
    amountMode: 'exact',
    exactAmount: '₹2,000',
  });
  check(
    group,
    'all four categories can be combined',
    allFour.count === 1 && allFour.records[0]?.id === 'Payments#2' && allFour.totalAmountMinor === 200_000,
    `${allFour.count} records / ${allFour.totalAmountMinor}`,
  );
  check(
    group,
    'categories are never combined with OR',
    run(records, { date: '2026-09-26', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234' }).count === 1,
  );

  // --- amount modes --------------------------------------------------------
  const range = run(records, { amountMode: 'range', minAmount: '1000', maxAmount: '3000' });
  check(
    group,
    'a range filter keeps both bounds inclusive',
    range.count === 3 && range.totalAmountMinor === 650_000 && range.averageAmountMinor === 216_667,
    `${range.count} records / ${range.totalAmountMinor} / ${range.averageAmountMinor}`,
  );
  const minOnly = run(records, { amountMode: 'range', minAmount: '2000' });
  check(
    group,
    'a minimum-only range keeps everything above it',
    minOnly.count === 2 && minOnly.totalAmountMinor === 500_000,
    `${minOnly.count} records / ${minOnly.totalAmountMinor}`,
  );
  const maxOnly = run(records, { amountMode: 'range', maxAmount: '2000' });
  check(
    group,
    'a maximum-only range keeps everything below it',
    maxOnly.count === 3 && maxOnly.totalAmountMinor === 400_000,
    `${maxOnly.count} records / ${maxOnly.totalAmountMinor}`,
  );
  check(
    group,
    'a range with equal bounds behaves like an exact amount',
    run(records, { amountMode: 'range', minAmount: '2000', maxAmount: '2000' }).count === 1,
  );

  // --- totals --------------------------------------------------------------
  const expectedTotal = dateAndName.records.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0);
  check(
    group,
    'the total is the sum of the matching records only',
    dateAndName.totalAmountMinor === expectedTotal &&
      dateAndName.totalAmountMinor !== filtering.summarizeRecords(records).totalAmountMinor,
  );
  check(
    group,
    'the average is the total divided by the records with a valid amount',
    filtering.summarizeRecords(buildRecords(SPEC_ROWS.slice(0, 2))).averageAmountMinor === 175_000 &&
      filtering.summarizeRecords([]).averageAmountMinor === null &&
      filtering.summarizeRecords([]).totalAmountMinor === 0,
  );

  // Integer paise: no float drift, no formatted strings in the arithmetic.
  const driftRecords = buildRecords([
    { rowNumber: 2, amountMinor: 199_999_999, name: 'A' },
    { rowNumber: 3, amountMinor: 1, name: 'A' },
    { rowNumber: 4, amountMinor: 10, name: 'A' },
  ]);
  const drift = filtering.summarizeRecords(driftRecords);
  check(
    group,
    'totals are exact integer paise',
    drift.totalAmountMinor === 200_000_010 &&
      Number.isSafeInteger(drift.totalAmountMinor) &&
      filtering.summarizeRecords(buildRecords([{ amountMinor: 200_050, name: 'A' }])).totalAmountMinor === 200_050,
    String(drift.totalAmountMinor),
  );

  // --- invalid data --------------------------------------------------------
  const messy = buildRecords([
    { rowNumber: 2, date: null, name: 'Sunita Devi', vehicleNumber: 'UP78XY9876', amountMinor: null },
    { rowNumber: 3, date: '2026-09-25', name: 'Sunita Devi', vehicleNumber: 'UP78XY9876', amountMinor: 10_000 },
  ]);
  const invalidAmountMatch = run(messy, { name: 'Sunita Devi' });
  check(
    group,
    'an unreadable amount stays out of the filtered total',
    invalidAmountMatch.count === 2 &&
      invalidAmountMatch.amountRecords === 1 &&
      invalidAmountMatch.totalAmountMinor === 10_000,
    JSON.stringify(invalidAmountMatch),
  );
  check(
    group,
    'an unreadable amount is never compared as ₹0',
    run(messy, { amountMode: 'range', minAmount: '0', maxAmount: '100000000' }).count === 1 &&
      run(messy, { amountMode: 'exact', exactAmount: '0' }).count === 0,
  );
  check(
    group,
    'records with an invalid date simply fail the date comparison',
    run(messy, { date: '2026-09-25' }).count === 1 && run(messy, { date: null }).count === 2,
  );

  // --- duplicates and purity ----------------------------------------------
  const duplicates = buildRecords([
    { rowNumber: 2, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000 },
    { rowNumber: 9, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000 },
  ]);
  const duplicateMatch = run(duplicates, { name: 'Raj Kumar' });
  check(
    group,
    'identical-looking rows are kept as separate matches',
    duplicateMatch.count === 2 && duplicateMatch.totalAmountMinor === 400_000,
    `${duplicateMatch.count} records / ${duplicateMatch.totalAmountMinor}`,
  );
  check(
    group,
    'filtering reuses the imported record objects and leaves the input untouched',
    byDate.records[0] === records[0] &&
      records.length === 4 &&
      duplicateMatch.records[0] !== duplicateMatch.records[1],
  );
  check(
    group,
    'without filters the imported records pass through unchanged',
    filtering.deriveFilteredResult(records, null).records === records &&
      filtering.deriveFilteredResult(records, null).isFiltered === false,
  );
  check(
    group,
    'filtering is deterministic',
    JSON.stringify(run(records, { name: 'Raj Kumar' }).records.map((record) => record.id)) ===
      JSON.stringify(run(records, { name: 'Raj Kumar' }).records.map((record) => record.id)),
  );

  // A 20k-row workbook is filtered in a single pass; the measured time is
  // reported so a regression in the engine is visible instead of guessed at.
  {
    const large = [];
    for (let index = 0; index < 20_000; index += 1) {
      large.push(
        buildRecord({
          id: `Payments#${index + 2}`,
          rowNumber: index + 2,
          date: index % 2 === 0 ? '2026-09-25' : '2026-09-26',
          name: index % 100 === 0 ? 'Neha Gupta' : 'Raj Kumar',
          vehicleNumber: index % 3 === 0 ? 'UP32CD5678' : 'UP32AB1234',
          amountMinor: 100_000 + index,
        }),
      );
    }
    const startedAt = performance.now();
    const largeResult = run(large, { name: 'Neha Gupta', amountMode: 'range', minAmount: '1000' });
    const elapsed = performance.now() - startedAt;
    check(
      group,
      'a 20,000-row worksheet filters in one fast pass',
      largeResult.count === 200 && elapsed < 1_000,
      `${largeResult.count} records in ${elapsed.toFixed(1)} ms`,
    );
  }

  // --- validation ----------------------------------------------------------
  const empty = validate({});
  check(
    group,
    'an empty filter set validates to nothing instead of the whole dataset',
    empty.values === null && empty.errors.length === 0 && empty.activeCount === 0,
  );
  check(
    group,
    'whitespace is not a filter',
    validate({ name: '   ', vehicleNumber: '  ', exactAmount: '' }).values === null,
  );
  for (const invalid of ['abc', 'hello', '₹xyz', '1.2.3', '--']) {
    const invalidResult = validate({ amountMode: 'exact', exactAmount: invalid });
    check(
      group,
      `an unreadable amount ${JSON.stringify(invalid)} is rejected`,
      invalidResult.errors.length === 1 &&
        invalidResult.errors[0]?.field === 'exactAmount' &&
        /is not a valid amount/.test(invalidResult.errors[0]?.message ?? '') &&
        invalidResult.values === null,
      JSON.stringify(invalidResult.errors),
    );
  }
  const acceptedSpellings = ['2000', '2,000', '2000.00', '₹2,000', '₹ 2,000'];
  check(
    group,
    'amounts are accepted in the same spellings as Stage 2',
    acceptedSpellings.every((raw) => validate({ amountMode: 'exact', exactAmount: raw }).values?.amount.exactMinor === 200_000),
    acceptedSpellings.join(' | '),
  );
  check(
    group,
    'an invalid amount is never silently turned into ₹0',
    validate({ amountMode: 'exact', exactAmount: 'abc' }).values === null,
  );

  const unordered = validate({ amountMode: 'range', minAmount: '3000', maxAmount: '1000' });
  check(
    group,
    'a minimum above the maximum is rejected with the documented message',
    unordered.errors.length === 1 &&
      unordered.errors[0]?.field === 'form' &&
      unordered.errors[0]?.message === 'Minimum amount cannot be greater than maximum amount.',
    JSON.stringify(unordered.errors),
  );
  check(
    group,
    'valid range bounds with an invalid one still report the invalid input',
    validate({ amountMode: 'range', minAmount: '1000', maxAmount: 'xyz' }).errors[0]?.field === 'maxAmount' &&
      validate({ amountMode: 'range', minAmount: 'xyz', maxAmount: '1000' }).errors[0]?.field === 'minAmount',
  );
  check(
    group,
    'another field can carry the filter when the amount box is left empty',
    validate({ amountMode: 'range', minAmount: '', maxAmount: '', name: 'Raj Kumar' }).values?.nameKey === 'raj kumar',
  );
  check(
    group,
    'an unusable vehicle entry is reported',
    validate({ vehicleNumber: '---' }).errors[0]?.message === 'Enter a vehicle number, for example UP32AB1234.',
  );
  check(
    group,
    'an impossible date is reported',
    validate({ date: '2026-13-45' }).errors[0]?.field === 'date' &&
      validate({ date: '25/09/2026' }).errors[0]?.field === 'date',
  );

  // --- the Stage 2 date policy is the one used for filtering ---------------
  const writtenDate = dates.parseDateCell({ value: '03/04/2026', hasDateFormat: false });
  check(
    group,
    'the day-first policy is unchanged: 03/04/2026 is 3 April 2026',
    writtenDate?.iso === '2026-04-03' &&
      dates.parseDateCell({ value: '09/25/2026', hasDateFormat: false }) === null,
    JSON.stringify(writtenDate),
  );
  {
    const aprilRecords = buildRecords([
      { rowNumber: 2, date: writtenDate?.iso ?? null, name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000 },
    ]);
    check(
      group,
      'a 03/04/2026 filter matches the record imported from 03/04/2026',
      run(aprilRecords, { date: '2026-04-03' }).count === 1 &&
        run(aprilRecords, { date: '2026-03-04' }).count === 0,
    );
  }

  // --- local calendar days -------------------------------------------------
  check(
    group,
    'Today and Yesterday are the local calendar days',
    filtering.todayIsoDate(new Date(2026, 8, 25, 10, 30)) === '2026-09-25' &&
      filtering.yesterdayIsoDate(new Date(2026, 8, 25, 10, 30)) === '2026-09-24' &&
      filtering.yesterdayIsoDate(new Date(2026, 3, 1, 9, 0)) === '2026-03-31' &&
      filtering.yesterdayIsoDate(new Date(2026, 0, 1, 9, 0)) === '2025-12-31',
  );
  {
    // Just after local midnight the UTC date can still be the day before; the
    // local helper must not follow it.
    const justAfterMidnight = new Date(2026, 3, 3, 0, 30);
    const utcDate = justAfterMidnight.toISOString().slice(0, 10);
    const shifted = utcDate !== '2026-04-03';
    check(
      group,
      'the local helpers never shift the day through UTC',
      filtering.toLocalIsoDate(justAfterMidnight) === '2026-04-03' &&
        (!shifted || utcDate === '2026-04-02'),
      `local=${filtering.toLocalIsoDate(justAfterMidnight)} utc=${utcDate} offset=${justAfterMidnight.getTimezoneOffset()}`,
    );
  }
  {
    const todayRecords = buildRecords([
      { rowNumber: 2, date: localToday(), name: 'Neha Gupta', vehicleNumber: 'UP32EF9012', amountMinor: 75_000 },
      { rowNumber: 3, date: localYesterday(), name: 'Neha Gupta', vehicleNumber: 'UP32EF9012', amountMinor: 25_000 },
    ]);
    check(
      group,
      'a Today filter matches exactly the record dated today',
      run(todayRecords, { date: filtering.todayIsoDate() }).count === 1 &&
        run(todayRecords, { date: filtering.todayIsoDate() }).totalAmountMinor === 75_000 &&
        run(todayRecords, { date: filtering.yesterdayIsoDate() }).totalAmountMinor === 25_000,
    );
  }

  // --- chips and available names ------------------------------------------
  const chipValues = validate({
    date: '2026-09-25',
    name: 'Raj Kumar',
    vehicleNumber: 'UP32AB1234',
    amountMode: 'exact',
    exactAmount: '2000',
  }).values;
  check(
    group,
    'every applied category gets a removable chip label',
    JSON.stringify(filtering.describeFilterChips(chipValues).map((chip) => chip.label)) ===
      JSON.stringify(['Date: 25/09/2026', 'Name: Raj Kumar', 'Vehicle: UP32AB1234', 'Amount: ₹2,000']) &&
      filtering.describeFilterChips(chipValues).map((chip) => chip.field).join(',') ===
        'date,name,vehicleNumber,amount',
    JSON.stringify(filtering.describeFilterChips(chipValues).map((chip) => chip.label)),
  );
  const amountChip = (partial) =>
    filtering
      .describeFilterChips(validate(partial).values)
      .find((chip) => chip.field === 'amount')?.label;
  check(
    group,
    'range chips describe the bound that was filled in',
    amountChip({ amountMode: 'range', minAmount: '1000', maxAmount: '3000' }) === 'Amount: ₹1,000 – ₹3,000' &&
      amountChip({ amountMode: 'range', minAmount: '2000' }) === 'Amount: ₹2,000 or more' &&
      amountChip({ amountMode: 'range', maxAmount: '2000' }) === 'Amount: up to ₹2,000' &&
      amountChip({ amountMode: 'exact', exactAmount: '2000' }) === 'Amount: ₹2,000',
    [
      amountChip({ amountMode: 'range', minAmount: '1000', maxAmount: '3000' }),
      amountChip({ amountMode: 'range', minAmount: '2000' }),
      amountChip({ amountMode: 'range', maxAmount: '2000' }),
    ].join(' | '),
  );
  check(
    group,
    'an untouched category never produces a chip',
    filtering.describeFilterChips(validate({ name: 'Raj Kumar' }).values).length === 1 &&
      filtering.describeFilterChips(validate({ name: 'Raj Kumar' }).values)[0]?.label === 'Name: Raj Kumar',
    JSON.stringify(filtering.describeFilterChips(validate({ name: 'Raj Kumar' }).values)),
  );
  {
    const withoutDate = filtering.clearFilterField(chipValues, 'date');
    const withoutVehicles = filtering.clearFilterField(withoutDate, 'vehicleNumber');
    const withoutAmount = filtering.clearFilterField(withoutVehicles, 'amount');
    const onlyName = filtering.clearFilterField(withoutAmount, 'name');
    check(
      group,
      'removing a chip clears only that category',
      withoutDate.date === null &&
        withoutDate.nameKey === 'raj kumar' &&
        withoutDate.vehicleKey === 'UP32AB1234' &&
        withoutDate.amount?.mode === 'exact' &&
        !filtering.isEmptyFilterValues(withoutDate) &&
        filtering.isEmptyFilterValues(onlyName),
      JSON.stringify(onlyName),
    );
    check(
      group,
      'applied values rebuild the same filter state',
      filtering.serializeFilterValues(
        filtering.validateFilterState(filtering.draftFromFilterValues(chipValues)).values,
      ) === filtering.serializeFilterValues(chipValues) &&
        filtering.draftFromFilterValues(chipValues).amountMode === 'exact',
    );
  }
  check(
    group,
    'amount inputs round-trip through plain numbers',
    filtering.amountMinorToInputValue(200_000) === '2000' &&
      filtering.amountMinorToInputValue(200_050) === '2000.50' &&
      filtering.amountMinorToInputValue(0) === '0' &&
      filtering.amountMinorToInputValue(123_456_789) === '1234567.89',
  );

  {
    const nameRecords = buildRecords([
      { rowNumber: 2, name: 'Raj Kumar' },
      { rowNumber: 3, name: 'raj kumar' },
      { rowNumber: 4, name: '  Amit  ' },
      { rowNumber: 5, name: '' },
      { rowNumber: 6, name: 'Sunita Devi' },
    ]);
    const options = filtering.collectNameOptions(nameRecords);
    check(
      group,
      'the name list holds each imported name once, first spelling first',
      JSON.stringify(options) === JSON.stringify(['Amit', 'Raj Kumar', 'Sunita Devi']),
      JSON.stringify(options),
    );
    check(
      group,
      'partial search narrows the names case-insensitively',
      JSON.stringify(filtering.filterNameOptions(options, 'raj')) === JSON.stringify(['Raj Kumar']) &&
        JSON.stringify(filtering.filterNameOptions(options, 'KUMAR')) === JSON.stringify(['Raj Kumar']) &&
        filtering.filterNameOptions(options, '').length === 3,
    );
  }

  // --- static guarantees ---------------------------------------------------
  const filteringSource = stripComments(await readSource('src/domain/filtering.ts'));
  check(
    group,
    'the engine is pure: no workbook, filesystem or bridge access',
    !/excelDataAnalyzer|node:fs|readFile|xlsx|from ['"]electron|window\.|document\./.test(filteringSource),
  );
  check(
    group,
    'the engine reuses the shared normalization rules',
    filteringSource.includes("from '@shared/text'") &&
      filteringSource.includes("from '@shared/money'") &&
      !/toUpperCase\(\)\s*\.replace/.test(filteringSource),
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Filter interface                                                          */
/* -------------------------------------------------------------------------- */

/** The dataset used by the interface checks: the example rows plus edge cases. */
function uiRows() {
  return [
    { rowNumber: 2, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000, paymentMode: 'Cash' },
    { rowNumber: 3, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32CD5678', amountMinor: 150_000, paymentMode: 'UPI' },
    { rowNumber: 4, date: '2026-09-25', name: 'Amit', vehicleNumber: 'UP32AB1234', amountMinor: 300_000, paymentMode: 'Cash' },
    { rowNumber: 5, date: '2026-09-26', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 50_000, paymentMode: 'Cash' },
    { rowNumber: 6, date: localToday(), name: 'Neha Gupta', vehicleNumber: 'UP32EF9012', amountMinor: 75_000, paymentMode: 'Cash' },
    // Same values as row 2 on purpose: duplicates are separate transactions.
    { rowNumber: 7, date: '2026-09-25', name: 'Raj Kumar', vehicleNumber: 'UP32AB1234', amountMinor: 200_000, paymentMode: 'Cash' },
    {
      rowNumber: 8,
      date: null,
      name: 'Sunita Devi',
      vehicleNumber: 'UP78XY9876',
      amountMinor: null,
      paymentMode: 'Cash',
      issues: [
        { field: 'date', originalValue: 'not a date', message: 'Date could not be interpreted.' },
        { field: 'amount', originalValue: 'abc', message: 'Amount is not a valid number and is excluded from the totals.' },
      ],
    },
  ];
}

function statisticsFor(records) {
  const withAmount = records.filter((record) => record.amountMinor !== null);
  const totalAmountMinor = withAmount.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0);
  return {
    rowsScanned: records.length,
    emptyRowsIgnored: 1,
    importedRecords: records.length,
    validRecords: records.filter((record) => record.issues.length === 0).length,
    recordsWithIssues: records.filter((record) => record.issues.length > 0).length,
    recordsWithAmount: withAmount.length,
    totalAmountMinor,
    averageAmountMinor: withAmount.length === 0 ? null : Math.round(totalAmountMinor / withAmount.length),
  };
}

const FILE = {
  name: 'fictional-payments.xlsx',
  path: 'C:\\Reports\\fictional-payments.xlsx',
  extension: 'xlsx',
  sizeInBytes: 15_360,
  selectionId: 'stage3-1',
};

/** Imports a workbook and waits until the Data screen shows it. */
async function openDataScreen(prepared, rows) {
  const records = rows.map((row) =>
    buildRecord({ id: `Payments#${row.rowNumber}`, ...row, issues: row.issues ?? [] }),
  );
  // The overrides count their own calls, which is what proves that filtering
  // never goes back to the workbook.
  const calls = { browse: 0, imported: [] };
  const { bridge } = createMockBridge({
    excel: {
      browse: async () => {
        calls.browse += 1;
        return { status: 'selected', file: FILE };
      },
      importWorkbook: async (filePath) => {
        calls.imported.push(filePath);
        return buildImportedWorkbook({ records, statistics: statisticsFor(records), fileName: FILE.name });
      },
    },
  });
  const app = await renderRenderer({ ...prepared, bridge });
  app.click(app.findButton('Browse Excel File'));
  await app.settle(80);
  return { app, calls, records };
}

/** Writes into a React-controlled input the way a user would. */
function typeInto(app, element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(app.window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

function press(app, element, key) {
  element.dispatchEvent(new app.window.KeyboardEvent('keydown', { key, bubbles: true }));
}

const tableRows = (app) => Array.from(app.document.querySelectorAll('tbody tr'));
const metric = (app, id) => app.document.querySelector(`[data-metric="${id}"]`)?.textContent ?? '';
/** The figure a metric tile displays, without its label and hint. */
const figure = (app, id) =>
  (app.document.querySelector(`[data-metric="${id}"] [data-metric-value]`)?.textContent ?? '').trim();
const byId = (app, id) => app.document.querySelector(`#${id}`);
/** Sidebar entry, matched exactly so it never picks up a filter button. */
const navButton = (app, label) =>
  Array.from(app.document.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === label,
  );
/** The highlighted suggestion, resolved the way the attribute intends it. */
const activeOption = (app) =>
  app.document.getElementById(byId(app, 'filter-name')?.getAttribute('aria-activedescendant') ?? '');
const chips = (app) =>
  Array.from(app.document.querySelectorAll('[aria-label="Active filters"] button')).map((chip) =>
    (chip.textContent ?? '').replace('remove', '').trim(),
  );

async function verifyFilterUi(workspace) {
  const group = 'filter ui';
  const prepared = await prepareRendererBundle(workspace);
  const fixtureRows = uiRows();
  const rowsOnToday = fixtureRows.filter((row) => row.date === localToday());
  const rowsOnWrittenDay = fixtureRows.filter((row) => row.date === '2026-09-25');
  const { app, calls } = await openDataScreen(prepared, fixtureRows);
  const { window } = app;

  try {
    // --- the panel ---------------------------------------------------------
    const panel = app.document.querySelector('[aria-label="Filters"]');
    check(
      group,
      'the data screen shows the filter panel',
      panel !== null &&
        (panel?.textContent ?? '').includes('Filters') &&
        (panel?.textContent ?? '').includes('Find exactly the records you need'),
      (panel?.textContent ?? '').slice(0, 80),
    );
    check(
      group,
      'the panel offers exactly the four filter categories',
      byId(app, 'filter-date')?.getAttribute('type') === 'date' &&
        byId(app, 'filter-name')?.getAttribute('role') === 'combobox' &&
        byId(app, 'filter-vehicle')?.getAttribute('type') === 'text' &&
        byId(app, 'filter-amount-mode-exact') !== null &&
        byId(app, 'filter-amount-mode-range') !== null &&
        !/payment mode|reason|remark/i.test(
          Array.from(panel?.querySelectorAll('label') ?? []).map((label) => label.textContent ?? '').join(' '),
        ),
      Array.from(panel?.querySelectorAll('label') ?? []).map((label) => label.textContent).join(' | '),
    );
    check(
      group,
      'the amount block starts in exact mode',
      byId(app, 'filter-amount-mode-exact')?.hasAttribute('checked') === true ||
        byId(app, 'filter-amount-mode-exact')?.checked === true,
    );
    check(
      group,
      'the panel has the two documented actions',
      app.findButton('Clear Filters') !== undefined && app.findButton('Filter Data') !== undefined,
    );
    check(
      group,
      'the filter action is a submit button inside the form',
      app.findButton('Filter Data')?.getAttribute('type') === 'submit',
    );
    check(
      group,
      'every filter input is labelled',
      ['filter-date', 'filter-name', 'filter-vehicle', 'filter-amount-exact'].every(
        (id) => app.document.querySelector(`label[for="${id}"]`) !== null,
      ),
      ['filter-date', 'filter-name', 'filter-vehicle', 'filter-amount-exact']
        .filter((id) => app.document.querySelector(`label[for="${id}"]`) === null)
        .join(', '),
    );
    check(
      group,
      'the text inputs carry an example placeholder',
      ['filter-name', 'filter-vehicle', 'filter-amount-exact'].every(
        (id) => (byId(app, id)?.getAttribute('placeholder') ?? '').length > 0,
      ),
    );
    check(
      group,
      'the date control is a single calendar day, not a range',
      app.document.querySelectorAll('input[type="date"]').length === 1,
    );

    // --- the unfiltered state ---------------------------------------------
    check(
      group,
      'the panel and the results say that no filters are applied yet',
      app.text().includes('No filters applied yet') &&
        app.text().includes('Showing all 7 imported records') &&
        app.text().includes('not a filtered subset'),
    );
    check(
      group,
      'the unfiltered figures describe the imported dataset',
      figure(app, 'filteredRecords') === '7' &&
        figure(app, 'filteredTotal') === '₹9,750' &&
        figure(app, 'filteredAverage') === '₹1,625' &&
        metric(app, 'filteredRecords').includes('No filters applied yet'),
      `${metric(app, 'filteredRecords')} | ${metric(app, 'filteredTotal')} | ${metric(app, 'filteredAverage')}`,
    );
    check(group, 'every imported record is listed before filtering', tableRows(app).length === 7);

    // --- empty submission --------------------------------------------------
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'submitting empty filters is rejected with the documented guidance',
      app.text().includes('Please provide at least one filter.') &&
        app.text().includes('Add at least one filter to search the data.'),
      app.text().slice(0, 200),
    );
    check(
      group,
      'the whole dataset is not presented as a filtered result',
      tableRows(app).length === 7 &&
        app.text().includes('Showing all 7 imported records') &&
        !app.text().includes('Showing 7 matching records'),
    );
    check(
      group,
      'no stale chips appear for an empty submission',
      chips(app).length === 0 && app.text().includes('No filters applied yet'),
    );

    // --- the name selector -------------------------------------------------
    byId(app, 'filter-name')?.focus();
    await app.settle(20);
    const listbox = app.document.querySelector('[role="listbox"]');
    check(
      group,
      'opening the name selector lists the names of the dataset',
      listbox !== null &&
        byId(app, 'filter-name')?.getAttribute('aria-expanded') === 'true' &&
        Array.from(listbox?.querySelectorAll('[role="option"]') ?? []).map((option) => option.textContent).join('|') ===
          'Amit|Neha Gupta|Raj Kumar|Sunita Devi',
      Array.from(listbox?.querySelectorAll('[role="option"]') ?? []).map((option) => option.textContent).join('|'),
    );

    typeInto(app, byId(app, 'filter-name'), 'raj');
    await app.settle(20);
    check(
      group,
      'partial typing narrows the suggestions without filtering',
      Array.from(app.document.querySelectorAll('[role="option"]')).map((option) => option.textContent).join('|') ===
        'Raj Kumar' &&
        tableRows(app).length === 7 &&
        chips(app).length === 0 &&
        app.text().includes('Filters changed — press Filter Data to update the results.'),
      app.text().slice(0, 160),
    );
    press(app, byId(app, 'filter-name'), 'ArrowDown');
    await app.settle(20);
    check(
      group,
      'the keyboard highlights a suggestion through aria-activedescendant',
      activeOption(app) !== null && activeOption(app)?.getAttribute('aria-selected') === 'true',
      String(byId(app, 'filter-name')?.getAttribute('aria-activedescendant')),
    );
    press(app, byId(app, 'filter-name'), 'Enter');
    await app.settle(20);
    check(
      group,
      'Enter selects the highlighted name instead of submitting',
      byId(app, 'filter-name')?.value === 'Raj Kumar' &&
        app.document.querySelector('[role="listbox"]') === null &&
        tableRows(app).length === 7 &&
        chips(app).length === 0,
      `${byId(app, 'filter-name')?.value} / ${tableRows(app).length} rows`,
    );

    byId(app, 'filter-name')?.focus();
    await app.settle(20);
    press(app, byId(app, 'filter-name'), 'Escape');
    await app.settle(20);
    check(group, 'Escape closes the suggestions', app.document.querySelector('[role="listbox"]') === null);

    app.click(app.document.querySelector('[aria-label="Clear name filter"]'));
    await app.settle(20);
    check(
      group,
      'the selected name can be cleared',
      byId(app, 'filter-name')?.value === '' && chips(app).length === 0,
      String(byId(app, 'filter-name')?.value),
    );

    // --- filtering by name -------------------------------------------------
    typeInto(app, byId(app, 'filter-name'), 'Raj Kumar');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'the result count message reports the matches',
      app.text().includes('Showing 4 matching records') && tableRows(app).length === 4,
      app.text().slice(0, 160),
    );
    check(
      group,
      'the filtered count, total and average come from the same result set',
      figure(app, 'filteredRecords') === '4' &&
        figure(app, 'filteredTotal') === '₹6,000' &&
        figure(app, 'filteredAverage') === '₹1,500',
      `${metric(app, 'filteredRecords')} | ${metric(app, 'filteredTotal')} | ${metric(app, 'filteredAverage')}`,
    );
    check(
      group,
      'the applied filter is shown as a removable chip',
      chips(app).join('|') === 'Name: Raj Kumar' &&
        app.document.querySelector('[aria-label="Remove filter Name: Raj Kumar"]') !== null,
      chips(app).join('|'),
    );
    check(
      group,
      'filtering never re-reads the workbook',
      calls.imported.length === 1 && calls.browse === 1,
      JSON.stringify(calls),
    );

    // --- removing a chip ---------------------------------------------------
    app.click(app.document.querySelector('[aria-label="Remove filter Name: Raj Kumar"]'));
    await app.settle(40);
    check(
      group,
      'removing a chip drops that filter and updates the results',
      chips(app).length === 0 &&
        tableRows(app).length === 7 &&
        app.text().includes('No filters applied yet') &&
        byId(app, 'filter-name')?.value === '',
    );

    // --- the date filter ---------------------------------------------------
    app.click(app.findButton('Today'));
    await app.settle(20);
    check(
      group,
      'Today fills the single date control and shows the day first',
      byId(app, 'filter-date')?.value === localToday() &&
        app.text().includes(`Selected: ${localDayFirst(localToday())}`),
      `${byId(app, 'filter-date')?.value} / ${localToday()}`,
    );
    app.click(app.findButton('Yesterday'));
    await app.settle(20);
    check(
      group,
      'Yesterday moves exactly one local day back',
      byId(app, 'filter-date')?.value === localYesterday(),
      `${byId(app, 'filter-date')?.value} / ${localYesterday()}`,
    );
    app.click(app.findButton('Today'));
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'a Today filter matches exactly the records dated today',
      tableRows(app).length === rowsOnToday.length &&
        app.text().includes(`Showing ${rowsOnToday.length} matching`) &&
        figure(app, 'filteredTotal') === rupees(totalOf(rowsOnToday)) &&
        chips(app).join('|') === `Date: ${localDayFirst(localToday())}`,
      `${tableRows(app).length} rows vs ${rowsOnToday.length} / ${chips(app).join('|')} / ${figure(app, 'filteredTotal')}`,
    );

    // --- clearing ----------------------------------------------------------
    app.click(app.findButton('Clear Filters'));
    await app.settle(40);
    check(
      group,
      'Clear Filters restores the unfiltered dataset',
      chips(app).length === 0 &&
        tableRows(app).length === 7 &&
        byId(app, 'filter-date')?.value === '' &&
        byId(app, 'filter-amount-mode-exact')?.checked === true &&
        byId(app, 'filter-amount-min') === null &&
        app.text().includes('No filters applied yet') &&
        app.text().includes('Filters cleared'),
    );

    // --- two categories combined ------------------------------------------
    typeInto(app, byId(app, 'filter-date'), '2026-09-25');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'a written date filters the day-first calendar day',
      tableRows(app).length === rowsOnWrittenDay.length &&
        figure(app, 'filteredTotal') === rupees(totalOf(rowsOnWrittenDay)) &&
        chips(app).join('|') === 'Date: 25/09/2026',
      `${tableRows(app).length} rows / ${figure(app, 'filteredTotal')} / ${chips(app).join('|')}`,
    );
    typeInto(app, byId(app, 'filter-name'), 'Raj Kumar');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'two categories are combined with AND',
      tableRows(app).length === 3 &&
        chips(app).join('|') === 'Date: 25/09/2026|Name: Raj Kumar' &&
        figure(app, 'filteredTotal') === '₹5,500',
      `${tableRows(app).length} rows / ${chips(app).join('|')}`,
    );
    app.click(app.findButton('Clear Filters'));
    await app.settle(40);

    // --- the amount range --------------------------------------------------
    app.click(byId(app, 'filter-amount-mode-range'));
    await app.settle(20);
    check(
      group,
      'switching to a range reveals the two bounds',
      byId(app, 'filter-amount-min') !== null && byId(app, 'filter-amount-max') !== null,
    );
    typeInto(app, byId(app, 'filter-amount-min'), '1,000');
    typeInto(app, byId(app, 'filter-amount-max'), '₹3,000');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'the range filter keeps both bounds inclusive',
      tableRows(app).length === 4 &&
        figure(app, 'filteredTotal') === '₹8,500' &&
        chips(app).join('|') === 'Amount: ₹1,000 – ₹3,000',
      `${tableRows(app).length} rows / ${chips(app).join('|')} / ${metric(app, 'filteredTotal')}`,
    );

    typeInto(app, byId(app, 'filter-amount-min'), '3000');
    typeInto(app, byId(app, 'filter-amount-max'), '1000');
    await app.settle(30);
    check(
      group,
      'an inverted range is reported inline and blocks the filter action',
      app.text().includes('Minimum amount cannot be greater than maximum amount.') &&
        app.document.querySelector('[role="alert"]') !== null &&
        app.findButton('Filter Data')?.disabled === true,
    );
    check(
      group,
      'the rejected range leaves the previous results untouched',
      tableRows(app).length === 4 && chips(app).join('|') === 'Amount: ₹1,000 – ₹3,000',
    );

    // --- an unreadable amount ---------------------------------------------
    app.click(byId(app, 'filter-amount-mode-exact'));
    await app.settle(20);
    typeInto(app, byId(app, 'filter-amount-exact'), 'abc');
    await app.settle(30);
    check(
      group,
      'an unreadable amount is reported instead of being read as ₹0',
      app.text().includes('"abc" is not a valid amount') &&
        byId(app, 'filter-amount-exact')?.getAttribute('aria-invalid') === 'true' &&
        app.findButton('Filter Data')?.disabled === true,
      app.text().slice(0, 200),
    );
    typeInto(app, byId(app, 'filter-amount-exact'), '₹xyz');
    await app.settle(30);
    check(
      group,
      'the rupee symbol does not make an invalid amount valid',
      app.text().includes('"₹xyz" is not a valid amount') &&
        app.findButton('Filter Data')?.disabled === true,
    );
    typeInto(app, byId(app, 'filter-amount-exact'), '2,000');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'an exact amount in Stage 2 spellings filters the records',
      tableRows(app).length === 2 &&
        chips(app).join('|') === 'Amount: ₹2,000' &&
        figure(app, 'filteredTotal') === '₹4,000' &&
        figure(app, 'filteredAverage') === '₹2,000',
      `${tableRows(app).length} rows / ${chips(app).join('|')} / ${metric(app, 'filteredTotal')}`,
    );
    check(
      group,
      'identical rows both appear among the matches',
      tableRows(app).filter((row) => (row.textContent ?? '').includes('Raj Kumar')).length === 2,
    );

    // --- no matches --------------------------------------------------------
    typeInto(app, byId(app, 'filter-name'), 'Nobody Here');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    check(
      group,
      'a filter without matches shows the empty state without a table',
      app.text().includes('No matching records') &&
        app.text().includes('Try changing or clearing one or more filters.') &&
        app.document.querySelectorAll('table').length === 0,
    );
    check(
      group,
      'the zero-result figures are zero and a dash, never a stale total',
      figure(app, 'filteredRecords') === '0' &&
        figure(app, 'filteredTotal') === '₹0' &&
        figure(app, 'filteredAverage') === '—',
      `${metric(app, 'filteredRecords')} | ${metric(app, 'filteredTotal')} | ${metric(app, 'filteredAverage')}`,
    );
    app.click(app.findButton('Clear filters'));
    await app.settle(40);
    check(
      group,
      'the empty state can clear the filters again',
      chips(app).length === 0 && tableRows(app).length === 7,
      `${tableRows(app).length} rows`,
    );

    // --- the dashboard follows the filters --------------------------------
    typeInto(app, byId(app, 'filter-name'), 'Raj Kumar');
    await app.settle(20);
    app.click(app.findButton('Filter Data'));
    await app.settle(40);
    app.click(navButton(app, 'Dashboard') ?? null);
    await app.settle(40);
    check(
      group,
      'the dashboard tiles follow the applied filters',
      app.text().includes('Filtered Records') &&
        app.text().includes('₹6,000') &&
        app.text().includes('₹1,500') &&
        app.text().includes('Records matching the filters applied on the Data screen.'),
      app.text().slice(0, 240),
    );
    app.click(navButton(app, 'Data') ?? null);
    await app.settle(40);
    check(
      group,
      'the filters survive navigation between screens',
      chips(app).join('|') === 'Name: Raj Kumar' && tableRows(app).length === 4,
    );

    // --- motion and rows ---------------------------------------------------
    check(
      group,
      'no per-row entrance animation is used',
      tableRows(app).every((row) => !/animate-/.test(row.className)) &&
        (app.document.querySelector('[aria-label="Filters"]')?.className ?? '').includes('animate-fade-up'),
      tableRows(app)[0]?.className ?? 'no rows',
    );
    check(
      group,
      'no blocking browser dialog is used for filter feedback',
      app.errors.length === 0 && !/alert\(|confirm\(/.test(stripComments(await readSource('src/state/FilterProvider.tsx'))),
      app.errors.join(' | '),
    );
  } finally {
    app.close();
  }

  // --- pagination with a larger worksheet ---------------------------------
  {
    const rows = [];
    for (let index = 0; index < 120; index += 1) {
      rows.push({
        rowNumber: index + 2,
        date: index % 2 === 0 ? '2026-09-25' : '2026-09-26',
        name: index < 5 ? 'Neha Gupta' : 'Raj Kumar',
        vehicleNumber: 'UP32AB1234',
        amountMinor: 100_000 + index,
        paymentMode: 'Cash',
      });
    }
    const { app } = await openDataScreen(prepared, rows);
    try {
      check(
        group,
        'a large worksheet is paginated',
        tableRows(app).length === 100 && app.text().includes('page 1 of 2'),
        `${tableRows(app).length} rows`,
      );
      app.click(app.document.querySelector('[aria-label="Next page"]'));
      await app.settle(30);
      check(group, 'the user can move to the last page', app.text().includes('page 2 of 2') && tableRows(app).length === 20);

      typeInto(app, byId(app, 'filter-name'), 'Neha Gupta');
      await app.settle(20);
      app.click(app.findButton('Filter Data'));
      await app.settle(40);
      check(
        group,
        'a new filter returns the table to the first page',
        tableRows(app).length === 5 &&
          app.text().includes('page 1 of 1') &&
          app.text().includes('Showing 5 matching records'),
        `${tableRows(app).length} rows / ${app.document.querySelector('[aria-label="Filtered results"]')?.textContent?.slice(0, 80)}`,
      );
      check(
        group,
        'the filtered totals cover every matching record, not just the page',
        figure(app, 'filteredRecords') === '5' &&
          figure(app, 'filteredTotal') === '₹5,000.10',
        `${metric(app, 'filteredTotal')}`,
      );

      // A repeated identical filter must produce identical figures.
      const before = `${figure(app, 'filteredRecords')}|${figure(app, 'filteredTotal')}|${figure(app, 'filteredAverage')}`;
      app.click(app.findButton('Filter Data'));
      await app.settle(30);
      const after = `${figure(app, 'filteredRecords')}|${figure(app, 'filteredTotal')}|${figure(app, 'filteredAverage')}`;
      check(group, 're-applying the same filter is deterministic', before === after, `${before} → ${after}`);
    } finally {
      app.close();
    }
  }

  // --- a filter waits for a running import ---------------------------------
  {
    const records = uiRows().map((row) =>
      buildRecord({ id: `Payments#${row.rowNumber}`, ...row, issues: row.issues ?? [] }),
    );
    const workbookResult = () => buildImportedWorkbook({ records, statistics: statisticsFor(records), fileName: FILE.name });
    let resolveImport;
    const pending = new Promise((resolve) => {
      resolveImport = resolve;
    });
    let reimporting = false;
    const { bridge } = createMockBridge({
      excel: {
        browse: async () => ({ status: 'selected', file: FILE }),
        importWorkbook: async () => (reimporting ? pending : workbookResult()),
      },
    });
    const app = await renderRenderer({ ...prepared, bridge });
    try {
      app.click(app.findButton('Browse Excel File'));
      await app.settle(80);
      reimporting = true;
      app.click(app.findButton('Change Excel File'));
      await app.settle(60);
      check(
        group,
        'the filter action waits while a workbook is being imported',
        app.findButton('Filter Data')?.disabled === true,
      );
      resolveImport(workbookResult());
      await app.settle(80);
      check(
        group,
        'the filter action returns as soon as the records are ready',
        app.findButton('Filter Data')?.disabled === false,
      );
    } finally {
      app.close();
    }
  }
}
