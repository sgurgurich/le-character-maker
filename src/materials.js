// Crafting materials and currencies, all stored on the stash:
//   savedShards:   [{ shardType, quantity }]        affix shards (shardType = affix id)
//   materialsList: items, base 102 runes / 103 glyphs, one stack per subtype
//   keysList:      items, base 104 keys, containerID 100, position y = subtype
//   ancientBones:  number
// Material items are tiny v5 records: [5, x, x, base, sub] (x = per-item id bytes).
import { randomInt } from 'node:crypto';
import { loadItemDb } from './itemdb.js';

export const BASE = { SHARD: 101, RUNE: 102, GLYPH: 103, KEY: 104 };
const KEY_CONTAINER = 100;
export const MAX_STACK = 999_999;

// Subtypes of a material base. By default only ones that drop normally;
// `special` adds non-dropping ones (event/boss currencies), never obsolete ones.
function subtypes(db, base, special) {
  const b = db?.bases.get(base);
  if (!b) return [];
  return [...b.subs.values()].filter((s) => !s.obsoleteItem && (special || !s.cannotDrop)).map((s) => ({ id: s.subTypeId, name: s.name }));
}

// v5 records are [5, x, x, base, sub]; old v1 ones [1, base, sub].
const isMaterial = (it, base, sub) =>
  (it.data?.[0] === 5 && it.data[3] === base && it.data[4] === sub) || (it.data?.[0] === 1 && it.data[1] === base && it.data[2] === sub);

const materialItem = (base, sub, quantity, extra = {}) => ({
  itemData: null,
  data: [5, randomInt(256), randomInt(256), base, sub],
  inventoryPosition: { x: -4, y: -4 },
  quantity,
  formatVersion: 2,
  ...extra,
});

function raiseItems(list, base, subs, amount, makeExtra) {
  let changed = 0;
  for (const { id } of subs) {
    const existing = list.find((it) => isMaterial(it, base, id));
    if (existing) {
      if (existing.quantity < amount) {
        existing.quantity = amount;
        changed++;
      }
    } else {
      list.push(materialItem(base, id, amount, makeExtra?.(id)));
      changed++;
    }
  }
  return changed;
}

function stack(v, what) {
  if (v === undefined || v === '' || v === null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_STACK) throw new Error(`${what} must be a whole number from 1 to ${MAX_STACK.toLocaleString('en-US')}`);
  return n;
}

// Raises materials on a stash to at least the given amounts. Never lowers.
// opts: { runes, glyphs, shards, keys, ancientBones, special }
export function grantMaterials(stash, opts, db = loadItemDb()) {
  if (!db) throw new Error('The item database is needed to know which materials exist');
  const runes = stack(opts.runes, 'Runes');
  const glyphs = stack(opts.glyphs, 'Glyphs');
  const shards = stack(opts.shards, 'Affix shards');
  const keys = stack(opts.keys, 'Keys');
  const bones = opts.ancientBones === undefined || opts.ancientBones === '' ? undefined : Number(opts.ancientBones);
  const special = Boolean(opts.special);
  const report = {};
  stash.materialsList ??= [];
  stash.keysList ??= [];
  stash.savedShards ??= [];
  if (runes) report.runes = raiseItems(stash.materialsList, BASE.RUNE, subtypes(db, BASE.RUNE, special), runes);
  if (glyphs) report.glyphs = raiseItems(stash.materialsList, BASE.GLYPH, subtypes(db, BASE.GLYPH, special), glyphs);
  if (keys) {
    report.keys = raiseItems(stash.keysList, BASE.KEY, subtypes(db, BASE.KEY, special), keys, (id) => ({
      containerID: KEY_CONTAINER,
      inventoryPosition: { x: 0, y: id },
    }));
  }
  if (shards) {
    let changed = 0;
    for (const { id } of subtypes(db, BASE.SHARD, true)) {
      const s = stash.savedShards.find((x) => x.shardType === id);
      if (!s) stash.savedShards.push({ shardType: id, quantity: shards }), changed++;
      else if (s.quantity < shards) (s.quantity = shards), changed++;
    }
    report.shards = changed;
  }
  if (bones !== undefined) {
    if (!Number.isInteger(bones) || bones < 0 || bones > 2_000_000_000) throw new Error('Ancient Bones must be a whole number from 0 to 2,000,000,000');
    if ('ancientBones' in stash || bones > 0) stash.ancientBones = bones;
    report.ancientBones = bones;
  }
  return report;
}

// What a stash holds, for display.
export function materialsSummary(stash, db = loadItemDb()) {
  const count = (list, base) => {
    const subs = subtypes(db, base, true);
    const held = subs.map((s) => ({ ...s, quantity: list?.find((it) => isMaterial(it, base, s.id))?.quantity ?? 0 }));
    return { types: subs.length, held: held.filter((h) => h.quantity > 0), total: held.reduce((a, h) => a + h.quantity, 0) };
  };
  const shards = stash.savedShards ?? [];
  return {
    runes: count(stash.materialsList, BASE.RUNE),
    glyphs: count(stash.materialsList, BASE.GLYPH),
    keys: count(stash.keysList, BASE.KEY),
    shards: { types: db?.bases.get(BASE.SHARD)?.subs.size ?? 0, held: shards.filter((s) => s.quantity > 0).length, total: shards.reduce((a, s) => a + Number(s.quantity), 0) },
    ancientBones: stash.ancientBones ?? null,
  };
}
