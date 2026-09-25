/**
 * Stage 7 verification suite: release hardening and the QA toolkit.
 *
 * Groups:
 *   1. release preflight   — the result model, the real static checks, and proof
 *                            that a tampered configuration is actually detected
 *   2. data preservation   — frozen records survive filtering, analytics, both
 *                            inspections and the export preparation unchanged
 *   3. repository hygiene  — generated artefacts, ignores, secrets, documentation
 *   4. release documentation — the Windows checklist and the QA report template
 *
 * The tamper checks copy a minimal release skeleton into a temporary directory,
 * break exactly one thing, and require that *the matching check fails while the
 * others keep passing*. That is what makes the static checks trustworthy: they
 * read the real configuration instead of asserting a constant.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildRecord,
  bundleModules,
  createRecorder,
  readSource,
  root,
  stripComments,
} from './harness.mjs';
import { createReport, formatResults, summarize } from '../release/model.mjs';
import {
  WINDOWS_REPORT_FILES,
  findArtifacts,
  inspectWindowsReport,
  runArtifactChecks,
} from '../release/artifact-checks.mjs';
import { listRelative, loadReleaseInputs, resolvePackageFiles, toPosixPath } from './packaging.mjs';
import { runStaticChecks } from '../release/static-checks.mjs';

const GROUP_PREFLIGHT = 'release preflight';
const GROUP_PRESERVATION = 'data preservation';
const GROUP_HYGIENE = 'repository hygiene';
const GROUP_DOCS = 'release documentation';

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

export async function runStage7(workspace) {
  await runGroup(GROUP_PREFLIGHT, () => verifyReleasePreflight(workspace));
  await runGroup(GROUP_PRESERVATION, () => verifyDataPreservation(workspace));
  await runGroup(GROUP_HYGIENE, () => verifyRepositoryHygiene());
  await runGroup(GROUP_DOCS, () => verifyReleaseDocumentation());

  return recorder.results;
}

/* -------------------------------------------------------------------------- */
/* 1. Release preflight                                                        */
/* -------------------------------------------------------------------------- */

async function verifyReleasePreflight(workspace) {
  // --- the result model ---------------------------------------------------
  check(
    GROUP_PREFLIGHT,
    'a check can only end in PASS, FAIL or NOT EXECUTED',
    (() => {
      const report = createReport('test');
      report.add('a passing check', 'PASS');
      report.assert('a failing check', false, 'because');
      report.add('an unavailable check', 'NOT EXECUTED', 'no Windows here');
      const rejected = (() => {
        try {
          report.add('a made-up check', 'MAYBE');
          return false;
        } catch {
          return true;
        }
      })();
      return report.results.length === 3 && rejected;
    })(),
  );

  const modelProof = (() => {
    const report = createReport('test');
    report.section('automated');
    report.add('all good', 'PASS');
    report.section('windows');
    report.add('installer', 'NOT EXECUTED', 'no Windows machine');
    const summary = summarize(report);
    return (
      summary.hasAutomaticBlockers === false &&
      summary.isAutomaticallyReady === true &&
      summary.automaticBlockers.length === 0 &&
      summary.manualBlockers.length === 1 &&
      summary.manualBlockers[0].includes('installer')
    );
  })();
  check(
    GROUP_PREFLIGHT,
    'a check that could not run is a manual blocker, never a failure',
    modelProof,
  );

  const failureProof = (() => {
    const report = createReport('test');
    report.section('automated');
    report.add('broken', 'FAIL', 'detail');
    report.add('unavailable', 'NOT EXECUTED', 'detail');
    const summary = summarize(report);
    return (
      summary.hasAutomaticBlockers === true &&
      summary.automaticBlockers.length === 1 &&
      summary.manualBlockers.length === 1 &&
      formatResults(report.results).includes('[FAIL] broken')
    );
  })();
  check(GROUP_PREFLIGHT, 'a failing check becomes an automatic blocker', failureProof);

  // --- the real repository ------------------------------------------------
  // A copied candidate is not a git checkout: the hygiene checks must report
  // that they could not run instead of failing.
  const realResults = await runStaticChecks({ baseDir: root });
  const realFailures = realResults.filter((result) => result.status === 'FAIL');
  check(
    GROUP_PREFLIGHT,
    `every static release check passes on this repository (${realResults.length} checks)`,
    realResults.length >= 60 && realFailures.length === 0,
    realFailures.map((result) => `${result.section}: ${result.name}`).slice(0, 3).join('; '),
  );
  check(
    GROUP_PREFLIGHT,
    'no static release check is silently skipped on this repository',
    realResults.every((result) => result.status !== 'NOT EXECUTED') &&
      realResults.filter((result) => result.status === 'PASS').length >= 60,
    realResults
      .filter((result) => result.status === 'NOT EXECUTED')
      .map((result) => result.name)
      .join('; '),
  );

  const artifacts = findArtifacts(root);
  check(
    GROUP_PREFLIGHT,
    'the artefact inspection describes what a Windows build would produce',
    artifacts.expectedInstallerName === 'Excel Data Analyzer-0.2.0-Setup.exe' &&
      artifacts.expectedPortableName === 'Excel Data Analyzer-0.2.0-Portable.exe' &&
      artifacts.installer === null,
    artifacts.installer ?? 'no installer built in this environment',
  );

  // --- the Windows report gate --------------------------------------------
  // A report only counts as evidence when it records a finished run. A missing
  // file, an untouched template, a report that still says PENDING and a report
  // written on another operating system must all stay NOT EXECUTED, so a manual
  // release blocker can never be cleared by writing a file.
  const reportRoot = path.join(workspace, 'windows-report');
  const reportPath = path.join(reportRoot, WINDOWS_REPORT_FILES[0] ?? '');
  await mkdir(path.dirname(reportPath), { recursive: true });

  const missingReport = inspectWindowsReport(reportRoot);

  const template = await readFile(path.join(root, 'docs/WINDOWS_RELEASE_REPORT_TEMPLATE.md'), 'utf8');
  await writeFile(reportPath, template);
  const unfilledTemplate = inspectWindowsReport(reportRoot);

  await writeFile(
    reportPath,
    [
      '# Windows release QA report — 0.2.0',
      '',
      '| Field | Value |',
      '| ----- | ----- |',
      '| Windows version and build | Windows 11 24H2, 26100.1742 |',
      '| Architecture | x64 |',
      '',
      '## 15. Final release decision',
      '',
      '| Field | Value |',
      '| ----- | ----- |',
      '| Decision | RELEASE VALIDATION PENDING |',
      '',
    ].join('\n'),
  );
  const pendingReport = inspectWindowsReport(reportRoot);

  const notEvidence = [missingReport, unfilledTemplate, pendingReport];
  check(
    GROUP_PREFLIGHT,
    'a pending Windows report never clears the release blockers',
    notEvidence.every((outcome) => outcome.completed === false) &&
      pendingReport.reason.includes('PENDING') &&
      unfilledTemplate.reason.includes('no finished release decision'),
    notEvidence.map((outcome) => outcome.reason).join(' | '),
  );

  await writeFile(
    reportPath,
    [
      '# Windows release QA report — 0.2.0',
      '',
      '| Field | Value |',
      '| ----- | ----- |',
      '| Windows version and build | Windows 11 24H2, 26100.1742 |',
      '| Architecture | x64 |',
      '| Date tested (local date) | 26/09/2026 |',
      '',
      '## 15. Final release decision',
      '',
      '| Field | Value |',
      '| ----- | ----- |',
      '| Decision | release |',
      '',
    ].join('\n'),
  );
  const finishedReport = inspectWindowsReport(reportRoot);
  check(
    GROUP_PREFLIGHT,
    'a report of a finished run on Windows counts as evidence',
    finishedReport.completed === true && finishedReport.reason.includes('decision: release'),
    finishedReport.reason,
  );

  // The same decision without a Windows machine is not Windows evidence.
  await writeFile(
    reportPath,
    ['# Windows release QA report — 0.2.0', '', '## 15. Final release decision', '', '| Decision | release |', ''].join('\n'),
  );
  const wrongMachineReport = inspectWindowsReport(reportRoot);
  check(
    GROUP_PREFLIGHT,
    'a report that does not name a Windows machine is not Windows evidence',
    wrongMachineReport.completed === false && wrongMachineReport.reason.includes('Windows machine'),
    wrongMachineReport.reason,
  );

  // --- artefact path resolution -------------------------------------------
  // The artefact checks only ever ran where no installer existed, so a path bug
  // survived until a real build: `findArtifacts` joined the output directory a
  // second time and looked for `release/release/win-unpacked/…`, which crashed
  // the preflight. A synthetic build output now exercises the same code path on
  // every platform.
  const artifactRoot = path.join(workspace, 'artifact-candidate');
  await createReleaseCandidate(artifactRoot);
  await mkdir(path.join(artifactRoot, 'release', 'win-unpacked'), { recursive: true });
  const syntheticExecutable = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2 * 1024 * 1024)]);
  for (const relative of [
    'release/Excel Data Analyzer-0.2.0-Setup.exe',
    'release/Excel Data Analyzer-0.2.0-Portable.exe',
  ]) {
    await writeFile(path.join(artifactRoot, relative), syntheticExecutable);
  }
  await writeFile(
    path.join(artifactRoot, 'release', 'win-unpacked', 'Excel Data Analyzer.exe'),
    syntheticExecutable.subarray(0, 1024),
  );

  const resolvedArtifacts = findArtifacts(artifactRoot);
  const artifactResults = await runArtifactChecks({ baseDir: artifactRoot });
  const artifactFailures = artifactResults.filter((result) => result.status === 'FAIL');
  check(
    GROUP_PREFLIGHT,
    'the artefact checks resolve the build output without joining it twice',
    resolvedArtifacts.installer !== null &&
      existsSync(resolvedArtifacts.installer) &&
      resolvedArtifacts.portable !== null &&
      existsSync(resolvedArtifacts.portable) &&
      resolvedArtifacts.unpackedExecutable !== null &&
      existsSync(resolvedArtifacts.unpackedExecutable) &&
      artifactFailures.length === 0,
    artifactFailures.length > 0
      ? artifactFailures.map((result) => result.name).join('; ')
      : `installer, portable and unpacked executable all resolved (${artifactResults.length} checks)`,
  );

  // --- cross-platform paths -----------------------------------------------
  // The release checks compare file paths against forward-slash patterns
  // (`dist/assets/…`, the expected artefact names, the exclusion patterns). On a
  // Windows runner `path.join`/`path.relative` return backslashes, which made
  // those comparisons fail there while passing on Linux — the checks were green
  // here and 13 of them failed on Windows. `toPosixPath` is the single place that
  // normalises them, and this check fails if it is ever bypassed.
  const crossPlatformProof = (() => {
    const windowsStyle = toPosixPath('dist\\assets\\index-abc123.js');
    const mixed = toPosixPath(path.join('dist-electron', 'main.js'));
    const { config } = loadReleaseInputs(root);
    const resolved = resolvePackageFiles({ baseDir: root, patterns: config.files ?? [] });
    const walked = [...listRelative(root, 'dist'), ...listRelative(root, 'dist-electron')];
    const withBackslashes = [...resolved.files, ...walked].filter((file) => file.includes('\\'));
    return {
      passed:
        windowsStyle === 'dist/assets/index-abc123.js' &&
        !mixed.includes('\\') &&
        resolved.files.includes('dist-electron/main.js') &&
        resolved.files.includes('dist/index.html') &&
        withBackslashes.length === 0,
      detail: `${resolved.files.length} packaged files, ${withBackslashes.length} with backslashes`,
    };
  })();
  check(
    GROUP_PREFLIGHT,
    'package paths are compared with forward slashes on every platform',
    crossPlatformProof.passed,
    crossPlatformProof.detail,
  );

  // --- tamper detection ---------------------------------------------------
  const candidate = path.join(workspace, 'candidate');
  await createReleaseCandidate(candidate);

  const tamperCases = [
    {
      name: 'a foreign application identifier',
      target: 'electron-builder.yml',
      patch: (content) => content.replace('appId: com.exceldataanalyzer.app', 'appId: com.example.changeme'),
      expected: 'the application identifier is stable and product-specific',
    },
    {
      name: 'a duplicated version inside the configuration',
      target: 'electron-builder.yml',
      patch: (content) => `${content}\nbuildVersion: 9.9.9\n`,
      expected: 'the version is a semantic version declared exactly once',
    },
    {
      name: 'a Windows target that is not the NSIS installer',
      target: 'electron-builder.yml',
      patch: (content) => content.replace('target: nsis', 'target: portable'),
      expected: 'the Windows target is an explicit x64 NSIS installer',
    },
    {
      name: 'a renderer loaded from the file system',
      target: 'electron/main.ts',
      patch: (content) =>
        content.replace(
          /void window\.loadURL\(DEV_SERVER_URL \?\? RENDERER_ENTRY_URL\);/,
          'void window.loadFile(path.join(__dirname, "../dist/index.html"));',
        ),
      expected: 'the packaged renderer is served from app://bundle/ and never from file://',
    },
    {
      name: 'a certificate check disabled through a launch switch',
      target: 'electron/main.ts',
      patch: (content) => `${content}\napp.commandLine.appendSwitch('--ignore-certificate-errors');\n`,
      expected: 'no insecure Electron switch appears in the application or the packaging inputs',
    },
    {
      name: 'renderer sources added to the packaged files',
      target: 'electron-builder.yml',
      patch: (content) => content.replace('  - package.json', "  - package.json\n  - 'src/**/*'"),
      expected: 'the application is packaged as an asar from the built bundles only',
      also: ['only production bundles are packaged'],
    },
    {
      name: 'an unexpected remote origin in the production renderer',
      target: 'dist/index.html',
      patch: (content) =>
        content.replace('<head>', '<head><script src="https://cdn.example.com/tracker.js"></script>'),
      expected: 'the production runtime',
      also: [
        'the shipped runtime can make no remote request',
        'the packaged page loads only same-origin assets',
      ],
    },
    {
      name: 'a missing icon file',
      target: 'build/icon.ico',
      patch: () => null,
      delete: true,
      expected: 'the configured Windows icon exists',
    },
    {
      name: 'a missing Windows checklist document',
      target: 'docs/WINDOWS_RELEASE_CHECKLIST.md',
      patch: () => null,
      delete: true,
      expected: 'the Windows manual checklist is present and covers the release areas',
    },
  ];

  for (const tamperCase of tamperCases) {
    const targetPath = path.join(candidate, tamperCase.target);
    const original = existsSync(targetPath) ? await readFile(targetPath) : null;

    if (tamperCase.delete) {
      await rm(targetPath, { force: true });
    } else {
      await writeFile(targetPath, tamperCase.patch(await readFile(targetPath, 'utf8')));
    }

    const results = await runStaticChecks({ baseDir: candidate });
    const relevant = results.filter(
      (result) => result.status === 'FAIL' && result.name.includes(tamperCase.expected),
    );
    // One broken input can be the same finding reported by two checks (a foreign
    // packaged path is both "extra files" and "not only the bundles"). Those are
    // declared per case; anything else that fails means the check is too eager.
    const allowed = [tamperCase.expected, ...(tamperCase.also ?? [])];
    const unrelated = results.filter(
      (result) =>
        result.status === 'FAIL' &&
        !allowed.some((name) => result.name.includes(name)) &&
        // Deleting a document also breaks the checksum-documentation check, which
        // is the same finding reported twice.
        !(tamperCase.delete && result.section === 'documentation'),
    );
    check(
      GROUP_PREFLIGHT,
      `a tampered release is rejected: ${tamperCase.name}`,
      relevant.length >= 1 && unrelated.length === 0,
      unrelated.length > 0
        ? `unrelated failures: ${unrelated.map((result) => result.name).slice(0, 2).join('; ')}`
        : `no check failed for "${tamperCase.expected}"`,
    );

    if (original) {
      await writeFile(targetPath, original);
    }
  }

  // The candidate is restored after every tamper case: a clean copy must pass.
  const restored = await runStaticChecks({ baseDir: candidate });
  check(
    GROUP_PREFLIGHT,
    'the checks pass again once the tampered copy is restored',
    restored.every((result) => result.status !== 'FAIL'),
    restored
      .filter((result) => result.status === 'FAIL')
      .map((result) => result.name)
      .join('; '),
  );

  await rm(candidate, { recursive: true, force: true });
}

/**
 * Copies the release inputs (configuration, sources, bundles, icons, docs) into
 * a temporary directory so a tampered copy can be inspected without touching the
 * repository. `node_modules`, `release/` and `.git` are not needed.
 */
async function createReleaseCandidate(destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of [
    'package.json',
    'electron-builder.yml',
    'README.md',
    '.gitignore',
    'index.html',
    'vite.config.ts',
    'tailwind.config.ts',
    'tsconfig.json',
    'electron',
    'src',
    'build',
    'dist',
    'dist-electron',
    'docs',
    'scripts',
  ]) {
    const source = path.join(root, entry);
    if (existsSync(source)) {
      await cp(source, path.join(destination, entry), { recursive: true });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Data preservation                                                        */
/* -------------------------------------------------------------------------- */

async function verifyDataPreservation(workspace) {
  const modules = await bundleModules(
    [
      'src/domain/filtering.ts',
      'src/domain/analytics.ts',
      'electron/shared/export.ts',
      'src/domain/pagination.ts',
    ],
    workspace,
  );
  const filtering = modules.filtering;
  const analytics = modules.analytics;
  const exporter = modules.export;
  const pagination = modules.pagination;

  const records = [
    buildRecord({
      id: 'payments#2',
      rowNumber: 2,
      date: '2026-04-03',
      name: 'Amit Kumar',
      vehicleNumber: 'UP32AB1234',
      paymentMode: 'UPI',
      amountMinor: 200_000,
      paymentReason: 'Fuel',
      remark: 'Weekly',
    }),
    buildRecord({
      id: 'payments#3',
      rowNumber: 3,
      date: '2026-04-03',
      name: 'Amit Kumar',
      vehicleNumber: 'UP32AB1234',
      paymentMode: 'UPI',
      amountMinor: 200_000,
      paymentReason: 'Fuel',
      remark: 'Weekly',
    }),
    buildRecord({
      id: 'payments#4',
      rowNumber: 4,
      date: null,
      name: 'Neha Gupta',
      vehicleNumber: 'UP78XY9876',
      paymentMode: 'Cash',
      amountMinor: null,
      paymentReason: '',
      remark: '',
    }),
  ];

  // Frozen, so any in-place write throws instead of passing unnoticed.
  const frozen = Object.freeze(records.map((record) => Object.freeze({ ...record })));
  const snapshot = JSON.stringify(frozen);

  const values = {
    date: '2026-04-03',
    nameKey: filtering.createNameKey('Amit Kumar'),
    nameLabel: 'Amit Kumar',
    vehicleKey: filtering.vehicleComparisonKey('UP32AB1234'),
    vehicleLabel: 'UP32AB1234',
    amount: { mode: 'range', minMinor: 100_000, maxMinor: 300_000 },
  };

  const outcome = await runWithoutThrowing(async () => {
    const validation = filtering.validateFilterState(filtering.draftFromFilterValues(values));
    const filtered = filtering.filterRecords(frozen, validation.values ?? values);
    const summary = filtering.summarizeRecords(filtered);
    const report = analytics.analyzeRecords(frozen);
    const quality = analytics.collectDataQualityRecords(frozen, 'invalidAmount');
    const duplicateRecords = analytics.collectDuplicateRecords(frozen, null);
    const exportRows = exporter.buildExportRows(frozen);
    const page = pagination.buildPageWindow(2, 10);
    return {
      validationErrors: validation.errors.length,
      filteredCount: filtered.length,
      filteredTotal: summary.totalAmountMinor,
      analyticsImported: report.summary.importedRecords,
      qualityCount: quality.length,
      duplicateRecords: duplicateRecords.length,
      duplicateGroups: report.duplicates.groupCount,
      exportRows: exportRows.length,
      exportColumns: Object.keys(exportRows[0] ?? {}),
      page,
    };
  });

  check(
    GROUP_PRESERVATION,
    'filtering, analytics, both inspections and the export preparation run over frozen records',
    outcome.error === null &&
      outcome.value.validationErrors === 0 &&
      outcome.value.filteredCount === 2 &&
      outcome.value.filteredTotal === 400_000 &&
      outcome.value.analyticsImported === 3 &&
      outcome.value.qualityCount === 1 &&
      outcome.value.duplicateGroups === 1 &&
      outcome.value.duplicateRecords === 2 &&
      outcome.value.exportRows === 3,
    outcome.error ?? JSON.stringify(outcome.value),
  );
  check(
    GROUP_PRESERVATION,
    'the imported records are byte-identical after every read-only operation',
    JSON.stringify(frozen) === snapshot,
  );
  check(
    GROUP_PRESERVATION,
    'an export row carries the seven columns in the documented order',
    outcome.value.exportColumns.join('|') === 'date|name|vehicleNumber|paymentMode|amount|paymentReason|remark' &&
      exporter.EXPORT_COLUMNS.map((column) => exporter.EXPORT_COLUMN_LABELS[column]).join('|') ===
        'Date|Name|Vehicle Number|Payment Mode|Amount|Payment Reason|Remark',
    outcome.value.exportColumns.join(', '),
  );
  check(
    GROUP_PRESERVATION,
    'an invalid amount stays null in the export instead of becoming zero',
    exporter.exportAmountRupees(null) === null && exporter.buildExportRow(frozen[2]).amount === null,
  );
  check(
    GROUP_PRESERVATION,
    'no domain module mutates the array it was given',
    !/records\.(sort|reverse|splice|push|pop|shift|unshift)\(/.test(
      stripComments(await readSource('src/domain/filtering.ts')) +
        stripComments(await readSource('src/domain/analytics.ts')),
    ),
  );
}

/** Runs a callback and reports the error instead of failing the suite. */
async function runWithoutThrowing(run) {
  try {
    return { value: await run(), error: null };
  } catch (error) {
    return {
      value: {
        filteredCount: -1,
        filteredTotal: -1,
        analyticsImported: -1,
        qualityCount: -1,
        duplicateGroups: -1,
        exportRows: -1,
        exportCells: -1,
        page: null,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Repository hygiene                                                       */
/* -------------------------------------------------------------------------- */

async function verifyRepositoryHygiene() {
  const gitignore = await readSource('.gitignore');
  const rules = gitignore.split(/\r?\n/).map((line) => line.trim());
  const ignored = ['/release/', '/dist/', '/dist-electron/', 'node_modules/', '.env', '*.log', '*.tsbuildinfo'];
  check(
    GROUP_HYGIENE,
    'generated output, secrets and logs are ignored by git',
    ignored.every((entry) => rules.includes(entry)),
    ignored.filter((entry) => !rules.includes(entry)).join(', '),
  );

  const { execFileSync } = await import('node:child_process');
  const isIgnored = (candidate) => {
    try {
      execFileSync('git', ['check-ignore', '-q', candidate], { cwd: root, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  check(
    GROUP_HYGIENE,
    'the release tooling is tracked while the packaging output stays ignored',
    // The build-output rules are anchored on purpose: an unanchored `release/`
    // would quietly exclude scripts/release/ from every commit.
    !isIgnored('scripts/release/static-checks.mjs') &&
      !isIgnored('scripts/verify/stage7.mjs') &&
      !isIgnored('docs/WINDOWS_RELEASE_CHECKLIST.md') &&
      isIgnored('release/Excel Data Analyzer-0.2.0-Setup.exe'),
  );

  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  check(
    GROUP_HYGIENE,
    'the repository tracks no generated artefact',
    tracked.every(
      (file) =>
        !/^(release|dist|dist-electron|node_modules)\//.test(file) &&
        !/\.(exe|msi|dmg|AppImage|blockmap|log|tsbuildinfo)$/i.test(file),
    ),
    tracked.filter((file) => /\.(exe|msi|log|tsbuildinfo)$/i.test(file)).join(', '),
  );
  check(
    GROUP_HYGIENE,
    'the repository tracks no temporary or editor-specific file',
    tracked.every((file) => !/(^|\/)(\.DS_Store|Thumbs\.db|\.idea|\.vscode\/[^e])/.test(file)),
  );
  check(
    GROUP_HYGIENE,
    'the working tree contains no stray log or temporary file',
    !existsSync(path.join(root, 'npm-debug.log')) &&
      !existsSync(path.join(root, '.env')) &&
      !existsSync(path.join(root, 'release')),
  );
  check(
    GROUP_HYGIENE,
    'the lockfile matches the manifest and this stage changed no dependency version',
    await lockfileUnchanged(),
  );
}

/**
 * The lockfile is the dependency contract: Stage 7 adds no dependency, so the
 * committed lockfile must still match `package.json` and must not differ from
 * the committed revision.
 */
async function lockfileUnchanged() {
  const manifest = JSON.parse(await readSource('package.json'));
  const lockPath = path.join(root, 'package-lock.json');
  if (!existsSync(lockPath)) {
    return false;
  }
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const rootEntry = lock.packages?.[''] ?? {};
  const { execFileSync } = await import('node:child_process');

  // The dependency table of the committed lockfile: only the root package entry
  // (name/version/license of this project) may differ from it. Anything else
  // would mean a dependency version moved, which this stage must not do.
  const committed = JSON.parse(
    execFileSync('git', ['show', 'HEAD:package-lock.json'], { cwd: root, encoding: 'utf8' }),
  );
  const dependenciesOf = (value) =>
    JSON.stringify(
      Object.entries(value.packages ?? {})
        .filter(([key]) => key !== '')
        .sort(([a], [b]) => a.localeCompare(b)),
    );

  return (
    lock.lockfileVersion >= 3 &&
    lock.version === manifest.version &&
    rootEntry.version === manifest.version &&
    rootEntry.name === manifest.name &&
    JSON.stringify(rootEntry.dependencies ?? {}) === JSON.stringify(manifest.dependencies ?? {}) &&
    JSON.stringify(rootEntry.devDependencies ?? {}) === JSON.stringify(manifest.devDependencies ?? {}) &&
    dependenciesOf(lock) === dependenciesOf(committed)
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Release documentation                                                    */
/* -------------------------------------------------------------------------- */

async function verifyReleaseDocumentation() {
  const checklist = await readSource('docs/WINDOWS_RELEASE_CHECKLIST.md');
  const template = await readSource('docs/WINDOWS_RELEASE_REPORT_TEMPLATE.md');
  const readme = await readSource('README.md');

  const sections = [
    'Installation',
    'First launch',
    'Import',
    'Filtering',
    'Analytics',
    'Export',
    'Window behaviour',
    'Offline',
    'Uninstallation',
  ];
  check(
    GROUP_DOCS,
    'the Windows checklist covers every release area',
    sections.every((section) => checklist.includes(section)),
    sections.filter((section) => !checklist.includes(section)).join(', '),
  );
  const boxes = (checklist.match(/- \[ \]/g) ?? []).length;
  check(
    GROUP_DOCS,
    `the checklist is actionable (${boxes} unchecked items)`,
    boxes >= 60,
    `${boxes} items`,
  );
  check(
    GROUP_DOCS,
    'the checklist stays unchecked until a real Windows run happens',
    !/- \[x\]/i.test(checklist) && /NOT EXECUTED/.test(checklist),
  );
  check(
    GROUP_DOCS,
    'the checklist documents the checksum command and the fictional-data rule',
    /Get-FileHash/.test(checklist) && /fictional/i.test(checklist),
  );

  const fields = [
    'Windows version',
    'Architecture',
    'Installer SHA-256',
    'Import results',
    'Export results',
    'Dialog results',
    'Uninstallation result',
    'Known issues',
    'Final release decision',
  ];
  check(
    GROUP_DOCS,
    'the QA report template carries every required field',
    fields.every((field) => template.includes(field)),
    fields.filter((field) => !template.includes(field)).join(', '),
  );
  check(
    GROUP_DOCS,
    'the template separates failures from the release decision',
    /Failures and observations/.test(template) && /Data-safety confirmation/.test(template),
  );

  check(
    GROUP_DOCS,
    'the README separates what is implemented, verified, packaged and pending',
    /### What is implemented/.test(readme) &&
      /### Release preflight/.test(readme) &&
      /### Windows validation status/.test(readme) &&
      /### Building the Windows application/.test(readme),
  );
  check(
    GROUP_DOCS,
    'the README links both QA documents',
    readme.includes('docs/WINDOWS_RELEASE_CHECKLIST.md') &&
      readme.includes('docs/WINDOWS_RELEASE_REPORT_TEMPLATE.md'),
  );
  check(
    GROUP_DOCS,
    'the README states the real automated check count and never claims a Windows run',
    /\d+\+? checks\*\* that do not need a GUI/.test(readme) &&
      !/Windows (testing|validation) (passed|complete|completed|succeeded)/i.test(readme),
  );
}
