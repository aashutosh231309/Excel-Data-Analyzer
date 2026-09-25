/**
 * Stage 1 verification suite.
 *
 *   1. spreadsheet selection rules (pure logic from electron/shared)
 *   2. Electron security configuration and renderer isolation (static analysis)
 *   3. a real DOM smoke test of the renderer (React + Tailwind CSS + interactions)
 *   4. the renderer -> preload -> main-process contract, headlessly
 *
 * The desktop shell itself is launched with `npm run dev` on a machine that can
 * run Electron; this suite covers everything that is verifiable headlessly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  Module,
  bundleModule,
  createRecorder,
  listSourceFiles,
  normalizeColor,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  requireFromHarness,
  root,
  stripComments,
} from './harness.mjs';

/** The suite predates the shared helpers; both names refer to the same code. */
const require = requireFromHarness;
const bundle = bundleModule;

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/**
 * Runs the Stage 1 checks against `workspace` (a temporary directory) and
 * returns the recorded results.
 */
export async function runStage1(workspace) {
  await verifySelectionRules(workspace);
  await verifySecurityConfiguration();
  await verifyMainProcess(workspace);
  await verifyRenderer(workspace);
  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* 1. Spreadsheet selection rules                                             */
/* -------------------------------------------------------------------------- */

async function verifySelectionRules(workspace) {
  const selection = await bundle(
    'electron/shared/file-selection.ts',
    path.join(workspace, 'file-selection.cjs'),
  );
  const fileTypes = await bundle(
    'electron/shared/file-types.ts',
    path.join(workspace, 'file-types.cjs'),
  );
  const format = await bundle('src/utils/format.ts', path.join(workspace, 'format.cjs'));

  const accepted = [
    'C:\\Reports\\payments.xlsx',
    'C:\\Reports\\PAYMENTS.XLSX',
    '/home/user/ledger.xls',
    'C:\\Reports\\2026.july.xls',
  ];
  for (const candidate of accepted) {
    check(
      'selection',
      `accepts ${path.basename(candidate)}`,
      fileTypes.isSupportedExcelFile(candidate),
    );
  }

  check(
    'selection',
    'accepts an extension-only name such as ".xlsx"',
    fileTypes.isSupportedExcelFile('C:\\Reports\\.xlsx'),
  );

  const rejected = [
    'C:\\Reports\\payments.csv',
    'C:\\Reports\\notes.txt',
    'C:\\Reports\\archive.xlsx.zip',
    'C:\\Reports\\spreadsheet',
    'C:\\Reports\\ledger.',
  ];
  for (const candidate of rejected) {
    check(
      'selection',
      `rejects ${path.basename(candidate)}`,
      !fileTypes.isSupportedExcelFile(candidate),
    );
  }

  check(
    'selection',
    'formats the accepted extension list',
    fileTypes.EXCEL_EXTENSION_LABEL === '.xlsx, .xls',
    fileTypes.EXCEL_EXTENSION_LABEL,
  );

  const built = selection.buildExcelFileSelection('C:\\Reports\\JULY REPORT.xlsx', 2048, 'id-1');
  check(
    'selection',
    'builds renderer-safe metadata',
    built.name === 'JULY REPORT.xlsx' &&
      built.path === 'C:\\Reports\\JULY REPORT.xlsx' &&
      built.extension === 'xlsx' &&
      built.sizeInBytes === 2048 &&
      built.selectionId === 'id-1',
    JSON.stringify(built),
  );

  check(
    'selection',
    'extracts file names from Windows and POSIX paths',
    selection.getFileName('C:\\a\\b\\c.xlsx') === 'c.xlsx' &&
      selection.getFileName('/a/b/c.xls') === 'c.xls',
  );

  const unsupportedMessage = selection.rejectionMessage('unsupported-type', 'photo.png');
  check(
    'selection',
    'explains unsupported files to the user',
    unsupportedMessage.includes('photo.png') && unsupportedMessage.includes('.xlsx, .xls'),
    unsupportedMessage,
  );
  check(
    'selection',
    'rejects an empty path with a helpful message',
    selection.rejectionMessage('empty-path').includes('.xlsx, .xls'),
  );

  check('selection', 'formats file sizes', format.formatFileSize(0) === 'Unknown size' &&
    format.formatFileSize(512) === '512 B' &&
    format.formatFileSize(2048) === '2 KB' &&
    format.formatFileSize(5 * 1024 * 1024) === '5 MB',
    `${format.formatFileSize(2048)} / ${format.formatFileSize(5 * 1024 * 1024)}`);
}

/* -------------------------------------------------------------------------- */
/* 2. Electron security configuration                                         */
/* -------------------------------------------------------------------------- */

async function verifySecurityConfiguration() {
  const main = await readSource('electron/main.ts');
  const preload = await readSource('electron/preload.ts');
  const rendererFiles = [
    ...(await listSourceFiles('src')),
  ];

  check('security', 'contextIsolation is enabled', /contextIsolation:\s*true/.test(main));
  check('security', 'nodeIntegration is disabled', /nodeIntegration:\s*false/.test(main));
  check('security', 'the renderer runs sandboxed', /sandbox:\s*true/.test(main));
  check('security', 'web security stays on', /webSecurity:\s*true/.test(main));
  check(
    'security',
    'no insecure switch appears anywhere in main.ts',
    !/nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false|enableRemoteModule/.test(
      main,
    ),
  );
  check(
    'security',
    'the preload script is registered for the window',
    /preload:\s*path\.join\(__dirname,\s*'preload\.js'\)/.test(main),
  );
  check(
    'security',
    'the bridge exposes a single named API',
    /contextBridge\.exposeInMainWorld\('excelDataAnalyzer'/.test(preload),
  );
  check(
    'security',
    'the preload surface stays whitelisted (invoke + named subscriptions only)',
    /ipcRenderer\.invoke/.test(preload) &&
      !/ipcRenderer\.send\(|sendSync|sendToHost|ipcRenderer\.postMessage|MessageChannel/.test(
        preload,
      ) &&
      // Three named subscriptions (window state, import progress, export
      // progress) and no generic `on(channel)` escape hatch.
      (preload.match(/ipcRenderer\.on\(/g) ?? []).length === 3 &&
      /ipcRenderer\.on\(IPC_CHANNELS\.windowStateChanged/.test(preload) &&
      /ipcRenderer\.on\(IPC_CHANNELS\.importProgress/.test(preload) &&
      /ipcRenderer\.on\(IPC_CHANNELS\.exportProgress/.test(preload),
    `subscriptions: ${(preload.match(/ipcRenderer\.on\(/g) ?? []).length}`,
  );
  check(
    'security',
    'the dialog is filtered to spreadsheet extensions',
    /SUPPORTED_EXCEL_EXTENSIONS/.test(main) && /name:\s*'Excel workbooks'/.test(main),
  );
  check(
    'security',
    'external navigation is blocked',
    /setWindowOpenHandler/.test(main) && /will-navigate/.test(main),
  );
  check('security', 'OS permission requests are denied', /setPermissionRequestHandler/.test(main));

  const rendererSources = await Promise.all(
    rendererFiles.map(async (file) => ({ file, source: await readSource(file) })),
  );

  const privilegedImports = rendererSources
    .filter(({ source }) => /from\s+'electron'|require\('electron'\)|from\s+'node:/.test(source))
    .map(({ file }) => file);
  check(
    'security',
    'no renderer module imports Electron or Node.js built-ins',
    privilegedImports.length === 0,
    privilegedImports.join(', '),
  );

  const alertUsage = rendererSources
    .filter(({ source }) => /(^|[^.\w])alert\(|(^|[^.\w])confirm\(/.test(stripComments(source)))
    .map(({ file }) => file);
  check(
    'security',
    'no alert()/confirm() used for feedback',
    alertUsage.length === 0,
    alertUsage.join(', '),
  );

  const bridgeUsage = rendererSources
    .filter(({ file, source }) => file.startsWith('src/') && /window\.excelDataAnalyzer/.test(source))
    .map(({ file }) => file);
  check(
    'security',
    'the renderer only touches the bridge through its accessor',
    bridgeUsage.length <= 1 && bridgeUsage.every((file) => file === 'src/lib/desktop-bridge.ts'),
    bridgeUsage.join(', '),
  );
  const viteConfig = await readSource('vite.config.ts');
  check(
    'security',
    "the packaged renderer ships a strict CSP (no inline scripts, no remote origins)",
    /default-src 'self'/.test(viteConfig) &&
      /script-src 'self'/.test(viteConfig) &&
      !/script-src[^\n]*'unsafe-inline'/.test(viteConfig) &&
      /connect-src 'none'/.test(viteConfig),
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Renderer smoke test                                                     */
/* -------------------------------------------------------------------------- */

async function verifyRenderer(workspace) {
  const prepared = await prepareRendererBundle(workspace);
  const { bundlePath, html: productionHtml, css } = prepared;
  const rendered = await renderRenderer(prepared);
  const { window, document, settle } = rendered;
  const consoleErrors = rendered.errors;
  const text = rendered.text;
  const findButtonByText = rendered.findButton;

  check('renderer', 'React mounts into #root', (document.querySelector('#root')?.childElementCount ?? 0) > 0);
  check('renderer', 'no runtime errors while rendering', consoleErrors.length === 0, consoleErrors.join(' | '));

  const expectedCopy = [
    'Excel Data Analyzer',
    'Analyze, filter and export your Excel data',
    'Upload your Excel file',
    'Drag & drop your spreadsheet here',
    'Browse Excel File',
    'Supported formats: .xlsx, .xls',
    // Stage 5 replaced the four headline tiles with the five analytics tiles of
    // the imported dataset; the filtered figures moved to their own section.
    'Imported Records',
    'Valid Amount Records',
    'Total Amount',
    'Average Amount',
    'Invalid / Incomplete Records',
    'Dashboard',
    'Data',
    'Settings',
    'Local processing',
    'Offline & local',
  ];
  for (const copy of expectedCopy) {
    check('renderer', `shows "${copy}"`, text().includes(copy));
  }

  const placeholders = Array.from(document.querySelectorAll('p')).filter(
    (node) => node.textContent?.trim() === '—',
  );
  check(
    'renderer',
    'the five statistic cards show empty placeholders',
    placeholders.length === 5,
    `found ${placeholders.length}`,
  );

  const bodyStyle = window.getComputedStyle(document.body);
  // Stage 5 re-pinned the design tokens to the light workspace palette
  // (light grey background, white cards, charcoal ink, deep indigo accent).
  // The assertions below check the same properties against the new values.
  check(
    'renderer',
    'app background uses the light workspace colour #F4F5F7',
    normalizeColor(bodyStyle.backgroundColor) === normalizeColor('#F4F5F7'),
    bodyStyle.backgroundColor,
  );
  check(
    'renderer',
    'primary text uses the charcoal ink #1F2430',
    normalizeColor(bodyStyle.color) === normalizeColor('#1F2430'),
    bodyStyle.color,
  );
  check(
    'renderer',
    'Inter is the primary font family',
    bodyStyle.fontFamily.includes('Inter Variable') && bodyStyle.fontFamily.includes('Inter'),
    bodyStyle.fontFamily,
  );

  const primaryButton = findButtonByText('Browse Excel File');
  const primaryStyle = primaryButton ? window.getComputedStyle(primaryButton) : null;
  const gradient = (style) => (style?.backgroundImage ?? '').replace(/\s/g, '');
  check(
    'renderer',
    'primary button uses the deep indigo gradient (#4F46E5 → #4338CA)',
    gradient(primaryStyle).includes('linear-gradient(135deg,#4f46e5,#4338ca)') ||
      (gradient(primaryStyle).includes('79,70,229') && gradient(primaryStyle).includes('67,56,202')),
    primaryStyle?.backgroundImage,
  );
  check(
    'renderer',
    'primary button uses the 10px input/button radius',
    primaryStyle?.borderRadius === '10px',
    primaryStyle?.borderRadius,
  );
  check(
    'renderer',
    'buttons expose hover and active transitions',
    primaryButton?.className.includes('transition-all') === true &&
      primaryButton?.className.includes('hover:brightness-110') === true &&
      primaryButton?.className.includes('active:translate-y-px') === true,
  );

  const card = document.querySelector('section[aria-label="Dataset statistics"] > div > div');
  const cardStyle = card ? window.getComputedStyle(card) : null;
  check(
    'renderer',
    'cards use the #FFFFFF surface',
    normalizeColor(cardStyle?.backgroundColor) === normalizeColor('#FFFFFF'),
    cardStyle?.backgroundColor,
  );
  check('renderer', 'cards use the 14px radius', cardStyle?.borderRadius === '14px', cardStyle?.borderRadius);
  // jsdom's CSS parser cannot resolve `rgb(r g b / var(--tw-…))` for border-color,
  // so the token is verified through the compiled stylesheet plus the applied class.
  check(
    'renderer',
    'cards use the #E3E6EB border',
    css.includes('.border-surface-border') &&
      css.includes('border-color:rgb(227 230 235') &&
      card?.className.includes('border-surface-border') === true,
  );
  check(
    'renderer',
    'palette tokens are compiled into the stylesheet',
    css.includes('background-color:rgb(244 245 247') && // #F4F5F7
      css.includes('background-color:rgb(255 255 255') && // #FFFFFF
      css.includes('background-color:rgb(247 248 250') && // #F7F8FA
      css.includes('#4f46e5,#4338ca') && // accent gradient
      css.includes('31 36 48'), // #1F2430 text
  );

  const activeNav = document.querySelector('[aria-current="page"]');
  check('renderer', 'the active section is marked for assistive tech', activeNav?.textContent?.includes('Dashboard') === true);
  const activeNavStyle = activeNav ? window.getComputedStyle(activeNav) : null;
  const activeGradient = activeNavStyle?.backgroundImage.replace(/\s/g, '') ?? '';
  check(
    'renderer',
    'the active navigation item uses the decorative accent gradient',
    activeGradient.includes('linear-gradient(135deg,#4f46e524,#4338ca14)') ||
      (activeGradient.includes('79,70,229,0.08') && activeGradient.includes('67,56,202,0.04')),
    activeNavStyle?.backgroundImage,
  );
  check(
    'renderer',
    'the active navigation item shows the accent indicator',
    activeNav?.querySelector('[aria-hidden="true"]')?.className.includes('bg-accent-gradient') === true,
  );

  const dropZone = document.querySelector('[aria-label="Excel file drop zone"]');
  check('renderer', 'the import surface is a labelled drop zone', Boolean(dropZone));
  check(
    'renderer',
    'the drop zone has hover styling and a 200ms transition',
    dropZone?.className.includes('hover:border-accent/50') === true &&
      dropZone?.className.includes('duration-200') === true,
  );

  const dragEnter = new window.Event('dragenter', { bubbles: true, cancelable: true });
  Object.defineProperty(dragEnter, 'dataTransfer', { value: { files: [], dropEffect: 'copy' } });
  dropZone?.dispatchEvent(dragEnter);
  await settle();
  check(
    'renderer',
    'dragging a file over the drop zone activates the highlight state',
    dropZone?.getAttribute('data-dragging') === 'true',
    dropZone?.getAttribute('data-dragging') ?? 'no attribute',
  );
  const dragLeave = new window.Event('dragleave', { bubbles: true, cancelable: true });
  Object.defineProperty(dragLeave, 'dataTransfer', { value: { files: [], dropEffect: 'copy' } });
  dropZone?.dispatchEvent(dragLeave);
  await settle();
  check(
    'renderer',
    'leaving the drop zone clears the highlight state',
    dropZone?.hasAttribute('data-dragging') === false,
  );

  const windowControlLabels = ['Minimize', 'Maximize', 'Close'];
  for (const label of windowControlLabels) {
    const control = document.querySelector(`button[aria-label="${label}"]`);
    check('renderer', `window control "${label}" is present and accessible`, Boolean(control));
    check(
      'renderer',
      `window control "${label}" is disabled outside Electron`,
      control?.hasAttribute('disabled') === true,
    );
  }

  // --- interactions -------------------------------------------------------
  const clickNav = (label) => {
    const button = findButtonByText(label);
    button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    return button;
  };

  clickNav('Data');
  await settle();
  check('renderer', 'Data screen renders its empty state', text().includes('No data loaded'));
  check(
    'renderer',
    'the data screen offers an import action instead of placeholder filters',
    findButtonByText('Choose file') !== undefined && findButtonByText('Filters') === undefined,
  );

  clickNav('Settings');
  await settle();
  check('renderer', 'Settings screen renders', text().includes('Security model') && text().includes('Data & privacy'));
  check(
    'renderer',
    'Settings lists the runtime without a desktop bridge',
    (text().match(/—/g) ?? []).length >= 3,
  );

  clickNav('Dashboard');
  await settle();
  const browseButton = findButtonByText('Browse Excel File');
  browseButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle();
  check(
    'renderer',
    'browsing outside the desktop shell explains itself instead of failing silently',
    text().includes('Desktop shell unavailable'),
  );

  const dismissButton = document.querySelector('button[aria-label="Dismiss notification"]');
  dismissButton?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await settle();
  const toastItem = document.querySelector('[role="status"], [role="alert"]');
  check(
    'renderer',
    'a dismissed notification fades out before it is removed',
    (toastItem?.className ?? '').includes('animate-toast-out'),
    toastItem?.className ?? '',
  );
  await settle(260);
  check('renderer', 'notifications can be dismissed', !text().includes('Desktop shell unavailable'));

  const zone = document.querySelector('[aria-label="Excel file drop zone"]');
  const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [], dropEffect: 'copy' } });
  zone?.dispatchEvent(dropEvent);
  await settle();
  check(
    'renderer',
    'an empty drop reports a warning notification',
    text().includes('Nothing to analyse'),
  );

  check('renderer', 'no runtime errors after interactions', consoleErrors.length === 0, consoleErrors.join(' | '));

  rendered.close();

  await verifyDesktopBridgeFlow(bundlePath, productionHtml, css);
}

/**
 * Re-runs the renderer with a mocked preload bridge to verify the whole
 * renderer → preload → main-process contract that cannot be exercised without
 * launching Electron itself.
 */
async function verifyDesktopBridgeFlow(bundlePath, html, css) {
  const calls = {
    minimize: 0,
    toggleMaximize: 0,
    close: 0,
    browse: 0,
    validate: [],
    imported: [],
    stateSubscribers: 0,
    progressSubscribers: 0,
  };
  let nextBrowseResult = { status: 'cancelled' };

  /** The workbook result the mocked main process returns for an import. */
  const workbookResult = (fileName) => ({
    status: 'imported',
    workbook: {
      file: {
        name: fileName,
        path: `C:\\Reports\\${fileName}`,
        extension: 'xlsx',
        sizeInBytes: 15_360,
        selectionId: 'bridge-1',
      },
      sheetName: 'Payments',
      sheets: [
        {
          name: 'Payments',
          headerRowIndex: 0,
          dataRowCount: 2,
          columns: [
            { field: 'date', header: 'Date', columnIndex: 0, required: true },
            { field: 'name', header: 'Name', columnIndex: 1, required: true },
            { field: 'vehicleNumber', header: 'Vehicle Number', columnIndex: 2, required: true },
            { field: 'paymentMode', header: 'Payment Mode', columnIndex: 3, required: true },
            { field: 'amount', header: 'Amount', columnIndex: 4, required: true },
          ],
          missingRequiredFields: [],
          isImportable: true,
        },
      ],
      columns: [],
      records: [
        {
          id: 'Payments#2',
          rowNumber: 2,
          date: '2026-07-01',
          name: 'Raj Kumar',
          vehicleNumber: 'UP32AB1234',
          vehicleKey: 'UP32AB1234',
          paymentMode: 'UPI',
          amountMinor: 200000,
          paymentReason: 'Fuel',
          remark: '',
          issues: [],
        },
        {
          id: 'Payments#3',
          rowNumber: 3,
          date: '2026-07-02',
          name: 'Sunita Devi',
          vehicleNumber: 'UP78XY9876',
          vehicleKey: 'UP78XY9876',
          paymentMode: 'Cash',
          amountMinor: 150000,
          paymentReason: 'Repair',
          remark: 'Paid in full',
          issues: [],
        },
      ],
      statistics: {
        rowsScanned: 2,
        emptyRowsIgnored: 1,
        importedRecords: 2,
        validRecords: 2,
        recordsWithIssues: 0,
        recordsWithAmount: 2,
        totalAmountMinor: 350000,
        averageAmountMinor: 175000,
      },
    },
  });

  const virtualConsole = new VirtualConsole();
  const consoleErrors = [];
  virtualConsole.on('jsdomError', (error) => consoleErrors.push(error.message));
  virtualConsole.on('error', (message) => consoleErrors.push(String(message)));

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

  window.excelDataAnalyzer = {
    app: {
      getPlatformInfo: async () => ({
        appName: 'Excel Data Analyzer',
        platform: 'win32',
        appVersion: '0.1.0',
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
      onStateChanged: () => {
        calls.stateSubscribers += 1;
        return () => {};
      },
    },
    excel: {
      browse: async () => {
        calls.browse += 1;
        return nextBrowseResult;
      },
      validatePath: async (filePath) => {
        calls.validate.push(filePath);
        return nextBrowseResult;
      },
      resolvePath: () => 'C:\\Reports\\july payments.xlsx',
      importWorkbook: async (filePath) => {
        calls.imported.push(filePath);
        const name = filePath.split(/[\\/]/).pop() ?? 'workbook.xlsx';
        return workbookResult(name);
      },
      selectWorksheet: async () => workbookResult('july payments.xlsx'),
      onImportProgress: () => {
        calls.progressSubscribers += 1;
        return () => {};
      },
    },
  };

  window.eval(await readFile(bundlePath, 'utf8'));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
  await settle();

  const text = () => document.body.textContent ?? '';
  const click = (element) => element?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const findButton = (label) =>
    Array.from(document.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').trim().includes(label),
    );

  check('bridge', 'the window state subscription is registered', calls.stateSubscribers >= 1);
  check('bridge', 'the import progress subscription is registered', calls.progressSubscribers >= 1);
  check(
    'bridge',
    'window controls become enabled inside the desktop shell',
    document.querySelector('button[aria-label="Minimize"]')?.hasAttribute('disabled') === false,
  );

  click(document.querySelector('button[aria-label="Minimize"]'));
  click(document.querySelector('button[aria-label="Maximize"]'));
  click(document.querySelector('button[aria-label="Close"]'));
  await settle();
  check(
    'bridge',
    'window controls invoke minimize / maximize / close over IPC',
    calls.minimize === 1 && calls.toggleMaximize === 1 && calls.close === 1,
    JSON.stringify({ minimize: calls.minimize, toggleMaximize: calls.toggleMaximize, close: calls.close }),
  );
  check(
    'bridge',
    'the maximize response is reflected in the control label',
    document.querySelector('button[aria-label="Restore down"]') !== null,
  );

  // Accepted file: the renderer asks the main process to import it, then shows
  // the real records — no figure is invented anywhere in this path.
  nextBrowseResult = {
    status: 'selected',
    file: {
      name: 'july payments.xlsx',
      path: 'C:\\Reports\\july payments.xlsx',
      extension: 'xlsx',
      sizeInBytes: 15_360,
      selectionId: 'test-1',
    },
  };
  click(findButton('Browse Excel File'));
  await settle();
  check(
    'bridge',
    'the import is requested from the main process with the selected path',
    calls.imported.includes('C:\\Reports\\july payments.xlsx'),
    calls.imported.join(' | '),
  );
  check('bridge', 'the selected file name is displayed', text().includes('july payments.xlsx'));
  check(
    'bridge',
    'the imported worksheets are shown on the data screen',
    text().includes('worksheet Payments') || text().includes('Payments'),
  );

  // Back on the dashboard the loaded-file panel reports the real file details.
  click(findButton('Dashboard'));
  await settle();
  // Stage 5 replaced the internal path line in the source card with the workbook
  // name, the worksheet, the row count and the load time: the interface never
  // shows the user's folder layout.
  check(
    'bridge',
    'the source card names the workbook without exposing the internal path',
    text().includes('july payments.xlsx') && !text().includes('C:\\Reports'),
    text().slice(0, 160),
  );
  check('bridge', 'the selected file size is displayed', text().includes('15 KB'));
  check(
    'bridge',
    'the loaded file panel reports the real record count and total',
    text().includes('2 records') && text().includes('₹3,500'),
    text().slice(0, 200),
  );

  // Unsupported file: rejected by the trusted main process, surfaced as an error.
  nextBrowseResult = {
    status: 'rejected',
    fileName: 'photo.png',
    message: '"photo.png" is not a supported spreadsheet. Please choose a .xlsx or .xls file.',
  };
  click(findButton('Change Excel File'));
  await settle();
  check('bridge', 'an unsupported file is rejected with an error notification', text().includes('File not accepted'));
  check('bridge', 'the rejection names the offending file', text().includes('photo.png'));

  // Clearing the dataset returns the card to its empty state.
  click(findButton('Clear data'));
  await settle();
  check('bridge', 'clearing the dataset restores the import prompt', text().includes('Upload your Excel file'));

  // Drag & drop goes through the same validation path.
  nextBrowseResult = { status: 'selected', file: { name: 'dropped.xlsx', path: 'C:\\Reports\\july payments.xlsx', extension: 'xlsx', sizeInBytes: 15_360, selectionId: 'test-2' } };
  const dropEvent = new window.Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [{ name: 'dropped.xlsx' }], dropEffect: 'copy' } });
  document.querySelector('[aria-label="Excel file drop zone"]')?.dispatchEvent(dropEvent);
  await settle();
  check(
    'bridge',
    'a dropped spreadsheet is validated by the main process',
    calls.validate.includes('C:\\Reports\\july payments.xlsx') && calls.imported.length >= 2,
    `validated: ${calls.validate.join(' | ')}`,
  );

  check('bridge', 'no runtime errors during the desktop flow', consoleErrors.length === 0, consoleErrors.join(' | '));

  // Settings screen reports the real runtime values coming from the main process.
  click(findButton('Settings'));
  await settle();
  check(
    'bridge',
    'Settings shows the runtime reported by the main process',
    text().includes('Windows') && text().includes('Electron') && text().includes('140.0.0'),
  );

  dom.window.close();
}

/* -------------------------------------------------------------------------- */
/* 4. Main process (built bundle, mocked Electron API)                        */
/* -------------------------------------------------------------------------- */

/**
 * Loads the real `dist-electron/main.js` bundle with a mocked Electron module so
 * the privileged behaviour (window options, IPC handlers, file validation,
 * dialogs, navigation and permission policy) can be exercised headlessly.
 */
async function verifyMainProcess(workspace) {
  const bundlePath = path.join(root, 'dist-electron/main.js');
  const tempDir = path.join(workspace, 'files');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(tempDir, { recursive: true });

  const workbooks = {
    xlsx: path.join(tempDir, 'july payments.xlsx'),
    xls: path.join(tempDir, 'ledger 2025.xls'),
    text: path.join(tempDir, 'notes.txt'),
    folder: path.join(tempDir, 'folder.xls'),
    missing: path.join(tempDir, 'deleted.xlsx'),
  };
  await writeFile(workbooks.xlsx, Buffer.alloc(1536, 7));
  await writeFile(workbooks.xls, Buffer.alloc(4096, 3));
  await writeFile(workbooks.text, 'not a spreadsheet');
  await mkdir(workbooks.folder, { recursive: true });

  function createElectronHarness({ singleInstanceLock = true } = {}) {
    const state = {
      quitCalls: 0,
      handlers: new Map(),
      windows: [],
      permissionHandler: null,
      dialogResult: { canceled: true, filePaths: [] },
      dialogOptions: [],
      externalUrls: [],
      themeSource: 'system',
      privilegedSchemes: [],
      protocolHandlers: new Map(),
    };

    class FakeWebContents {
      constructor() {
        this.sent = [];
        this.navigationListeners = [];
        this.windowOpenHandler = null;
      }
      send(channel, payload) {
        this.sent.push({ channel, payload });
      }
      setWindowOpenHandler(handler) {
        this.windowOpenHandler = handler;
      }
      on(event, listener) {
        if (event === 'will-navigate') {
          this.navigationListeners.push(listener);
        }
      }
    }

    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.webContents = new FakeWebContents();
        this.listeners = new Map();
        this.maximized = false;
        this.fullScreen = false;
        this.minimized = false;
        this.destroyed = false;
        this.shown = false;
        state.windows.push(this);
      }
      loadURL(url) {
        this.url = url;
        return Promise.resolve();
      }
      loadFile(file) {
        this.loadedFile = file;
        return Promise.resolve();
      }
      get loadedUrl() {
        return this.url;
      }
      once(event, listener) {
        if (event === 'ready-to-show') {
          this.readyToShow = listener;
        }
      }
      on(event, listener) {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener);
        this.listeners.set(event, listeners);
      }
      emit(event) {
        for (const listener of this.listeners.get(event) ?? []) {
          listener();
        }
      }
      isDestroyed() {
        return this.destroyed;
      }
      isMaximized() {
        return this.maximized;
      }
      isFullScreen() {
        return this.fullScreen;
      }
      maximize() {
        this.maximized = true;
        this.emit('maximize');
      }
      unmaximize() {
        this.maximized = false;
        this.emit('unmaximize');
      }
      minimize() {
        this.minimized = true;
      }
      restore() {
        this.minimized = false;
        this.emit('restore');
      }
      close() {
        this.closed = true;
      }
      focus() {
        this.focused = true;
      }
      show() {
        this.shown = true;
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
        requestSingleInstanceLock: () => singleInstanceLock,
        whenReady: () => Promise.resolve(),
        on: () => {},
        quit: () => {
          state.quitCalls += 1;
        },
        getVersion: () => '0.1.0',
        // Electron resolves this from the packaged application metadata; the
        // mock reports the same name the interface must display.
        getName: () => 'Excel Data Analyzer',
        isPackaged: false,
      },
      BrowserWindow: FakeBrowserWindow,
      ipcMain: { handle: (channel, handler) => state.handlers.set(channel, handler) },
      dialog: {
        showOpenDialog: async (...args) => {
          state.dialogOptions.push(args[args.length - 1]);
          return state.dialogResult;
        },
      },
      session: {
        defaultSession: {
          setPermissionRequestHandler: (handler) => {
            state.permissionHandler = handler;
          },
        },
      },
      protocol: {
        registerSchemesAsPrivileged: (schemes) => state.privilegedSchemes.push(...schemes),
        handle: (scheme, handler) => state.protocolHandlers.set(scheme, handler),
      },
      // Stands in for Electron's `net.fetch`, which streams local files.
      net: {
        fetch: async (fileUrl) => {
          const filePath = fileURLToPath(fileUrl);
          if (!existsSync(filePath)) {
            throw new Error(`ENOENT: ${filePath}`);
          }
          return new Response(readFileSync(filePath), { status: 200 });
        },
      },
      nativeTheme: {
        get themeSource() {
          return state.themeSource;
        },
        set themeSource(value) {
          state.themeSource = value;
        },
      },
      shell: {
        openExternal: async (url) => {
          state.externalUrls.push(url);
        },
      },
    };

    return { state, electron };
  }

  async function loadMainProcess(options = {}) {
    const harness = createElectronHarness(options);
    const originalLoad = Module._load;
    Module._load = function load(request, parent, isMain) {
      if (request === 'electron') {
        return harness.electron;
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[bundlePath];
    try {
      require(bundlePath);
    } finally {
      Module._load = originalLoad;
    }
    // `app.whenReady().then(...)` resolves on the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 20));
    harness.window = harness.state.windows[0];
    return harness;
  }

  const harness = await loadMainProcess();
  const { state } = harness;
  const windowOptions = harness.window?.options;

  check('main process', 'the main bundle loads', Boolean(harness.window), 'no window was created');
  check(
    'main process',
    'a 1280×800 window with a 900×620 minimum is created',
    windowOptions?.width === 1280 &&
      windowOptions?.height === 800 &&
      windowOptions?.minWidth === 900 &&
      windowOptions?.minHeight === 620,
    JSON.stringify({ w: windowOptions?.width, h: windowOptions?.height, mw: windowOptions?.minWidth, mh: windowOptions?.minHeight }),
  );
  check(
    'main process',
    'the window is frameless but keeps minimise/maximise/close',
    windowOptions?.frame === false &&
      windowOptions?.minimizable === true &&
      windowOptions?.maximizable === true &&
      windowOptions?.closable === true,
  );
  check(
    'main process',
    'webPreferences are hardened',
    windowOptions?.webPreferences?.contextIsolation === true &&
      windowOptions.webPreferences.nodeIntegration === false &&
      windowOptions.webPreferences.sandbox === true &&
      windowOptions.webPreferences.webSecurity === true,
  );
  check(
    'main process',
    'the preload script is wired to the window',
    windowOptions?.webPreferences?.preload === path.join(root, 'dist-electron/preload.js'),
    windowOptions?.webPreferences?.preload,
  );
  check(
    'main process',
    'the window background matches the light design system',
    windowOptions?.backgroundColor === '#F4F5F7',
    windowOptions?.backgroundColor,
  );
  harness.window?.readyToShow?.();
  check('main process', 'the ready-to-show handler shows the window', harness.window?.shown === true);
  check(
    'main process',
    'the renderer is loaded over the privileged app:// scheme, not file://',
    harness.window?.loadedUrl === 'app://bundle/index.html',
    harness.window?.loadedUrl,
  );
  check('main process', 'light mode is requested from the OS', state.themeSource === 'light');

  // --- packaged renderer protocol ----------------------------------------
  const scheme = state.privilegedSchemes.find((entry) => entry.scheme === 'app');
  check(
    'main process',
    'the app:// scheme is registered as standard, secure and fetch-capable',
    scheme?.privileges?.standard === true &&
      scheme.privileges.secure === true &&
      scheme.privileges.supportFetchAPI === true,
    JSON.stringify(state.privilegedSchemes),
  );

  const serve = state.protocolHandlers.get('app');
  check('main process', 'a handler serves the app:// scheme', typeof serve === 'function');
  if (serve) {
    const indexResponse = await serve({ url: 'app://bundle/index.html' });
    const indexBody = await indexResponse.text();
    check(
      'main process',
      'the packaged index.html is served with its CSP',
      indexResponse.status === 200 && indexBody.includes('Content-Security-Policy'),
      `status ${indexResponse.status}`,
    );

    const assets = await readdir(path.join(root, 'dist/assets'));
    const scriptName = assets.find((file) => file.endsWith('.js'));
    const scriptResponse = await serve({ url: `app://bundle/assets/${scriptName}` });
    check(
      'main process',
      'renderer assets are served through the same scheme',
      scriptResponse.status === 200 && (await scriptResponse.text()).length > 1000,
      `status ${scriptResponse.status}, asset ${String(scriptName)}`,
    );

    // A file that really exists just outside the served bundle: if the guard
    // were missing, this request would return its contents.
    const secretPath = path.join(root, '.verify-secret.txt');
    await writeFile(secretPath, 'verify-secret-payload');
    try {
      const traversal = await serve({ url: 'app://bundle/%2e%2e%2F.verify-secret.txt' });
      const traversalBody = await traversal.text();
      check(
        'main process',
        'path traversal outside the bundle is refused',
        traversal.status === 404 && !traversalBody.includes('verify-secret-payload'),
        `status ${traversal.status}`,
      );

      const normalizedTraversal = await serve({ url: 'app://bundle/%2e%2e/%2e%2e/.verify-secret.txt' });
      check(
        'main process',
        'encoded parent segments cannot escape the bundle',
        normalizedTraversal.status === 404 &&
          !(await normalizedTraversal.text()).includes('verify-secret-payload'),
      );
    } finally {
      await rm(secretPath, { force: true });
    }

    const otherHost = await serve({ url: 'app://elsewhere/index.html' });
    check('main process', 'requests for another app:// host are refused', otherHost.status === 404);

    const missing = await serve({ url: 'app://bundle/assets/missing.js' });
    check('main process', 'a missing renderer file returns 404 instead of throwing', missing.status === 404);
  }

  const expectedChannels = [
    'excel:browse-file',
    'excel:validate-file',
    'excel:import-workbook',
    'excel:select-worksheet',
    'excel:export-filtered-data',
    'app:get-platform-info',
    'window:get-state',
    'window:minimize',
    'window:toggle-maximize',
    'window:close',
  ];
  check(
    'main process',
    'every whitelisted IPC channel has exactly one handler',
    expectedChannels.every((channel) => state.handlers.has(channel)) && state.handlers.size === expectedChannels.length,
    `registered: ${[...state.handlers.keys()].join(', ')}`,
  );
  check(
    'main process',
    'import progress is pushed to the renderer and never invoked by it',
    !state.handlers.has('excel:import-progress') &&
      /webContents\.send\(IPC_CHANNELS\.importProgress/.test(await readSource('electron/main.ts')),
  );

  // --- native file dialog -------------------------------------------------
  const invoke = (channel, ...args) =>
    state.handlers.get(channel)({ sender: harness.window.webContents }, ...args);

  state.dialogResult = { canceled: true, filePaths: [] };
  const cancelled = await invoke('excel:browse-file');
  check('main process', 'cancelling the dialog is reported as cancelled', cancelled.status === 'cancelled');
  const filters = state.dialogOptions.at(-1)?.filters?.[0];
  check(
    'main process',
    'the picker is filtered to .xlsx and .xls',
    JSON.stringify(filters) === JSON.stringify({ name: 'Excel workbooks', extensions: ['xlsx', 'xls'] }),
    JSON.stringify(filters),
  );

  state.dialogResult = { canceled: false, filePaths: [workbooks.xlsx] };
  const xlsxSelection = await invoke('excel:browse-file');
  check(
    'main process',
    'an .xlsx file is accepted with its metadata',
    xlsxSelection.status === 'selected' &&
      xlsxSelection.file.name === 'july payments.xlsx' &&
      xlsxSelection.file.path === workbooks.xlsx &&
      xlsxSelection.file.extension === 'xlsx' &&
      xlsxSelection.file.sizeInBytes === 1536,
    JSON.stringify(xlsxSelection),
  );

  state.dialogResult = { canceled: false, filePaths: [workbooks.xls] };
  const xlsSelection = await invoke('excel:browse-file');
  check(
    'main process',
    'an .xls file is accepted with its metadata',
    xlsSelection.status === 'selected' && xlsSelection.file.extension === 'xls' && xlsSelection.file.sizeInBytes === 4096,
    JSON.stringify(xlsSelection),
  );

  state.dialogResult = { canceled: false, filePaths: [workbooks.text] };
  const textSelection = await invoke('excel:browse-file');
  check(
    'main process',
    'an unsupported file chosen through the picker is rejected',
    textSelection.status === 'rejected' &&
      textSelection.fileName === 'notes.txt' &&
      textSelection.message.includes('.xlsx, .xls'),
    JSON.stringify(textSelection),
  );

  // --- drag & drop validation --------------------------------------------
  const dropped = await invoke('excel:validate-file', workbooks.xlsx);
  check('main process', 'a dropped spreadsheet is validated', dropped.status === 'selected' && dropped.file.path === workbooks.xlsx);
  const droppedBadType = await invoke('excel:validate-file', workbooks.text);
  check('main process', 'a dropped non-spreadsheet is rejected', droppedBadType.status === 'rejected');
  const droppedFolder = await invoke('excel:validate-file', workbooks.folder);
  check(
    'main process',
    'a directory with a spreadsheet extension is rejected',
    droppedFolder.status === 'rejected' && droppedFolder.message.includes('not a file'),
    JSON.stringify(droppedFolder),
  );
  const droppedMissing = await invoke('excel:validate-file', workbooks.missing);
  check(
    'main process',
    'a missing file is rejected with a readable message',
    droppedMissing.status === 'rejected' && droppedMissing.message.includes('could not be read'),
    JSON.stringify(droppedMissing),
  );
  const droppedJunk = await invoke('excel:validate-file', 42);
  check('main process', 'a malformed path is rejected', droppedJunk.status === 'rejected');

  // --- platform info & window commands -----------------------------------
  const platformInfo = await invoke('app:get-platform-info');
  const platformKeys = [
    'appName',
    'platform',
    'appVersion',
    'electronVersion',
    'chromeVersion',
    'nodeVersion',
    'isPackaged',
  ];
  check(
    'main process',
    'platform information is reported read-only',
    platformKeys.every((key) => key in platformInfo) &&
      platformInfo.appName === 'Excel Data Analyzer' &&
      platformInfo.appVersion === '0.1.0' &&
      platformInfo.isPackaged === false &&
      platformInfo.nodeVersion === process.versions.node,
    JSON.stringify(platformInfo),
  );

  check('main process', 'window state is reported', (await invoke('window:get-state')).isMaximized === false);
  harness.window.webContents.sent.length = 0;
  await invoke('window:minimize');
  check('main process', 'minimize reaches the window', harness.window.minimized === true);
  const maximized = await invoke('window:toggle-maximize');
  check('main process', 'maximize toggles the window state', maximized.isMaximized === true && harness.window.maximized === true);
  const restored = await invoke('window:toggle-maximize');
  check('main process', 'the same command restores the window', restored.isMaximized === false);
  const pushedStates = harness.window.webContents.sent.filter((entry) => entry.channel === 'window:state-changed');
  check(
    'main process',
    'window state changes are pushed to the renderer',
    pushedStates.length >= 2 && pushedStates.at(-1).payload.isMaximized === false,
    `${pushedStates.length} notifications`,
  );
  await invoke('window:close');
  check('main process', 'close reaches the window', harness.window.closed === true);

  // --- security policies --------------------------------------------------
  const decisions = [];
  state.permissionHandler?.({}, 'media', (granted) => decisions.push(['media', granted]));
  state.permissionHandler?.({}, 'geolocation', (granted) => decisions.push(['geolocation', granted]));
  state.permissionHandler?.({}, 'clipboard-sanitized-write', (granted) => decisions.push(['clipboard-sanitized-write', granted]));
  check(
    'main process',
    'camera, microphone and location permissions are denied',
    decisions[0]?.[1] === false && decisions[1]?.[1] === false && decisions[2]?.[1] === true,
    JSON.stringify(decisions),
  );

  const openHandler = harness.window.webContents.windowOpenHandler?.({ url: 'https://example.com/docs' });
  check(
    'main process',
    'external links are denied in-app and opened in the default browser',
    openHandler?.action === 'deny' && state.externalUrls.includes('https://example.com/docs'),
  );
  const windowOpenDenied = harness.window.webContents.windowOpenHandler?.({ url: 'file:///etc/passwd' });
  check('main process', 'non-https links are not opened externally', windowOpenDenied?.action === 'deny' && state.externalUrls.length === 1);

  const navigationDecision = { prevented: false, preventDefault() { this.prevented = true; } };
  harness.window.webContents.navigationListeners[0]?.(
    navigationDecision,
    'https://malicious.example.com/steal',
  );
  check('main process', 'navigation away from the application is blocked', navigationDecision.prevented === true);

  const localNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  harness.window.webContents.navigationListeners[0]?.(localNavigation, 'app://bundle/index.html#dashboard');
  check('main process', 'in-app renderer navigation stays allowed', localNavigation.prevented === false);

  const fileNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  harness.window.webContents.navigationListeners[0]?.(fileNavigation, `file://${path.join(root, 'dist/index.html')}`);
  check('main process', 'file:// navigation is not allowed any more', fileNavigation.prevented === true);

  // --- single instance ----------------------------------------------------
  const second = await loadMainProcess({ singleInstanceLock: false });
  check(
    'main process',
    'a second instance quits instead of opening another window',
    second.state.quitCalls === 1 && second.state.windows.length === 0 && second.state.handlers.size === 0,
    JSON.stringify({ quits: second.state.quitCalls, windows: second.state.windows.length }),
  );
}
