import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeItem, slotsForBase } from '../src/items.js';
import { applyGear, extractGear } from '../src/loadouts.js';

test('decodes a v5 rare with four affixes', () => {
  const d = decodeItem([5, 56, 125, 0, 11, 4, 0, 90, 54, 100, 16, 4, 0, 52, 87, 0, 13, 132, 49, 249, 75, 32, 34, 99, 0]);
  assert.equal(d.base, 0);
  assert.equal(d.sub, 11);
  assert.equal(d.forgingPotential, 16);
  assert.deepEqual(d.affixes, [
    { tier: 0, id: 52, roll: 87 },
    { tier: 0, id: 13, roll: 132 },
    { tier: 3, id: 505, roll: 75 },
    { tier: 2, id: 34, roll: 99 },
  ]);
  assert.deepEqual(d.rest, [0]);
});

test('decodes v1 and v5 uniques with two-byte ids', () => {
  assert.equal(decodeItem([1, 8, 1, 7, 250, 94, 139, 0, 32, 33, 73, 188, 152, 169, 35, 3, 135, 0]).uniqueId, 32);
  assert.equal(decodeItem([5, 51, 234, 22, 61, 7, 0, 91, 135, 114, 1, 87, 165, 227, 219, 14, 3, 212, 156, 53, 0]).uniqueId, 343);
});

test('legendary keeps its unique rolls and extra affix', () => {
  const d = decodeItem([5, 28, 30, 1, 67, 9, 0, 4, 195, 236, 1, 53, 186, 232, 132, 19, 147, 114, 251, 97, 1, 49, 223, 55]);
  assert.equal(d.uniqueId, 309);
  assert.equal(d.affixes.length, 1);
});

test('sealed flag is separate from the affix count', () => {
  const d = decodeItem([5, 120, 118, 16, 4, 4, 0, 229, 52, 50, 30, 133, 35, 5, 95, 32, 2, 9, 34, 206, 106, 16, 64, 228, 16, 68, 141, 0]);
  assert.equal(d.sealed, true);
  assert.equal(d.affixes.length, 5);
});

test('slot rules', () => {
  assert.deepEqual(slotsForBase(21), [9, 10]);
  assert.deepEqual(slotsForBase(23), [4]);
  assert.deepEqual(slotsForBase(9), [4, 5]);
});

test('applying gear replaces only the chosen groups', () => {
  const item = (containerID, b) => ({ itemData: null, data: [5, 0, 0, b, 0, 0, 0, 0, 0, 0, 0, 0, 0], inventoryPosition: { x: 0, y: 0 }, quantity: 1, containerID, formatVersion: 2 });
  const char = { characterName: 'T', characterClass: 1, level: 100, savedItems: [item(2, 0), item(29, 25), item(1, 3)] };
  const donor = { savedItems: [item(2, 0), item(3, 1), item(29, 26)] };
  applyGear(char, extractGear(donor, ['gear']), ['gear']);
  assert.deepEqual(char.savedItems.map((i) => i.containerID).sort((a, b) => a - b), [1, 2, 3, 29]);
});
