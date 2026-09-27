// Item database (bases, affixes, uniques, English names), exported from
// lastepochtools.com and cached locally. Not part of the repo: it's their
// compiled data, kept for personal use only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIRS } from './paths.js';

// data/ inside the project (git-ignored) first, then %LOCALAPPDATA%\le-char.
export const DATA_DIR = DIRS.data;

export function itemDbPath() {
  if (process.env.LE_ITEMDB) return process.env.LE_ITEMDB;
  const local = path.join(DATA_DIR, 'itemdb.json');
  if (fs.existsSync(local)) return local;
  // Older location, from before the data folder existed.
  const legacy = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'le-char', 'itemdb.json');
  return fs.existsSync(legacy) ? legacy : local;
}

// Stores item data exported from lastepochtools (see the "Get item data" flow)
// after checking it has what the app needs, and reloads it.
export function saveItemDb(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid item data.");
  }
  for (const k of ['itemList', 'affixList', 'uniqueList', 'names']) {
    if (!raw?.[k]) throw new Error(`That file is missing ${k}; export it again with the "Export LE Tools item data" bookmark.`);
  }
  const target = process.env.LE_ITEMDB || path.join(DATA_DIR, 'itemdb.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  cached = null;
  return itemDbStatus();
}

let cached = null;
let lastError = null;

export function loadItemDb() {
  if (cached) return cached;
  const file = itemDbPath();
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    lastError = null;
  } catch (e) {
    lastError = e.code === 'ENOENT' ? 'file not found' : `${e.code ?? 'error'}: ${e.message}`;
    return null;
  }
  const name = (key) => (key && raw.names[key]) || null;
  const bases = new Map();
  for (const b of [...Object.values(raw.itemList.equippable), ...Object.values(raw.itemList.nonEquippable)]) {
    const subs = new Map(Object.values(b.subItems ?? {}).map((s) => [s.subTypeId, { ...s, name: name(s.displayNameKey) }]));
    bases.set(b.baseTypeId, { ...b, name: name(b.displayNameKey), subs });
  }
  const affixes = new Map();
  for (const a of [...Object.values(raw.affixList.singleAffixes), ...Object.values(raw.affixList.multiAffixes)]) {
    affixes.set(a.affixId, {
      ...a,
      name: name(a.affixDisplayNameKey),
      title: name(a.affixTitleKey),
      propertyNames: a.affixProperties.map((p) => name(p.modDisplayNameKey)),
    });
  }
  const uniques = new Map();
  for (const u of Object.values(raw.uniqueList.uniques)) {
    uniques.set(u.uniqueId, { ...u, name: name(u.displayNameKey)?.replace(/''/g, "'") });
  }
  cached = { source: raw.source, dataVersion: raw.dataVersion, fetchedAt: raw.fetchedAt, bases, affixes, uniques, setNames: raw.setNames ?? {} };
  return cached;
}

export function itemDbStatus() {
  const db = loadItemDb();
  return db
    ? { loaded: true, path: itemDbPath(), dataVersion: db.dataVersion, fetchedAt: db.fetchedAt, uniques: db.uniques.size, affixes: db.affixes.size }
    : { loaded: false, path: itemDbPath(), error: lastError };
}
