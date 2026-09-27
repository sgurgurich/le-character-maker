// Builds dist/LE-Character-Maker.exe: a Node single-executable app with the
// GUI and default presets embedded, plus a .sha256 file for the updater.
//   npm run build
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { inject } from 'postject';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const EXE = 'LE-Character-Maker.exe';
const at = (...p) => path.join(root, ...p);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);

// 1. One CommonJS file (single-executable apps can't load ES modules).
await esbuild.build({
  entryPoints: [at('src', 'main.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: at('dist', 'app.cjs'),
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  logOverride: { 'empty-import-meta': 'silent' }, // import.meta is only used when running from source
});

// 2. The blob the exe runs, with the GUI and presets as assets.
const seaConfig = {
  main: at('dist', 'app.cjs'),
  output: at('dist', 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  assets: {
    'gui/index.html': at('gui', 'index.html'),
    'presets/campaign-complete-v16.json': at('presets', 'campaign-complete-v16.json'),
  },
};
fs.writeFileSync(at('dist', 'sea-config.json'), JSON.stringify(seaConfig, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', at('dist', 'sea-config.json')], { stdio: 'inherit' });

// 3. A copy of node.exe with the blob injected. The copy's Authenticode
// signature no longer matches once modified, so remove it when signtool exists.
const exe = at('dist', EXE);
fs.copyFileSync(process.execPath, exe);
try {
  execFileSync('signtool', ['remove', '/s', exe], { stdio: 'ignore' });
} catch {
  // signtool isn't installed; Windows still runs the exe.
}
await inject(exe, 'NODE_SEA_BLOB', fs.readFileSync(seaConfig.output), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

// 4. Checksum for the in-app updater.
const hash = createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
fs.writeFileSync(`${exe}.sha256`, `${hash}  ${EXE}\n`);
for (const f of ['app.cjs', 'sea-prep.blob', 'sea-config.json']) fs.rmSync(at('dist', f));
console.log(`Built ${EXE} v${pkg.version} (${(fs.statSync(exe).size / 1e6).toFixed(1)} MB), sha256 ${hash.slice(0, 12)}…`);
