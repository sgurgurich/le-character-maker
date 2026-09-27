// Gear loadouts: equipped gear, idols and blessings saved verbatim so they can
// be copied onto other characters. Items are never re-encoded here.
import fs from 'node:fs';
import path from 'node:path';
import { CLASSES } from './constants.js';
import { BLESSING_CONTAINERS, CONTAINERS, EQUIP_SLOTS, describeItem } from './items.js';
import { loadItemDb } from './itemdb.js';
import { DIRS } from './paths.js';
import { parseJson, stringifyJson } from './save.js';

export const LOADOUT_DIR = DIRS.loadouts;
const REPLACED_DIR = path.join(LOADOUT_DIR, '_replaced');
const KEEP_REPLACED = 30;

export const GEAR_GROUPS = {
  gear: (c) => c in EQUIP_SLOTS,
  idols: (c) => c === CONTAINERS.IDOLS,
  blessings: (c) => BLESSING_CONTAINERS.includes(c),
};

function groupOf(containerID) {
  return Object.keys(GEAR_GROUPS).find((g) => GEAR_GROUPS[g](containerID));
}

export function extractGear(char, groups = Object.keys(GEAR_GROUPS)) {
  const out = Object.fromEntries(groups.map((g) => [g, []]));
  for (const it of char.savedItems) {
    const g = groupOf(it.containerID);
    if (g && out[g]) out[g].push(structuredClone(it));
  }
  return out;
}

function safeName(name) {
  if (!/^[\w .()-]+$/.test(name)) throw new Error('Loadout names may use letters, digits, spaces and - _ . ( )');
  return name.trim();
}

function writeLoadout(dir, name, loadout, force) {
  const file = path.join(dir, `${safeName(name)}.json`);
  if (fs.existsSync(file) && !force) throw new Error(`Loadout "${name}" exists. Choose another name or overwrite it.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, stringifyJson(loadout, 2) + '\n');
  return file;
}

export function captureLoadout(char, name, { groups, note, force } = {}) {
  const chosen = groups?.length ? groups : Object.keys(GEAR_GROUPS);
  const loadout = {
    name: safeName(name),
    note: note || `${char.characterName}, level ${char.level} ${CLASSES[char.characterClass]?.name ?? ''}`.trim(),
    fromCharacter: char.characterName,
    fromClass: char.characterClass,
    capturedAt: new Date().toISOString(),
    groups: extractGear(char, chosen),
  };
  return { file: writeLoadout(LOADOUT_DIR, name, loadout, force), loadout };
}

export function loadLoadout(name) {
  const file = path.join(LOADOUT_DIR, `${safeName(name)}.json`);
  if (!fs.existsSync(file)) throw new Error(`No loadout "${name}"`);
  return parseJson(fs.readFileSync(file, 'utf8'));
}

export function listLoadouts() {
  if (!fs.existsSync(LOADOUT_DIR)) return [];
  return fs
    .readdirSync(LOADOUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const l = parseJson(fs.readFileSync(path.join(LOADOUT_DIR, f), 'utf8'));
      return {
        name: l.name,
        note: l.note,
        fromClass: l.fromClass,
        capturedAt: l.capturedAt,
        counts: Object.fromEntries(Object.entries(l.groups).map(([g, items]) => [g, items.length])),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Keeps whatever a gear change removes, so it can be put back later.
export function keepReplaced(char, removed) {
  if (!Object.values(removed).some((items) => items.length)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
  const base = `${char.characterName.replace(/[^\w .()-]/g, '_')} replaced ${stamp}`;
  let name = base;
  for (let n = 2; fs.existsSync(path.join(REPLACED_DIR, `${name}.json`)); n++) name = `${base} (${n})`;
  const file = writeLoadout(REPLACED_DIR, name, {
    name,
    note: `Gear removed from ${char.characterName}`,
    fromCharacter: char.characterName,
    fromClass: char.characterClass,
    capturedAt: new Date().toISOString(),
    groups: removed,
  });
  const old = fs.readdirSync(REPLACED_DIR).filter((f) => f.endsWith('.json')).sort().reverse().slice(KEEP_REPLACED);
  for (const f of old) fs.rmSync(path.join(REPLACED_DIR, f));
  return file;
}

// Replaces the given groups on the character with the loadout's items.
// Returns warnings, and saves the displaced items as a "replaced" loadout.
export function applyGear(char, gear, groups = Object.keys(gear)) {
  const warnings = [];
  const removed = Object.fromEntries(groups.map((g) => [g, []]));
  char.savedItems = char.savedItems.filter((it) => {
    const g = groupOf(it.containerID);
    if (g && groups.includes(g)) {
      removed[g].push(it);
      return false;
    }
    return true;
  });
  for (const g of groups) for (const it of gear[g] ?? []) char.savedItems.push(structuredClone(it));
  warnings.push(...gearWarnings(char, groups));
  const replacedFile = keepReplaced(char, removed);
  return { warnings, replacedFile };
}

export function removeGearSlots(char, containerIDs) {
  const removed = { gear: [], idols: [], blessings: [] };
  char.savedItems = char.savedItems.filter((it) => {
    if (!containerIDs.includes(it.containerID)) return true;
    removed[groupOf(it.containerID) ?? 'gear'].push(it);
    return false;
  });
  return { replacedFile: keepReplaced(char, removed) };
}

// Class and level problems with the character's equipped items.
export function gearWarnings(char, groups = ['gear']) {
  const db = loadItemDb();
  const warnings = [];
  const className = CLASSES[char.characterClass]?.name;
  for (const it of char.savedItems) {
    const g = groupOf(it.containerID);
    if (!g || !groups.includes(g)) continue;
    const d = describeItem(it.data, db);
    if (!d.supported) continue;
    if (d.classRequirement && !(d.classRequirement & (1 << char.characterClass))) {
      warnings.push(`${d.name} can't be used by ${/^[AEIOU]/.test(className) ? 'an' : 'a'} ${className}.`);
    }
    if (d.levelRequirement > char.level) warnings.push(`${d.name} needs level ${d.levelRequirement}.`);
  }
  return warnings;
}
