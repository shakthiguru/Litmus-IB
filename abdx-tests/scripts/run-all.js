// Runs the suite in three passes (seed -> parallel -> stateful), merges the results and builds the HTML report.
// Usage: node scripts/run-all.js            (WORKERS=n to change the parallel worker count)
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const blobDir = path.join(root, 'blob-report');
const outDir = path.join(root, 'reports');
fs.rmSync(blobDir, { recursive: true, force: true });
fs.rmSync(path.join(outDir, 'playwright-html'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const workers = String(process.env.WORKERS || 12);
const passes = [
  { project: 'seed', workers: '1' },
  { project: 'parallel', workers },
  { project: 'stateful', workers: '1' },
];
const meta = { startedAt: new Date().toISOString(), workers: Number(workers), baseURL: process.env.ABDX_BASE_URL || 'https://abdx.vercel.app', passes: [] };
const t0 = Date.now();
for (const [i, p] of passes.entries()) {
  const start = Date.now();
  console.log(`\n=== Pass ${i + 1}/3: ${p.project} (${p.workers} worker${p.workers === '1' ? '' : 's'}) ===`);
  const r = spawnSync('npx', ['playwright', 'test', '--project', p.project, '--workers', p.workers, '--reporter', 'dot,blob', '--output', path.join('test-results', p.project)], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BLOB_OUTPUT_FILE: path.join(blobDir, `${i + 1}-${p.project}.zip`) },
  });
  meta.passes.push({ ...p, seconds: (Date.now() - start) / 1000, exitCode: r.status });
}
meta.wallSeconds = (Date.now() - t0) / 1000;
meta.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outDir, 'run-meta.json'), JSON.stringify(meta, null, 2));

console.log('\n=== Merging results ===');
spawnSync('npx', ['playwright', 'merge-reports', '--reporter', 'html,json', blobDir], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(outDir, 'results.json'), PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(outDir, 'playwright-html'), PLAYWRIGHT_HTML_OPEN: 'never' },
});
require('./report.js');
