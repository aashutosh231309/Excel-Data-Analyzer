/**
 * Artifact checks: what the release actually produces.
 *
 * These run against `release/` and the built bundles. When no installer exists
 * yet — the case in an environment that cannot download the Windows Electron
 * runtime — the checks are reported as `NOT EXECUTED` with the reason, never as
 * a pass, and never as a failure of the application itself.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FAIL, NOT_EXECUTED, PASS, createReport } from './model.mjs';
import { listRelative, loadReleaseInputs } from '../verify/packaging.mjs';

/** Finds the release artefacts of a build, following the configured names. */
export function findArtifacts(baseDir) {
  const { config, packageJson } = loadReleaseInputs(baseDir);
  const releaseDir = path.join(baseDir, config.directories?.output ?? 'release');
  const files = listRelative(baseDir, config.directories?.output ?? 'release');
  const version = packageJson.version;

  const installer = files.find((file) => /Setup\.exe$/i.test(file));
  const portable = files.find((file) => /Portable\.exe$/i.test(file));
  const unpackedExecutable = files.find((file) => /^[^/]+\/win-unpacked\/.*\.exe$/i.test(file));

  return {
    releaseDirectory: releaseDir,
    exists: existsSync(releaseDir),
    files,
    // `files` are relative to `baseDir`, so they still carry the output
    // directory (`release/win-unpacked/…`). Joining them to `releaseDir` a second
    // time produced `release\release\win-unpacked\…` and crashed the artefact
    // checks — a defect that could only appear once an installer really existed.
    installer: installer ? path.join(baseDir, installer) : null,
    portable: portable ? path.join(baseDir, portable) : null,
    unpackedExecutable: unpackedExecutable ? path.join(baseDir, unpackedExecutable) : null,
    /** The name Electron Builder would produce, from the configured template. */
    expectedInstallerName: `Excel Data Analyzer-${version}-Setup.exe`,
    expectedPortableName: `Excel Data Analyzer-${version}-Portable.exe`,
    version,
  };
}

/**
 * Inspects the Windows artefacts that exist. Without an installer every check
 * here is `NOT EXECUTED`: the configuration is validated by the static checks,
 * but nothing is claimed about a file that was never produced.
 */
export async function runArtifactChecks({ baseDir, report = createReport('artifacts') } = {}) {
  const artifacts = findArtifacts(baseDir);
  const { packageJson } = loadReleaseInputs(baseDir);

  report.section('release artifacts');

  if (!artifacts.exists || artifacts.files.length === 0) {
    report.add(
      'the Windows installer exists',
      NOT_EXECUTED,
      'no release/ output — npm run dist:win needs the Windows Electron runtime',
    );
    report.add(
      'the installer name and version match the configuration',
      NOT_EXECUTED,
      'no installer to inspect',
    );
    report.add(
      'the installer carries the application icon and metadata',
      NOT_EXECUTED,
      'no installer to inspect',
    );
    report.add('the installer checksum can be recorded', NOT_EXECUTED, 'no installer to hash');
    report.add(
      'the unpacked application directory was produced',
      NOT_EXECUTED,
      'no release/ output',
    );
    return report.results;
  }

  report.assert(
    `the installer matches the configured name (${artifacts.expectedInstallerName})`,
    artifacts.installer !== null &&
      path.basename(artifacts.installer) === artifacts.expectedInstallerName,
    artifacts.installer ? path.basename(artifacts.installer) : 'none',
  );
  if (artifacts.installer) {
    const size = statSync(artifacts.installer).size;
    report.assert(
      'the installer is a plausible Windows executable (PE header, sane size)',
      size > 1_000_000 && readFileSync(artifacts.installer).subarray(0, 2).toString('latin1') === 'MZ',
      `${(size / 1_048_576).toFixed(1)} MiB`,
    );
    report.assert(
      'the installer version in the file name equals package.json',
      path.basename(artifacts.installer).includes(`-${packageJson.version}-`),
    );
  }
  if (artifacts.unpackedExecutable) {
    const executable = readFileSync(artifacts.unpackedExecutable);
    report.assert(
      'the packaged application executable is a Windows binary',
      executable.subarray(0, 2).toString('latin1') === 'MZ',
      path.basename(artifacts.unpackedExecutable),
    );
  }
  if (artifacts.portable) {
    report.assert(
      'the portable build matches the configured name',
      path.basename(artifacts.portable) === artifacts.expectedPortableName,
      path.basename(artifacts.portable),
    );
  } else {
    report.add('the portable build was produced', NOT_EXECUTED, 'not built in this run');
  }

  return report.results;
}

/**
 * The file a finished Windows run leaves behind. The version is part of the
 * name, so a report written for an older build never counts for this one.
 */
export const WINDOWS_REPORT_FILES = ['docs/WINDOWS_RELEASE_REPORT-0.2.0.md'];

/**
 * Decides whether a Windows QA report counts as evidence.
 *
 * The file existing is not enough. A report only counts when it records a
 * finished run: a release decision of `RELEASE VALIDATION COMPLETE` or
 * `RELEASE BLOCKED`, and the Windows machine it was produced on. An unfilled
 * template, a report that still says `RELEASE VALIDATION PENDING`, or a report
 * written anywhere other than Windows stays `NOT EXECUTED` — existence alone
 * must never clear a manual blocker.
 */
/** Release decisions that count as finished, in either wording the template allows. */
const COMPLETED_DECISIONS = ['release', 'release with known issues', 'block'];

/** The decision a report records: the template's `| Decision | … |` row, or the heading after it. */
function readReleaseDecision(content) {
  const row = /^\|\s*Decision\s*\|\s*([^|]*)\|/im.exec(content);
  if (row?.[1]) {
    return row[1].trim();
  }
  return /Release decision([\s\S]{0,200})/i.exec(content)?.[1]?.trim() ?? '';
}

export function inspectWindowsReport(baseDir) {
  const candidate = WINDOWS_REPORT_FILES.map((relative) => ({
    relative,
    absolute: path.join(baseDir, relative),
  }))[0];

  if (!candidate) {
    return { completed: false, file: '', reason: 'no Windows report path is configured' };
  }
  if (!existsSync(candidate.absolute)) {
    return { completed: false, file: candidate.relative, reason: `${candidate.relative} has not been written` };
  }

  const content = readFileSync(candidate.absolute, 'utf8');
  const decision = readReleaseDecision(content);
  const normalized = decision.toLowerCase();

  // A report that still says PENDING is not evidence, whatever else it records.
  if (normalized.includes('pending')) {
    return {
      completed: false,
      file: candidate.relative,
      reason: `${candidate.relative} still records RELEASE VALIDATION PENDING`,
    };
  }

  const decided =
    /release validation complete|release blocked/.test(normalized) || COMPLETED_DECISIONS.includes(normalized);
  if (!decided) {
    return {
      completed: false,
      file: candidate.relative,
      reason: `${candidate.relative} records no finished release decision (found "${decision || 'nothing'}")`,
    };
  }

  // A decision written anywhere other than Windows cannot be Windows evidence.
  if (!/Windows\s+(?:10|11|Server)/i.test(content) || !/\bx64\b|\barm64\b/i.test(content)) {
    return {
      completed: false,
      file: candidate.relative,
      reason: `${candidate.relative} does not record the Windows machine and architecture it ran on`,
    };
  }

  return { completed: true, file: candidate.relative, reason: `${candidate.relative} (decision: ${decision})` };
}

/** The checks that need a real Windows machine, listed for the report. */
export const MANUAL_WINDOWS_CHECKS = [
  'Install the application through the NSIS installer',
  'Launch the installed application from the Start menu',
  'Native open dialog (file picker filtered to .xlsx/.xls)',
  'Native save dialog (default name, cancel, unwritable destination)',
  'Excel interoperability of the exported workbook',
  'Uninstall through Windows Settings → Apps',
  'Windows SmartScreen behaviour of the unsigned installer',
];
void FAIL;
void PASS;
