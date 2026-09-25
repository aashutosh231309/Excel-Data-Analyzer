/**
 * Shared helpers for the verification suites.
 *
 * The suites run headlessly: they bundle the real source files with esbuild and
 * import them, render the real React application against the compiled Tailwind
 * stylesheet in a DOM environment, and load the built Electron main bundle
 * against a mocked Electron API. Nothing here replaces application code.
 */
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const requireFromHarness = createRequire(import.meta.url);

/** Minimal CommonJS module registry access for injected Electron mocks. */
export const Module = requireFromHarness('node:module');

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export function createRecorder() {
  const results = [];
  return {
    results,
    check(group, name, passed, detail = '') {
      results.push({ group, name, passed: Boolean(passed), detail });
    },
    /** Records a check that throws as a failure instead of aborting the suite. */
    async attempt(group, name, run) {
      try {
        const outcome = await run();
        if (typeof outcome === 'object' && outcome !== null && 'passed' in outcome) {
          this.check(group, name, outcome.passed, outcome.detail ?? '');
        } else {
          this.check(group, name, Boolean(outcome));
        }
      } catch (error) {
        this.check(group, name, false, error instanceof Error ? error.message : String(error));
      }
    },
    failures() {
      return results.filter((result) => !result.passed).length;
    },
  };
}

export function printResults(results) {
  const groups = [...new Set(results.map((result) => result.group))];
  for (const group of groups) {
    const groupResults = results.filter((result) => result.group === group);
    const passed = groupResults.filter((result) => result.passed).length;
    console.log(`\n${group.toUpperCase()} — ${passed}/${groupResults.length} checks passed`);
    for (const result of groupResults) {
      const detail = !result.passed && result.detail ? `  (${result.detail})` : '';
      console.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${result.name}${detail}`);
    }
  }
  const failures = results.filter((result) => !result.passed);
  return failures.length;
}

/* -------------------------------------------------------------------------- */
/* Source access                                                               */
/* -------------------------------------------------------------------------- */

export async function readSource(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

export async function listSourceFiles(directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(relativePath)));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(relativePath);
    }
  }
  return files;
}

/** Removes comments so static checks inspect executable code only. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export async function createWorkspace() {
  return mkdtemp(path.join(tmpdir(), 'eda-verify-'));
}

export async function removeWorkspace(workspace) {
  await rm(workspace, { recursive: true, force: true });
}

/* -------------------------------------------------------------------------- */
/* Bundling                                                                    */
/* -------------------------------------------------------------------------- */

/** Bundles one application module (with its imports) into a requireable file. */
export async function bundleModule(entry, outfile, extra = {}) {
  await esbuild.build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    logLevel: 'silent',
    ...extra,
  });
  const loaded = requireFromHarness(outfile);
  delete requireFromHarness.cache[outfile];
  return loaded;
}

/** Bundles several modules in one pass and returns them keyed by file name. */
export async function bundleModules(entries, outDir) {
  const modules = {};
  for (const entry of entries) {
    const name = path.basename(entry).replace(/\.ts$/, '');
    modules[name] = await bundleModule(entry, path.join(outDir, `${name}.cjs`));
  }
  return modules;
}

/**
 * Bundles the renderer for a DOM environment and loads the compiled stylesheet
 * that the packaged application ships.
 */
export async function prepareRendererBundle(workspace) {
  const bundlePath = path.join(workspace, 'renderer.js');
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main.tsx')],
    outfile: bundlePath,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      '@': path.join(root, 'src'),
      '@shared': path.join(root, 'electron/shared'),
    },
    loader: { '.css': 'empty' },
  });

  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const assets = await readdir(path.join(root, 'dist/assets'));
  const cssFile = assets.find((file) => file.endsWith('.css'));
  const css = cssFile ? await readFile(path.join(root, 'dist/assets', cssFile), 'utf8') : '';

  return { bundlePath, html, css };
}

/**
 * Renders the real renderer bundle in a DOM environment.
 * `bridge` is installed as `window.excelDataAnalyzer` before the app boots.
 */
export async function renderRenderer({ bundlePath, html, css, bridge = null }) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (message) => errors.push(String(message)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole,
  });

  const { window } = dom;
  const { document } = window;

  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  if (bridge) {
    window.excelDataAnalyzer = bridge;
  }

  // jsdom cannot evaluate media queries. Reduced motion is reported so the
  // animated statistics render their final value instead of a mid-animation
  // frame; the application honours that setting by design.
  window.matchMedia = (query) => ({
    matches: String(query).includes('prefers-reduced-motion'),
    media: String(query),
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  window.eval(await readFile(bundlePath, 'utf8'));

  const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
  // React 18 mounts through the scheduler, so the first paint is awaited.
  await settle();

  return {
    dom,
    window,
    document,
    errors,
    settle,
    text: () => document.body.textContent ?? '',
    findButton: (label) =>
      Array.from(document.querySelectorAll('button')).find((button) =>
        (button.textContent ?? '').trim().includes(label),
      ),
    click: (element) => {
      element?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
    close: () => dom.window.close(),
  };
}

/** Normalizes jsdom's `rgb(r g b / var(--tw-…))` output for comparisons. */
export function normalizeColor(value) {
  if (!value) {
    return '';
  }
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const channels = hex[1].match(/.{2}/g).map((pair) => Number.parseInt(pair, 16));
    return `rgb(${channels.join(', ')})`;
  }
  const functional = value.match(/rgba?\(([^)]+)\)/);
  if (functional) {
    const channels = functional[1]
      .split(/[,/\s]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((channel) => Number.parseFloat(channel));
    return `rgb(${channels.join(', ')})`;
  }
  return value.trim();
}

/* -------------------------------------------------------------------------- */
/* Mock preload bridge                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Builds a complete `window.excelDataAnalyzer` mock so the renderer can be
 * exercised without Electron. Every method can be overridden per test.
 */
export function createMockBridge(overrides = {}) {
  const merge = (section, base) => ({ ...base, ...(overrides[section] ?? {}) });
  const calls = {
    minimize: 0,
    toggleMaximize: 0,
    close: 0,
    browse: 0,
    validate: [],
    imported: [],
    selectedSheets: [],
    progressSubscribers: 0,
  };

  const bridge = {
    app: {
      getPlatformInfo: async () => ({
        platform: 'win32',
        appVersion: '0.2.0',
        electronVersion: '44.0.0',
        chromeVersion: '140.0.0',
        nodeVersion: '22.0.0',
        isPackaged: false,
      }),
    },
    window: {
      getState: async () => ({ isMaximized: false, isFullScreen: false }),
      minimize: async () => {
        calls.minimize += 1;
      },
      toggleMaximize: async () => {
        calls.toggleMaximize += 1;
        return { isMaximized: true, isFullScreen: false };
      },
      close: async () => {
        calls.close += 1;
      },
      onStateChanged: () => () => {},
    },
    excel: {
      browse: async () => {
        calls.browse += 1;
        return { status: 'cancelled' };
      },
      validatePath: async (filePath) => {
        calls.validate.push(filePath);
        return { status: 'rejected', message: 'not used in this test' };
      },
      resolvePath: () => 'C:\\Reports\\sample.xlsx',
      importWorkbook: async (filePath) => {
        calls.imported.push(filePath);
        return { status: 'unreadable', fileName: path.basename(filePath), message: 'No workbook configured for this test.' };
      },
      selectWorksheet: async (filePath, sheetName) => {
        calls.selectedSheets.push(`${path.basename(filePath)}#${sheetName}`);
        return { status: 'unreadable', fileName: path.basename(filePath), message: 'No workbook configured for this test.' };
      },
      onImportProgress: () => {
        calls.progressSubscribers += 1;
        return () => {};
      },
    },
  };

  const merged = {
    app: merge('app', bridge.app),
    window: merge('window', bridge.window),
    excel: merge('excel', bridge.excel),
  };

  return { bridge: merged, calls };
}

/** Collects progress events a mock bridge would have sent to the renderer. */
export function createProgressChannel() {
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(progress) {
      for (const listener of listeners) {
        listener(progress);
      }
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
}

/** Builds an import result payload for renderer tests. */
export function buildImportedWorkbook({
  fileName = 'payments-july.xlsx',
  sheetName = 'Payments',
  sheets = [{ name: 'Payments', headerRowIndex: 0, dataRowCount: 2, columns: [], missingRequiredFields: [], isImportable: true }],
  records,
  statistics,
  columns = [
    { field: 'date', header: 'Date', columnIndex: 0, required: true },
    { field: 'name', header: 'Name', columnIndex: 1, required: true },
    { field: 'vehicleNumber', header: 'Vehicle Number', columnIndex: 2, required: true },
    { field: 'paymentMode', header: 'Payment Mode', columnIndex: 3, required: true },
    { field: 'amount', header: 'Amount', columnIndex: 4, required: true },
    { field: 'paymentReason', header: 'Payment Reason', columnIndex: 5, required: false },
    { field: 'remark', header: 'Remark', columnIndex: 6, required: false },
  ],
} = {}) {
  const defaultRecords = records ?? [
    buildRecord({
      id: 'Payments#2',
      rowNumber: 2,
      date: '2026-09-25',
      name: 'Raj Kumar',
      vehicleNumber: 'UP32AB1234',
      paymentMode: 'UPI',
      amountMinor: 200000,
      paymentReason: 'Fuel',
      remark: 'Weekly settlement',
    }),
    buildRecord({
      id: 'Payments#3',
      rowNumber: 3,
      date: null,
      name: 'Sunita Devi',
      vehicleNumber: 'UP78XY9876',
      paymentMode: 'Cash',
      amountMinor: null,
      paymentReason: '',
      remark: '',
      issues: [
        { field: 'date', originalValue: 'not a date', message: 'Date could not be interpreted.' },
        { field: 'amount', originalValue: 'abc', message: 'Amount is not a valid number and is excluded from the totals.' },
      ],
    }),
  ];

  return {
    status: 'imported',
    workbook: {
      file: {
        name: fileName,
        path: `C:\\Reports\\${fileName}`,
        extension: 'xlsx',
        sizeInBytes: 15_360,
        selectionId: 'test-1',
      },
      sheetName,
      sheets,
      columns,
      records: defaultRecords,
      statistics: statistics ?? {
        rowsScanned: defaultRecords.length,
        emptyRowsIgnored: 2,
        importedRecords: defaultRecords.length,
        validRecords: defaultRecords.filter((record) => record.issues.length === 0).length,
        recordsWithIssues: defaultRecords.filter((record) => record.issues.length > 0).length,
        recordsWithAmount: defaultRecords.filter((record) => record.amountMinor !== null).length,
        totalAmountMinor: defaultRecords.reduce((sum, record) => sum + (record.amountMinor ?? 0), 0),
        averageAmountMinor: 200000,
      },
    },
  };
}

/** A single normalized record with sensible defaults. */
export function buildRecord(partial) {
  const vehicleNumber = partial.vehicleNumber ?? '';
  return {
    id: 'row',
    rowNumber: 2,
    date: null,
    name: '',
    vehicleNumber,
    vehicleKey: vehicleNumber.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    paymentMode: '',
    amountMinor: null,
    paymentReason: '',
    remark: '',
    issues: [],
    ...partial,
  };
}
