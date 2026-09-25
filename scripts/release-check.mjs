#!/usr/bin/env node
/**
 * Release validation for the Windows build.
 *
 *   npm run release:check
 *
 * The script inspects the real release inputs — the packaging configuration, the
 * generated icons, the production bundles and the archive contents — against the
 * invariants a release depends on. It never launches Electron and never touches
 * the network, so it runs anywhere Node.js runs.
 *
 * It is deliberately *not* a substitute for building the installer on Windows:
 * it proves configuration correctness, not runtime behaviour.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  inspectIco,
  inspectPng,
  loadReleaseInputs,
  packAsar,
  resolvePackageFiles,
  root,
  validateConfigAgainstSchema,
  windowsTargets,
} from './verify/packaging.mjs';

const REQUIRED_ICO_SIZES = [16, 32, 48, 256];
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
];

const results = [];
function check(section, name, passed, detail = '') {
  results.push({ section, name, passed: Boolean(passed), detail });
}
function skip(section, name, reason) {
  results.push({ section, name, passed: true, skipped: true, detail: reason });
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

const inputs = loadReleaseInputs();
const { config, packageJson, mainSource, configText } = inputs;
const identitySection = 'application identity';
const configSection = 'packaging configuration';

const schemaProblems = validateConfigAgainstSchema(config);
check(
  configSection,
  'electron-builder.yml matches the Electron Builder schema',
  schemaProblems.length === 0,
  schemaProblems.slice(0, 3).join('; '),
);

check(
  identitySection,
  'the application name is "Excel Data Analyzer"',
  packageJson.productName === 'Excel Data Analyzer' && config.productName === 'Excel Data Analyzer',
  `${packageJson.productName} / ${config.productName}`,
);
check(
  identitySection,
  'the application identifier is a stable reverse-domain identifier',
  /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/.test(String(config.appId)) &&
    !/example|test|changeme|todo/i.test(String(config.appId)),
  String(config.appId),
);
check(
  identitySection,
  'the version is valid and declared once',
  /^\d+\.\d+\.\d+$/.test(packageJson.version) &&
    !/"version"\s*:/.test(configText) &&
    !/\b\d+\.\d+\.\d+\b/.test(configText.replace(/^\s*#.*$/gm, '')),
  packageJson.version,
);
check(
  identitySection,
  'the window title matches the application name',
  /title:\s*'Excel Data Analyzer'/.test(mainSource),
);
check(
  identitySection,
  'the installer carries the current version in its artifact name',
  config.win?.artifactName === '${productName}-${version}-Setup.${ext}' &&
    config.nsis?.artifactName === '${productName}-${version}-Setup.${ext}',
  String(config.win?.artifactName),
);

/* -------------------------------------------------------------------------- */
/* Windows target and installer                                                */
/* -------------------------------------------------------------------------- */

const targets = windowsTargets(config);
check(
  configSection,
  'a Windows target is declared explicitly',
  targets.some((entry) => entry.target === 'nsis' && entry.arch.includes('x64')),
  JSON.stringify(targets),
);
check(
  configSection,
  'the installer asks for no elevation',
  config.win?.requestedExecutionLevel === 'asInvoker',
  String(config.win?.requestedExecutionLevel),
);
check(
  configSection,
  'the installer is per-user and installs a Start Menu entry',
  config.nsis?.perMachine === false &&
    config.nsis?.createStartMenuShortcut === true &&
    config.nsis?.shortcutName === 'Excel Data Analyzer',
);
check(
  configSection,
  'the installer offers a normal uninstall with the correct display name',
  config.nsis?.uninstallDisplayName === 'Excel Data Analyzer' &&
    config.nsis?.allowElevation === true &&
    config.nsis?.deleteAppDataOnUninstall === false,
);
check(
  configSection,
  'the installer and the uninstaller use the generated icon',
  config.nsis?.installerIcon === 'build/icon.ico' &&
    config.nsis?.uninstallerIcon === 'build/icon.ico',
);
check(
  configSection,
  'the build is reproducible and never publishes',
  packageJson.scripts['dist:win']?.includes('--publish never') &&
    packageJson.scripts['dist:win']?.includes('--x64'),
  packageJson.scripts['dist:win'],
);
check(
  configSection,
  'a portable build is offered as its own command',
  packageJson.scripts['dist:win:portable']?.includes('--win portable') &&
    config.portable?.artifactName === '${productName}-${version}-Portable.${ext}',
  packageJson.scripts['dist:win:portable'],
);
check(
  configSection,
  'release artifacts land in a dedicated output directory',
  config.directories?.output === 'release' && config.directories?.buildResources === 'build',
);
check(
  configSection,
  'the application is packaged as an asar archive',
  config.asar === true,
);

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

const iconSection = 'icons';
const icoPath = path.join(root, config.win?.icon ?? 'build/icon.ico');
check(iconSection, 'the configured Windows icon exists', existsSync(icoPath), icoPath);
if (existsSync(icoPath)) {
  const ico = inspectIco(readFileSync(icoPath));
  check(
    iconSection,
    'the Windows icon is a real multi-resolution .ico container',
    ico.problems.length === 0 && ico.entries.length >= REQUIRED_ICO_SIZES.length,
    ico.problems.join('; ') || `${ico.entries.length} entries`,
  );
  const sizes = ico.entries.map((entry) => entry.size);
  check(
    iconSection,
    `the Windows icon covers 16/32/48/256 px (${sizes.join(', ')})`,
    REQUIRED_ICO_SIZES.every((size) => sizes.includes(size)),
    sizes.join(', '),
  );
  check(
    iconSection,
    'the small entries are uncompressed bitmaps and the 256 px entry is a PNG',
    ico.entries.filter((entry) => entry.size < 256).every((entry) => entry.format === 'bmp') &&
      ico.entries.some((entry) => entry.size === 256 && entry.format === 'png'),
  );
}
const masterPng = inspectPng(existsSync(path.join(root, 'build/icon.png')) ? readFileSync(path.join(root, 'build/icon.png')) : Buffer.alloc(0));
check(
  iconSection,
  'the master PNG is a square 512 px image for the Linux/macOS targets',
  masterPng !== null && masterPng.width === 512 && masterPng.height === 512,
  masterPng ? `${masterPng.width}×${masterPng.height}` : 'unreadable',
);

/* -------------------------------------------------------------------------- */
/* Security                                                                    */
/* -------------------------------------------------------------------------- */

const securitySection = 'security';
check(
  securitySection,
  'the packaged renderer is served from app://bundle/',
  /const APP_SCHEME = 'app'/.test(mainSource) &&
    /const APP_HOST = 'bundle'/.test(mainSource) &&
    /RENDERER_ENTRY_URL = `\$\{RENDERER_ORIGIN\}\/index\.html`/.test(mainSource),
);
check(
  securitySection,
  'no file:// renderer path exists anywhere in the packaging inputs',
  !/loadFile\(/.test(mainSource) &&
    !/'file:\/\//.test(mainSource) &&
    !/file:\/\//.test(configText) &&
    !/file:\/\//.test(JSON.stringify(packageJson.scripts)),
);
check(
  securitySection,
  'the browser window keeps the hardened web preferences',
  /contextIsolation:\s*true/.test(mainSource) &&
    /nodeIntegration:\s*false/.test(mainSource) &&
    /sandbox:\s*true/.test(mainSource) &&
    /webSecurity:\s*true/.test(mainSource),
);
check(
  securitySection,
  'the development server is only used when the dev launcher sets the variable',
  /const DEV_SERVER_URL = process\.env\.VITE_DEV_SERVER_URL/.test(mainSource) &&
    /void window\.loadURL\(DEV_SERVER_URL \?\? RENDERER_ENTRY_URL\)/.test(mainSource),
);
check(
  securitySection,
  'the protocol handler keeps the traversal guard',
  /startsWith\(`\$\{APP_SCHEME\}:\/\/\$\{APP_HOST\}\/`\)/.test(mainSource) ||
    /relative\(/.test(mainSource.slice(mainSource.indexOf('function registerRendererProtocol'))),
);

const distIndex = path.join(root, 'dist/index.html');
if (existsSync(distIndex)) {
  const html = readFileSync(distIndex, 'utf8');
  check(
    securitySection,
    'the production renderer ships a strict CSP and no remote or dev origin',
    /http-equiv="Content-Security-Policy"/.test(html) &&
      /default-src 'self'/.test(html) &&
      !/localhost|127\.0\.0\.1|https?:\/\/(?!www\.w3\.org)/.test(html),
  );
} else {
  skip(securitySection, 'the production renderer ships a strict CSP', 'dist/ is not built yet');
}

/* -------------------------------------------------------------------------- */
/* Package contents                                                            */
/* -------------------------------------------------------------------------- */

const packageSection = 'package contents';
const isIgnored = (() => {
  try {
    execFileSync('git', ['check-ignore', '-q', 'release/example.exe'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
check(packageSection, 'the output directory is ignored by git', isIgnored, 'release/');
const trackedRelease = (() => {
  try {
    return execFileSync('git', ['ls-files', 'release'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
check(packageSection, 'no generated installer is committed', trackedRelease.length === 0, trackedRelease);

if (existsSync(path.join(root, 'dist/index.html'))) {
  const resolved = resolvePackageFiles({ patterns: config.files ?? [] });
  check(
    packageSection,
    'every configured path exists in the build output',
    resolved.problems.length === 0,
    resolved.problems.join('; '),
  );

  const offenders = resolved.files
    .map((file) => [file, FORBIDDEN_PACKAGE_PATTERNS.find(([pattern]) => pattern.test(file))])
    .filter(([, match]) => Boolean(match))
    .map(([file, match]) => `${file} (${match[1]})`);
  check(
    packageSection,
    `development-only material is not packaged (${resolved.files.length} files)`,
    offenders.length === 0,
    offenders.slice(0, 4).join('; '),
  );

  const missing = REQUIRED_PACKAGE_FILES.filter((file) => !resolved.files.includes(file));
  check(
    packageSection,
    'the renderer, the main process, the preload script and the metadata are packaged',
    missing.length === 0,
    missing.join(', '),
  );

  const directory = mkdtempSync(path.join(tmpdir(), 'eda-asar-'));
  try {
    const archive = path.join(directory, 'app.asar');
    const entries = await packAsar({ files: resolved.files, destination: archive });
    // The archive also carries the directory entries of the paths it contains.
    const archivedFiles = entries.filter((entry) => path.extname(entry) !== '');
    const unexpected = archivedFiles.filter((entry) => !resolved.files.includes(entry));
    const missingFiles = resolved.files.filter((file) => !archivedFiles.includes(file));
    check(
      packageSection,
      `the configured contents pack into a valid asar archive (${entries.length} entries)`,
      unexpected.length === 0 &&
        missingFiles.length === 0 &&
        REQUIRED_PACKAGE_FILES.every((file) => archivedFiles.includes(file)),
      [...unexpected, ...missingFiles].slice(0, 3).join('; '),
    );
  } catch (error) {
    check(
      packageSection,
      'the configured contents pack into a valid asar archive',
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
} else {
  skip(packageSection, 'the configured contents pack into a valid asar archive', 'dist/ is not built yet');
  skip(packageSection, 'development-only material is not packaged', 'dist/ is not built yet');
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const sections = [...new Set(results.map((result) => result.section))];
let failures = 0;
for (const section of sections) {
  const sectionResults = results.filter((result) => result.section === section);
  const passed = sectionResults.filter((result) => result.passed).length;
  console.log(`\n${section.toUpperCase()} — ${passed}/${sectionResults.length} checks passed`);
  for (const result of sectionResults) {
    if (result.passed && !result.skipped) {
      console.log(`  [PASS] ${result.name}${result.detail ? `  (${result.detail})` : ''}`);
    } else if (result.skipped) {
      console.log(`  [SKIP] ${result.name}  (${result.detail})`);
    } else {
      failures += 1;
      console.log(`  [FAIL] ${result.name}${result.detail ? `  (${result.detail})` : ''}`);
    }
  }
}

console.log(
  `\n${results.length - failures}/${results.length} release checks passed.` +
    (failures === 0 ? ' The configuration is release-ready.' : ' Fix the failures above.'),
);
console.log(
  'This script verifies configuration and archive contents only: it does not build or run the ' +
    'installer, and it never launches Electron.',
);

process.exit(failures === 0 ? 0 : 1);
