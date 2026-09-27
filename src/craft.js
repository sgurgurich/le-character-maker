// Item creator: turns a spec into save bytes, using the same format the
// decoder reads (see items.js). Validation follows the game's rules as far as
// the item database describes them.
//
// spec = {
//   kind: 'regular' | 'unique' | 'legendary',
//   base, sub,                         // regular items
//   uniqueId,                          // unique / set / legendary
//   affixes: [{ id, tier (1-based), roll (0-100 %) }],   // regular, legendary
//   forgingPotential,                  // regular (0-255)
//   uniqueRoll,                        // unique mods, 0-100 % (default 100)
//   potential,                         // unique: Legendary Potential 0-4 / Weaver's Will 0-28
// }
import { randomInt } from 'node:crypto';
import { CONTAINERS, IDOL_BASES, RARITY, describeItem, encodeItem, isIdolBase, slotsForBase } from './items.js';
import { loadItemDb } from './itemdb.js';

const FLAG_POTENTIAL = 4;
const MAX_AFFIXES = 4;
const MAX_PER_KIND = 2; // prefixes, suffixes
const MAX_LP = 4;
const MAX_WEAVERS_WILL = 28;

const pctToRoll = (pct, what) => {
  const p = pct === undefined || pct === '' ? 100 : Number(pct);
  if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error(`${what} roll must be 0-100%`);
  return Math.round((p / 100) * 255);
};

const randomBytes = (n) => Array.from({ length: n }, () => randomInt(256));

function buildAffixes(db, base, list = []) {
  // Idols take one prefix and one suffix; gear two of each.
  const idol = isIdolBase(base);
  const maxTotal = idol ? 2 : MAX_AFFIXES;
  const perKind = idol ? 1 : MAX_PER_KIND;
  if (list.length > maxTotal) throw new Error(`At most ${maxTotal} affixes`);
  const seen = new Set();
  const kinds = { 0: 0, 1: 0 };
  return list.map((a, n) => {
    const def = db.affixes.get(Number(a.id));
    if (!def) throw new Error(`Affix ${n + 1}: unknown affix id ${a.id}`);
    if (seen.has(def.affixId)) throw new Error(`${def.name} is on the item twice`);
    seen.add(def.affixId);
    if (!def.canRollOn.includes(base)) throw new Error(`${def.name} can't roll on ${db.bases.get(base)?.name ?? 'this item type'}`);
    if (++kinds[def.type] > perKind) throw new Error(`At most ${perKind} ${def.type === 0 ? (perKind === 1 ? 'prefix' : 'prefixes') : perKind === 1 ? 'suffix' : 'suffixes'}`);
    const tier = Number(a.tier ?? def.tiers.length);
    if (!Number.isInteger(tier) || tier < 1 || tier > def.tiers.length) throw new Error(`${def.name} tier must be 1-${def.tiers.length}`);
    return { tier: tier - 1, id: def.affixId, roll: pctToRoll(a.roll, def.name) };
  });
}

export function createItem(spec, db = loadItemDb()) {
  if (!db) throw new Error('The item database is needed to create items');
  const kind = spec.kind ?? 'regular';
  const common = { version: 5, seed: randomBytes(3) };

  if (kind === 'regular') {
    const base = db.bases.get(Number(spec.base));
    if (!base || !(slotsForBase(base.baseTypeId).length || isIdolBase(base.baseTypeId))) throw new Error('Pick an equipment or idol type');
    const sub = base.subs.get(Number(spec.sub));
    if (!sub) throw new Error(`Unknown ${base.name} type`);
    const affixes = buildAffixes(db, base.baseTypeId, spec.affixes);
    // Idols have no forging potential in the game.
    const fp = isIdolBase(base.baseTypeId) || spec.forgingPotential === undefined || spec.forgingPotential === '' ? 0 : Number(spec.forgingPotential);
    if (!Number.isInteger(fp) || fp < 0 || fp > 255) throw new Error('Forging potential must be 0-255');
    return encodeItem({
      ...common,
      extra: [...randomBytes(2), 0],
      base: base.baseTypeId,
      sub: sub.subTypeId,
      rarity: affixes.length, // regular items store their affix count as rarity
      forgingPotential: fp,
      affixes,
    });
  }

  const u = db.uniques.get(Number(spec.uniqueId));
  if (!u || u.hideFromPlayers) throw new Error('Pick a unique');
  const roll = pctToRoll(spec.uniqueRoll, u.name);
  const body = { ...common, base: u.baseTypeId, sub: u.subTypeId, uniqueId: u.uniqueId, uniqueRolls: Array(8).fill(roll) };

  if (kind === 'legendary') {
    if (u.isSetItem) throw new Error('Set items can\'t be legendary');
    const affixes = buildAffixes(db, u.baseTypeId, spec.affixes);
    if (!affixes.length) throw new Error('A legendary needs at least one affix');
    return encodeItem({ ...body, extra: [...randomBytes(2), 0], rarity: RARITY.LEGENDARY, affixes });
  }

  if (kind !== 'unique') throw new Error(`Unknown item kind "${kind}"`);
  const rarity = u.isSetItem ? RARITY.SET : RARITY.UNIQUE;
  if (spec.potential === undefined || spec.potential === '' || u.isSetItem) {
    return encodeItem({ ...body, extra: [...randomBytes(2), 0], rarity, affixes: [] });
  }
  const weaver = u.legendaryType === 1;
  const max = weaver ? MAX_WEAVERS_WILL : MAX_LP;
  const potential = Number(spec.potential);
  if (!Number.isInteger(potential) || potential < 0 || potential > max) {
    throw new Error(`${weaver ? "Weaver's Will" : 'Legendary Potential'} must be 0-${max}`);
  }
  return encodeItem({ ...body, extra: [...randomBytes(2), FLAG_POTENTIAL], rarity, potential });
}

// A savedItems entry for an idol at grid position (x, y) (its top-left cell).
export function idolEntry(data, x, y) {
  return { itemData: null, data, inventoryPosition: { x, y }, quantity: 1, containerID: CONTAINERS.IDOLS, formatVersion: 2 };
}

// A savedItems entry for an equipment container.
export function equipEntry(data, containerID) {
  return { itemData: null, data, inventoryPosition: { x: 0, y: 0 }, quantity: 1, containerID, formatVersion: 2 };
}

export function previewItem(spec, db = loadItemDb()) {
  const data = createItem(spec, db);
  return { data, item: describeItem(data, db) };
}

// What the creator UI needs for one equipment slot: types, affixes, uniques.
export function catalogForSlot(containerID, db = loadItemDb()) {
  if (!db) throw new Error('The item database is needed to create items');
  const bases = Number(containerID) === CONTAINERS.IDOLS
    ? IDOL_BASES.map((id) => db.bases.get(id)).filter(Boolean)
    : [...db.bases.values()].filter((b) => slotsForBase(b.baseTypeId).includes(Number(containerID)));
  const baseIds = new Set(bases.map((b) => b.baseTypeId));
  return {
    bases: bases.map((b) => ({
      id: b.baseTypeId,
      name: b.name,
      size: b.size,
      subs: [...b.subs.values()]
        .filter((s) => !s.obsoleteItem && !s.isLegacySubType && s.name)
        .map((s) => ({ id: s.subTypeId, name: s.name, level: s.levelRequirement, classReq: s.classRequirement }))
        .sort((a, c) => a.level - c.level),
    })),
    affixes: [...db.affixes.values()]
      .filter((a) => a.canRollOn.some((b) => baseIds.has(b)) && a.name)
      .map((a) => ({ id: a.affixId, name: a.name, kind: a.type === 0 ? 'prefix' : 'suffix', canRollOn: a.canRollOn.filter((b) => baseIds.has(b)), tiers: a.tiers.length, classSpecificity: a.classSpecificity }))
      .sort((a, c) => a.name.localeCompare(c.name)),
    uniques: [...db.uniques.values()]
      .filter((u) => baseIds.has(u.baseTypeId) && !u.hideFromPlayers && u.name)
      .map((u) => ({
        id: u.uniqueId,
        name: u.name,
        base: u.baseTypeId,
        baseName: db.bases.get(u.baseTypeId)?.name,
        set: Boolean(u.isSetItem),
        setName: u.isSetItem ? db.setNames[u.setId] : null,
        weaver: u.legendaryType === 1,
        level: u.levelRequirement,
      }))
      .sort((a, c) => a.name.localeCompare(c.name)),
  };
}
