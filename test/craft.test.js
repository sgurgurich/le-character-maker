import assert from 'node:assert/strict';
import test from 'node:test';
import { createItem } from '../src/craft.js';
import { loadItemDb } from '../src/itemdb.js';
import { decodeItem, describeItem, encodeItem } from '../src/items.js';

const db = loadItemDb();
const skip = !db && 'item database not available';

test('encode reproduces decoded items byte for byte', () => {
  for (const data of [
    [5, 56, 125, 0, 11, 4, 0, 90, 54, 100, 16, 4, 0, 52, 87, 0, 13, 132, 49, 249, 75, 32, 34, 99, 0],
    [5, 28, 30, 1, 67, 9, 0, 4, 195, 236, 1, 53, 186, 232, 132, 19, 147, 114, 251, 97, 1, 49, 223, 55],
    [5, 88, 192, 21, 4, 7, 4, 198, 151, 122, 1, 38, 92, 167, 213, 59, 134, 234, 235, 222, 15],
    [1, 8, 4, 7, 193, 92, 131, 0, 234, 211, 82, 57, 166, 179, 12, 33, 133, 1],
  ]) assert.deepEqual(encodeItem(decodeItem(data)), data);
});

test('creates a rare with the requested affixes', { skip }, () => {
  const data = createItem({ kind: 'regular', base: 0, sub: 11, forgingPotential: 40, affixes: [{ id: 52, tier: 5, roll: 100 }, { id: 505, tier: 7, roll: 0 }] });
  const d = decodeItem(data);
  assert.equal(d.rarity, 2);
  assert.equal(d.forgingPotential, 40);
  assert.deepEqual(d.affixes, [{ tier: 4, id: 52, roll: 255 }, { tier: 6, id: 505, roll: 0 }]);
  assert.equal(describeItem(data, db).rarity, 'Exalted');
});

test('creates a unique with legendary potential', { skip }, () => {
  const d = decodeItem(createItem({ kind: 'unique', uniqueId: 243, uniqueRoll: 100, potential: 4 }));
  assert.equal(d.uniqueId, 243);
  assert.equal(d.potential, 4);
  assert.deepEqual(d.uniqueRolls, Array(8).fill(255));
});

test('creates a legendary: unique rolls plus affixes', { skip }, () => {
  const d = decodeItem(createItem({ kind: 'legendary', uniqueId: 309, uniqueRoll: 50, affixes: [{ id: 25, tier: 7, roll: 100 }] }));
  assert.equal(d.rarity, 9);
  assert.equal(d.uniqueId, 309);
  assert.equal(d.affixes.length, 1);
  assert.equal(d.potential, undefined);
});

test('rejects affixes the item cannot have', { skip }, () => {
  assert.throws(() => createItem({ kind: 'regular', base: 0, sub: 11, affixes: [{ id: 0, tier: 1 }] }), /can't roll on/);
  const suffixes = [...db.affixes.values()].filter((a) => a.type === 1 && a.canRollOn.includes(0)).slice(0, 3);
  assert.throws(() => createItem({ kind: 'regular', base: 0, sub: 11, affixes: suffixes.map((a) => ({ id: a.affixId, tier: 1 })) }), /At most 2 suffixes/);
  assert.throws(() => createItem({ kind: 'unique', uniqueId: 243, potential: 9 }), /Legendary Potential must be 0-4/);
});

test('creates idols with at most one prefix and one suffix, no forging potential', { skip }, () => {
  const idolAffix = (type) => [...db.affixes.values()].find((a) => a.type === type && a.canRollOn.includes(25));
  const d = decodeItem(createItem({ kind: 'regular', base: 25, sub: 0, forgingPotential: 40, affixes: [{ id: idolAffix(0).affixId, tier: 1 }, { id: idolAffix(1).affixId, tier: 1 }] }));
  assert.equal(d.base, 25);
  assert.equal(d.forgingPotential, 0);
  assert.equal(d.affixes.length, 2);
  const prefixes = [...db.affixes.values()].filter((a) => a.type === 0 && a.canRollOn.includes(25)).slice(0, 2);
  assert.throws(() => createItem({ kind: 'regular', base: 25, sub: 0, affixes: prefixes.map((a) => ({ id: a.affixId, tier: 1 })) }), /At most 1 prefix/);
});
