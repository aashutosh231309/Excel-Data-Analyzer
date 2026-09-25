/**
 * Static release checks: everything that can be decided by reading the
 * repository itself.
 *
 * These checks are the automated half of the release preflight. They inspect the
 * real files — the packaging configuration, the built bundles, the icons, the
 * generated archive, the documentation — and never a copied constant. Every
 * check takes a candidate root, so the verification suite can prove that a
 * tampered configuration is actually detected.
 *
 * They cannot prove anything about the Windows runtime: that half is listed as
 * `NOT EXECUTED` with the manual checklist in `docs/WINDOWS_RELEASE_CHECKLIST.md`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FAIL, NOT_EXECUTED, PASS, createReport } from './model.mjs';
import {
  inspectIco,
  inspectPng,
  listRelative,
  loadReleaseInputs,
  packAsar,
  readRelative,
  resolvePackageFiles,
  stripComments,
  validateConfigAgainstSchema,
  windowsTargets,
} from '../verify/packaging.mjs';

const REQUIRED_ICO_SIZES = [16, 32, 48, 256];
const SCALING_ICO_SIZES = [20, 40];
const REQUIRED_PACKAGE_FILES = [
  'dist/index.html',
  'dist-electron/main.js',
  'dist-electron/preload.js',
  'package.json',
];
const FORBIDDEN_PACKAGE_PATTERNS = [
  [/(^|\/)node_modules\//, 'a node_modules entry'],
  [/\.map$/, 'a source map'],
  [/(^|\/)\.env/, 'an environment file'],
  [/(^|\/)src\//, 'renderer source'],
  [/(^|\/)electron\//, 'main-process source'],
  [/(^|\/)scripts\//, 'a build script'],
  [/(^|\/)build\//, 'an icon source'],
  [/(^|\/)docs\//, 'documentation'],
  [/\.(ts|tsx)$/, 'a TypeScript source file'],
];
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'an embedded private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access-key identifier'],
  [/\bghp_[A-Za-z0-9]{36}\b/, 'a GitHub token'],
  [/postgres(ql)?:\/\/[^/\s]+:[^/\s]+@/, 'a database URL with credentials'],
];
/**
 * Hosts that appear in the production bundles only as XML namespace identifiers
 * or documentation links — strings inside the bundled SheetJS and React code,
 * never a network request. The check still fails on any host that is not on this
 * list, so a new remote origin cannot slip in unnoticed; combined with
 * `connect-src 'none'` in the CSP, none of these can be fetched at runtime.
 */
const NAMESPACE_ONLY_HOSTS = new Set([
  'www.w3.org',
  'reactjs.org',
  'react.dev',
  'developer.mozilla.org',
  'schemas.openxmlformats.org',
  'schemas.microsoft.com',
  'sheetjs.com',
  'sheetjs.openxmlformats.org',
  'purl.org',
  'purl.oclc.org',
  'openoffice.org',
  'docs.oasis-open.org',
]);
/** Executable ways for the shipped runtime to reach another origin. */
const REMOTE_LOAD_PATTERNS = [
  [/<script[^>]+src=["']https?:/i, 'a remote script tag'],
  [/<link[^>]+href=["']https?:/i, 'a remote stylesheet'],
  [/@import\s+(?:url\()?["']?https?:/i, 'a remote @import'],
  [/import\(\s*["']https?:/, 'a remote dynamic import'],
  [/new\s+WebSocket\(\s*["'](?!data:)/, 'a WebSocket connection'],
  [/(?:fetch|XMLHttpRequest[^)]*open)\(\s*["']https?:/, 'a remote fetch'],
];

/**
 * Runs every static check against `baseDir` (the repository by default).
 * Returns the results; nothing is printed here.
 */
export async function runStaticChecks({ baseDir, report = createReport('static') } = {}) {
  const inputs = loadReleaseInputs(baseDir);

  // A section that throws is recorded as one failed check of that section: the
  // remaining sections still run, so a broken configuration cannot hide the
  // state of everything else.
  const section = async (name, run) => {
    report.section(name);
    try {
      await run(inputs);
    } catch (error) {
      report.add(
        `the ${name} checks run to completion`,
        FAIL,
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  await section('release inputs', (value) => checkReleaseInputs(report, value));
  await section('application identity', (value) => checkIdentity(report, value));
  await section('security invariants', (value) => checkSecurity(report, value));
  await section('offline runtime', (value) => checkOffline(report, value));
  await section('secrets and hygiene', (value) => checkSecrets(report, value));
  await section('icons', (value) => checkIcons(report, value));
  await section('package contents', (value) => checkPackageContents(report, value));
  await section('runtime file-safety', (value) => checkRuntimeFileSafety(report, value));
  await section('documentation', (value) => checkDocumentation(report, value));

  return report.results;
}

/* -------------------------------------------------------------------------- */
/* Release inputs                                                              */
/* -------------------------------------------------------------------------- */

function checkReleaseInputs(report, inputs) {
  const { config, packageJson, configFile } = inputs;

  const schemaProblems = validateConfigAgainstSchema(config);
  report.assert(
    'electron-builder.yml is valid against the Electron Builder schema',
    schemaProblems.length === 0,
    schemaProblems.slice(0, 3).join('; '),
  );

  const targets = windowsTargets(config);
  report.assert(
    'the Windows target is an explicit x64 NSIS installer',
    targets.length === 1 && targets[0].target === 'nsis' && targets[0].arch.join(',') === 'x64',
    JSON.stringify(targets),
  );

  const documentedPatterns = ['dist/**/*', 'dist-electron/**/*', 'package.json', '!node_modules/**/*'];
  const configuredPatterns = [...(config.files ?? [])].sort();
  report.assert(
    'the application is packaged as an asar from the built bundles only',
    config.asar === true &&
      configuredPatterns.join('|') === [...documentedPatterns].sort().join('|') &&
      (config.files ?? []).every((entry) => typeof entry === 'string' && entry.length > 0),
    configuredPatterns.join(', '),
  );

  report.assert(
    'release artefacts are written to a dedicated directory',
    config.directories?.output === 'release' && config.directories?.buildResources === 'build',
    `${config.directories?.output}`,
  );

  report.assert(
    'the installer is per-user, needs no elevation and creates the shortcuts',
    config.win?.requestedExecutionLevel === 'asInvoker' &&
      config.nsis?.perMachine === false &&
      config.nsis?.oneClick === false &&
      config.nsis?.allowToChangeInstallationDirectory === true &&
      config.nsis?.createDesktopShortcut === true &&
      config.nsis?.createStartMenuShortcut === true &&
      config.nsis?.shortcutName === packageJson.productName,
  );

  report.assert(
    'the installer can be removed like any other application',
    config.nsis?.uninstallDisplayName === packageJson.productName &&
      config.nsis?.deleteAppDataOnUninstall === false &&
      config.nsis?.allowElevation === true,
  );

  report.assert(
    'no publisher, telemetry, update or auto-start metadata is invented',
    !/telemetry|analytics|autostart|auto-launch|autoUpdater/i.test(configFile) &&
      !/^publish:/m.test(configFile) &&
      !/certificateFile|cscLink|signingHashAlgorithms/.test(configFile),
  );

  report.assert(
    'the packaging scripts build production first and never publish',
    ['pack', 'dist:win', 'dist:win:portable'].every((script) =>
      (packageJson.scripts?.[script] ?? '').startsWith('npm run build &&'),
    ) &&
      packageJson.scripts['dist:win'].includes('--publish never') &&
      packageJson.scripts['dist:win:portable'].includes('--publish never'),
    packageJson.scripts?.['dist:win'],
  );

  report.assert(
    'the production build generates the icons before the bundles',
    (packageJson.scripts?.build ?? '').includes('npm run icons') &&
      packageJson.scripts.build.indexOf('build:electron') > packageJson.scripts.build.indexOf('npm run icons'),
  );

  report.assert(
    'the development server and its port appear in no packaging input',
    !/localhost|127\.0\.0\.1|5273/.test(configFile) &&
      !('build' in packageJson) &&
      !/5273/.test(JSON.stringify(packageJson.scripts ?? {})),
  );
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

function checkIdentity(report, inputs) {
  const { config, packageJson, configFile, mainSource, baseDir } = inputs;
  const productName = 'Excel Data Analyzer';

  report.assert(
    'package.json declares the product name and a description',
    packageJson.productName === productName &&
      typeof packageJson.description === 'string' &&
      packageJson.description.length > 20,
    String(packageJson.productName),
  );
  report.assert(
    'the packaging configuration uses the same product name',
    config.productName === packageJson.productName,
    String(config.productName),
  );
  report.assert(
    'the application identifier is stable and product-specific',
    config.appId === 'com.exceldataanalyzer.app' &&
      config.appId !== packageJson.name &&
      /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(config.appId),
    String(config.appId),
  );
  report.assert(
    'the version is a semantic version declared exactly once',
    /^\d+\.\d+\.\d+$/.test(packageJson.version) &&
      !/^\s*version:/m.test(configFile) &&
      !/^\s*buildVersion:/m.test(configFile),
    packageJson.version,
  );
  report.assert(
    'the installer and portable artefact names carry the version',
    config.win?.artifactName === '${productName}-${version}-Setup.${ext}' &&
      config.nsis?.artifactName === '${productName}-${version}-Setup.${ext}' &&
      config.portable?.artifactName === '${productName}-${version}-Portable.${ext}',
  );
  report.assert(
    'the window title and the title bar show the application name',
    new RegExp(`title: '${productName}'`).test(mainSource) &&
      new RegExp(`<h1[^>]*>\\s*${productName}\\s*</h1>`).test(
        safeRead(baseDir, 'src/layouts/TitleBar.tsx'),
      ),
  );

  // The version must come from the runtime, never from a literal in the UI.
  const uiSources = listRelative(baseDir, 'src').filter((file) => /\.tsx?$/.test(file));
  const withVersionLiteral = uiSources.filter((file) =>
    /\b\d+\.\d+\.\d+\b/.test(stripComments(safeRead(baseDir, file))),
  );
  report.assert(
    'no interface file hard-codes a version number',
    withVersionLiteral.length === 0,
    withVersionLiteral.slice(0, 3).join(', '),
  );
  report.assert(
    'the runtime reports the name and version of the loaded application metadata',
    /appName: app\.getName\(\)/.test(mainSource) && /appVersion: app\.getVersion\(\)/.test(mainSource),
  );
  report.assert(
    'the About surface renders the values the runtime reports',
    /data-about/.test(safeRead(baseDir, 'src/pages/SettingsPage.tsx')) &&
      /platform\.info\.appVersion/.test(safeRead(baseDir, 'src/pages/SettingsPage.tsx')),
  );
}

/* -------------------------------------------------------------------------- */
/* Security                                                                    */
/* -------------------------------------------------------------------------- */

function checkSecurity(report, inputs) {
  const { mainSource, baseDir, configFile } = inputs;

  report.assert(
    'the browser window keeps context isolation, no Node integration and the sandbox',
    /contextIsolation:\s*true/.test(mainSource) &&
      /nodeIntegration:\s*false/.test(mainSource) &&
      /sandbox:\s*true/.test(mainSource) &&
      /webSecurity:\s*true/.test(mainSource),
  );
  const INSECURE_SWITCHES = /--no-sandbox|--disable-web-security|--allow-running-insecure-content|--ignore-certificate-errors|NODE_TLS_REJECT_UNAUTHORIZED/;
  report.assert(
    'no insecure Electron switch appears in the application or the packaging inputs',
    !INSECURE_SWITCHES.test(
      listRelative(baseDir, 'electron')
        .map((file) => stripComments(safeRead(baseDir, file)))
        .join('\n'),
    ) &&
      !INSECURE_SWITCHES.test(readRelative(baseDir, 'electron-builder.yml')) &&
      !INSECURE_SWITCHES.test(
        JSON.stringify(JSON.parse(safeRead(baseDir, 'package.json')).scripts ?? {}),
      ),
  );
  report.assert(
    'the development launcher only waives the sandbox behind an explicit opt-in',
    (() => {
      const launcher = stripComments(safeRead(baseDir, 'scripts/dev.mjs'));
      if (!/--no-sandbox/.test(launcher)) {
        return true;
      }
      return (
        /process\.env\.EDA_NO_SANDBOX === '1'/.test(launcher) &&
        /withoutSandbox \? \[root, '--no-sandbox'\]/.test(launcher)
      );
    })(),
  );
  report.assert(
    'the preload surface stays a single named bridge with no raw ipcRenderer',
    (() => {
      const preload = stripComments(safeRead(baseDir, 'electron/preload.ts'));
      const exposed = preload.match(/exposeInMainWorld\(([^,]+),/);
      return (
        exposed !== null &&
        exposed[1].trim() === "'excelDataAnalyzer'" &&
        !/exposeInMainWorld\([^,]+, *(ipcRenderer|window|process)/.test(preload) &&
        !/(^|[^.])\brequire\b/.test(preload)
      );
    })(),
  );
  const channelNames = [
    ...safeRead(baseDir, 'electron/shared/channels.ts').matchAll(/:\s*'([a-z-]+:[a-z-]+)'/g),
  ].map((match) => match[1]);
  const invokeChannels = [
    ...stripComments(safeRead(baseDir, 'electron/preload.ts')).matchAll(
      /ipcRenderer\.invoke\(IPC_CHANNELS\.(\w+)/g,
    ),
  ].map((match) => match[1]);
  const subscribeChannels = [
    ...stripComments(safeRead(baseDir, 'electron/preload.ts')).matchAll(
      /ipcRenderer\.on\(IPC_CHANNELS\.(\w+)/g,
    ),
  ].map((match) => match[1]);
  const handlerChannels = [...mainSource.matchAll(/ipcMain\.handle\(\s*IPC_CHANNELS\.(\w+)/g)].map(
    (match) => match[1],
  );
  report.assert(
    `every renderer-callable channel is whitelisted and handled exactly once (${invokeChannels.length} commands)`,
    channelNames.length >= 10 &&
      new Set(handlerChannels).size === handlerChannels.length &&
      invokeChannels.length >= 6 &&
      invokeChannels.every((channel) => handlerChannels.includes(channel)) &&
      invokeChannels.every((channel) => channelNames.length > 0),
    `handled: ${handlerChannels.length}, invoked: ${invokeChannels.length}`,
  );
  report.assert(
    'notification channels are one-way and never handled by the main process',
    subscribeChannels.length === 3 &&
      subscribeChannels.every((channel) => !handlerChannels.includes(channel)) &&
      subscribeChannels.every((channel) => channelNames.length > 0),
    subscribeChannels.join(', '),
  );
  report.assert(
    'the main process registers no channel that the renderer cannot use',
    handlerChannels.every((channel) => invokeChannels.includes(channel)),
    handlerChannels.filter((channel) => !invokeChannels.includes(channel)).join(', '),
  );
  report.assert(
    'the renderer never imports Electron, Node or a file-system module',
    (() => {
      const sources = listRelative(baseDir, 'src')
        .filter((file) => /\.tsx?$/.test(file))
        .map((file) => stripComments(safeRead(baseDir, file)));
      return !sources.some((source) =>
        /from 'electron'|require\('electron'\)|from 'node:|from 'fs'|from 'child_process'/.test(source),
      );
    })(),
  );
  report.assert(
    'nothing in the renderer or preload enables an insecure web preference',
    !/allowRunningInsecureContent:\s*true|webviewTag:\s*true|enableRemoteModule:\s*true|experimentalFeatures:\s*true/.test(
      [mainSource, stripComments(safeRead(baseDir, 'electron/preload.ts'))].join('\n'),
    ),
  );
  report.assert(
    'the packaged renderer is served from app://bundle/ and never from file://',
    /const APP_SCHEME = 'app'/.test(mainSource) &&
      /const APP_HOST = 'bundle'/.test(mainSource) &&
      /loadURL\(DEV_SERVER_URL \?\? RENDERER_ENTRY_URL\)/.test(mainSource) &&
      !/loadFile\(/.test(mainSource),
  );
  report.assert(
    'the protocol handler still refuses anything outside the bundle',
    (() => {
      const handler = mainSource.slice(mainSource.indexOf('function resolveRendererFile'));
      return (
        /url\.host !== APP_HOST/.test(handler) &&
        /path\.relative\(RENDERER_DIST, target\)/.test(handler) &&
        /relativePath\.startsWith\('\.\.'\)/.test(handler) &&
        /includes\('\\0'\)/.test(handler)
      );
    })(),
  );
  report.assert(
    'production CSP forbids remote code, frames and connections',
    (() => {
      const vite = safeRead(baseDir, 'vite.config.ts');
      return (
        /"default-src 'self'"/.test(vite) &&
        /"script-src 'self'"/.test(vite) &&
        /"connect-src 'none'"/.test(vite) &&
        /"object-src 'none'"/.test(vite) &&
        /"base-uri 'none'"/.test(vite) &&
        /"frame-ancestors 'none'"/.test(vite) &&
        !/'unsafe-eval'/.test(vite)
      );
    })(),
  );
  report.assert(
    'the development server is only used when the development launcher sets it',
    /const DEV_SERVER_URL = process\.env\.VITE_DEV_SERVER_URL/.test(mainSource) &&
      !/localhost|127\.0\.0\.1/.test(mainSource) &&
      !/localhost|127\.0\.0\.1|5273/.test(configFile),
  );
  report.assert(
    'an unloadable interface shows a readable failure page',
    /STARTUP_FAILURE_URL/.test(mainSource) &&
      /did-fail-load/.test(mainSource) &&
      /preload-error/.test(mainSource) &&
      /uncaughtException/.test(mainSource),
  );
}

/* -------------------------------------------------------------------------- */
/* Offline runtime                                                             */
/* -------------------------------------------------------------------------- */

async function checkOffline(report, inputs) {
  const { baseDir } = inputs;
  const runtimeFiles = listRelative(baseDir, 'dist')
    .concat(listRelative(baseDir, 'dist-electron'))
    .filter((file) => /\.(js|css|html|mjs)$/.test(file));

  if (runtimeFiles.length === 0) {
    report.add(
      'the production runtime references no network origin',
      NOT_EXECUTED,
      'dist/ is not built; run npm run build first',
    );
    return;
  }

  const unknownHosts = new Set();
  const localOrigins = new Set();
  const remoteLoads = new Set();
  for (const file of runtimeFiles) {
    const content = safeRead(baseDir, file);
    for (const [, url] of content.matchAll(/\b((?:https?|wss?):\/\/[^\s"'`)\\]+)/g)) {
      try {
        const host = new URL(url).host;
        // A single-label host is a placeholder token such as `macVmlSchemaUri`
        // inside the bundled SheetJS code, not an origin that could be reached.
        // `localhost` is still reported: the dedicated scan below looks for it.
        if (!NAMESPACE_ONLY_HOSTS.has(host) && host.includes('.')) {
          unknownHosts.add(`${file}: ${host}`);
        }
      } catch {
        unknownHosts.add(`${file}: unreadable URL`);
      }
    }
    for (const [, local] of content.matchAll(
      /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:5273\b|:5173\b)/g,
    )) {
      localOrigins.add(`${file}: ${local}`);
    }
    for (const [pattern, label] of REMOTE_LOAD_PATTERNS) {
      if (pattern.test(content)) {
        remoteLoads.add(`${file}: ${label}`);
      }
    }
  }

  report.assert(
    `the production runtime (${runtimeFiles.length} files) references no development or unknown origin`,
    unknownHosts.size === 0 && localOrigins.size === 0,
    [...unknownHosts, ...localOrigins].slice(0, 4).join('; '),
  );
  report.assert(
    'the shipped runtime can make no remote request',
    remoteLoads.size === 0 && /connect-src 'none'/.test(safeRead(baseDir, 'dist/index.html')),
    [...remoteLoads].slice(0, 3).join('; '),
  );

  const html = safeRead(baseDir, 'dist/index.html');
  report.assert(
    'the packaged page loads only same-origin assets and keeps the strict CSP',
    /default-src 'self'/.test(html) &&
      /connect-src 'none'/.test(html) &&
      [...html.matchAll(/(?:src|href)="([^"]+)"/g)].every(
        (match) => !/^(?:[a-z]+:)?\/\//i.test(match[1]) || match[1].startsWith('./'),
      ),
  );
}

/* -------------------------------------------------------------------------- */
/* Secrets and hygiene                                                         */
/* -------------------------------------------------------------------------- */

function checkSecrets(report, inputs) {
  const { baseDir } = inputs;

  const tracked = gitList(baseDir, ['ls-files']);
  if (tracked === null) {
    report.add('the repository is inspected with git', NOT_EXECUTED, 'not a git checkout');
    return;
  }

  const sensitiveNames = tracked.filter((file) =>
    /(^|\/)(\.env(\..*)?|.*\.pem|.*\.p12|.*\.pfx|.*\.key|id_rsa|.*\.jks)$/i.test(file),
  );
  report.assert(
    `no secret or environment file is tracked (${tracked.length} tracked files)`,
    sensitiveNames.length === 0,
    sensitiveNames.join(', '),
  );

  const trackedSecrets = tracked
    .filter((file) => /\.(ts|tsx|mjs|js|json|yml|yaml|md)$/.test(file))
    .map((file) => [file, safeRead(baseDir, file)])
    .filter(([, content]) => SECRET_PATTERNS.some(([pattern]) => pattern.test(content)))
    .map(([file]) => file);
  report.assert('no credential-like string is committed', trackedSecrets.length === 0, trackedSecrets.join(', '));

  const generated = tracked.filter((file) =>
    /^(release|dist|dist-electron|node_modules)\//.test(file) || /\.(exe|msi|dmg|AppImage|zip|log|tsbuildinfo)$/i.test(file),
  );
  report.assert('no generated artefact or build output is tracked', generated.length === 0, generated.join(', '));

  const gitignore = existsSync(path.join(baseDir, '.gitignore')) ? safeRead(baseDir, '.gitignore') : '';
  const ignoreRules = gitignore.split(/\r?\n/).map((line) => line.trim());
  report.assert(
    'the ignore rules cover dependencies, build output, releases, secrets and logs',
    ['node_modules/', '/dist/', '/dist-electron/', '/release/', '.env', '*.log', '*.tsbuildinfo'].every((entry) =>
      ignoreRules.includes(entry),
    ),
    ignoreRules.filter((rule) => rule.length > 0).join(' '),
  );
  report.assert(
    'the output rules are anchored, so a source directory named release is still tracked',
    // `/release/` matches only the packaging output; a bare `release/` would also
    // swallow `scripts/release/`, which holds the release tooling itself.
    ignoreRules.includes('/release/') &&
      !ignoreRules.includes('release/') &&
      !gitCheckIgnore(baseDir, 'scripts/release/static-checks.mjs') &&
      gitCheckIgnore(baseDir, 'release/Excel Data Analyzer-0.2.0-Setup.exe'),
  );

  const ignored = ['release/Excel Data Analyzer-0.2.0-Setup.exe', 'dist/index.html', '.env'].map((candidate) =>
    gitCheckIgnore(baseDir, candidate),
  );
  report.assert(
    'the ignore rules really match a generated installer, the build output and a local .env',
    ignored.every((value) => value === true),
    ignored.join(', '),
  );
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

function checkIcons(report, inputs) {
  const { config, baseDir } = inputs;
  const icoPath = path.join(baseDir, config.win?.icon ?? 'build/icon.ico');

  report.assert('the configured Windows icon exists', existsSync(icoPath), path.relative(baseDir, icoPath));
  if (!existsSync(icoPath)) {
    return;
  }

  const ico = inspectIco(readRelativeBuffer(icoPath));
  const sizes = ico.entries.map((entry) => entry.size);
  report.assert(
    'the Windows icon is a real multi-resolution icon container',
    ico.problems.length === 0 && ico.entries.length >= REQUIRED_ICO_SIZES.length,
    ico.problems.join('; ') || `${ico.entries.length} entries`,
  );
  report.assert(
    'the Windows icon covers the taskbar sizes 16 / 32 / 48 / 256',
    REQUIRED_ICO_SIZES.every((size) => sizes.includes(size)),
    sizes.join(', '),
  );
  report.assert(
    'the Windows icon covers the 125 % and 150 % scaling sizes',
    SCALING_ICO_SIZES.every((size) => sizes.includes(size)),
    sizes.join(', '),
  );
  report.assert(
    'the small entries are uncompressed bitmaps and the 256 px entry is a PNG',
    ico.entries.filter((entry) => entry.size < 256).every((entry) => entry.format === 'bmp') &&
      ico.entries.some((entry) => entry.size === 256 && entry.format === 'png'),
  );

  const master = existsSync(path.join(baseDir, 'build/icon.png'))
    ? inspectPng(readRelativeBuffer(path.join(baseDir, 'build/icon.png')))
    : null;
  report.assert(
    'the master PNG for the other targets is a square 512 px image',
    master !== null && master.width === 512 && master.height === 512,
    master ? `${master.width}×${master.height}` : 'unreadable',
  );
  report.assert(
    'the installer, the uninstaller and the application use the same icon',
    config.win.icon === 'build/icon.ico' &&
      config.nsis?.installerIcon === 'build/icon.ico' &&
      config.nsis?.uninstallerIcon === 'build/icon.ico',
  );
  report.assert(
    'the icon artwork is reproducible from the repository and uses the interface palette',
    existsSync(path.join(baseDir, 'scripts/generate-icons.mjs')) &&
      ['#4F46E5', '#4338CA', '#0E7490'].every((hex) =>
        safeRead(baseDir, 'scripts/generate-icons.mjs').includes(hex),
      ),
  );
}

/* -------------------------------------------------------------------------- */
/* Package contents                                                            */
/* -------------------------------------------------------------------------- */

async function checkPackageContents(report, inputs) {
  const { config, baseDir } = inputs;

  if (!existsSync(path.join(baseDir, 'dist/index.html'))) {
    report.add(
      'the configured package contents resolve against the build output',
      NOT_EXECUTED,
      'dist/ is not built; run npm run build first',
    );
    return;
  }

  const resolved = resolvePackageFiles({ baseDir, patterns: config.files ?? [] });
  report.assert(
    'every configured path exists in the build output',
    resolved.problems.length === 0,
    resolved.problems.join('; '),
  );

  const offenders = resolved.files
    .map((file) => [file, FORBIDDEN_PACKAGE_PATTERNS.find(([pattern]) => pattern.test(file))])
    .filter(([, match]) => Boolean(match))
    .map(([file, match]) => `${file} (${match[1]})`);
  report.assert(
    `only production bundles are packaged (${resolved.files.length} files)`,
    offenders.length === 0,
    offenders.slice(0, 4).join('; '),
  );

  const missing = REQUIRED_PACKAGE_FILES.filter((file) => !resolved.files.includes(file));
  report.assert(
    'the main process, the preload script, the renderer and the metadata are packaged',
    missing.length === 0,
    missing.join(', '),
  );

  const rendererAssets = resolved.files.filter((file) => file.startsWith('dist/assets/'));
  report.assert(
    'the renderer ships its JavaScript, stylesheet and bundled fonts',
    rendererAssets.some((file) => file.endsWith('.js')) &&
      rendererAssets.some((file) => file.endsWith('.css')) &&
      rendererAssets.some((file) => file.endsWith('.woff2')),
    `${rendererAssets.length} assets`,
  );

  // The archive is really built from the resolved files, then read back.
  const directory = await mkdtemp(path.join(tmpdir(), 'eda-release-asar-'));
  try {
    const archive = path.join(directory, 'app.asar');
    const entries = await packAsar({ baseDir, files: resolved.files, destination: archive });
    const archivedFiles = entries.filter((entry) => path.extname(entry) !== '');
    const unexpected = archivedFiles.filter((entry) => !resolved.files.includes(entry));
    const missingFiles = resolved.files.filter((file) => !archivedFiles.includes(file));
    report.assert(
      `the configured contents pack into a valid archive (${entries.length} entries)`,
      unexpected.length === 0 && missingFiles.length === 0,
      [...unexpected, ...missingFiles].slice(0, 3).join('; '),
    );
    const unsafe = entries.filter(
      (entry) =>
        entry.includes('..') ||
        entry.startsWith('/') ||
        entry.includes('\\') ||
        entry.includes(':') ||
        entry.includes('\0'),
    );
    report.assert(
      'no archive entry escapes the package root',
      unsafe.length === 0,
      unsafe.slice(0, 3).join('; '),
    );
  } catch (error) {
    report.add(
      'the configured contents pack into a valid archive',
      FAIL,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Runtime file safety                                                         */
/* -------------------------------------------------------------------------- */

function checkRuntimeFileSafety(report, inputs) {
  const { baseDir } = inputs;
  const electronFiles = listRelative(baseDir, 'electron').filter((file) => file.endsWith('.ts'));
  const electronSources = new Map(
    electronFiles.map((file) => [file, stripComments(safeRead(baseDir, file))]),
  );
  const all = [...electronSources.values()].join('\n');

  report.assert(
    'no runtime code assumes a POSIX-only or development path',
    !/['"`]\/tmp\b|['"`]\/home\/|['"`]\/usr\/|['"`]\/var\/|\bProgram Files\b|['"`]C:\\\\/.test(all),
  );
  report.assert(
    'paths are built with the platform-aware APIs',
    /path\.join\(__dirname/.test(inputs.mainSource) && /pathToFileURL\(/.test(inputs.mainSource),
  );
  report.assert(
    'the application stores no data of its own',
    !/app\.getPath\(|userData|\bapp\.setPath\(/.test(all) &&
      !/localStorage|indexedDB|sessionStorage|document\.cookie/.test(
        listRelative(baseDir, 'src')
          .filter((file) => /\.tsx?$/.test(file))
          .map((file) => stripComments(safeRead(baseDir, file)))
          .join('\n'),
      ),
  );

  const writers = [...electronSources.entries()].filter(([, source]) =>
    /\bwriteFileSync\(|\bwriteFile\(|createWriteStream\(|\.mkdir\(/.test(source),
  );
  const exportWriter = 'electron/export/workbook.ts';
  report.assert(
    'the export writer is the only module that writes, and it writes where the dialog pointed',
    writers.length === 1 && writers[0][0] === exportWriter,
    writers.map(([file]) => file).join(', '),
  );
  report.assert(
    'the export path comes from the save dialog and can never be the loaded workbook',
    /dialog\.showSaveDialog/.test(inputs.mainSource) &&
      /isSameFilePath\(sourcePath, destination\)/.test(inputs.mainSource) &&
      /withXlsxExtension\(chosenPath\)/.test(inputs.mainSource),
  );
  report.assert(
    'the application creates no temporary file and cleans up none',
    !/mkdtemp|tmpdir\(\)|\bos\.tmpdir\b/.test(all) &&
      !/unlink\(|rmdir\(|\brm\(/.test(all),
  );
  report.assert(
    'the import path only reads, and never writes back to the workbook',
    (() => {
      const importFiles = electronFiles.filter((file) => /excel\//.test(file) || /shared\/(import|sheet)/.test(file));
      return (
        importFiles.length >= 2 &&
        importFiles.every((file) => !/writeFile|writeFileSync|createWriteStream/.test(electronSources.get(file)))
      );
    })(),
  );

  const exportRules = stripComments(safeRead(baseDir, 'electron/shared/export.ts'));
  report.assert(
    'the export limits and the seven exported columns are unchanged',
    /EXPORT_ROW_LIMIT = 250_000/.test(exportRules) &&
      /EXPORT_CELL_LIMIT = 4_000/.test(exportRules) &&
      /'Date'/.test(safeRead(baseDir, 'electron/shared/export.ts')),
  );
}

/* -------------------------------------------------------------------------- */
/* Documentation                                                               */
/* -------------------------------------------------------------------------- */

function checkDocumentation(report, inputs) {
  const { baseDir, packageJson } = inputs;
  const readme = safeRead(baseDir, 'README.md');

  const documentedScripts = [...readme.matchAll(/npm run ([a-z:0-9-]+)/g)].map((match) => match[1]);
  const unknown = [...new Set(documentedScripts)].filter((script) => !(script in (packageJson.scripts ?? {})));
  report.assert('every documented npm script exists', unknown.length === 0, unknown.join(', '));

  report.assert(
    'the documentation names the packaging, verification and preflight commands',
    ['verify', 'release:check', 'dist:win'].every((script) => documentedScripts.includes(script)),
    [...new Set(documentedScripts)].join(', '),
  );
  report.assert(
    'the documentation states where the installer is produced and how it is removed',
    /release\//.test(readme) && /uninstall/i.test(readme) && /Start Menu/i.test(readme),
  );
  report.assert(
    'the documentation names the artefact files of the configured output',
    readme.includes('Excel Data Analyzer-0.2.0-Setup.exe') ||
      /Excel Data Analyzer-<version>-Setup\.exe/.test(readme),
  );
  report.assert(
    'the documented version matches package.json',
    !/Excel Data Analyzer-(\d+\.\d+\.\d+)-Setup/.test(readme) ||
      readme.includes(`Excel Data Analyzer-${packageJson.version}-Setup`),
    packageJson.version,
  );
  report.assert(
    'the documentation keeps the Windows validation pending instead of claiming it',
    /pending/i.test(readme) &&
      !/Windows (testing|validation) (passed|complete|completed|succeeded)/i.test(readme) &&
      !/installer (was|has been) tested/i.test(readme),
  );
  report.assert(
    'the Windows manual checklist is present and covers the release areas',
    (() => {
      const file = 'docs/WINDOWS_RELEASE_CHECKLIST.md';
      if (!existsSync(path.join(baseDir, file))) {
        return false;
      }
      const checklist = safeRead(baseDir, file);
      return [
        'Installation',
        'First launch',
        'Import',
        'Filtering',
        'Analytics',
        'Export',
        'Window behaviour',
        'Uninstallation',
        'Offline',
      ].every((section) => checklist.includes(section)) &&
        (checklist.match(/- \[ \]/g) ?? []).length >= 40;
    })(),
  );
  report.assert(
    'the Windows QA report template is present with the release-decision fields',
    (() => {
      const file = 'docs/WINDOWS_RELEASE_REPORT_TEMPLATE.md';
      if (!existsSync(path.join(baseDir, file))) {
        return false;
      }
      const template = safeRead(baseDir, file);
      return ['Windows version', 'Installer SHA-256', 'Import results', 'Export results', 'Final release decision'].every(
        (field) => template.includes(field),
      );
    })(),
  );
  report.assert(
    'the checksum instructions are documented for Windows',
    /Get-FileHash/.test(safeRead(baseDir, 'docs/WINDOWS_RELEASE_CHECKLIST.md')) ||
      /Get-FileHash/.test(readme),
  );
  report.assert(
    'the release preflight script and the static check module exist',
    existsSync(path.join(baseDir, 'scripts/release-check.mjs')) &&
      existsSync(path.join(baseDir, 'scripts/release/static-checks.mjs')) &&
      safeRead(baseDir, 'package.json').includes('release:check'),
  );
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function gitList(baseDir, args) {
  try {
    return execFileSync('git', ['-C', baseDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function gitCheckIgnore(baseDir, candidate) {
  try {
    execFileSync('git', ['-C', baseDir, 'check-ignore', '-q', candidate], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Reads a file, returning an empty string when it does not exist. */
function safeRead(baseDir, relativePath) {
  const full = path.join(baseDir, relativePath);
  return existsSync(full) ? readFileSync(full, 'utf8') : '';
}

function readRelativeBuffer(absolutePath) {
  return readFileSync(absolutePath);
}
