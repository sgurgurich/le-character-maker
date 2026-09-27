// Operations shared by the CLI and the GUI server.
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from './paths.js';
import { MAX_SKILL_XP, PROGRESSION_GROUPS, resolveClass, resolveMastery } from './constants.js';
import { listSlots, nextFreeSlot, parseJson, readFile, readSlot, stringifyJson, writeFile } from './save.js';
import { grantMaterials } from './materials.js';
import { FACTIONS, factionById, findFactionTemplate, joinFaction, setFactionProgress, syncStashFactions } from './factions.js';
import { MAX_GOLD, listStashes, missingStashReason, setGold, stashFor } from './stash.js';
import {
  applyProgression,
  extractProgression,
  defaultAbilityBar,
  grantAllPassives,
  resetPassives,
  setLevel,
  completeQuests,
  setAbilityBar,
  setSkillSlots,
  setSkillXp,
  unlockAllIdolSlots,
} from './character.js';
import { applyBuild, parseBuild } from './letools.js';
import { GEAR_GROUPS, applyGear, extractGear, gearWarnings, keepReplaced, loadLoadout, removeGearSlots } from './loadouts.js';
import { CONTAINERS, EQUIP_SLOTS, decodeItem, idolCells, isIdolBase, isIdolCell, isTwoHanded, slotsForBase } from './items.js';
import { loadItemDb } from './itemdb.js';
import { createItem, equipEntry, idolEntry } from './craft.js';

export const PRESET_DIR = DIRS.presets;

export function bool(v, flag) {
  if (v === undefined || typeof v === 'boolean') return v;
  if (/^(true|1|yes)$/i.test(v)) return true;
  if (/^(false|0|no)$/i.test(v)) return false;
  throw new Error(`--${flag} expects true or false`);
}

export function int(v, flag) {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${flag} expects a non-negative integer`);
  return n;
}

export function slotArg(v) {
  const n = int(v, 'slot');
  if (n === undefined) throw new Error('Missing slot number');
  return n;
}

export function groupsArg(v) {
  if (Array.isArray(v)) return v.length ? v : undefined;
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

export function loadPreset(name) {
  const file = path.join(PRESET_DIR, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No preset "${name}". Run "le-char presets" to list them.`);
  return parseJson(fs.readFileSync(file, 'utf8'));
}

export function listPresets() {
  if (!fs.existsSync(PRESET_DIR)) return [];
  return fs
    .readdirSync(PRESET_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => parseJson(fs.readFileSync(path.join(PRESET_DIR, f), 'utf8')));
}

export function capturePreset(char, name, { groups, note, force } = {}) {
  if (!/^[\w.-]+$/.test(name)) throw new Error('Preset names may only use letters, digits, "-", "_" and "."');
  const chosen = groupsArg(groups) ?? Object.keys(PROGRESSION_GROUPS);
  const preset = {
    name,
    note: note || `Captured from ${char.characterName} (level ${char.level})`,
    saveVersion: char.competitiveCharacterVersion,
    capturedAt: new Date().toISOString(),
    groups: extractProgression(char, chosen),
  };
  const file = path.join(PRESET_DIR, `${name}.json`);
  if (fs.existsSync(file) && !force) throw new Error(`Preset "${name}" exists. Pass --force to overwrite.`);
  fs.mkdirSync(PRESET_DIR, { recursive: true });
  fs.writeFileSync(file, stringifyJson(preset, 2) + '\n');
  return { file, groups: chosen };
}

// The stash holding a character's gold, plus the other characters sharing it.
export function goldInfo(dir, char, slot, stashes = listStashes(dir)) {
  const others = [];
  for (const s of listSlots(dir)) {
    if (s === slot) continue;
    try {
      others.push({ slot: s, char: readSlot(dir, s) });
    } catch {}
  }
  const everyone = others.map((o) => o.char);
  const stash = stashFor(stashes, char, slot, everyone);
  if (!stash) return { stashId: null, gold: null, sharedWith: [], missing: missingStashReason(char) };
  const sharedWith = others
    .filter((o) => stashFor(stashes, o.char, o.slot, [char, ...everyone.filter((c) => c !== o.char)])?.id === stash.id)
    .map((o) => o.char.characterName);
  return { stashId: stash.id, gold: stash.gold, sharedWith };
}

// Validates a gold change without writing, so callers can fail before touching
// the character file.
// { 0: 'dacn33', 3: '' } or CLI text '1=dacn33,4=' (slots numbered 1-5 there).
function skillSlotsArg(v) {
  if (typeof v === 'object') return v;
  return Object.fromEntries(String(v).split(',').map((p) => p.split('=')).map(([k, id]) => [Number(k) - 1, (id ?? '').trim()]));
}

// Material flags -> grantMaterials options, or null when none were given.
export function materialsArg(o) {
  const m = { runes: o.runes, glyphs: o.glyphs, shards: o.shards, keys: o.keys, ancientBones: o['ancient-bones'], special: bool(o['special-materials'], 'special-materials') };
  return ['runes', 'glyphs', 'shards', 'keys', 'ancientBones'].some((k) => m[k] !== undefined && m[k] !== '') ? m : null;
}

// Validates material amounts and that the character has a stash, before writing.
export function planMaterials(dir, char, slot, materials) {
  const info = goldInfo(dir, char, slot);
  if (!info.stashId) throw new Error(info.missing);
  grantMaterials({}, materials); // throws on bad amounts
  return info;
}

export function planGold(dir, char, slot, value) {
  const gold = int(value, 'gold');
  if (gold > MAX_GOLD) throw new Error(`Gold can be at most ${MAX_GOLD.toLocaleString('en-US')}`);
  const info = goldInfo(dir, char, slot);
  if (!info.stashId) throw new Error(info.missing);
  return { ...info, gold };
}

export function applyGold(dir, char, slot, value) {
  const plan = planGold(dir, char, slot, value);
  return { ...plan, backup: setGold(dir, plan.stashId, plan.gold) };
}

export function targetSlot(dir, o) {
  if (o.slot === undefined || o.slot === '') return nextFreeSlot(dir);
  const slot = slotArg(o.slot);
  if (listSlots(dir).includes(slot) && !o.force) {
    throw new Error(`Slot ${slot} is occupied. Pick another --slot or pass --force to overwrite.`);
  }
  return slot;
}

// Applies the shared edit flags to a character in place; returns warnings.
export function applyEdits(char, o, ctx = {}) {
  const warnings = [];
  // A build import comes first; the rest of the edit applies on top of it.
  if (o['import-build']) {
    const { build, modules } = typeof o['import-build'] === 'string' ? { build: o['import-build'] } : o['import-build'];
    warnings.push(...applyBuild(char, parseBuild(build), listArg(modules ?? o['import-modules']), { applyGear, completeQuests }));
  }
  if (o.name !== undefined) char.characterName = o.name;
  if (o.class !== undefined) {
    const cls = resolveClass(o.class);
    if (cls !== char.characterClass) {
      char.characterClass = cls;
      // Old skills, passives and ability bar belong to the previous class.
      char.savedSkillTrees = [];
      char.abilityBar = defaultAbilityBar(cls);
      resetPassives(char);
      if (o.mastery === undefined) char.chosenMastery = 0;
      warnings.push('Class changed: cleared skills and ability bar, refunded passives.');
    }
  }
  if (o.mastery !== undefined) {
    char.chosenMastery = resolveMastery(char.characterClass, o.mastery);
    char.clickedUnlockMasteriesButton = char.chosenMastery > 0;
  }
  if (o.level !== undefined) setLevel(char, int(o.level, 'level'));
  const hc = bool(o.hardcore, 'hardcore');
  if (hc !== undefined) char.hardcore = hc;
  const solo = bool(o.solo, 'solo');
  if (solo !== undefined) {
    char.soloChallenge = solo;
    if ('soloCharacterChallenge' in char) char.soloCharacterChallenge = solo;
  }
  if (o.preset) {
    const preset = loadPreset(o.preset);
    if (preset.saveVersion !== undefined && preset.saveVersion !== char.competitiveCharacterVersion) {
      warnings.push(
        `Preset "${preset.name}" came from save version ${preset.saveVersion}, this character is ${char.competitiveCharacterVersion}. Quest IDs may not line up.`,
      );
    }
    applyProgression(char, preset, groupsArg(o.groups));
  }
  // After the preset, so a preset can't undo it.
  if (bool(o['unlock-idols'], 'unlock-idols')) unlockAllIdolSlots(char);
  const grantAll = bool(o['grant-all-passives'], 'grant-all-passives');
  if (o['reset-passives']) resetPassives(char, grantAll ? undefined : int(o['passive-points'], 'passive-points'));
  else if (o['passive-points'] !== undefined && !grantAll) char.savedCharacterTree.unspentPoints = int(o['passive-points'], 'passive-points');
  if (grantAll) grantAllPassives(char);
  // Specializations before skill xp, so 'max all' also covers new skills.
  if (o['skill-slots'] !== undefined && o['skill-slots'] !== '') {
    const slotWarnings = setSkillSlots(char, skillSlotsArg(o['skill-slots']), MAX_SKILL_XP);
    // An explicit hotbar in the same edit decides placement, so skip "not on the hotbar".
    warnings.push(...(o['ability-bar'] ? slotWarnings.filter((w) => !/hotbar/.test(w)) : slotWarnings));
  }
  if (o['ability-bar'] !== undefined && o['ability-bar'] !== '') {
    setAbilityBar(char, Array.isArray(o['ability-bar']) ? o['ability-bar'] : String(o['ability-bar']).split(',').map((x) => x.trim()));
  }
  if (o['skill-xp'] !== undefined) {
    setSkillXp(char, o['skill-xp'] === 'max' ? MAX_SKILL_XP : int(o['skill-xp'], 'skill-xp'));
  }
  if (o['clear-items']) char.savedItems = [];
  warnings.push(...applyGearEdits(char, o, ctx));
  if (applyFactionEdits(char, o, ctx)) ctx.factionsChanged = true;
  return warnings;
}

function resolveFaction(v) {
  const f = factionById(v) ?? FACTIONS.find((x) => x.name.toLowerCase().replace(/\W/g, '') === String(v).toLowerCase().replace(/\W/g, ''));
  if (!f) throw new Error(`Unknown faction "${v}". Options: ${FACTIONS.map((x) => `${x.id}=${x.name}`).join(', ')}`);
  return f;
}

// "1=max,3=5" or { 1: 'max', 3: 5 } -> [[faction, value], ...]
function factionMap(v) {
  if (v === undefined || v === '') return [];
  const entries = typeof v === 'object' ? Object.entries(v) : String(v).split(',').map((p) => p.split('='));
  return entries.filter(([, val]) => val !== undefined && val !== '').map(([k, val]) => [resolveFaction(String(k).trim()), String(val).trim()]);
}

// Returns true if anything faction-related changed.
function applyFactionEdits(char, o, ctx = {}) {
  const { dir } = ctx;
  ctx.favorEdited ??= new Set();
  let changed = false;
  if (o['join-faction'] !== undefined && o['join-faction'] !== '') {
    const f = resolveFaction(o['join-faction']);
    joinFaction(char, f.id, char.factions?.[f.id] ? undefined : dir ? findFactionTemplate(dir, f.id) : undefined);
    changed = true;
  }
  if (bool(o['max-factions'], 'max-factions')) {
    for (const e of Object.values(char.factions ?? {})) if (e.isMember) setFactionProgress(char, e.id, { rank: 'max' });
    changed = true;
  }
  for (const [f, rank] of factionMap(o['faction-rank'])) {
    setFactionProgress(char, f.id, { rank: rank === 'max' ? 'max' : Number(rank) });
    changed = true;
  }
  for (const [f, favor] of factionMap(o['faction-favor'])) {
    setFactionProgress(char, f.id, { favor: Number(favor) });
    ctx.favorEdited.add(f.id);
    changed = true;
  }
  return changed;
}

// After the character is written: mirror faction numbers into its stash and/or
// set gold there, in one stash write. Returns what happened, for messages.
export function updateStash(dir, char, slot, { gold, factions, favorEdited, materials } = {}) {
  if (gold === undefined && !factions && !materials) return null;
  const info = goldInfo(dir, char, slot);
  if (!info.stashId) {
    if (gold !== undefined || materials) throw new Error(info.missing);
    return { skipped: 'Faction progress not mirrored: this character has no stash yet.' };
  }
  const stash = readFile(dir, info.stashId);
  if (gold !== undefined) stash.gold = gold;
  if (factions) syncStashFactions(stash, char, favorEdited);
  const granted = materials ? grantMaterials(stash, materials) : undefined;
  const backup = writeFile(dir, info.stashId, stash);
  return { stashId: info.stashId, sharedWith: info.sharedWith, gold, granted, backup };
}

function listArg(v) {
  if (v === undefined || v === '') return undefined;
  return (Array.isArray(v) ? v : String(v).split(',')).map((s) => (typeof s === 'string' ? s.trim() : s)).filter((s) => s !== '');
}

// Loadout, copy-from-character and slot removal. Replaced items are kept as a
// loadout under loadouts/_replaced so nothing is lost.
function applyGearEdits(char, o, { dir } = {}) {
  const warnings = [];
  const note = (r) => r.replacedFile && warnings.push(`Replaced items kept as loadout "${path.basename(r.replacedFile, '.json')}".`);
  const remove = listArg(o['remove-gear'])?.map((c) => int(c, 'remove-gear'));
  if (remove?.length) note(removeGearSlots(char, remove));
  const groups = listArg(o['gear-groups']) ?? Object.keys(GEAR_GROUPS);
  for (const g of groups) if (!GEAR_GROUPS[g]) throw new Error(`Unknown gear group "${g}". Options: ${Object.keys(GEAR_GROUPS).join(', ')}`);
  let source = null;
  if (o.loadout) source = loadLoadout(o.loadout).groups;
  else if (o['copy-gear-from'] !== undefined && o['copy-gear-from'] !== '') {
    if (!dir) throw new Error('Copying gear needs the save folder');
    source = extractGear(readSlot(dir, slotArg(o['copy-gear-from'])), groups);
  }
  if (source) {
    const usable = groups.filter((g) => g in source);
    const r = applyGear(char, source, usable);
    warnings.push(...r.warnings);
    note(r);
  }
  // Idols removed by grid position (top-left cell).
  const removeIdols = listArg(o['remove-idols'])?.map((p) => (typeof p === 'string' ? p.split(':').map(Number) : [p.x, p.y])) ?? [];
  if (removeIdols.length) {
    const hits = char.savedItems.filter((it) => it.containerID === CONTAINERS.IDOLS && removeIdols.some(([x, y]) => it.inventoryPosition.x === x && it.inventoryPosition.y === y));
    char.savedItems = char.savedItems.filter((it) => !hits.includes(it));
    note({ replacedFile: keepReplaced(char, { gear: [], idols: hits, blessings: [] }) });
  }

  // Build every item first, so a bad spec leaves the character untouched.
  const specs = createArg(o['create-items']);
  const gear = [];
  const idols = [];
  for (const { containerID, spec, position } of specs) {
    const cid = int(containerID, 'containerID');
    const data = createItem(spec);
    const { base } = decodeItem(data);
    if (cid === CONTAINERS.IDOLS) {
      if (!isIdolBase(base)) throw new Error('Only idols go on the idol grid');
      idols.push({ data, x: int(position?.x, 'position.x'), y: int(position?.y, 'position.y'), base });
    } else {
      if (!(cid in EQUIP_SLOTS)) throw new Error(`Container ${cid} isn't an equipment slot`);
      if (!slotsForBase(base).includes(cid)) throw new Error(`That item doesn't go in the ${EQUIP_SLOTS[cid]} slot`);
      gear.push(equipEntry(data, cid));
    }
  }
  if (idols.length) placeIdols(char, idols);
  if (gear.length) {
    note(removeGearSlots(char, gear.map((e) => e.containerID)));
    char.savedItems.push(...gear);
  }
  const created = [...gear, ...idols];
  if (created.length) {
    warnings.push(...gearWarnings(char, idols.length ? ['gear', 'idols'] : ['gear']));
    const main = char.savedItems.find((it) => it.containerID === 4);
    const off = char.savedItems.find((it) => it.containerID === 5);
    if (main && off && isTwoHanded(decodeItem(main.data).base) && decodeItem(off.data).base !== 17) {
      warnings.push('A two-handed weapon is equipped together with an off-hand item.');
    }
  }
  return warnings;
}

// Puts new idols on the grid; each must fit on free grid cells.
function placeIdols(char, idols) {
  const db = loadItemDb();
  const taken = new Set();
  const occupy = (base, x, y, name) => {
    const size = db?.bases.get(base)?.size ?? { x: 1, y: 1 };
    for (const [cx, cy] of idolCells(size, x, y)) {
      if (!isIdolCell(cx, cy)) throw new Error(`${name} doesn't fit on the idol grid at ${x},${y}`);
      if (taken.has(`${cx},${cy}`)) throw new Error(`${name} at ${x},${y} overlaps another idol`);
      taken.add(`${cx},${cy}`);
    }
  };
  for (const it of char.savedItems.filter((i) => i.containerID === CONTAINERS.IDOLS)) {
    const d = decodeItem(it.data);
    if (d.supported) occupy(d.base, it.inventoryPosition.x, it.inventoryPosition.y, 'An existing idol');
  }
  for (const { data, x, y, base } of idols) {
    occupy(base, x, y, db?.bases.get(base)?.name ?? 'Idol');
    char.savedItems.push(idolEntry(data, x, y));
  }
}

// create-items: array of { containerID, spec, position? }, or its JSON text (CLI).
function createArg(v) {
  if (v === undefined || v === '') return [];
  const list = typeof v === 'string' ? JSON.parse(v) : v;
  return Array.isArray(list) ? list : [list];
}
