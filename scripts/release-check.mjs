#!/usr/bin/env node
/**
 * Release preflight.
 *
 *   npm run release:check              # full preflight
 *   npm run release:check -- --static  # configuration checks only, no build
 *   npm run release:check -- --no-build
 *   npm run release:check -- --json
 *
 * The preflight runs every release check that this environment can run and
 * reports each one as PASS, FAIL or NOT EXECUTED:
 *
 *   PASS          the check ran and succeeded
 *   FAIL          the check ran and failed          → automatic release blocker
 *   NOT EXECUTED  the environment cannot run it     → manual release blocker
 *
 * The Windows runtime checks (installer, native dialogs, Excel interop,
 * uninstall) can only be executed by a person on Windows. They are listed as
 * manual blockers with the checklist in `docs/WINDOWS_RELEASE_CHECKLIST.md`;
 * they never make this command fail, and they are never reported as passing.
 *
 * Nothing here disables a security control, bypasses certificate verification
 * or reaches the network.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FAIL,
  NOT_EXECUTED,
  PASS,
  createReport,
  formatResults,
  summarize,
} from './release/model.mjs';
import {
  MANUAL_WINDOWS_CHECKS,
  findArtifacts,
  inspectWindowsReport,
  runArtifactChecks,
} from './release/artifact-checks.mjs';
import { runStaticChecks } from './release/static-checks.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const arguments_ = process.argv.slice(2);
const isStaticOnly = arguments_.includes('--static');
const skipBuild = arguments_.includes('--no-build') || isStaticOnly;
const asJson = arguments_.includes('--json');

const report = createReport('preflight');
const startedAt = Date.now();

/* -------------------------------------------------------------------------- */
/* Steps                                                                       */
/* -------------------------------------------------------------------------- */

/** Runs a command and returns its exit code with the captured output. */
function runCommand(command, args, { timeout = 900_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

async function runPipelineSteps() {
  report.section('pipeline');

  if (skipBuild) {
    report.add('the production build is up to date', NOT_EXECUTED, '--static/--no-build was used');
  } else {
    const build = await runCommand('npm', ['run', 'build']);
    report.assert(
      'the production build succeeds (typecheck + icons + main + renderer)',
      build.code === 0,
      build.output.split('\n').filter(Boolean).slice(-3).join(' | '),
    );
    report.assert(
      'the type check passes with no emit',
      build.code === 0 && !/error TS\d+/.test(build.output),
      build.code === 0 ? '' : 'the build failed',
    );
  }

  if (isStaticOnly) {
    report.add(
      'the verification suites pass',
      NOT_EXECUTED,
      '--static was used; run npm run verify for the full suite',
    );
    return;
  }

  const suites = await runCommand(process.execPath, ['scripts/verify.mjs']);
  const tally = suites.output.match(/(\d+)\/(\d+) checks passed/);
  report.assert(
    tally
      ? `the verification suites pass (${tally[1]}/${tally[2]})`
      : 'the verification suites pass',
    suites.code === 0 && tally !== null && tally[1] === tally[2],
    suites.output.split('\n').filter((line) => line.includes('[FAIL]')).slice(0, 3).join(' | '),
  );
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

await runPipelineSteps();
await runStaticChecks({ baseDir: root, report });
await runArtifactChecks({ baseDir: root, report });

/* -------------------------------------------------------------------------- */
/* Manual Windows checks                                                       */
/* -------------------------------------------------------------------------- */

report.section('manual windows validation');
/**
 * Only a report of a finished run counts. `inspectWindowsReport` requires a real
 * release decision and the Windows machine behind it, so a pending or unfilled
 * report cannot clear this blocker by existing.
 */
const windowsReport = inspectWindowsReport(root);
report.add(
  'a completed Windows QA report is attached to this release',
  windowsReport.completed ? PASS : NOT_EXECUTED,
  windowsReport.reason,
);
for (const check of MANUAL_WINDOWS_CHECKS) {
  report.add(check, NOT_EXECUTED, 'requires a real Windows machine');
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const summary = summarize(report);
const artifacts = findArtifacts(root);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        results: report.results,
        summary: {
          total: summary.total,
          passed: summary.passed,
          failed: summary.failures.length,
          notExecuted: summary.notExecuted.length,
        },
        automaticBlockers: summary.automaticBlockers,
        manualBlockers: summary.manualBlockers,
      },
      null,
      2,
    ),
  );
} else {
  console.log('Excel Data Analyzer — release preflight');
  console.log(formatResults(report.results));
  console.log('');
  console.log(
    `${summary.passed} PASS · ${summary.failures.length} FAIL · ${summary.notExecuted.length} NOT EXECUTED — ` +
      `${summary.total} release checks in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
  );

  console.log('');
  console.log('RELEASE ARTIFACTS');
  console.log(
    artifacts.installer
      ? `  installer: ${path.relative(root, artifacts.installer)}`
      : `  installer: not built — ${artifacts.expectedInstallerName} would be written to release/`,
  );
  console.log(
    `  windows packaging: ${
      artifacts.installer ? 'artifacts present' : 'NOT EXECUTED — needs the Windows Electron runtime'
    }`,
  );

  console.log('');
  console.log('AUTOMATIC BLOCKERS');
  if (summary.automaticBlockers.length === 0) {
    console.log('  none — every automated release check passed');
  } else {
    for (const blocker of summary.automaticBlockers) {
      console.log(`  • ${blocker}`);
    }
  }

  console.log('');
  console.log('MANUAL BLOCKERS (must be cleared on Windows before a public release)');
  for (const blocker of summary.manualBlockers) {
    console.log(`  • ${blocker}`);
  }

  console.log('');
  console.log(
    summary.hasAutomaticBlockers
      ? 'RESULT: FAIL — fix the automatic blockers above.'
      : 'RESULT: automated release checks PASS. Windows runtime validation is still pending.',
  );
  console.log(
    'This command never installs, launches or uninstalls the application: configuration correctness is not Windows testing.',
  );
}

process.exit(summary.hasAutomaticBlockers ? 1 : 0);
