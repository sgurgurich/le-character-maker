import assert from 'node:assert/strict';
import test from 'node:test';
import { blankCharacter, completeQuests } from '../src/character.js';
import { loadItemDb } from '../src/itemdb.js';
import { decodeItem } from '../src/items.js';
import { applyBuild, convertBuild, parseBuild } from '../src/letools.js';
import { applyGear } from '../src/loadouts.js';

const db = loadItemDb();
const skip = !db && 'item database not available';

// A small planner build using the item database's own string ids.
function sampleBuild() {
  const unique = [...db.uniques.values()].find((u) => u.uniqueId === 243); // Dragonsong (bow)
  const helmet = db.bases.get(0).subs.get(11); // Death Mask
  const helmAffixes = [...db.affixes.values()].filter((a) => a.canRollOn.includes(0) && a.id);
  const prefix = helmAffixes.find((a) => a.type === 0), suffix = helmAffixes.find((a) => a.type === 1);
  const smallIdol = db.bases.get(25).subs.get(0);
  const blessing = [...db.bases.get(34).subs.values()].find((s) => s.id);
  return {
    bio: { level: 90, characterClass: 4, chosenMastery: 2 },
    equipment: {
      head: { id: helmet.id, affixes: [{ id: prefix.id, tier: '5', r: 200 }], sealedAffix: { id: suffix.id, tier: 1, r: 10 }, ir: [1, 2, 3], ur: [] },
      weapon1: { id: unique.id, affixes: [{ id: [...db.affixes.values()].find((a) => a.canRollOn.includes(23) && a.id).id, tier: 7 }], ir: [4, 5, 6], ur: [9, 9, 9, 9, 9, 9, 9, 9] },
    },
    idols: [{ x: 2, y: 1, id: smallIdol.id, affixes: [] }, { x: 1, y: 2, id: smallIdol.id, affixes: [] }],
    blessings: { 8: { id: blessing.id, ir: [7, 8, 9] } },
    charTree: { selected: { 1: 5, 3: 2 }, version: 0 },
    skillTrees: [{ treeID: 'mush9', selected: { 0: 0, 2: 3 }, slotNumber: 0, version: 0 }],
    hud: ['mush9', 'na28', 'na28', 'na28', 'ba1'],
    completedQuests: [1, 20, 99999],
  };
}

test('parseBuild accepts double-encoded JSON and rejects links', () => {
  assert.equal(parseBuild(JSON.stringify(JSON.stringify({ bio: {}, equipment: {} }))).bio !== undefined, true);
  assert.throws(() => parseBuild('https://www.lastepochtools.com/planner/abc'), /That is a link/);
  assert.throws(() => parseBuild('{"x":1}'), /doesn't look like/);
});

test('converts items: sealed affix first, legendary from unique + affixes', { skip }, () => {
  const c = convertBuild(sampleBuild(), db);
  const helm = decodeItem(c.gear.find((g) => g.containerID === 2).data);
  assert.equal(helm.sealed, true);
  assert.equal(helm.rarity, 1); // one regular affix; the sealed one isn't counted
  assert.equal(db.affixes.get(helm.affixes[0].id).type, 1); // the sealed suffix is stored first
  assert.deepEqual(helm.seed, [1, 2, 3]);
  const bow = decodeItem(c.gear.find((g) => g.containerID === 4).data);
  assert.equal(bow.rarity, 9);
  assert.equal(bow.uniqueId, 243);
  assert.deepEqual(bow.uniqueRolls, Array(8).fill(9));
  assert.equal(bow.affixes[0].tier, 6);
});

test('idols convert from 1-based cells; blessings map to timeline containers', { skip }, () => {
  const c = convertBuild(sampleBuild(), db);
  assert.deepEqual(c.idols.map((i) => [i.inventoryPosition.x, i.inventoryPosition.y]), [[1, 0], [0, 1]]);
  assert.deepEqual(c.blessings.map((b) => b.containerID), [43]);
  const bad = sampleBuild();
  bad.idols = [{ x: 1, y: 1, id: bad.idols[0].id, affixes: [] }]; // cell (0,0) is a missing corner
  assert.match(convertBuild(bad, db).warnings.join(), /doesn't fit the idol grid/);
});

test('applies chosen modules and refuses class-specific parts on another class', { skip }, () => {
  const char = blankCharacter({ name: 'T', classId: 4 });
  applyBuild(char, sampleBuild(), ['character', 'equipment', 'passives', 'skills', 'quests'], { applyGear, completeQuests });
  assert.equal(char.level, 90);
  assert.equal(char.chosenMastery, 2);
  assert.equal(char.savedItems.filter((i) => i.containerID >= 2 && i.containerID <= 12).length, 2);
  assert.equal(char.savedItems.some((i) => i.containerID === 29), false); // idols not chosen
  assert.deepEqual(char.savedCharacterTree.nodeIDs, [1, 3]);
  assert.deepEqual(char.savedSkillTrees[0].nodeIDs, [2]);
  assert.equal(char.savedSkillTrees[0].unspentPoints, 17);
  assert.deepEqual(char.abilityBar, ['mush9', 'na28', 'na28', 'na28', 'ba1']);
  assert.equal(char.savedQuests.length, 2);
  const mage = blankCharacter({ name: 'M', classId: 1 });
  assert.throws(() => applyBuild(mage, sampleBuild(), ['passives'], { applyGear, completeQuests }), /This build is for a Rogue/);
});
