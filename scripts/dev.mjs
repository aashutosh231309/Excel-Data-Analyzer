/**
 * Development launcher: starts the Vite dev server, bundles the Electron
 * main/preload scripts in watch mode and launches Electron against the dev URL.
 *
 *   npm run dev
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { context } from 'esbuild';
import { createServer } from 'vite';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const server = await createServer({
  configFile: path.join(root, 'vite.config.ts'),
  mode: 'development',
});
await server.listen();

const devServerUrl =
  server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port ?? 5273}/`;

const electronCtx = await context({
  entryPoints: [path.join(root, 'electron/main.ts'), path.join(root, 'electron/preload.ts')],
  outdir: path.join(root, 'dist-electron'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
});
await electronCtx.watch();

let shuttingDown = false;
const electron = spawn(electronPath, [root, '--no-sandbox'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl, NODE_ENV: 'development' },
});

async function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await electronCtx.dispose();
  await server.close();
  process.exit(code);
}

electron.on('exit', (code) => void shutdown(code ?? 0));
process.on('SIGINT', () => {
  electron.kill('SIGINT');
  void shutdown(0);
});
process.on('SIGTERM', () => {
  electron.kill('SIGTERM');
  void shutdown(0);
});

console.log(`[dev] renderer: ${devServerUrl}`);
for (const url of server.resolvedUrls?.network ?? []) {
  console.log(`[dev] network:  ${url}`);
}
