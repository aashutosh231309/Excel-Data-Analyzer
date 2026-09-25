/**
 * Release-packaging helpers shared by `scripts/release-check.mjs` and the
 * Stage 6 verification suite.
 *
 * Everything here inspects real files: the packaging configuration, the icon
 * binaries, the production bundles and the archive that would ship. Nothing is
 * asserted against a copied constant, and nothing launches Electron — so the
 * checks stay deterministic and runnable in a headless environment.
 *
 * This module deliberately imports only Node built-ins at load time; the
 * third-party helpers (js-yaml, ajv, @electron/asar) are resolved lazily from
 * the project's own dependencies.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const requireFromHere = createRequire(import.meta.url);

export function requireDependency(name) {
  return requireFromHere(name);
}

/** Reads and parses the packaging configuration plus the surrounding metadata. */
export function loadReleaseInputs(baseDir = root) {
  const configPath = path.join(baseDir, 'electron-builder.yml');
  const configText = readFileSync(configPath, 'utf8');
  const yaml = requireDependency('js-yaml');
  const packageJson = JSON.parse(readFileSync(path.join(baseDir, 'package.json'), 'utf8'));
  const configFile = readFileSync(configPath, 'utf8');
  return {
    configPath,
    configText,
    // Electron Builder reads package.json as the source for the version, the
    // product name and the description; the YAML config supplies the rest.
    packageJson,
    config: yaml.load(configText) ?? {},
    baseDir,
    configFile,
    mainSource: readFileSync(path.join(baseDir, 'electron/main.ts'), 'utf8'),
  };
}

/* -------------------------------------------------------------------------- */
/* Files                                                                       */
/* -------------------------------------------------------------------------- */

/** Reads a repository-relative file, optionally from a copied candidate root. */
export function readRelative(baseDir, relativePath) {
  return readFileSync(path.join(baseDir, relativePath), 'utf8');
}

/**
 * Removes block and line comments. The release checks look for code patterns,
 * and a sentence in a comment ("the renderer receives no `require`") must never
 * count as the code itself.
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Lists the repository-relative files under a directory of a candidate root. */
export function listRelative(baseDir, relativeDirectory) {
  const directory = path.join(baseDir, relativeDirectory);
  if (!existsSync(directory)) {
    return [];
  }
  const walk = (current) =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(current, entry.name);
      return entry.isDirectory()
        ? walk(full)
        : [path.relative(baseDir, full).split(path.sep).join('/')];
    });
  return walk(directory).sort();
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Validates the configuration against Electron Builder's own JSON schema, so an
 * unknown or misspelled option can never reach a release build unnoticed.
 */
export function validateConfigAgainstSchema(config) {
  const Ajv = requireDependency('ajv');
  const schema = requireDependency('app-builder-lib/scheme.json');
  const ajv = new Ajv({ strict: false, allowUnionTypes: true, allErrors: true });
  const validate = ajv.compile(schema);
  if (validate(config)) {
    return [];
  }
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`,
  );
}

/** All Windows target names declared in the configuration. */
export function windowsTargets(config) {
  const targets = config.win?.target ?? [];
  return (Array.isArray(targets) ? targets : [targets]).flatMap((entry) => {
    if (typeof entry === 'string') {
      return [{ target: entry, arch: [] }];
    }
    return [{ target: entry?.target ?? '', arch: entry?.arch ?? [] }];
  });
}

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

const ICO_HEADER_BYTES = 6;
const ICO_DIRECTORY_ENTRY_BYTES = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Parses a real `.ico` container: the layout a Windows shell reads. It verifies
 * the header, every directory entry and the payload of each entry (either a PNG
 * stream or a 32-bit BMP with a `BITMAPINFOHEADER`), which is what makes a
 * renamed PNG fail here instead of silently in Windows.
 */
export function inspectIco(buffer) {
  const problems = [];
  const entries = [];

  if (buffer.length < ICO_HEADER_BYTES) {
    return { entries, problems: ['the file is too short to be an icon'] };
  }
  const reserved = buffer.readUInt16LE(0);
  const type = buffer.readUInt16LE(2);
  const count = buffer.readUInt16LE(4);
  if (reserved !== 0 || type !== 1) {
    problems.push(`the header is not an icon container (reserved=${reserved}, type=${type})`);
  }
  if (count === 0) {
    problems.push('the icon contains no image');
  }

  for (let index = 0; index < count; index += 1) {
    const entryOffset = ICO_HEADER_BYTES + index * ICO_DIRECTORY_ENTRY_BYTES;
    if (entryOffset + ICO_DIRECTORY_ENTRY_BYTES > buffer.length) {
      problems.push(`entry ${index} points outside the file`);
      break;
    }
    const width = buffer[entryOffset] === 0 ? 256 : buffer[entryOffset];
    const height = buffer[entryOffset + 1] === 0 ? 256 : buffer[entryOffset + 1];
    const bitCount = buffer.readUInt16LE(entryOffset + 6);
    const bytes = buffer.readUInt32LE(entryOffset + 8);
    const offset = buffer.readUInt32LE(entryOffset + 12);

    if (width !== height) {
      problems.push(`entry ${index} is not square (${width}×${height})`);
    }
    if (offset + bytes > buffer.length) {
      problems.push(`entry ${index} (${width}px) is truncated`);
      continue;
    }
    const payload = buffer.subarray(offset, offset + bytes);
    const isPng = payload.subarray(0, 8).equals(PNG_SIGNATURE);
    if (!isPng) {
      const headerBytes = payload.readUInt32LE(0);
      if (headerBytes !== 40) {
        problems.push(`entry ${index} (${width}px) carries no BITMAPINFOHEADER`);
      }
      if (bitCount !== 32) {
        problems.push(`entry ${index} (${width}px) is not a 32-bit image`);
      }
    }
    entries.push({ size: width, format: isPng ? 'png' : 'bmp', bytes, bitCount });
  }

  return { entries, problems };
}

/** Reads the real pixel size out of a PNG's IHDR chunk. */
export function inspectPng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

/* -------------------------------------------------------------------------- */
/* Package contents                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolves the include/exclude patterns of the configuration against the real
 * build output, so the resulting list is exactly what would be packed.
 *
 * The patterns of this project are explicit on purpose (`dist/**`,
 * `dist-electron/**`, `package.json`, no `node_modules`), which keeps this
 * resolution honest: a pattern that is not one of the supported forms is
 * reported instead of guessed.
 */
export function resolvePackageFiles({ baseDir = root, patterns }) {
  const included = [];
  const problems = [];

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      continue; // handling below
    }
    if (pattern.endsWith('/**/*') || pattern.endsWith('/**')) {
      const directory = path.join(baseDir, pattern.replace(/\/\*\*(\/\*)?$/, ''));
      if (!existsSync(directory)) {
        problems.push(`the configured directory ${path.relative(baseDir, directory)} does not exist`);
        continue;
      }
      for (const file of walk(directory)) {
        included.push(path.relative(baseDir, path.join(directory, file)));
      }
      continue;
    }
    if (pattern.includes('*')) {
      problems.push(`the pattern ${pattern} is not supported by this inspection`);
      continue;
    }
    const file = path.join(baseDir, pattern);
    if (!existsSync(file)) {
      problems.push(`the configured file ${pattern} does not exist`);
      continue;
    }
    included.push(pattern);
  }

  const excluded = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  const files = included
    .filter((file) => !excluded.some((pattern) => matchesExclude(file, pattern)))
    .sort();
  return { files, problems };
}

function matchesExclude(file, pattern) {
  if (pattern.endsWith('/**/*')) {
    return file.startsWith(`${pattern.slice(0, -'/**/*'.length)}/`);
  }
  if (pattern.endsWith('/**')) {
    return file.startsWith(`${pattern.slice(0, -'/**'.length)}/`);
  }
  return file === pattern;
}

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const nested of walk(full)) {
        files.push(path.join(entry.name, nested));
      }
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files;
}

/**
 * Packs the real build output into an asar archive in a temporary directory and
 * returns the archive's file list. This proves two things a configuration
 * listing alone cannot: the bundles are packable as an archive, and the archive
 * contains exactly the resolved files and nothing else.
 */
export async function packAsar({ files, destination, baseDir = root }) {
  const asar = requireDependency('@electron/asar');
  // The archive is written from the real files on disk; the library stats them
  // itself, so nothing about the contents is taken on trust.
  const absolute = files.map((file) => path.join(baseDir, file));
  await asar.createPackageFromFiles(baseDir, destination, absolute);
  const listed = await asar.listPackage(destination);
  return listed.map((entry) => entry.replace(/^\//, '').replace(/\\/g, '/')).sort();
}
