/**
 * Verification entry point.
 *
 *   npm run verify
 *
 * Runs every headless suite in order and reports a single summary. Electron
 * itself cannot run in this environment, so the suites cover logic, security
 * configuration, bundled output and the real renderer in a DOM.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createWorkspace, printResults, removeWorkspace, root } from './verify/harness.mjs';
import { runStage1 } from './verify/stage1.mjs';
import { runStage2 } from './verify/stage2.mjs';

const suites = [
  { name: 'Stage 1 — desktop shell', run: runStage1 },
  { name: 'Stage 2 — Excel import & data understanding', run: runStage2 },
];

if (!existsSync(path.join(root, 'dist/index.html'))) {
  console.error('dist/index.html is missing — run "npm run build" before "npm run verify".');
  process.exit(1);
}

const results = [];

for (const suite of suites) {
  const started = Date.now();
  console.log(`\n▶ ${suite.name}`);
  const workspace = await createWorkspace();
  try {
    results.push(...(await suite.run(workspace)));
  } finally {
    await removeWorkspace(workspace);
  }
  console.log(`  finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

const failures = printResults(results);
const passed = results.length - failures;
console.log(
  `\n${passed}/${results.length} checks passed${failures > 0 ? ` — ${failures} FAILED.` : '.'}`,
);
process.exit(failures > 0 ? 1 : 0);
