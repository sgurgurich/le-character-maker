// Import builds from the lastepochtools.com planner.
//
// The planner holds a build as JSON (window._loadedBuildSnapshot on a planner
// page). It uses the game's own item/affix/unique ids (as strings), so items can
// be rebuilt exactly:
//   equipment.<slot> = { id, affixes:[{id, tier (1-based), r (0-255)}], sealedAffix?, ir:[3], ur:[8] }
//   idols = [{ x, y (1-based grid cell), id, affixes, ur }]
//   blessings = { <timeline id>: { id, ir } }
//   charTree = { selected: {node: points}, version }, skillTrees = [{ treeID, selected, slotNumber, version }]
//   hud = hotbar, bio = { level, characterClass, chosenMastery }, completedQuests = [quest ids]
// Mapping to the save, checked against real saves:
//   ir = the 3 implicit-roll bytes after rarity; ur = the 8 unique-roll bytes;
//   a sealed affix is stored first, flagged in the count byte;
//   blessing timeline 1-7 -> container 33-39, 8-10 -> 43-45.
import { randomInt } from 'node:crypto';
import { CLASSES, CLASS_TREE_VERSIONS, MAX_LEVEL, MAX_SKILL_XP, withArticle } from './constants.js';
import { CONTAINERS, RARITY, describeItem, encodeItem, idolCells, isIdolBase, isIdolCell } from './items.js';
import { loadItemDb } from './itemdb.js';
import { REWARD_QUESTS, maxPassivePoints } from './quests.js';
import { SKILLS, skillName } from './skills.js';

export const IMPORT_MODULES = {
  character: 'Class, mastery & level',
  equipment: 'Equipment',
  idols: 'Idols',
  blessings: 'Blessings',
  passives: 'Passive tree',
  skills: 'Skills & hotbar',
  quests: 'Completed quests',
};

const EQUIP_KEYS = { head: 2, chest: 3, weapon1: 4, weapon2: 5, hands: 6, waist: 7, feet: 8, ring1: 9, ring2: 10, amulet: 11, relic: 12 };
const BLESSING_CONTAINERS = { 1: 33, 2: 34, 3: 35, 4: 36, 5: 37, 6: 38, 7: 39, 8: 43, 9: 44, 10: 45 };
const SKILL_POINTS = 20;

// The planner's string ids -> item database entries.
let index = null;
function dbIndex(db) {
  if (index?.db === db) return index;
  const subs = new Map();
  for (const b of db.bases.values()) for (const s of b.subs.values()) if (s.id) subs.set(s.id, { base: b.baseTypeId, sub: s.subTypeId, name: s.name });
  index = {
    db,
    subs,
    uniques: new Map([...db.uniques.values()].filter((u) => u.id).map((u) => [u.id, u])),
    affixes: new Map([...db.affixes.values()].filter((a) => a.id).map((a) => [a.id, a])),
  };
  return index;
}

// Accepts the build JSON as text (possibly JSON-encoded twice, as the page stores it) or an object.
export function parseBuild(input) {
  let b = input;
  for (let i = 0; i < 2 && typeof b === 'string'; i++) {
    const text = b.trim();
    if (/^https?:\/\//.test(text)) throw new Error('That is a link. Open it in your browser, use the "Copy build" bookmark, then paste here.');
    try {
      b = JSON.parse(text);
    } catch {
      throw new Error("That doesn't look like build data. Use the \"Copy build\" bookmark on a lastepochtools planner page, then paste.");
    }
  }
  if (!b || typeof b !== 'object' || !b.bio || !b.equipment) throw new Error("That doesn't look like a lastepochtools build.");
  return b;
}

const rand3 = () => [randomInt(256), randomInt(256), randomInt(256)];
const bytes = (arr, n, fill) => Array.from({ length: n }, (_, i) => (Number.isInteger(arr?.[i]) ? arr[i] & 0xff : fill()));

function importAffix(ix, a, warnings, where) {
  const def = ix.affixes.get(a.id);
  if (!def) {
    warnings.push(`${where}: skipped an affix the item data doesn't know (${a.id}).`);
    return null;
  }
  const tier = Math.min(Math.max(Number(a.tier) || 1, 1), def.tiers.length);
  return { id: def.affixId, tier: tier - 1, roll: Number.isInteger(a.r) ? a.r : 255 };
}

// One planner item -> save bytes.
export function importItem(entry, db = loadItemDb(), warnings = [], where = 'Item') {
  const ix = dbIndex(db);
  const unique = ix.uniques.get(entry.id);
  const type = ix.subs.get(entry.id);
  if (!unique && !type) throw new Error(`${where}: unknown item id ${entry.id}`);
  const affixes = (entry.affixes ?? []).map((a) => importAffix(ix, a, warnings, where)).filter(Boolean);
  const sealed = entry.sealedAffix ? importAffix(ix, entry.sealedAffix, warnings, where) : null;
  if (entry.corruptedAffix) warnings.push(`${where}: corrupted affixes aren't supported yet, so it was left off.`);
  const all = sealed ? [sealed, ...affixes] : affixes; // the sealed affix is stored first
  const common = { version: 5, extra: [randomInt(256), randomInt(256), 0], seed: bytes(entry.ir, 3, () => randomInt(256)), affixes: all, sealed: Boolean(sealed) };
  if (unique) {
    const rarity = affixes.length ? RARITY.LEGENDARY : unique.isSetItem ? RARITY.SET : RARITY.UNIQUE;
    return encodeItem({ ...common, base: unique.baseTypeId, sub: unique.subTypeId, rarity, uniqueId: unique.uniqueId, uniqueRolls: bytes(entry.ur, 8, () => 255) });
  }
  return encodeItem({ ...common, base: type.base, sub: type.sub, rarity: affixes.length, forgingPotential: 0 });
}

const entry = (data, containerID, x = 0, y = 0) => ({ itemData: null, data, inventoryPosition: { x, y }, quantity: 1, containerID, formatVersion: 2 });

// Everything the build contains, converted, plus warnings. Nothing is applied.
export function convertBuild(build, db = loadItemDb()) {
  if (!db) throw new Error('The item database is needed to import builds');
  const warnings = [];
  const bio = build.bio;
  const classId = Number(bio.characterClass);
  if (!CLASSES[classId]) throw new Error('The build has an unknown class');

  const gear = [];
  for (const [key, it] of Object.entries(build.equipment ?? {})) {
    const cid = EQUIP_KEYS[key];
    if (!cid || !it?.id) continue;
    try {
      gear.push(entry(importItem(it, db, warnings, key), cid));
    } catch (e) {
      warnings.push(e.message);
    }
  }

  const idols = [];
  const taken = new Set();
  for (const it of build.idols ?? []) {
    try {
      const data = importItem(it, db, warnings, 'Idol');
      const { base } = describeItem(data, db);
      if (!isIdolBase(base)) throw new Error(`Idol at ${it.x},${it.y} isn't an idol`);
      const x = Number(it.x) - 1, y = Number(it.y) - 1; // planner cells are 1-based
      const size = db.bases.get(base).size;
      const cells = idolCells(size, x, y);
      if (cells.some(([cx, cy]) => !isIdolCell(cx, cy) || taken.has(`${cx},${cy}`))) throw new Error(`Idol at ${it.x},${it.y} doesn't fit the idol grid`);
      cells.forEach(([cx, cy]) => taken.add(`${cx},${cy}`));
      idols.push(entry(data, CONTAINERS.IDOLS, x, y));
    } catch (e) {
      warnings.push(e.message);
    }
  }

  const blessings = [];
  for (const [timeline, it] of Object.entries(build.blessings ?? {})) {
    const cid = BLESSING_CONTAINERS[timeline];
    if (!cid || !it?.id) continue;
    try {
      blessings.push(entry(importItem(it, db, warnings, 'Blessing'), cid));
    } catch (e) {
      warnings.push(e.message);
    }
  }

  const tree = build.charTree ?? { selected: {} };
  const passiveNodes = Object.entries(tree.selected ?? {}).map(([n, p]) => [Number(n), Number(p)]).filter(([, p]) => p > 0);

  const skills = (build.skillTrees ?? [])
    .filter((t) => SKILLS.has(t.treeID))
    .map((t) => {
      const nodes = Object.entries(t.selected ?? {}).map(([n, p]) => [Number(n), Number(p)]).filter(([n, p]) => n !== 0 && p > 0);
      return { treeID: t.treeID, slotNumber: Number(t.slotNumber), version: Number(t.version ?? SKILLS.get(t.treeID).version), nodes };
    });
  for (const t of build.skillTrees ?? []) if (!SKILLS.has(t.treeID)) warnings.push(`Skipped unknown skill ${t.treeID}.`);

  const questIds = new Set((build.completedQuests ?? []).map(Number));
  const quests = REWARD_QUESTS.filter((q) => questIds.has(q.id));

  return {
    bio: { level: Math.min(Math.max(Number(bio.level) || 1, 1), MAX_LEVEL), classId, mastery: Number(bio.chosenMastery) || 0 },
    gear, idols, blessings,
    passives: { version: Number(tree.version ?? 0), nodes: passiveNodes },
    skills,
    hud: Array.isArray(build.hud) ? build.hud.slice(0, 5) : null,
    quests,
    unknownQuests: questIds.size - quests.length,
    dataVersion: build.dataVersion ?? null,
    warnings,
  };
}

// A readable summary for the import preview.
export function previewBuild(build, db = loadItemDb()) {
  const c = convertBuild(build, db);
  const item = (e) => ({ containerID: e.containerID, position: e.inventoryPosition, ...describeItem(e.data, db) });
  const cls = CLASSES[c.bio.classId];
  return {
    bio: { ...c.bio, className: cls.name, masteryName: cls.masteries[c.bio.mastery] ?? 'None' },
    gear: c.gear.map(item),
    idols: c.idols.map(item),
    blessings: c.blessings.map(item),
    passivePoints: c.passives.nodes.reduce((a, [, p]) => a + p, 0),
    skills: c.skills.map((t) => ({ slot: t.slotNumber, name: skillName(t.treeID), points: t.nodes.reduce((a, [, p]) => a + p, 0) })),
    hud: c.hud?.map((id) => skillName(id)) ?? [],
    quests: c.quests.length,
    dataVersion: c.dataVersion,
    warnings: c.warnings,
  };
}

// Applies the chosen modules to a character. Gear, idols and blessings go
// through applyGear so replaced items are kept. Returns warnings.
export function applyBuild(char, build, modules, { applyGear, completeQuests }) {
  const c = convertBuild(build);
  const want = new Set(modules?.length ? modules : Object.keys(IMPORT_MODULES));
  const warnings = [...c.warnings];
  const cls = CLASSES[c.bio.classId];

  if (want.has('character')) {
    if (char.characterClass !== c.bio.classId) {
      char.characterClass = c.bio.classId;
      char.savedSkillTrees = [];
      char.savedCharacterTree = { ...char.savedCharacterTree, nodeIDs: [], nodePoints: [], unspentPoints: 0 };
    }
    char.chosenMastery = c.bio.mastery;
    char.clickedUnlockMasteriesButton = c.bio.mastery > 0;
    char.level = c.bio.level;
    char.currentExp = 0;
  }
  const classMatches = char.characterClass === c.bio.classId;
  if (!classMatches && (want.has('passives') || want.has('skills'))) {
    throw new Error(`This build is for ${withArticle(cls.name)}. Include "${IMPORT_MODULES.character}", or import it into ${withArticle(cls.name)}.`);
  }

  const gear = {};
  if (want.has('equipment')) gear.gear = c.gear;
  if (want.has('idols')) gear.idols = c.idols;
  if (want.has('blessings')) gear.blessings = c.blessings;
  if (Object.keys(gear).length) {
    const r = applyGear(char, gear, Object.keys(gear));
    warnings.push(...r.warnings);
    if (r.replacedFile) warnings.push('Replaced items were kept as a loadout.');
  }

  if (want.has('passives')) {
    const spent = c.passives.nodes.reduce((a, [, p]) => a + p, 0);
    char.savedCharacterTree = {
      ...char.savedCharacterTree,
      treeID: '',
      version: c.passives.version,
      nodeIDs: c.passives.nodes.map(([n]) => n),
      nodePoints: c.passives.nodes.map(([, p]) => p),
      unspentPoints: Math.max(0, maxPassivePoints(char.level) - spent),
    };
    if (c.passives.version < CLASS_TREE_VERSIONS[c.bio.classId]) {
      warnings.push(`The passive tree was planned on an older ${cls.name} tree (v${c.passives.version}, current v${CLASS_TREE_VERSIONS[c.bio.classId]}); the game may refund some points.`);
    }
    if (spent > maxPassivePoints(char.level)) warnings.push(`The passive tree uses ${spent} points; level ${char.level} normally has ${maxPassivePoints(char.level)}.`);
  }

  if (want.has('skills')) {
    char.savedSkillTrees = c.skills.map((t) => {
      const spent = t.nodes.reduce((a, [, p]) => a + p, 0);
      return {
        treeID: t.treeID, slotNumber: t.slotNumber, xp: MAX_SKILL_XP, version: t.version,
        nodeIDs: t.nodes.map(([n]) => n), nodePoints: t.nodes.map(([, p]) => p),
        unspentPoints: Math.max(0, SKILL_POINTS - spent), nodesTaken: null, abilityXP: 0,
      };
    });
    if (c.hud?.length === 5) char.abilityBar = [...c.hud];
    const mismatched = c.skills.filter((t) => t.version !== SKILLS.get(t.treeID).version).map((t) => skillName(t.treeID));
    if (mismatched.length) warnings.push(`${mismatched.join(', ')} ${mismatched.length === 1 ? 'was' : 'were'} planned on an older skill tree; the game may refund those points.`);
  }

  if (want.has('quests') && c.quests.length) completeQuests(char, c.quests);
  if (want.has('quests') && c.unknownQuests) warnings.push(`${c.unknownQuests} completed quest${c.unknownQuests === 1 ? '' : 's'} in the build aren't known to the tool and were skipped.`);
  return warnings;
}
