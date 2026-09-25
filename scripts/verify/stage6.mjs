/**
 * Stage 6 verification suite: the Windows release packaging.
 *
 * Groups:
 *   1. application identity   — name, identifier and version agree everywhere
 *   2. packaging configuration — the Electron Builder configuration is valid
 *                                and describes the release we intend to ship
 *   3. packaged build          — the real production bundles: loading through
 *                                `app://bundle/`, hardened web preferences,
 *                                crash-safe startup, no development leftovers
 *   4. windows release         — icon binaries, file-system hygiene, release
 *                                artefacts and the release documentation
 *
 * Everything here inspects real files: the configuration, the generated icons,
 * the built bundles and the archive that would ship. Nothing is taken from a
 * copied constant, and nothing launches Electron — the suite stays deterministic
 * and headless, which is exactly why it cannot replace a run on Windows.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createMockBridge,
  createRecorder,
  prepareRendererBundle,
  readSource,
  renderRenderer,
  requireFromHarness,
  root,
  stripComments,
} from './harness.mjs';

/** The production bundle is CommonJS; this is how it is loaded in the suite. */
const require = requireFromHarness;
import {
  inspectIco,
  inspectPng,
  loadReleaseInputs,
  packAsar,
  resolvePackageFiles,
  toPosixPath,
  validateConfigAgainstSchema,
  windowsTargets,
} from './packaging.mjs';

const GROUP_IDENTITY = 'application identity';
const GROUP_CONFIG = 'packaging configuration';
const GROUP_BUILD = 'packaged build';
const GROUP_RELEASE = 'windows release';

const recorder = createRecorder();
const check = recorder.check.bind(recorder);

/** Runs one group and records a failure instead of aborting the whole suite. */
async function runGroup(name, run) {
  try {
    await run();
  } catch (error) {
    check(name, 'the group runs to completion', false, error instanceof Error ? error.message : String(error));
  }
}

export async function runStage6(workspace) {
  const inputs = loadReleaseInputs();
  const prepared = await prepareRendererBundle(workspace);

  await runGroup(GROUP_IDENTITY, () => verifyIdentity(inputs, prepared));
  await runGroup(GROUP_CONFIG, () => verifyConfiguration(inputs));
  await runGroup(GROUP_BUILD, () => verifyPackagedBuild(prepared));
  await runGroup(GROUP_RELEASE, () => verifyWindowsRelease(inputs));

  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* 1. Application identity                                                     */
/* -------------------------------------------------------------------------- */

async function verifyIdentity(inputs, prepared) {
  const { packageJson, config, mainSource } = inputs;
  const productName = 'Excel Data Analyzer';

  check(
    GROUP_IDENTITY,
    'package.json declares the product name and the description',
    packageJson.productName === productName &&
      typeof packageJson.description === 'string' &&
      packageJson.description.length > 20,
    String(packageJson.productName),
  );
  check(
    GROUP_IDENTITY,
    'the packaging configuration uses the same product name',
    config.productName === packageJson.productName,
    String(config.productName),
  );
  check(
    GROUP_IDENTITY,
    'the application identifier is stable and product-specific',
    config.appId === 'com.exceldataanalyzer.app' &&
      config.appId !== packageJson.name &&
      /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(config.appId),
    String(config.appId),
  );
  check(
    GROUP_IDENTITY,
    'the version is a real semantic version and is not duplicated in the configuration',
    /^\d+\.\d+\.\d+$/.test(packageJson.version) && !/version:/.test(inputs.configText),
    packageJson.version,
  );
  check(
    GROUP_IDENTITY,
    'the window title and the title bar show the application name',
    new RegExp(`title: '${productName}'`).test(mainSource) &&
      new RegExp(`<h1[^>]*>\\s*${productName}\\s*</h1>`).test(await readSource('src/layouts/TitleBar.tsx')),
  );
  check(
    GROUP_IDENTITY,
    'the installer artefact name carries the product name and the version',
    config.win?.artifactName === '${productName}-${version}-Setup.${ext}' &&
      config.portable?.artifactName === '${productName}-${version}-Portable.${ext}',
    `${config.win?.artifactName} / ${config.portable?.artifactName}`,
  );

  // The About card must render the runtime values the main process reports,
  // never a literal copied into the interface.
  const { bridge } = createMockBridge();
  bridge.app.getPlatformInfo = async () => ({
    appName: productName,
    platform: 'win32',
    appVersion: '9.9.9-test',
    electronVersion: '44.0.0',
    chromeVersion: '140.0.0',
    nodeVersion: '22.0.0',
    isPackaged: true,
  });
  const app = await renderRenderer({ ...prepared, bridge });
  app.click(app.findButton('Settings'));
  await app.settle(80);
  const about = app.document.querySelector('[data-about]');
  const aboutName = (app.document.querySelector('[data-about-name]')?.textContent ?? '').trim();
  const aboutVersion = (app.document.querySelector('[data-about-version]')?.textContent ?? '').trim();
  check(
    GROUP_IDENTITY,
    'the About card shows the name and version reported by the runtime',
    about !== null && aboutName === productName && aboutVersion === '9.9.9-test',
    `${aboutName} ${aboutVersion}`,
  );
  check(
    GROUP_IDENTITY,
    'the About card states the product description and the copyright notice',
    (about?.textContent ?? '').includes('Offline desktop application') &&
      (about?.textContent ?? '').includes('Copyright © 2026 Excel Data Analyzer'),
  );
  check(
    GROUP_IDENTITY,
    'the About card reports an installed build as installed',
    about?.getAttribute('data-about-build') === 'installed' &&
      (about?.textContent ?? '').includes('Installed build'),
  );
  check(
    GROUP_IDENTITY,
    'the interface contains no hard-coded application version',
    !/v?\d+\.\d+\.\d+/.test(
      [await readSource('src/pages/SettingsPage.tsx'), await readSource('src/layouts/TitleBar.tsx')].join('\n'),
    ),
  );
  app.close();
}

/* -------------------------------------------------------------------------- */
/* 2. Packaging configuration                                                  */
/* -------------------------------------------------------------------------- */

function verifyConfiguration(inputs) {
  const { config, packageJson, configText } = inputs;

  const schemaProblems = validateConfigAgainstSchema(config);
  check(
    GROUP_CONFIG,
    'electron-builder.yml is valid against the Electron Builder schema',
    schemaProblems.length === 0,
    schemaProblems.slice(0, 3).join('; '),
  );

  const targets = windowsTargets(config);
  check(
    GROUP_CONFIG,
    'the Windows target is an explicit x64 NSIS installer',
    targets.length === 1 && targets[0].target === 'nsis' && targets[0].arch.join(',') === 'x64',
    JSON.stringify(targets),
  );
  check(
    GROUP_CONFIG,
    'the application is packaged as an asar archive from the built bundles only',
    config.asar === true &&
      config.files.includes('dist/**/*') &&
      config.files.includes('dist-electron/**/*') &&
      config.files.includes('package.json') &&
      config.files.includes('!node_modules/**/*'),
    config.files.join(', '),
  );
  check(
    GROUP_CONFIG,
    'release artefacts are written to a dedicated, ignored directory',
    config.directories.output === 'release' &&
      existsSync(path.join(root, '.gitignore')) &&
      // The rule is anchored to the repository root on purpose: an unanchored
      // `release/` would also hide `scripts/release/`, which holds the release
      // tooling and must be committed.
      /^\/release\/$/m.test(readFileSync(path.join(root, '.gitignore'), 'utf8')),
  );
  check(
    GROUP_CONFIG,
    'the Windows icon is configured for the application, the installer and the uninstaller',
    config.win.icon === 'build/icon.ico' &&
      config.nsis.installerIcon === 'build/icon.ico' &&
      config.nsis.uninstallerIcon === 'build/icon.ico',
  );
  check(
    GROUP_CONFIG,
    'the installer is per-user, needs no elevation and creates the shortcuts',
    config.win.requestedExecutionLevel === 'asInvoker' &&
      config.nsis.perMachine === false &&
      config.nsis.oneClick === false &&
      config.nsis.createDesktopShortcut === true &&
      config.nsis.createStartMenuShortcut === true &&
      config.nsis.shortcutName === packageJson.productName,
  );
  check(
    GROUP_CONFIG,
    'the installer can be removed like any other application',
    config.nsis.uninstallDisplayName === packageJson.productName &&
      config.nsis.deleteAppDataOnUninstall === false,
  );
  check(
    GROUP_CONFIG,
    'no publisher, telemetry or auto-start metadata is invented',
    !/telemetry|analytics|autostart|auto-launch/i.test(configText) &&
      !/publish:/.test(configText) &&
      !/certificateFile|cscLink/.test(configText),
  );
  check(
    GROUP_CONFIG,
    'the packaging scripts never publish and always build the production bundle first',
    ['pack', 'dist:win', 'dist:win:portable'].every((script) =>
      (packageJson.scripts[script] ?? '').startsWith('npm run build &&'),
    ) &&
      packageJson.scripts['dist:win'].includes('--publish never') &&
      packageJson.scripts['dist:win:portable'].includes('--publish never'),
    packageJson.scripts['dist:win'],
  );
  check(
    GROUP_CONFIG,
    'the production build generates the icons before packaging',
    packageJson.scripts.build.includes('npm run icons') &&
      packageJson.scripts.build.indexOf('build:electron') > packageJson.scripts.build.indexOf('npm run icons'),
  );
  check(
    GROUP_CONFIG,
    'a portable build exists without changing the installed application',
    /--win portable/.test(packageJson.scripts['dist:win:portable']) &&
      config.portable.requestExecutionLevel === 'user' &&
      config.portable.unicode === true,
    packageJson.scripts['dist:win:portable'],
  );
  check(
    GROUP_CONFIG,
    'the development server and the local ports are not part of the packaging configuration',
    !/localhost|127\.0\.0\.1|5273/.test(configText) &&
      !/localhost|127\.0\.0\.1|5273/.test(JSON.stringify(packageJson.build ?? {})) &&
      !('build' in packageJson),
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Packaged build                                                           */
/* -------------------------------------------------------------------------- */

async function verifyPackagedBuild(prepared) {
  const { Module } = await import('./harness.mjs');
  const distDir = path.join(root, 'dist');
  const electronDir = path.join(root, 'dist-electron');
  const indexPath = path.join(distDir, 'index.html');

  check(
    GROUP_BUILD,
    'the production renderer and the Electron bundles exist',
    existsSync(indexPath) &&
      existsSync(path.join(electronDir, 'main.js')) &&
      existsSync(path.join(electronDir, 'preload.js')),
  );

  const distFiles = walkRelative(distDir);
  check(
    GROUP_BUILD,
    'the renderer bundle ships its assets, stylesheet and bundled font',
    distFiles.some((file) => /^assets\/.*\.js$/.test(file)) &&
      distFiles.some((file) => /^assets\/.*\.css$/.test(file)) &&
      distFiles.some((file) => /^assets\/.*\.woff2$/.test(file)),
    distFiles.length ? `${distFiles.length} files` : 'no files',
  );
  check(
    GROUP_BUILD,
    'no source map or development artefact is shipped',
    !distFiles.some((file) => file.endsWith('.map')) &&
      !walkRelative(electronDir).some((file) => file.endsWith('.map')) &&
      !distFiles.some((file) => /\.(ts|tsx)$/.test(file)),
  );

  const html = readFileSync(indexPath, 'utf8');
  check(
    GROUP_BUILD,
    'the packaged page keeps the strict CSP and references only local assets',
    /http-equiv="Content-Security-Policy"/.test(html) &&
      /default-src 'self'/.test(html) &&
      /connect-src 'none'/.test(html) &&
      !/https?:\/\/(?!www\.w3\.org)/.test(html) &&
      !/localhost|127\.0\.0\.1/.test(html),
  );

  // The real main-process bundle, loaded with a mocked Electron API exactly the
  // way the packaged application starts: no development server, no arguments.
  // No development server in the environment: this is exactly how the packaged
  // application starts.
  const harness = await loadMainProcessBundle({ Module });
  const window = harness.state.windows[0];
  const options = window?.options ?? {};
  check(
    GROUP_BUILD,
    'the packaged window loads the renderer through app://bundle/ and never file://',
    window?.url === 'app://bundle/index.html' &&
      window?.loadedFile === undefined &&
      !String(window?.url ?? '').startsWith('file:'),
    String(window?.url),
  );
  check(
    GROUP_BUILD,
    'the packaged window keeps contextIsolation, nodeIntegration and the sandbox',
    options.webPreferences?.contextIsolation === true &&
      options.webPreferences?.nodeIntegration === false &&
      options.webPreferences?.sandbox === true &&
      options.webPreferences?.webSecurity === true,
    JSON.stringify(options.webPreferences),
  );
  check(
    GROUP_BUILD,
    'the preload script is the packaged one and no other renderer flag is passed',
    path.basename(String(options.webPreferences?.preload ?? '')) === 'preload.js' &&
      !('webviewTag' in options.webPreferences) &&
      !('enableRemoteModule' in options.webPreferences) &&
      options.webPreferences?.allowRunningInsecureContent === undefined,
    String(options.webPreferences?.preload),
  );
  check(
    GROUP_BUILD,
    'the production window keeps the documented size, minimum and title',
    options.width === 1280 &&
      options.height === 800 &&
      options.minWidth === 900 &&
      options.minHeight === 620 &&
      options.maximizable === true &&
      options.title === 'Excel Data Analyzer',
    `${options.width}×${options.height} min ${options.minWidth}×${options.minHeight}`,
  );
  check(
    GROUP_BUILD,
    'the packaged application starts with the light theme of the design system',
    harness.state.themeSource === 'light' && options.backgroundColor === '#F4F5F7',
    `${harness.state.themeSource} ${options.backgroundColor}`,
  );
  const runtimeInfo = await harness.invoke('app:get-platform-info');
  check(
    GROUP_BUILD,
    'the application name and version reported at runtime come from Electron',
    runtimeInfo.appName === 'Excel Data Analyzer' &&
      runtimeInfo.appVersion === '0.2.0-test' &&
      runtimeInfo.isPackaged === true &&
      harness.state.nameCalls === 1,
    JSON.stringify(runtimeInfo),
  );

  // Crash-safe startup: a failed load must not leave an empty window behind.
  harness.state.consoleErrors.length = 0;
  window.webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'app://bundle/index.html');
  const failureUrl = String(window.url ?? '');
  check(
    GROUP_BUILD,
    'a renderer that cannot load shows a readable failure page instead of a blank window',
    failureUrl.startsWith('data:text/html') &&
      decodeURIComponent(failureUrl).includes('The interface could not be loaded') &&
      harness.state.consoleErrors.some((line) => line.includes('failed to load')),
  );
  check(
    GROUP_BUILD,
    'the failure page contains no system path, stack trace or development label',
    !/localhost|Vite|node_modules|\/home\/|C:\\/i.test(decodeURIComponent(failureUrl)),
  );
  check(
    GROUP_BUILD,
    'a preload script that cannot run is logged and never crashes the application',
    (() => {
      harness.state.consoleErrors.length = 0;
      window.webContents.emit('preload-error', {}, '/tmp/preload.js', new Error('boom'));
      return (
        harness.state.consoleErrors.some((line) => line.includes('preload script')) &&
        harness.state.quitCalls === 0
      );
    })(),
  );

  harness.restoreConsole();

  const mainBundle = readFileSync(path.join(electronDir, 'main.js'), 'utf8');
  check(
    GROUP_BUILD,
    'the minified production bundle keeps every security setting',
    /contextIsolation:!0/.test(mainBundle) &&
      /nodeIntegration:!1/.test(mainBundle) &&
      /sandbox:!0/.test(mainBundle) &&
      /webSecurity:!0/.test(mainBundle),
  );
  check(
    GROUP_BUILD,
    'the production bundle serves the renderer from the app scheme and never loads a local file',
    /"app"/.test(mainBundle) &&
      /"bundle"/.test(mainBundle) &&
      /\$\{[A-Za-z_$]+\}:\/\/\$\{[A-Za-z_$]+\}/.test(mainBundle) &&
      mainBundle.includes('index.html') &&
      // The renderer is never loaded from the file system: `loadFile` must not
      // appear at all. (A `file:///` literal does exist inside the bundled
      // SheetJS library, which never loads a renderer.)
      !/loadFile\(/.test(mainBundle) &&
      !/loadURL\('file:/.test(mainBundle),
  );
  check(
    GROUP_BUILD,
    'the production bundle never reaches a development server unless the launcher sets it',
    /VITE_DEV_SERVER_URL/.test(mainBundle) &&
      /localStorage|indexedDB|sessionStorage/.test(readRendererSources()) === false,
  );
  const rendered = await renderRenderer({ ...prepared, bridge: null });
  const renderedText = rendered.text();
  rendered.close();
  check(
    GROUP_BUILD,
    'the production interface contains no development label',
    !/localhost|vite|webpack|dev server|127\.0\.0\.1/i.test(html.replace(/<!--[\s\S]*?-->/g, '')) &&
      !/localhost|vite|webpack|dev server|127\.0\.0\.1/i.test(renderedText),
    renderedText.slice(0, 80),
  );

}

/* -------------------------------------------------------------------------- */
/* 4. Windows release                                                          */
/* -------------------------------------------------------------------------- */

async function verifyWindowsRelease(inputs) {
  const { config, packageJson } = inputs;
  const iconPath = path.join(root, config.win.icon);

  const ico = existsSync(iconPath) ? inspectIco(readFileSync(iconPath)) : { entries: [], problems: ['missing'] };
  const sizes = ico.entries.map((entry) => entry.size);
  check(
    GROUP_RELEASE,
    'the Windows icon is a real multi-resolution icon with the taskbar sizes',
    ico.problems.length === 0 &&
      [16, 32, 48, 256].every((size) => sizes.includes(size)) &&
      ico.entries.some((entry) => entry.format === 'png') &&
      ico.entries.filter((entry) => entry.size < 256).every((entry) => entry.format === 'bmp'),
    `${sizes.join(', ')} ${ico.problems.join('; ')}`,
  );
  check(
    GROUP_RELEASE,
    'the Windows icon also covers the 125 % and 150 % display scalings',
    sizes.includes(20) && sizes.includes(40),
    sizes.join(', '),
  );
  const master = existsSync(path.join(root, 'build/icon.png'))
    ? inspectPng(readFileSync(path.join(root, 'build/icon.png')))
    : null;
  check(
    GROUP_RELEASE,
    'the master PNG for the Linux/macOS targets is a valid 512 px square',
    master !== null && master.width === 512 && master.height === 512 && master.colorType === 6,
    JSON.stringify(master),
  );
  check(
    GROUP_RELEASE,
    'the icon generator is the single source of the artwork and uses the interface palette',
    existsSync(path.join(root, 'scripts/generate-icons.mjs')) &&
      ['#4F46E5', '#4338CA', '#0E7490'].every((hex) =>
        readFileSync(path.join(root, 'scripts/generate-icons.mjs'), 'utf8').includes(hex),
      ),
  );

  const resolved = resolvePackageFiles({ patterns: config.files });
  check(
    GROUP_RELEASE,
    'every configured path exists in the build output',
    resolved.problems.length === 0,
    resolved.problems.join('; '),
  );
  const forbidden = resolved.files.filter((file) =>
    /\.map$|(^|\/)node_modules\/|(^|\/)src\/|(^|\/)scripts\/|(^|\/)electron\/|(^|\/)\.env|(^|\/)build\//.test(file),
  );
  check(
    GROUP_RELEASE,
    `the package would contain only the production bundles (${resolved.files.length} files)`,
    forbidden.length === 0,
    forbidden.slice(0, 4).join('; '),
  );

  const workspace = await mkdtemp(path.join(tmpdir(), 'eda-stage6-'));
  try {
    const archive = path.join(workspace, 'app.asar');
    const entries = await packAsar({ files: resolved.files, destination: archive });
    const archivedFiles = entries.filter((entry) => path.extname(entry) !== '');
    check(
      GROUP_RELEASE,
      'the production bundles pack into a valid asar archive',
      archivedFiles.length === resolved.files.length &&
        ['dist/index.html', 'dist-electron/main.js', 'dist-electron/preload.js', 'package.json'].every((file) =>
          archivedFiles.includes(file),
        ),
      `${entries.length} entries`,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  // Windows file-system hygiene and the absence of application storage.
  const electronSources = await Promise.all(
    ['main.ts', 'preload.ts', 'excel/workbook.ts', 'export/workbook.ts', 'shared/import.ts', 'shared/export.ts'].map(
      (file) => readSource(`electron/${file}`),
    ),
  );
  const mainSource = electronSources[0];
  check(
    GROUP_RELEASE,
    'the main process builds every path with path utilities instead of string concatenation',
    /path\.join\(__dirname/.test(mainSource) &&
      /pathToFileURL\(/.test(mainSource) &&
      /path\.relative\(/.test(mainSource),
  );
  check(
    GROUP_RELEASE,
    'no POSIX-only or development path is assumed anywhere in the application code',
    !/['"`]\/tmp\b/.test(electronSources.join('\n')) &&
      !/['"`]\/usr\//.test(electronSources.join('\n')) &&
      !/Excel-Data-Analyzer|node_modules[^'"]*\/electron/.test(electronSources.join('\n')),
  );
  check(
    GROUP_RELEASE,
    'the application stores no data of its own',
    !/getPath\(|userData|app\.getPath/.test(electronSources.join('\n')) &&
      !/localStorage|indexedDB|sessionStorage|document\.cookie/.test(readRendererSources()) &&
      !/better-sqlite|sqlite3|levelup|lowdb/.test(JSON.stringify(packageJson.dependencies ?? {})),
  );
  const exportSource = await readSource('electron/export/workbook.ts');
  const writerIndex = electronSources.findIndex((source) => source === exportSource);
  const otherSources = electronSources.filter((_source, index) => index !== writerIndex).join('\n');
  check(
    GROUP_RELEASE,
    'the only file the application writes is the export the user chooses',
    // Exactly one write call exists in the privileged process — in the export
    // writer — and its destination is always the path the save dialog returned.
    (otherSources.match(/\bwriteFileSync\(|\bwriteFile\(|createWriteStream\(/g) ?? []).length === 0 &&
      (exportSource.match(/XLSX\.writeFile\(/g) ?? []).length === 1 &&
      /showSaveDialog/.test(mainSource) &&
      /withXlsxExtension\(chosenPath\)/.test(mainSource),
  );

  // Documentation must describe commands that exist, and must not claim a
  // Windows run that never happened.
  const readme = await readSource('README.md');
  const documentedScripts = [...readme.matchAll(/npm run ([a-z:0-9-]+)/g)].map((match) => match[1]);
  const unknownScripts = [...new Set(documentedScripts)].filter(
    (script) => !(script in packageJson.scripts) && script !== 'verify',
  );
  check(
    GROUP_RELEASE,
    'every documented npm script exists',
    unknownScripts.length === 0,
    unknownScripts.join(', '),
  );
  check(
    GROUP_RELEASE,
    'the documentation names the packaging commands of this repository',
    documentedScripts.includes('dist:win') && documentedScripts.includes('release:check'),
  );
  check(
    GROUP_RELEASE,
    'the documentation states where the installer is produced and how it is removed',
    /release\//.test(readme) &&
      /uninstall/i.test(readme) &&
      /Start Menu/i.test(readme) &&
      /Windows Settings/i.test(readme),
  );
  check(
    GROUP_RELEASE,
    'the documentation keeps green, light and development builds distinct from packaged runs',
    /Packaged|packaged/i.test(readme) &&
      /installer/i.test(readme) &&
      !/installer (was|has been) tested/i.test(readme),
  );
  check(
    GROUP_RELEASE,
    'the release check script is part of the repository',
    existsSync(path.join(root, 'scripts/release-check.mjs')) &&
      packageJson.scripts['release:check'] === 'node scripts/release-check.mjs',
  );
  const exportRules = await readSource('electron/shared/export.ts');
  check(
    GROUP_RELEASE,
    'packaging changed none of the export limits',
    /EXPORT_ROW_LIMIT = 250_000/.test(exportRules) && /EXPORT_CELL_LIMIT = 4_000/.test(exportRules),
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function walkRelative(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  // Forward slashes on every platform: the checks below match paths such as
  // `assets/index.js`, and Windows would otherwise produce `assets\index.js`.
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory()
      ? walkRelative(full).map((nested) => toPosixPath(path.join(entry.name, nested)))
      : [entry.name];
  });
}

function readRendererSources() {
  const directory = path.join(root, 'src');
  return walkRelative(directory)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => stripComments(readFileSync(path.join(directory, file), 'utf8')))
    .join('\n');
}

/**
 * Loads the real `dist-electron/main.js` with a mocked Electron module, exactly
 * as the packaged application starts it: no development server, no arguments.
 */
async function loadMainProcessBundle({ Module }) {
  const bundlePath = path.join(root, 'dist-electron/main.js');
  const previousDevServerUrl = process.env.VITE_DEV_SERVER_URL;
  delete process.env.VITE_DEV_SERVER_URL;

  const state = {
    windows: [],
    handlers: new Map(),
    quitCalls: 0,
    themeSource: 'system',
    consoleErrors: [],
    nameCalls: 0,
  };

  class FakeWebContents {
    constructor() {
      this.listeners = new Map();
      this.sent = [];
    }
    on(event, listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    emit(event, ...args) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(...args);
      }
    }
    send() {}
    setWindowOpenHandler() {}
  }

  class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = new FakeWebContents();
      this.listeners = new Map();
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
    once(event, listener) {
      if (event === 'ready-to-show') {
        this.readyToShow = listener;
      }
      if (event === 'closed') {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      }
    }
    on(event, listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    }
    isDestroyed() {
      return false;
    }
    isMaximized() {
      return false;
    }
    isFullScreen() {
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
      quit: () => {
        state.quitCalls += 1;
      },
      exit: (code) => {
        state.exitCode = code;
      },
      isReady: () => true,
      getName: () => {
        state.nameCalls += 1;
        return 'Excel Data Analyzer';
      },
      getVersion: () => '0.2.0-test',
      isPackaged: true,
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: { handle: (channel, handler) => state.handlers.set(channel, handler) },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: '' }),
      showErrorBox: () => {},
    },
    session: { defaultSession: { setPermissionRequestHandler: () => {} } },
    protocol: { registerSchemesAsPrivileged: () => {}, handle: () => {} },
    net: { fetch: async () => new Response('', { status: 200 }) },
    nativeTheme: {
      get themeSource() {
        return state.themeSource;
      },
      set themeSource(value) {
        state.themeSource = value;
      },
    },
    shell: { openExternal: async () => {} },
  };

  // The main process reports startup problems through `console.error`; keeping
  // the override alive lets the suite read them instead of the terminal.
  const originalError = console.error;
  console.error = (...args) => {
    state.consoleErrors.push(args.map((value) => String(value)).join(' '));
  };

  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return electron;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[bundlePath];
  try {
    require(bundlePath);
  } finally {
    Module._load = originalLoad;
  }

  if (previousDevServerUrl === undefined) {
    delete process.env.VITE_DEV_SERVER_URL;
  } else {
    process.env.VITE_DEV_SERVER_URL = previousDevServerUrl;
  }

  // `app.whenReady().then(...)` resolves on the microtask queue: the window is
  // created one tick after the bundle is required.
  await new Promise((resolve) => setTimeout(resolve, 20));

  return {
    state,
    restoreConsole: () => {
      console.error = originalError;
    },
    invoke: async (channel, ...args) => {
      // Errors inside the handlers are captured the way the real process logs
      // them, so the assertions read the behaviour instead of a stack trace.
      const handler = state.handlers.get(channel);
      if (!handler) {
        throw new Error(`no handler for ${channel}`);
      }
      const fakeEvent = { sender: state.windows[0]?.webContents };
      try {
        return await handler(fakeEvent, ...args);
      } catch (error) {
        console.error(`[ipc] ${channel} failed`, error);
        throw error;
      }
    },
  };
}
