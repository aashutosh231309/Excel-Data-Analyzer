/**
 * Stage 5 verification suite: the analytics workspace, the data quality
 * insights, the duplicate insight and the session states of the workspace.
 *
 * Groups:
 *   1. analytics         — the pure report (totals, payment modes, amount
 *                          ranges, data quality, duplicates) over fixtures
 *   2. analytics ui      — the dashboard sections rendered from a real import
 *   3. session states    — the states a session can be in, end to end
 *   4. workspace quality — architecture, accessibility, motion and safety rules
 *
 * The fixtures are fictional and deterministic; nothing here is production data
 * and nothing is written back to a workbook.
 */
import path from 'node:path';
import {
  buildImportedWorkbook,
  buildRecord,
  bundleModule,
  createMockBridge,
  createRecorder,
  listSourceFiles,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  root,
  stripComments,
} from './harness.mjs';

const GROUP_ANALYTICS = 'analytics';
const GROUP_UI = 'analytics ui';
const GROUP_STATES = 'session states';
const GROUP_QUALITY = 'workspace quality';

// --- accessibility: contrast ------------------------------------------------
// The audit reads the tokens straight out of the Tailwind theme, so a palette
// edit cannot silently make a text/background pair unreadable.

const TEXT_SIZE_TOKENS = /^text-(xs|sm|base|lg|xl|2xl|3xl|\[)/;
const STATE_VARIANTS = ['hover', 'focus', 'focus-visible', 'active', 'disabled', 'group-hover'];

const hexToRgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
const channelLuminance = (channel) =>
  channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const relativeLuminance = ([red, green, blue]) =>
  0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
const contrastRatio = (first, second) => {
  const [high, low] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};
const blendOver = (foreground, background, alpha) =>
  foreground.map((channel, index) => channel * alpha + background[index] * (1 - alpha));

/** Design tokens of the Tailwind theme, keyed the way the utility classes are. */
function readThemePalette(configSource) {
  const palette = new Map();
  const colours = configSource.slice(
    configSource.indexOf('colors: {') + 'colors: {'.length,
    configSource.indexOf('fontFamily:'),
  );
  for (const [, name, nested, flat] of colours.matchAll(
    /(\w+):\s*(?:\{([^}]*)\}|'(#[0-9A-Fa-f]{6})')/g,
  )) {
    if (nested) {
      for (const [, key, value] of nested.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
        palette.set(key === 'DEFAULT' ? name : `${name}-${key}`, value.toUpperCase());
      }
    } else if (flat) {
      palette.set(name, flat.toUpperCase());
    }
  }
  const images = configSource.slice(
    configSource.indexOf('backgroundImage:'),
    configSource.indexOf('boxShadow:'),
  );
  // The gradient resolves to its lighter stop: the worst case for white text.
  palette.set(
    'accent-gradient',
    (images.match(/linear-gradient\([^)]*?(#[0-9A-Fa-f]{6})/) ?? [])[1] ?? null,
  );
  palette.set('accent-decorative', '#F6F5FD');
  palette.set('white', '#FFFFFF');
  return palette;
}

function resolveColour(palette, token) {
  const [name, alpha] = token.split('/');
  const hex = palette.get(name);
  if (!hex) {
    return null;
  }
  return { rgb: hexToRgb(hex), alpha: alpha === undefined ? 1 : Number(alpha) / 100 };
}

/**
 * Every text/background pair that actually appears on one element, evaluated at
 * the worst of the surfaces it can sit on. Unknown utilities are skipped rather
 * than guessed.
 */
function collectColourPairs(byFile, palette) {
  const surface = resolveColour(palette, 'surface')?.rgb ?? hexToRgb('#FFFFFF');
  const background = resolveColour(palette, 'background')?.rgb ?? surface;
  const pairs = [];

  for (const [file, source] of byFile) {
    for (const literal of source.match(/(["'`])(?:[^"'`\\]|\\.)*?\1/g) ?? []) {
      const body = literal.slice(1, -1);
      if (!/text-|bg-/.test(body)) {
        continue;
      }
      const groups = new Map();
      for (const token of body.split(/\s+/).filter(Boolean)) {
        const parts = token.split(':');
        const raw = parts.pop();
        const variant = parts.join(':') || 'base';
        if (parts.length > 1 || (parts.length === 1 && !STATE_VARIANTS.includes(parts[0]))) {
          continue;
        }
        if (!/^(text|bg)-/.test(raw) || TEXT_SIZE_TOKENS.test(raw)) {
          continue;
        }
        groups.set(variant, [...(groups.get(variant) ?? []), raw]);
      }
      if (groups.size === 0) {
        continue;
      }
      const pick = (variant, kind) =>
        (groups.get(variant) ?? []).find((token) => token.startsWith(`${kind}-`));
      const baseText = pick('base', 'text');
      const baseBackground = pick('base', 'bg');

      for (const [variant] of groups) {
        const textToken = pick(variant, 'text') ?? baseText;
        const backgroundToken = pick(variant, 'bg') ?? baseBackground;
        if (!textToken) {
          continue;
        }
        const text = resolveColour(palette, textToken.slice('text-'.length));
        if (!text) {
          continue;
        }
        const backgroundColour = backgroundToken
          ? resolveColour(palette, backgroundToken.slice('bg-'.length))
          : null;
        const unders =
          backgroundColour && backgroundColour.alpha === 1 ? [backgroundColour.rgb] : [surface, background];

        for (const under of unders) {
          const behind = backgroundColour
            ? backgroundColour.alpha === 1
              ? backgroundColour.rgb
              : blendOver(backgroundColour.rgb, under, backgroundColour.alpha)
            : under;
          const foreground = text.alpha === 1 ? text.rgb : blendOver(text.rgb, behind, text.alpha);
          pairs.push({
            file,
            variant,
            pair: `${textToken} on ${backgroundToken ?? 'inherited'}`,
            ratio: contrastRatio(foreground, behind),
          });
        }
      }
    }
  }
  // The same utility combination appears many times; only the worst ratio per
  // combination is reported.
  const worst = new Map();
  for (const pair of pairs) {
    const key = `${pair.file}|${pair.variant}|${pair.pair}`;
    const current = worst.get(key);
    if (!current || pair.ratio < current.ratio) {
      worst.set(key, pair);
    }
  }
  return [...worst.values()];
}

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/**
 * Runs one group and records a failure instead of aborting the whole suite, so
 * the checks that already ran keep their result.
 */
async function runGroup(name, run) {
  try {
    await run();
  } catch (error) {
    check(
      name,
      'the group runs to completion',
      false,
      error instanceof Error ? `${error.message}` : String(error),
    );
  }
}

/** Runs every Stage 5 group and returns the recorded results. */
export async function runStage5(workspace) {
  let analytics = null;
  let prepared = null;

  await runGroup('analytics', async () => {
    analytics = await bundleModule('src/domain/analytics.ts', path.join(workspace, 'analytics.cjs'), {
      alias: {
        '@': path.join(root, 'src'),
        '@shared': path.join(root, 'electron/shared'),
      },
    });
  });
  await runGroup('analytics ui', async () => {
    prepared = await prepareRendererBundle(workspace);
  });

  await runGroup(GROUP_ANALYTICS, async () => {
    if (!analytics) {
      throw new Error('the analytics module could not be bundled');
    }
    await verifyAnalyticsEngine(analytics, workspace);
  });
  await runGroup(GROUP_UI, async () => {
    if (!prepared || !analytics) {
      throw new Error('the renderer bundle or the analytics module is missing');
    }
    await verifyAnalyticsUi(prepared, analytics);
  });
  await runGroup(GROUP_STATES, async () => {
    if (!prepared) {
      throw new Error('the renderer bundle is missing');
    }
    await verifySessionStates(prepared);
  });
  await runGroup(GROUP_QUALITY, async () => {
    if (!analytics) {
      throw new Error('the analytics module is missing');
    }
    await verifyWorkspaceQuality(workspace, analytics);
  });

  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* Fixtures (fictional, deterministic)                                         */
/* -------------------------------------------------------------------------- */

/** ₹ amounts in integer paise, exactly as the import pipeline stores them. */
const SHOWCASE_ROWS = [
  // A group of four identical records: same date, name, vehicle, mode, amount,
  // reason and remark. They stay separate records everywhere.
  {
    rowNumber: 2,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  {
    rowNumber: 3,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  {
    rowNumber: 4,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  // ₹499 → the first amount range; no remark.
  {
    rowNumber: 5,
    date: '2026-04-04',
    name: 'Neha Gupta',
    vehicleNumber: 'UP78XY9876',
    paymentMode: 'Cash',
    amountMinor: 49_900,
    paymentReason: 'Tolls',
    remark: '',
  },
  // ₹500 → the second amount range; no name.
  {
    rowNumber: 6,
    date: '2026-04-04',
    name: '',
    vehicleNumber: 'UP32CD5678',
    paymentMode: 'UPI',
    amountMinor: 50_000,
    paymentReason: 'Loading',
    remark: 'Paid',
  },
  // ₹1,000 → the third range; no vehicle, no payment mode, no reason, no remark.
  {
    rowNumber: 7,
    date: '2026-04-05',
    name: 'Sunita Devi',
    vehicleNumber: '',
    paymentMode: '',
    amountMinor: 100_000,
    paymentReason: '',
    remark: '',
  },
  // An unreadable amount: it stays out of every total and range.
  {
    rowNumber: 8,
    date: '2026-04-05',
    name: 'Raj Kumar',
    vehicleNumber: 'UP16EF4321',
    paymentMode: 'Bank Transfer',
    amountMinor: null,
    paymentReason: 'Repair',
    remark: 'Garage',
  },
  // An unreadable date: the record stays in the table, out of the day filters.
  {
    rowNumber: 9,
    date: null,
    name: 'Ravi Verma',
    vehicleNumber: 'UP32GH8765',
    paymentMode: 'UPI',
    amountMinor: 1_000_000,
    paymentReason: 'Advance',
    remark: '',
    issues: [
      { field: 'date', originalValue: 'not a date', message: 'Date could not be interpreted.' },
    ],
  },
  // Back to the identical group: five rows apart, still a duplicate.
  {
    rowNumber: 10,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  // Similar but not identical: a different amount, a different mode and a
  // different remark never group with each other.
  {
    rowNumber: 11,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_100,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  {
    rowNumber: 12,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'Cash',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Weekly settlement',
  },
  {
    rowNumber: 13,
    date: '2026-04-03',
    name: 'Amit Kumar',
    vehicleNumber: 'UP32AB1234',
    paymentMode: 'UPI',
    amountMinor: 200_000,
    paymentReason: 'Fuel',
    remark: 'Extra stop fee',
  },
];

/** Two records without a single problem, and without duplicates. */
const CLEAN_ROWS = [
  {
    rowNumber: 2,
    date: '2026-04-03',
    name: 'Kiran Shah',
    vehicleNumber: 'UP32AA0001',
    paymentMode: 'UPI',
    amountMinor: 125_000,
    paymentReason: 'Advance',
    remark: 'March',
  },
  {
    rowNumber: 3,
    date: '2026-04-04',
    name: 'Meena Rao',
    vehicleNumber: 'UP32AA0002',
    paymentMode: 'Cash',
    amountMinor: 250_000,
    paymentReason: 'Fuel',
    remark: 'April',
  },
];

function toRecords(rows, sheetName) {
  return rows.map((row) =>
    buildRecord({
      id: `${sheetName}#${row.rowNumber}`,
      issues: [],
      ...row,
    }),
  );
}

function statisticsFor(records) {
  let totalAmountMinor = 0;
  let recordsWithAmount = 0;
  let recordsWithIssues = 0;
  for (const record of records) {
    if (record.amountMinor !== null) {
      totalAmountMinor += record.amountMinor;
      recordsWithAmount += 1;
    }
    if (record.issues.length > 0) {
      recordsWithIssues += 1;
    }
  }
  return {
    rowsScanned: records.length,
    emptyRowsIgnored: 0,
    importedRecords: records.length,
    validRecords: records.length - recordsWithIssues,
    recordsWithIssues,
    recordsWithAmount,
    totalAmountMinor,
    averageAmountMinor:
      recordsWithAmount === 0 ? null : Math.round(totalAmountMinor / recordsWithAmount),
  };
}

function workbookFor(rows, { fileName = 'showcase-payments.xlsx', sheetName = 'Payments' } = {}) {
  const records = toRecords(rows, sheetName);
  return buildImportedWorkbook({
    fileName,
    sheetName,
    records,
    statistics: statisticsFor(records),
  });
}

const SHOWCASE_EXPECTED = {
  records: 12,
  validAmountRecords: 11,
  totalAmount: '₹26,000',
  averageAmount: '₹2,363.64',
  incompleteRecords: 5,
  duplicateGroups: 1,
  duplicateRecords: 4,
  affectedPercentage: '41.7%',
};

/* -------------------------------------------------------------------------- */
/* Renderer helpers                                                            */
/* -------------------------------------------------------------------------- */

const byId = (app, id) => app.document.querySelector(`#${id}`);
const figure = (app, id) =>
  app.document.querySelector(`[data-metric="${id}"] [data-metric-value]`)?.textContent?.trim() ?? '';
const metric = (app, id) => app.document.querySelector(`[data-metric="${id}"]`)?.textContent ?? '';
const tableRows = (app) => Array.from(app.document.querySelectorAll('tbody tr'));
const sectionText = (app, id) => app.document.querySelector(`[data-section="${id}"]`)?.textContent ?? '';
const barFigures = (app, id) =>
  app.document.querySelector(`[data-bar="${id}"] [data-bar-figures]`)?.textContent?.trim() ?? '';
const barDetail = (app, id) =>
  app.document.querySelector(`[data-bar="${id}"]`)?.textContent ?? '';
/** Sidebar entry, matched exactly so it never picks up a filter button. */
const navButton = (app, label) =>
  Array.from(app.document.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === label,
  );
const sessionState = (app) =>
  app.document.querySelector('[data-source-card]')?.getAttribute('data-session-state') ?? 'none';

/** Writes a value the way a user would, so React state updates. */
function typeInto(app, element, value) {
  const setter = Object.getOwnPropertyDescriptor(app.window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

async function goTo(app, label, settle = 60) {
  app.click(navButton(app, label));
  await app.settle(settle);
}

function selectionFor(fileName) {
  return {
    status: 'selected',
    file: {
      name: fileName,
      path: `C:\\Reports\\${fileName}`,
      extension: 'xlsx',
      sizeInBytes: 20_480,
      selectionId: `selection-${fileName}`,
    },
  };
}

/**
 * Renders the real application against a bridge that hands out the fixtures in
 * the order the test asks for them.
 */
async function openWorkspace(prepared, { rows = SHOWCASE_ROWS, fileName = 'showcase-payments.xlsx' } = {}) {
  const queue = {
    selections: [selectionFor(fileName)],
    results: [workbookFor(rows, { fileName })],
  };

  const { bridge, calls } = createMockBridge({
    excel: {
      browse: async () => queue.selections.shift() ?? { status: 'cancelled' },
      validatePath: async () => queue.selections[0] ?? { status: 'cancelled' },
      resolvePath: () => `C:\\Reports\\${fileName}`,
      importWorkbook: async (filePath) =>
        queue.results.shift() ?? {
          status: 'unreadable',
          fileName: path.basename(filePath),
          message: 'No workbook configured for this test.',
        },
    },
  });

  const app = await renderRenderer({ ...prepared, bridge });
  return { app, queue, calls };
}

async function importFixture(app, queue) {
  app.click(app.findButton('Browse Excel File'));
  await app.settle(90);
  return queue;
}

/* -------------------------------------------------------------------------- */
/* 1. The analytics engine                                                     */
/* -------------------------------------------------------------------------- */

async function verifyAnalyticsEngine(analytics, workspace) {
  const { analyzeRecords, collectDataQualityRecords, collectDuplicateRecords, recordDuplicateSignature, AMOUNT_BUCKETS } =
    analytics;

  const showcase = toRecords(SHOWCASE_ROWS, 'Payments');
  const report = analyzeRecords(showcase);

  /* --- baseline statistics ---------------------------------------------- */
  check(
    GROUP_ANALYTICS,
    'the report counts the imported records',
    report.summary.importedRecords === SHOWCASE_EXPECTED.records,
    String(report.summary.importedRecords),
  );
  check(
    GROUP_ANALYTICS,
    'only records with a readable amount are counted as valid',
    report.summary.validAmountRecords === SHOWCASE_EXPECTED.validAmountRecords &&
      report.summary.invalidAmountRecords === 1,
    `${report.summary.validAmountRecords} valid / ${report.summary.invalidAmountRecords} invalid`,
  );
  check(
    GROUP_ANALYTICS,
    'the total adds up the integer paise of the valid amounts',
    report.summary.totalAmountMinor === 2_600_000,
    String(report.summary.totalAmountMinor),
  );
  check(
    GROUP_ANALYTICS,
    'the average divides by the records with a valid amount',
    report.summary.averageAmountMinor === Math.round(2_600_000 / 11),
    String(report.summary.averageAmountMinor),
  );
  check(
    GROUP_ANALYTICS,
    'an unreadable amount never becomes zero in the total',
    report.summary.totalAmountMinor === 2_600_000 &&
      report.summary.invalidAmountRecords === 1 &&
      showcase.some((record) => record.rowNumber === 8 && record.amountMinor === null) &&
      report.summary.validAmountRecords + report.summary.invalidAmountRecords === showcase.length,
  );
  check(
    GROUP_ANALYTICS,
    'an empty dataset reports no average at all',
    analyzeRecords([]).summary.averageAmountMinor === null,
  );
  check(
    GROUP_ANALYTICS,
    'an empty dataset reports zeros instead of throwing',
    analyzeRecords([]).summary.importedRecords === 0 &&
      analyzeRecords([]).paymentModes.length === 0 &&
      analyzeRecords([]).duplicates.groupCount === 0,
  );

  /* --- filtered analytics ------------------------------------------------ */
  const amitOnly = showcase.filter((record) => record.name === 'Amit Kumar');
  const filtered = analyzeRecords(amitOnly);
  check(
    GROUP_ANALYTICS,
    'a filtered report describes exactly the records it was given',
    filtered.summary.importedRecords === 7 &&
      filtered.summary.totalAmountMinor === 1_400_100 &&
      filtered.summary.averageAmountMinor === Math.round(1_400_100 / 7),
    `${filtered.summary.importedRecords} / ${filtered.summary.totalAmountMinor} / ${filtered.summary.averageAmountMinor}`,
  );
  check(
    GROUP_ANALYTICS,
    'the filtered figures differ from the dataset figures',
    filtered.summary.importedRecords !== report.summary.importedRecords &&
      filtered.summary.totalAmountMinor !== report.summary.totalAmountMinor,
  );
  const emptyResult = analyzeRecords([]);
  check(
    GROUP_ANALYTICS,
    'zero matches produce no total, no average and no breakdown',
    emptyResult.summary.totalAmountMinor === 0 &&
      emptyResult.summary.averageAmountMinor === null &&
      emptyResult.amountBuckets.every((bucket) => bucket.count === 0),
  );

  /* --- payment modes ----------------------------------------------------- */
  const modes = report.paymentModes;
  check(
    GROUP_ANALYTICS,
    'every payment mode of the dataset is reported',
    modes.map((entry) => entry.mode).join('|') === 'UPI|Cash|Bank Transfer|',
    modes.map((entry) => `${entry.mode}:${entry.count}`).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'the modes are ordered by record count',
    modes.map((entry) => entry.count).join('|') === '8|2|1|1',
    modes.map((entry) => entry.count).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'each mode reports its count, percentage and amount total',
    modes[0].count === 8 &&
      modes[0].percentage === 66.7 &&
      modes[0].totalAmountMinor === 2_250_100 &&
      modes[0].amountRecords === 8,
    JSON.stringify(modes[0]),
  );
  check(
    GROUP_ANALYTICS,
    'records without a payment mode are grouped as Unknown / Missing, never dropped',
    modes.some((entry) => entry.mode === '' && entry.label === 'Unknown / Missing' && entry.count === 1) &&
      modes.reduce((sum, entry) => sum + entry.count, 0) === showcase.length,
  );
  check(
    GROUP_ANALYTICS,
    'a mode without a readable amount reports no total and no average',
    (() => {
      const bank = modes.find((entry) => entry.mode === 'Bank Transfer');
      return bank?.totalAmountMinor === 0 && bank?.amountRecords === 0 && bank?.averageAmountMinor === null;
    })(),
  );
  check(
    GROUP_ANALYTICS,
    'the mode percentages add up to the analysed records',
    Math.abs(modes.reduce((sum, entry) => sum + entry.percentage, 0) - 100) < 0.3,
    modes.map((entry) => entry.percentage).join('|'),
  );

  /* --- amount ranges ---------------------------------------------------- */
  check(
    GROUP_ANALYTICS,
    'the amount ranges are the five application-defined buckets',
    AMOUNT_BUCKETS.map((bucket) => bucket.label).join('|') ===
      '₹0 – ₹499|₹500 – ₹999|₹1,000 – ₹4,999|₹5,000 – ₹9,999|₹10,000 and above',
    AMOUNT_BUCKETS.map((bucket) => bucket.label).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'records are distributed over the ranges by their amount',
    report.amountBuckets.map((bucket) => bucket.count).join('|') === '1|1|8|0|1',
    report.amountBuckets.map((bucket) => `${bucket.label}:${bucket.count}`).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'the range percentages use the records with a valid amount',
    report.amountBuckets[2].percentage === 72.7 && report.amountBuckets[3].percentage === 0,
    report.amountBuckets.map((bucket) => bucket.percentage).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'the ranges cover every record with a valid amount exactly once',
    report.amountBuckets.reduce((sum, bucket) => sum + bucket.count, 0) ===
      report.summary.validAmountRecords,
  );

  // Boundary values in paise: 0, 499, 500, 999, 1000, 4999, 5000, 9999, 10000.
  const boundaries = [0, 49_900, 50_000, 99_900, 100_000, 499_900, 500_000, 999_900, 1_000_000];
  const boundaryReport = analyzeRecords(
    boundaries.map((amountMinor, index) =>
      buildRecord({ id: `b${index}`, rowNumber: index + 2, amountMinor, date: '2026-04-01' }),
    ),
  );
  check(
    GROUP_ANALYTICS,
    'the range boundaries 0 / 499 / 500 / 999 / 1,000 / 4,999 / 5,000 / 9,999 / 10,000 are deterministic',
    boundaryReport.amountBuckets.map((bucket) => bucket.count).join('|') === '2|2|2|2|1',
    boundaryReport.amountBuckets.map((bucket) => `${bucket.label}:${bucket.count}`).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    '₹10,000 falls in the open-ended top range',
    analyzeRecords([buildRecord({ id: 'top', amountMinor: 1_000_000 })]).amountBuckets[4].count === 1,
  );
  check(
    GROUP_ANALYTICS,
    'an unreadable amount is excluded from the ranges and reported as invalid',
    analyzeRecords([
      buildRecord({ id: 'x', amountMinor: null, issues: [{ field: 'amount', originalValue: 'abc', message: 'invalid' }] }),
    ]).summary.invalidAmountRecords === 1 &&
      analyzeRecords([buildRecord({ id: 'x', amountMinor: null })]).dataQuality.categories.find(
        (category) => category.id === 'invalidAmount',
      )?.count === 1,
  );

  /* --- data quality ------------------------------------------------------ */
  const quality = report.dataQuality;
  const counts = Object.fromEntries(quality.categories.map((category) => [category.id, category.count]));
  check(
    GROUP_ANALYTICS,
    'the quality panel counts the seven documented problems',
    quality.categories.map((category) => category.label).join('|') ===
      'Missing Name|Missing Vehicle Number|Missing Payment Mode|Missing Payment Reason|Missing Remark|Invalid Date|Invalid Amount',
    quality.categories.map((category) => category.label).join('|'),
  );
  check(
    GROUP_ANALYTICS,
    'missing name, vehicle, mode, reason and remark are counted',
    counts.missingName === 1 &&
      counts.missingVehicleNumber === 1 &&
      counts.missingPaymentMode === 1 &&
      counts.missingPaymentReason === 1 &&
      counts.missingRemark === 3,
    JSON.stringify(counts),
  );
  check(
    GROUP_ANALYTICS,
    'an unreadable date and an unreadable amount are counted separately',
    counts.invalidDate === 1 && counts.invalidAmount === 1,
    JSON.stringify(counts),
  );
  check(
    GROUP_ANALYTICS,
    'a record with several problems is counted once in the affected records',
    quality.affectedRecords === 5 &&
      quality.totalRecords === showcase.length &&
      Object.values(counts).reduce((sum, value) => sum + value, 0) === 9,
    `affected ${quality.affectedRecords} vs category sum ${Object.values(counts).reduce((sum, value) => sum + value, 0)}`,
  );
  check(
    GROUP_ANALYTICS,
    'the affected share is a percentage of the imported records',
    quality.affectedPercentage === 41.7,
    String(quality.affectedPercentage),
  );
  check(
    GROUP_ANALYTICS,
    'a clean dataset reports no affected record',
    (() => {
      const clean = analyzeRecords(toRecords(CLEAN_ROWS, 'Payments'));
      return clean.dataQuality.affectedRecords === 0 && clean.dataQuality.affectedPercentage === 0;
    })(),
  );
  check(
    GROUP_ANALYTICS,
    'a quality category can be opened as a record list without touching the data',
    (() => {
      const rows = collectDataQualityRecords(showcase, 'missingRemark');
      return (
        rows.length === 3 &&
        rows.every((record) => record.remark.trim() === '') &&
        rows.every((record) => showcase.includes(record)) &&
        showcase.every((record) => typeof record.remark === 'string')
      );
    })(),
  );

  /* --- duplicates -------------------------------------------------------- */
  const duplicates = report.duplicates;
  check(
    GROUP_ANALYTICS,
    'only records that match on all seven normalized fields form a group',
    duplicates.groupCount === 1 && duplicates.groups[0].count === 4,
    `${duplicates.groupCount} groups / ${duplicates.groups[0]?.count} records`,
  );
  check(
    GROUP_ANALYTICS,
    'the number of participating records is reported',
    duplicates.recordCount === 4,
    String(duplicates.recordCount),
  );
  check(
    GROUP_ANALYTICS,
    'a different amount, payment mode or remark never groups',
    duplicates.groups.every((group) =>
      group.records.every((record) => record.amountMinor === group.amountMinor),
    ) &&
      duplicates.groups[0].records.every((record) => record.paymentMode === 'UPI') &&
      duplicates.groups[0].records.every((record) => record.remark === 'Weekly settlement'),
  );
  check(
    GROUP_ANALYTICS,
    'similar-looking rows with a different field stay separate records',
    duplicates.groups[0].records.every((record) => record.rowNumber !== 11) &&
      duplicates.groups[0].records.every((record) => record.rowNumber !== 12) &&
      duplicates.groups[0].records.every((record) => record.rowNumber !== 13),
  );
  check(
    GROUP_ANALYTICS,
    'three identical records form one group of three',
    (() => {
      const three = analyzeRecords(
        toRecords(SHOWCASE_ROWS.slice(0, 3), 'Payments'),
      );
      return three.duplicates.groupCount === 1 && three.duplicates.recordCount === 3;
    })(),
  );
  check(
    GROUP_ANALYTICS,
    'the signature is deterministic across runs',
    recordDuplicateSignature(showcase[0]) === recordDuplicateSignature(showcase[8]) &&
      recordDuplicateSignature(showcase[0]) !== recordDuplicateSignature(showcase[3]) &&
      recordDuplicateSignature(showcase[0]) !== recordDuplicateSignature(showcase[9]) &&
      recordDuplicateSignature(showcase[0]) !== recordDuplicateSignature(showcase[10]) &&
      recordDuplicateSignature(showcase[0]) !== recordDuplicateSignature(showcase[11]),
  );
  check(
    GROUP_ANALYTICS,
    'two identical reports are byte-identical (deterministic analytics)',
    JSON.stringify(analyzeRecords(showcase)) === JSON.stringify(analyzeRecords(showcase)),
  );
  check(
    GROUP_ANALYTICS,
    'a duplicate group can be opened as a record list',
    (() => {
      const group = collectDuplicateRecords(showcase, 'group-1');
      const all = collectDuplicateRecords(showcase);
      return (
        group.length === 4 &&
        all.length === 4 &&
        group.every((record) => record.amountMinor === 200_000) &&
        collectDuplicateRecords(showcase, 'group-9').length === 0
      );
    })(),
  );
  check(
    GROUP_ANALYTICS,
    'a clean dataset reports no duplicates',
    analyzeRecords(toRecords(CLEAN_ROWS, 'Payments')).duplicates.groupCount === 0,
  );
  check(
    GROUP_ANALYTICS,
    'analytics never modify the records they read',
    (() => {
      const before = JSON.stringify(showcase);
      analyzeRecords(showcase);
      collectDataQualityRecords(showcase, 'missingName');
      collectDuplicateRecords(showcase, 'group-1');
      return JSON.stringify(showcase) === before;
    })(),
  );

  /* --- one pass over the records ---------------------------------------- */
  const source = stripComments(await readSource('src/domain/analytics.ts'));
  const analyzeBody = source.slice(source.indexOf('export function analyzeRecords'));
  check(
    GROUP_ANALYTICS,
    'the report is produced in a single pass over the records',
    (analyzeBody.match(/for \(const record of records\)/g) ?? []).length === 1 &&
      !/records\.(filter|reduce|map|forEach)\(/.test(analyzeBody),
  );

  /* --- performance ------------------------------------------------------ */
  const large = [];
  for (let index = 0; index < 20_000; index += 1) {
    large.push(
      buildRecord({
        id: `big-${index}`,
        rowNumber: index + 2,
        date: '2026-04-03',
        name: `Name ${index % 400}`,
        vehicleNumber: `UP32AB${1000 + (index % 900)}`,
        paymentMode: ['UPI', 'Cash', 'Bank Transfer', ''][index % 4],
        amountMinor: (index % 40) * 12_500,
        paymentReason: index % 5 === 0 ? '' : 'Fuel',
        remark: index % 7 === 0 ? '' : 'Weekly',
      }),
    );
  }
  const startedAt = Date.now();
  const largeReport = analyzeRecords(large);
  const elapsed = Date.now() - startedAt;
  check(
    GROUP_ANALYTICS,
    'analysing 20,000 records stays fast enough for the interface',
    elapsed < 1_000 && largeReport.summary.importedRecords === 20_000,
    `${elapsed} ms for 20,000 records`,
  );

  // 200 000 records is the documented export ceiling: the analytics must remain
  // practical there as well, without a worker thread.
  const huge = [];
  for (let index = 0; index < 200_000; index += 1) {
    huge.push(
      buildRecord({
        id: `huge-${index}`,
        rowNumber: index + 2,
        date: '2026-04-03',
        name: `Name ${index % 400}`,
        vehicleNumber: `UP32AB${1000 + (index % 900)}`,
        paymentMode: ['UPI', 'Cash', 'Bank Transfer', ''][index % 4],
        amountMinor: (index % 40) * 12_500,
        paymentReason: 'Fuel',
        remark: index % 7 === 0 ? '' : 'Weekly',
      }),
    );
  }
  const hugeStart = Date.now();
  const hugeReport = analyzeRecords(huge);
  const hugeElapsed = Date.now() - hugeStart;
  check(
    GROUP_ANALYTICS,
    'analysing 200,000 records stays practical',
    hugeElapsed < 8_000 && hugeReport.summary.importedRecords === 200_000,
    `${hugeElapsed} ms for 200,000 records`,
  );

  check(
    GROUP_ANALYTICS,
    'the module is pure: no React, DOM, Electron or file system access',
    !/\brequire\(|from 'react'|\bdocument\.|\bwindow\.|\bprocess\.|node:fs|electron/.test(source),
  );

  void workspace;
}

/* -------------------------------------------------------------------------- */
/* 2. The dashboard sections                                                   */
/* -------------------------------------------------------------------------- */

async function verifyAnalyticsUi(prepared, analytics) {
  const { app, queue } = await openWorkspace(prepared);

  // --- the welcome state before any import -------------------------------
  check(
    GROUP_UI,
    'before an import the dashboard welcomes the user instead of inventing figures',
    app.text().includes('Nothing is loaded yet') &&
      app.text().includes('No workbook loaded') &&
      !app.document.querySelector('[data-analytics-workspace]'),
  );
  const placeholders = Array.from(app.document.querySelectorAll('[data-metric-value]')).map((node) =>
    node.textContent?.trim(),
  );
  check(
    GROUP_UI,
    'the five dataset tiles show a dash while nothing is loaded',
    placeholders.length === 5 && placeholders.every((value) => value === '—'),
    placeholders.join('|'),
  );

  await importFixture(app, queue);
  check(
    GROUP_UI,
    'the import loads the 12-record fixture workbook',
    app.text().includes('Showing all 12 imported records') && app.text().includes('Imported Data'),
  );

  await goTo(app, 'Dashboard');
  check(
    GROUP_UI,
    'the dashboard becomes the analytics workspace after an import',
    app.document.querySelector('[data-analytics-workspace]') !== null &&
      app.text().includes('12 records loaded from showcase-payments.xlsx'),
  );

  // --- the source card ---------------------------------------------------
  const sourceCard = app.document.querySelector('[data-source-card]')?.textContent ?? '';
  check(
    GROUP_UI,
    'the source card reports the workbook, the worksheet, the rows and the load time',
    sourceCard.includes('showcase-payments.xlsx') &&
      sourceCard.includes('Payments') &&
      sourceCard.includes('12 records') &&
      /Loaded \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/.test(sourceCard),
    sourceCard.slice(0, 120),
  );
  check(
    GROUP_UI,
    'the source card never exposes the internal file location',
    !/[A-Za-z]:\\/.test(app.text()) && sourceCard.includes('Workbook loaded'),
  );

  // --- the primary figures ----------------------------------------------
  check(
    GROUP_UI,
    'the five dataset tiles report the imported records, amounts and problems',
    figure(app, 'importedRecords') === '12' &&
      figure(app, 'validAmountRecords') === '11' &&
      figure(app, 'totalAmount') === SHOWCASE_EXPECTED.totalAmount &&
      figure(app, 'averageAmount') === SHOWCASE_EXPECTED.averageAmount &&
      figure(app, 'incompleteRecords') === String(SHOWCASE_EXPECTED.incompleteRecords),
    `${figure(app, 'importedRecords')} / ${figure(app, 'validAmountRecords')} / ${figure(app, 'totalAmount')} / ${figure(app, 'averageAmount')} / ${figure(app, 'incompleteRecords')}`,
  );
  check(
    GROUP_UI,
    'the imported figures are never relabelled as filtered',
    app.text().includes('Imported Records') &&
      app.text().includes('Filtered Records') &&
      metric(app, 'importedRecordsCompared').includes('Every record read from the workbook.') &&
      metric(app, 'filteredRecordsCompared').includes('No filters applied yet'),
  );
  check(
    GROUP_UI,
    'the imported and filtered figures agree while no filter is applied',
    figure(app, 'filteredRecordsCompared') === '12' &&
      figure(app, 'filteredTotalCompared') === SHOWCASE_EXPECTED.totalAmount &&
      figure(app, 'filteredAverageCompared') === '₹2,363.64',
  );

  // --- payment modes -----------------------------------------------------
  check(
    GROUP_UI,
    'the payment mode breakdown lists every mode with count, percentage and total',
    barFigures(app, 'UPI').includes('8 records') &&
      barFigures(app, 'UPI').includes('66.7%') &&
      barDetail(app, 'UPI').includes('₹22,501') &&
      barFigures(app, 'Cash').includes('2 records') &&
      barDetail(app, 'Cash').includes('₹2,499'),
    `${barFigures(app, 'UPI')} | ${barDetail(app, 'UPI')}`,
  );
  check(
    GROUP_UI,
    'records without a payment mode appear as Unknown / Missing',
    sectionText(app, 'payment-modes').includes('Unknown / Missing') &&
      barFigures(app, 'unknown-payment-mode').includes('1 record'),
  );
  check(
    GROUP_UI,
    'a payment mode without a readable amount says so',
    barDetail(app, 'Bank Transfer').includes('No readable amount in this group.'),
  );

  // --- amount ranges -----------------------------------------------------
  check(
    GROUP_UI,
    'the amount distribution shows the five application-defined ranges',
    sectionText(app, 'amount-distribution').includes('₹0 – ₹499') &&
      sectionText(app, 'amount-distribution').includes('₹500 – ₹999') &&
      sectionText(app, 'amount-distribution').includes('₹1,000 – ₹4,999') &&
      sectionText(app, 'amount-distribution').includes('₹5,000 – ₹9,999') &&
      sectionText(app, 'amount-distribution').includes('₹10,000 and above'),
  );
  check(
    GROUP_UI,
    'each range reports its count, share and volume',
    barFigures(app, '1000-4999').includes('8 records') &&
      barFigures(app, '1000-4999').includes('72.7%') &&
      barDetail(app, '1000-4999').includes('₹15,001') &&
      barFigures(app, '5000-9999').includes('0 records') &&
      barFigures(app, '10000-plus').includes('1 record'),
    `${barFigures(app, '1000-4999')} | ${barDetail(app, '1000-4999')}`,
  );
  check(
    GROUP_UI,
    'the ranges are labelled as application-defined analytical ranges',
    sectionText(app, 'amount-distribution').includes('Application-defined analytical ranges') &&
      sectionText(app, 'amount-distribution').includes('unreadable amounts are listed under data quality'),
  );

  // --- data quality ------------------------------------------------------
  check(
    GROUP_UI,
    'the data quality panel summarizes the import without adding the categories up',
    sectionText(app, 'data-quality').includes('Imported records') &&
      sectionText(app, 'data-quality').includes('Records with at least one issue') &&
      sectionText(app, 'data-quality').includes(SHOWCASE_EXPECTED.affectedPercentage) &&
      sectionText(app, 'data-quality').includes('counted once'),
  );
  const qualityCount = (id) =>
    app.document.querySelector(`[data-quality-category="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ??
    '';
  check(
    GROUP_UI,
    'each quality category reports its own count and share',
    qualityCount('missingName').includes('Missing Name') &&
      qualityCount('missingName').includes('1') &&
      qualityCount('missingRemark').includes('3') &&
      qualityCount('missingRemark').includes('25%') &&
      qualityCount('invalidAmount').includes('Invalid Amount'),
    `${qualityCount('missingName')} | ${qualityCount('missingRemark')}`,
  );
  check(
    GROUP_UI,
    'the quality categories reuse the import rules for missing and invalid values',
    qualityCount('missingVehicleNumber').includes('1') &&
      qualityCount('missingPaymentMode').includes('1') &&
      qualityCount('missingPaymentReason').includes('1') &&
      qualityCount('invalidDate').includes('1'),
  );

  // --- duplicates --------------------------------------------------------
  check(
    GROUP_UI,
    'the duplicate panel reports the groups and the participating records',
    sectionText(app, 'duplicates').includes('1 group') &&
      sectionText(app, 'duplicates').includes('4 records') &&
      sectionText(app, 'duplicates').includes('identical on every field'),
  );
  check(
    GROUP_UI,
    'the duplicate panel states that nothing has been removed',
    sectionText(app, 'duplicates').includes(
      'Possible duplicate records are informational only. No records have been removed.',
    ),
  );
  check(
    GROUP_UI,
    'duplicates are never described as fraudulent, erroneous or dishonest',
    !/fraud|erroneous|dishonest|suspicious/i.test(app.text()),
  );
  const duplicateActions = sectionText(app, 'duplicates');
  check(
    GROUP_UI,
    'the duplicate panel offers no way to delete, merge or edit a record',
    !/delete|merge|edit|remove record/i.test(duplicateActions),
    duplicateActions.slice(0, 120),
  );
  check(
    GROUP_UI,
    'the duplicate group lists its key fields and the first row',
    sectionText(app, 'duplicates').includes('03/04/2026') &&
      sectionText(app, 'duplicates').includes('Amit Kumar') &&
      sectionText(app, 'duplicates').includes('UP32AB1234') &&
      sectionText(app, 'duplicates').includes('₹2,000') &&
      sectionText(app, 'duplicates').includes('first on row 2'),
  );

  // --- a clean dataset ---------------------------------------------------
  const clean = await openWorkspace(prepared, { rows: CLEAN_ROWS, fileName: 'clean-payments.xlsx' });
  await importFixture(clean.app, clean.queue);
  await goTo(clean.app, 'Dashboard');
  check(
    GROUP_UI,
    'a clean dataset reports no problems instead of empty lists',
    sectionText(clean.app, 'data-quality').includes('Every imported record has all seven fields') &&
      sectionText(clean.app, 'duplicates').includes('No exact duplicate records were found') &&
      figure(clean.app, 'incompleteRecords') === '0',
  );
  check(
    GROUP_UI,
    'a dataset without problems still reports its amounts',
    figure(clean.app, 'importedRecords') === '2' &&
      figure(clean.app, 'totalAmount') === '₹3,750' &&
      figure(clean.app, 'averageAmount') === '₹1,875',
    `${figure(clean.app, 'importedRecords')} / ${figure(clean.app, 'totalAmount')}`,
  );
  clean.app.close();
  app.close();
  void analytics;
}

/* -------------------------------------------------------------------------- */
/* 3. The session states                                                       */
/* -------------------------------------------------------------------------- */

async function verifySessionStates(prepared) {
  const { app, queue } = await openWorkspace(prepared);

  // --- state 1: no workbook ---------------------------------------------
  await goTo(app, 'Data');
  check(
    GROUP_STATES,
    'state 1 — no workbook: the Data screen explains how to start',
    app.text().includes('No data loaded') && app.text().includes('Go to Dashboard'),
  );
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 1 — no workbook: the dashboard shows the import surface and dashes only',
    app.text().includes('Upload your Excel file') &&
      app.text().includes('Nothing is loaded yet') &&
      Array.from(app.document.querySelectorAll('[data-metric-value]')).every(
        (node) => node.textContent?.trim() === '—',
      ) &&
      !app.document.querySelector('[data-analytics-workspace]'),
  );

  // --- state 2: workbook loaded, no filters ------------------------------
  await importFixture(app, queue);
  check(
    GROUP_STATES,
    'state 2 — loaded: the results describe the imported dataset',
    app.text().includes('Imported Data') &&
      app.text().includes('Showing all 12 imported records') &&
      app.text().includes('not a filtered subset') &&
      app.text().includes('No filters applied yet'),
  );
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 2 — loaded: the dashboard reports the baseline analytics',
    sessionState(app) === 'workbook-loaded' &&
      figure(app, 'importedRecords') === '12' &&
      figure(app, 'filteredRecordsCompared') === '12' &&
      app.text().includes('No filters are applied, so the filtered figures equal the imported ones.'),
  );

  // --- state 3: filters active ------------------------------------------
  await goTo(app, 'Data');
  typeInto(app, byId(app, 'filter-name'), 'Amit Kumar');
  await app.settle(30);
  app.click(app.findButton('Filter Data'));
  await app.settle(60);
  check(
    GROUP_STATES,
    'state 3 — filtered: the results show only the matching records',
    figure(app, 'filteredRecords') === '7' &&
      figure(app, 'filteredTotal') === '₹14,001' &&
      figure(app, 'filteredAverage') === '₹2,000.14' &&
      tableRows(app).length === 7,
    `${figure(app, 'filteredRecords')} / ${figure(app, 'filteredTotal')} / ${tableRows(app).length}`,
  );
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 3 — filtered: the dashboard distinguishes imported from filtered figures',
    sessionState(app) === 'filters-active' &&
      figure(app, 'filteredRecordsCompared') === '7' &&
      figure(app, 'filteredTotalCompared') === '₹14,001' &&
      figure(app, 'filteredAverageCompared') === '₹2,000.14' &&
      figure(app, 'importedRecords') === '12' &&
      figure(app, 'importedRecordsCompared') === '12',
    `${figure(app, 'filteredRecordsCompared')} / ${figure(app, 'importedRecordsCompared')}`,
  );
  check(
    GROUP_STATES,
    'state 3 — filtered: the filtered figures carry the stronger hierarchy',
    (app.document.querySelector('[data-metric="filteredRecordsCompared"]')?.className ?? '').includes(
      'bg-accent-decorative',
    ) &&
      !(app.document.querySelector('[data-metric="importedRecordsCompared"]')?.className ?? '').includes(
        'bg-accent-decorative',
      ),
  );
  check(
    GROUP_STATES,
    'state 3 — filtered: the breakdowns follow the filters',
    barFigures(app, 'UPI').includes('6 records') &&
      barDetail(app, 'UPI').includes('₹12,001') &&
      sectionText(app, 'payment-modes').includes('matching the filters') &&
      barFigures(app, '1000-4999').includes('7 records') &&
      barFigures(app, '1000-4999').includes('100%'),
    `${barFigures(app, 'UPI')} | ${barFigures(app, '1000-4999')}`,
  );
  check(
    GROUP_STATES,
    'state 3 — filtered: the dataset-wide insights stay dataset-wide',
    sectionText(app, 'data-quality').includes('41.7%') &&
      sectionText(app, 'duplicates').includes('1 group'),
  );

  // --- state 4: no records match ----------------------------------------
  await goTo(app, 'Data');
  typeInto(app, byId(app, 'filter-name'), 'Nobody Here');
  await app.settle(30);
  app.click(app.findButton('Filter Data'));
  await app.settle(60);
  check(
    GROUP_STATES,
    'state 4 — zero matches: the dataset and the controls survive the empty result',
    app.text().includes('No matching records') &&
      app.text().includes('Try changing or clearing one or more filters.') &&
      byId(app, 'filter-name')?.value === 'Nobody Here' &&
      app.findButton('Clear filters') !== undefined &&
      tableRows(app).length === 0,
  );
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 4 — zero matches: the filtered figures show a dash, never a fake ₹0',
    sessionState(app) === 'zero-results' &&
      figure(app, 'filteredRecordsCompared') === '0' &&
      figure(app, 'filteredTotalCompared') === '—' &&
      figure(app, 'filteredAverageCompared') === '—' &&
      metric(app, 'filteredTotalCompared').includes('No matching records, so there is no filtered total'),
  );
  check(
    GROUP_STATES,
    'state 4 — zero matches: the imported figures are untouched',
    figure(app, 'importedRecords') === '12' && figure(app, 'totalAmount') === '₹26,000',
  );

  // --- back to the filtered state, then a data quality inspection --------
  await goTo(app, 'Data');
  app.click(app.findButton('Clear filters'));
  await app.settle(50);
  typeInto(app, byId(app, 'filter-name'), 'Amit Kumar');
  await app.settle(30);
  app.click(app.findButton('Filter Data'));
  await app.settle(50);
  await goTo(app, 'Dashboard');
  app.click(app.document.querySelector('[data-quality-category="missingName"]'));
  await app.settle(70);
  check(
    GROUP_STATES,
    'state 5 — data quality inspection: the affected records open in the existing table',
    app.document.querySelector('[data-inspection-kind="data-quality"]') !== null &&
      app.text().includes('Data Quality Inspection') &&
      app.text().includes('Missing Name') &&
      app.text().includes('Showing 1–1 of 1 records in this data quality check') &&
      tableRows(app).length === 1,
    `${tableRows(app).length} rows`,
  );
  check(
    GROUP_STATES,
    'state 5 — data quality inspection: the inspection is not a filter on the results',
    app.document.querySelector('[aria-label="Filters"]') !== null &&
      app.text().includes('Name: Amit Kumar') &&
      figure(app, 'filteredRecords') === '7' &&
      app.text().includes('Your filters, the current export and the imported data are unchanged'),
  );
  check(
    GROUP_STATES,
    'state 5 — data quality inspection: no export is offered while inspecting',
    app.findButton('Export Excel') === undefined && app.findButton('Export Data') === undefined,
    Array.from(app.document.querySelectorAll('button'))
      .map((button) => (button.textContent ?? '').trim())
      .join(' | '),
  );
  const inspectionBanner = app.document.querySelector('[data-inspection-kind="data-quality"]');
  const inspectionActions = Array.from(inspectionBanner?.querySelectorAll('button') ?? []).map(
    (button) => (button.textContent ?? '').trim(),
  );
  check(
    GROUP_STATES,
    'state 5 — data quality inspection: the inspection can only be left, nothing is edited',
    inspectionBanner !== null &&
      inspectionActions.join('|') === 'Back to results' &&
      !/\b(delete|edit|merge|remove)\b/i.test(inspectionActions.join(' ')),
    inspectionActions.join(' | '),
  );

  // --- state 7: return from the inspection ------------------------------
  app.click(app.findButton('Back to results'));
  await app.settle(60);
  check(
    GROUP_STATES,
    'state 7 — return: the previous results, filters and export come back',
    app.document.querySelector('[data-inspection-kind]') === null &&
      app.text().includes('Filtered Results') &&
      app.text().includes('Name: Amit Kumar') &&
      figure(app, 'filteredRecords') === '7' &&
      tableRows(app).length === 7 &&
      app.findButton('Export Excel') !== undefined,
    `${tableRows(app).length} rows`,
  );

  // --- state 6: duplicate inspection ------------------------------------
  await goTo(app, 'Dashboard');
  app.click(app.document.querySelector('[data-duplicate-group="group-1"]'));
  await app.settle(70);
  check(
    GROUP_STATES,
    'state 6 — duplicate inspection: the identical records open in the existing table',
    app.document.querySelector('[data-inspection-kind="duplicates"]') !== null &&
      app.text().includes('Duplicate Inspection') &&
      app.text().includes('4 records match on all seven fields') &&
      tableRows(app).length === 4 &&
      app.text().includes('Showing 1–4 of 4 records in this duplicate inspection'),
    `${tableRows(app).length} rows`,
  );
  check(
    GROUP_STATES,
    'state 6 — duplicate inspection: the rows are the identical records, unchanged',
    tableRows(app).every((row) => row.textContent?.includes('₹2,000')) &&
      tableRows(app).every((row) => row.textContent?.includes('Amit Kumar')) &&
      tableRows(app).every((row) => row.textContent?.includes('Weekly settlement')),
  );
  app.click(app.findButton('Back to results'));
  await app.settle(50);
  await goTo(app, 'Dashboard');
  app.click(app.findButton('Inspect all duplicate records'));
  await app.settle(70);
  check(
    GROUP_STATES,
    'state 6 — duplicate inspection: all groups can be inspected at once',
    app.text().includes('Duplicate Inspection') &&
      app.text().includes('1 group contains 4 records') &&
      tableRows(app).length === 4,
    app.text().slice(0, 160),
  );
  app.click(app.findButton('Back to results'));
  await app.settle(50);

  // --- state 8: a successful replacement --------------------------------
  await goTo(app, 'Dashboard');
  queue.selections.push(selectionFor('clean-payments.xlsx'));
  queue.results.push(workbookFor(CLEAN_ROWS, { fileName: 'clean-payments.xlsx' }));
  app.click(app.findButton('Change Excel File'));
  await app.settle(100);
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 8 — replacement: the new workbook replaces the dataset and recalculates the analytics',
    app.text().includes('2 records loaded from clean-payments.xlsx') &&
      figure(app, 'importedRecords') === '2' &&
      figure(app, 'totalAmount') === '₹3,750' &&
      figure(app, 'averageAmount') === '₹1,875',
    `${figure(app, 'importedRecords')} / ${figure(app, 'totalAmount')}`,
  );
  check(
    GROUP_STATES,
    'state 8 — replacement: the filters, the inspection and the pagination are reset',
    sessionState(app) === 'workbook-loaded' &&
      !app.text().includes('Amit Kumar') &&
      app.document.querySelector('[data-inspection-kind]') === null &&
      sectionText(app, 'duplicates').includes('No exact duplicate records were found'),
  );
  await goTo(app, 'Data');
  check(
    GROUP_STATES,
    'state 8 — replacement: the Data screen starts again from an unfiltered first page',
    app.text().includes('Showing all 2 imported records') &&
      app.text().includes('page 1 of 1') &&
      app.text().includes('No filters applied yet') &&
      app.findButton('Clear Filters')?.hasAttribute('disabled') === true,
    app.text().slice(0, 160),
  );

  // --- state 9: a failed replacement ------------------------------------
  queue.selections.push(selectionFor('broken.xlsx'));
  queue.results.push({
    status: 'unreadable',
    fileName: 'broken.xlsx',
    message: 'The workbook could not be read.',
  });
  app.click(app.findButton('Change Excel File'));
  await app.settle(100);
  check(
    GROUP_STATES,
    'state 9 — failed replacement: the error is explicit and the dataset is kept',
    app.text().includes('Unable to read this Excel file') &&
      app.text().includes('the current dataset was kept') &&
      app.text().includes('Showing all 2 imported records'),
    app.text().slice(0, 160),
  );
  await goTo(app, 'Dashboard');
  check(
    GROUP_STATES,
    'state 9 — failed replacement: the analytics still describe the previous workbook',
    figure(app, 'importedRecords') === '2' &&
      figure(app, 'totalAmount') === '₹3,750' &&
      app.text().includes('2 records loaded from clean-payments.xlsx'),
  );
  check(
    GROUP_STATES,
    'the session stays usable after a failed replacement',
    app.findButton('Change Excel File') !== undefined &&
      app.document.querySelector('[data-analytics-workspace]') !== null,
  );

  check(
    GROUP_STATES,
    'every session state is visually distinguishable',
    app.document.querySelector('[data-source-card]')?.getAttribute('data-session-state') === 'workbook-loaded',
  );
  app.close();
}

/* -------------------------------------------------------------------------- */
/* 4. Architecture, accessibility, motion and safety                           */
/* -------------------------------------------------------------------------- */

async function verifyWorkspaceQuality(workspace, analytics) {
  const sources = await listSourceFiles('src');
  const files = await Promise.all(sources.map(async (file) => [file, stripComments(await readSource(file))]));
  const byFile = new Map(files);

  // --- one analytics layer ----------------------------------------------
  const analyzers = sources.filter(
    (file) => !file.startsWith('src/domain/') && /analyzeRecords\(/.test(byFile.get(file) ?? ''),
  );
  check(
    GROUP_QUALITY,
    'exactly one module builds the analytics reports',
    analyzers.join('|') === 'src/state/AnalyticsProvider.tsx',
    analyzers.join(', '),
  );
  const provider = byFile.get('src/state/AnalyticsProvider.tsx') ?? '';
  check(
    GROUP_QUALITY,
    'the provider memoizes each report instead of recalculating per render',
    (provider.match(/useMemo[<(]/g) ?? []).length >= 4 &&
      /analyzeSafely\(datasetRecords\)/.test(provider) &&
      /isFiltered \? analyzeSafely\(activeRecords\) : datasetOutcome/.test(provider),
    `useMemo ${(provider.match(/useMemo[<(]/g) ?? []).length}`,
  );
  check(
    GROUP_QUALITY,
    'the dashboard components only present the report they are given',
    [...byFile.entries()]
      .filter(([file]) => file.startsWith('src/components/dashboard/'))
      .every(([, source]) => !/analyzeRecords\(|summarizeRecords\(/.test(source)),
  );
  check(
    GROUP_QUALITY,
    'the analytics layer reuses the record model and the shared rules',
    /from '@shared\/import'/.test(byFile.get('src/domain/analytics.ts') ?? '') &&
      /from '@shared\/text'/.test(byFile.get('src/domain/analytics.ts') ?? '') &&
      /from '@\/domain\/filtering'/.test(byFile.get('src/domain/analytics.ts') ?? ''),
  );
  check(
    GROUP_QUALITY,
    'no charting dependency was added for the breakdowns',
    !/\brecharts\b|\bchart\.js\b|\bd3\b|victory|nivo|apexcharts/i.test(
      [...byFile.values()].join('\n'),
    ) &&
      !/\b(recharts|chart\.js|d3|apexcharts|victory)\b/.test(
        await readSource('package.json'),
      ),
  );
  check(
    GROUP_QUALITY,
    'the breakdowns are plain elements, not canvas drawing',
    !/<canvas|getContext\(/.test([...byFile.values()].join('\n')),
  );

  // --- analytics failures stay contained ---------------------------------
  check(
    GROUP_QUALITY,
    'a failing analytics run is reported instead of crashing the screen',
    /try \{/.test(provider) &&
      /catch \(cause\)/.test(provider) &&
      /console\.error\('\[analytics\]/.test(provider) &&
      /The analytics could not be computed for this dataset\. Your records are unchanged\./.test(
        provider,
      ),
  );
  check(
    GROUP_QUALITY,
    'the error is surfaced to the user, not hidden',
    /Analytics unavailable/.test(byFile.get('src/pages/DashboardPage.tsx') ?? ''),
  );

  // --- accessibility -----------------------------------------------------
  const quality = byFile.get('src/components/dashboard/DataQualityInsights.tsx') ?? '';
  const duplicates = byFile.get('src/components/dashboard/DuplicateInsights.tsx') ?? '';
  check(
    GROUP_QUALITY,
    'quality categories are real buttons with accessible names',
    /<button/.test(quality) &&
      /type="button"/.test(quality) &&
      /aria-label=/.test(quality) &&
      /focus-visible:ring/.test(quality),
  );
  check(
    GROUP_QUALITY,
    'duplicate groups are real buttons with accessible names',
    /<button/.test(duplicates) && /aria-label=/.test(duplicates) && /focus-visible:ring/.test(duplicates),
  );
  check(
    GROUP_QUALITY,
    'the quality summary uses a description list',
    /<dl/.test(quality) && /<dt/.test(quality) && /<dd/.test(quality),
  );
  check(
    GROUP_QUALITY,
    'every analytics section is a labelled heading',
    (byFile.get('src/components/dashboard/AnalyticsSection.tsx') ?? '').includes('<h2'),
  );
  check(
    GROUP_QUALITY,
    'the inspection view is labelled for assistive technology',
    /aria-label=\{label\}/.test(byFile.get('src/components/data/InspectionBanner.tsx') ?? '') &&
      /aria-live="polite"/.test(byFile.get('src/components/data/InspectionBanner.tsx') ?? ''),
  );
  check(
    GROUP_QUALITY,
    'nothing in the new screens is hover-only',
    !/\bhidden group-hover\/[a-z]+:block/.test(quality + duplicates),
  );

  // --- motion ------------------------------------------------------------
  const newSources = sources
    .filter((file) => /^src\/(components\/dashboard|domain|state)\//.test(file))
    .map((file) => byFile.get(file) ?? '')
    .join('\n');
  check(
    GROUP_QUALITY,
    'no continuous, bouncing or oversized animation was added',
    // `animate-pulse` stays allowed: it is the indeterminate import bar of the
    // existing progress panel, not a new effect of this stage.
    !/animate-\[|animate-bounce|animate-ping/.test(newSources) &&
      !/duration-(500|700|1000)\b/.test(newSources),
  );
  check(
    GROUP_QUALITY,
    'micro-interactions stay inside the documented duration band',
    (newSources.match(/duration-(150|200)/g) ?? []).length > 0 &&
      !/duration-(0|75|100)\b/.test(newSources),
  );
  check(
    GROUP_QUALITY,
    'section content uses the 380ms fade-up transition',
    /animate-fade-up/.test(byFile.get('src/pages/DashboardPage.tsx') ?? '') &&
      /'fade-up': 'fade-up 380ms/.test(await readSource('tailwind.config.ts')),
  );
  check(
    GROUP_QUALITY,
    'the reduced-motion rule of the design system is untouched',
    /prefers-reduced-motion: reduce/.test(await readSource('src/styles/globals.css')),
  );

  // --- safety ------------------------------------------------------------
  check(
    GROUP_QUALITY,
    'the new modules never use a blocking dialog or eval',
    !/\balert\(|\beval\(|new Function\(/.test(newSources) && !/\balert\(/.test(quality + duplicates),
  );
  check(
    GROUP_QUALITY,
    'the new modules reach no file system, Electron API or IPC channel',
    !/node:fs|from 'electron'|ipcRenderer|child_process|writeFile|shell\.|\brequire\(/.test(
      newSources,
    ),
  );
  check(
    GROUP_QUALITY,
    'the interface never renders an absolute file path again',
    !/file\.path\b/.test(byFile.get('src/components/dashboard/FileImportCard.tsx') ?? '') &&
      !/file\.path\b/.test(byFile.get('src/pages/DataPage.tsx') ?? ''),
  );
  check(
    GROUP_QUALITY,
    'the workspace sections contain no emoji',
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(newSources),
  );
  check(
    GROUP_QUALITY,
    'no global mutable state was introduced for the analytics',
    !/\bwindow\.[A-Za-z_]+\s*=/.test(newSources) && !/^let /m.test(byFile.get('src/domain/analytics.ts') ?? ''),
  );
  const viewSources = sources.filter(
    (file) => file.startsWith('src/components/dashboard/') || file === 'src/pages/DashboardPage.tsx',
  );
  check(
    GROUP_QUALITY,
    'the analytics screens read the providers, never the desktop bridge directly',
    viewSources.every((file) => !/desktop-bridge|ipcRenderer/.test(byFile.get(file) ?? '')) &&
      /useAnalytics/.test(byFile.get('src/pages/DashboardPage.tsx') ?? '') &&
      /useAnalytics/.test(byFile.get('src/components/dashboard/FileImportCard.tsx') ?? ''),
    viewSources.join(', '),
  );

  // --- accessibility: contrast -------------------------------------------
  const palette = readThemePalette(await readSource('tailwind.config.ts'));
  const colourPairs = collectColourPairs(byFile, palette);
  const failingPairs = colourPairs.filter((pair) => pair.ratio < 4.5);
  // The sweep only sees one element. This single pair is painted by an ancestor
  // and gets its own measurement in the check below.
  const inheritedPairs = failingPairs.filter(
    (pair) => pair.file === 'src/layouts/TitleBar.tsx' && pair.pair.startsWith('text-white'),
  );
  const unresolvedPairs = failingPairs.filter((pair) => !inheritedPairs.includes(pair));
  check(
    GROUP_QUALITY,
    `every text/background pair in the interface clears 4.5:1 (${colourPairs.length} combinations over ${palette.size} tokens)`,
    colourPairs.length >= 30 && unresolvedPairs.length === 0 && inheritedPairs.length === 1,
    failingPairs
      .slice(0, 4)
      .map((pair) => `${pair.ratio.toFixed(2)}:1 ${pair.file} ${pair.variant} ${pair.pair}`)
      .join('; '),
  );
  const markGlyph = contrastRatio(hexToRgb('#FFFFFF'), hexToRgb(palette.get('accent-gradient')));
  const titleBar = byFile.get('src/layouts/TitleBar.tsx') ?? '';
  check(
    GROUP_QUALITY,
    'the white mark of the title bar clears 4.5:1 against the gradient it sits on',
    markGlyph >= 4.5 && /bg-accent-gradient/.test(titleBar) && /text-white/.test(titleBar),
    `${markGlyph.toFixed(2)}:1`,
  );

  // --- the engine still answers the documented questions -----------------
  const report = analytics.analyzeRecords([
    buildRecord({
      id: 'x',
      rowNumber: 2,
      date: '2026-04-03',
      name: 'Test Person',
      vehicleNumber: 'UP32AB0001',
      paymentMode: 'UPI',
      amountMinor: 100,
      paymentReason: 'Fuel',
      remark: 'Note',
    }),
  ]);
  check(
    GROUP_QUALITY,
    'a single fully valid record produces a complete report',
    report.summary.importedRecords === 1 &&
      report.summary.incompleteRecords === 0 &&
      report.duplicates.groupCount === 0 &&
      report.paymentModes[0].percentage === 100,
  );
  check(
    GROUP_QUALITY,
    'a zero amount is a valid amount, not an invalid one',
    (() => {
      const zero = analytics.analyzeRecords([
        buildRecord({ id: 'zero', amountMinor: 0, date: '2026-04-03', name: 'Zero Pay' }),
      ]);
      return (
        zero.summary.validAmountRecords === 1 &&
        zero.summary.totalAmountMinor === 0 &&
        zero.summary.averageAmountMinor === 0 &&
        zero.amountBuckets[0].count === 1
      );
    })(),
  );
  void workspace;
}
