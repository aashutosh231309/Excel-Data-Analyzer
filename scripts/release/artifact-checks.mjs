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
    installer: installer ? path.join(releaseDir, path.basename(installer)) : null,
    portable: portable ? path.join(releaseDir, path.basename(portable)) : null,
    unpackedExecutable: unpackedExecutable ? path.join(releaseDir, unpackedExecutable) : null,
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
