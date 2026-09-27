import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIRS } from './paths.js';

const HEADER = 'EPOCH';
const SLOT_PREFIX = '1CHARACTERSLOT_BETA_';

// Where the game itself keeps saves:
// %USERPROFILE%\AppData\LocalLow\Eleventh Hour Games\Last Epoch\Saves
export function gameSaveDir() {
  return path.join(os.homedir(), 'AppData', 'LocalLow', 'Eleventh Hour Games', 'Last Epoch', 'Saves');
}

export function defaultSaveDir() {
  return process.env.LE_SAVE_DIR || gameSaveDir();
}

export function slotPath(dir, slot) {
  return path.join(dir, `${SLOT_PREFIX}${slot}`);
}

// A number whose original text JS can't reproduce: 64-bit ints beyond
// Number.MAX_SAFE_INTEGER (sceneProgresses[].savedProgress) and C# floats
// written as "0.0". Kept verbatim so untouched fields are written back exactly.
export class RawNumber {
  constructor(source) {
    this.source = source;
  }
  valueOf() {
    return Number(this.source);
  }
  toString() {
    return this.source;
  }
}

export function parseJson(text) {
  return JSON.parse(text, (_key, value, ctx) =>
    typeof value === 'number' && String(value) !== ctx.source ? new RawNumber(ctx.source) : value,
  );
}

export function stringifyJson(data, indent) {
  return JSON.stringify(data, (_key, value) => (value instanceof RawNumber ? JSON.rawJSON(value.source) : value), indent);
}

export function parseSave(text) {
  return parseJson(text.startsWith(HEADER) ? text.slice(HEADER.length) : text);
}

export function serializeSave(data) {
  return HEADER + stringifyJson(data);
}

export function readSlot(dir, slot) {
  const file = slotPath(dir, slot);
  if (!fs.existsSync(file)) throw new Error(`No character in slot ${slot} (${file})`);
  return parseSave(fs.readFileSync(file, 'utf8'));
}

// Lists occupied slots, ignoring the game's .bak and _temp copies.
export function listSlots(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Save directory not found: ${dir}`);
  const re = new RegExp(`^${SLOT_PREFIX}(\\d+)$`);
  return fs
    .readdirSync(dir)
    .map((f) => f.match(re)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

export function nextFreeSlot(dir) {
  const used = new Set(listSlots(dir));
  let n = 0;
  while (used.has(n)) n++;
  return n;
}

export function backupDir() {
  return DIRS.backups;
}

// Copies a save file (if present) into backups/ before it is overwritten.
export function backupFile(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return null;
  const out = backupDir();
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(out, `${name}.${stamp}`);
  fs.copyFileSync(file, dest);
  return dest;
}

export function backupSlot(dir, slot) {
  return backupFile(dir, `${SLOT_PREFIX}${slot}`);
}

export function readFile(dir, name) {
  return parseSave(fs.readFileSync(path.join(dir, name), 'utf8'));
}

// Backs up, then replaces atomically so a crash can't leave a half-written save.
export function writeFile(dir, name, data) {
  const backup = backupFile(dir, name);
  const file = path.join(dir, name);
  fs.writeFileSync(file + '.le-char-tmp', serializeSave(data), 'utf8');
  fs.renameSync(file + '.le-char-tmp', file);
  return backup;
}

export function writeSlot(dir, slot, data) {
  data.id = String(slot);
  if ('slot' in data) data.slot = slot;
  return writeFile(dir, `${SLOT_PREFIX}${slot}`, data);
}
