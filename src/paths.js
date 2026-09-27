// Where the app's files live. Run from source, everything sits in the repo.
// Run as the packaged exe (a Node single-executable app), bundled files come
// from inside the exe and the user's data lives in %LOCALAPPDATA%.
import fs from 'node:fs';
import * as sea from 'node:sea';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_EXE = sea.isSea();

// Set at build time for the exe (esbuild --define); read from package.json otherwise.
/* global __APP_VERSION__ */
const SOURCE_ROOT = IS_EXE ? null : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined'
  ? __APP_VERSION__
  : JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'package.json'), 'utf8')).version;

export const EXE_PATH = IS_EXE ? process.execPath : null;

export const USER_DIR = IS_EXE
  ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'LE Character Maker')
  : SOURCE_ROOT;

export const DIRS = {
  presets: path.join(USER_DIR, 'presets'),
  loadouts: path.join(USER_DIR, 'loadouts'),
  backups: path.join(USER_DIR, 'backups'),
  data: path.join(USER_DIR, 'data'),
};

// Files shipped with the app, e.g. 'gui/index.html'.
export function readAsset(name) {
  return IS_EXE ? sea.getAsset(name, 'utf8') : fs.readFileSync(path.join(SOURCE_ROOT, name), 'utf8');
}

export const BUNDLED_PRESETS = ['campaign-complete-v16'];

// First run of the exe: copy the bundled presets into the user's folder.
export function seedUserDir() {
  if (!IS_EXE) return;
  fs.mkdirSync(DIRS.presets, { recursive: true });
  for (const name of BUNDLED_PRESETS) {
    const file = path.join(DIRS.presets, `${name}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, readAsset(`presets/${name}.json`));
  }
}

// Changes whenever the running code changes: the version for the exe, file
// times from source (so a relaunch after editing replaces an old server).
export function codeVersion() {
  if (IS_EXE) return APP_VERSION;
  const files = [...fs.readdirSync(path.join(SOURCE_ROOT, 'src')).map((f) => path.join(SOURCE_ROOT, 'src', f)), path.join(SOURCE_ROOT, 'gui', 'index.html')];
  return String(Math.max(...files.map((f) => fs.statSync(f).mtimeMs)));
}
