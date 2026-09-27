// Updates from GitHub releases. A release carries the exe plus a .sha256 file;
// installing downloads the exe, checks it against that hash, and hands over to
// a small script that swaps it in once this process exits, then relaunches.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION, EXE_PATH, IS_EXE, USER_DIR } from './paths.js';

export const REPO = 'sgurgurich/le-character-maker';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_MS = 30 * 60 * 1000;

let cached = null;

// "1.2.10" > "1.2.9"; ignores a leading "v" and any "-suffix".
export function newerThan(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

export async function checkForUpdate({ force = false } = {}) {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.info;
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'le-character-maker' } });
  if (res.status === 404) return { current: APP_VERSION, available: false, latest: null, note: 'No releases published yet.' };
  if (!res.ok) throw new Error(`GitHub returned ${res.status} checking for updates`);
  const r = await res.json();
  const latest = String(r.tag_name ?? '').replace(/^v/, '');
  const exe = r.assets?.find((a) => /\.exe$/i.test(a.name));
  const sum = r.assets?.find((a) => /\.exe\.sha256$/i.test(a.name));
  const info = {
    current: APP_VERSION,
    latest,
    available: Boolean(latest && exe && newerThan(latest, APP_VERSION)),
    notes: r.body ?? '',
    url: r.html_url,
    publishedAt: r.published_at,
    asset: exe ? { url: exe.browser_download_url, size: exe.size, name: exe.name } : null,
    checksumUrl: sum?.browser_download_url ?? null,
    canInstall: IS_EXE,
  };
  cached = { at: Date.now(), info };
  return info;
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'le-character-maker' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// Downloads and verifies the new exe, then schedules the swap. The caller
// should exit the process shortly after this resolves.
export async function installUpdate() {
  if (!IS_EXE) throw new Error('Running from source: update with git pull instead.');
  const info = await checkForUpdate({ force: true });
  if (!info.available) throw new Error("You're already on the latest version.");
  if (!info.checksumUrl) throw new Error('The release has no checksum, so the download could not be verified.');

  const [exe, sumText] = await Promise.all([download(info.asset.url), download(info.checksumUrl).then((b) => b.toString('utf8'))]);
  const expected = sumText.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash('sha256').update(exe).digest('hex');
  if (!/^[0-9a-f]{64}$/.test(expected) || actual !== expected) throw new Error("The download didn't match its checksum, so it wasn't installed.");

  const dir = path.join(USER_DIR, 'updates');
  fs.mkdirSync(dir, { recursive: true });
  const newExe = path.join(dir, `LE-Character-Maker-${info.latest}.exe`);
  fs.writeFileSync(newExe, exe);

  // Wait for this process to exit, swap the exe in place, and relaunch. If the
  // exe's folder isn't writable, run the downloaded copy instead.
  const script = path.join(dir, 'apply-update.cmd');
  fs.writeFileSync(script, [
    '@echo off',
    ':wait',
    `tasklist /FI "PID eq ${process.pid}" 2>nul | find "${process.pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)`,
    `move /Y "${newExe}" "${EXE_PATH}" >nul 2>&1 && (start "" "${EXE_PATH}") || (start "" "${newExe}")`,
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n'));
  spawn('cmd.exe', ['/c', script], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return { version: info.latest };
}
