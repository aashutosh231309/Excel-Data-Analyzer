/**
 * Bundles the Electron main process and preload script with esbuild.
 *
 *   node scripts/build-electron.mjs               # one-off production bundle
 *   node scripts/build-electron.mjs --development # unminified bundle + sourcemaps
 *   node scripts/build-electron.mjs --watch       # rebuild on change (dev mode)
 */
import { build, context } from 'esbuild';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outdir = path.join(root, 'dist-electron');
const isDevelopment = process.argv.includes('--development');
const isWatch = process.argv.includes('--watch');

/** Electron and Node built-ins stay external: they exist at runtime. */
const options = {
  entryPoints: [path.join(root, 'electron/main.ts'), path.join(root, 'electron/preload.ts')],
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: isDevelopment,
  minify: !isDevelopment,
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production'),
  },
};

if (isWatch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[electron] watching main/preload sources…');
} else {
  await rm(outdir, { recursive: true, force: true });
  await build(options);
}
