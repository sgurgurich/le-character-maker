import assert from 'node:assert/strict';
import test from 'node:test';
import { blankCharacter, setLevel, summarize } from '../src/character.js';
import { applyEdits } from '../src/ops.js';
import { IDOL_QUESTS, isQuestComplete, maxPassivePoints } from '../src/quests.js';

test('max passive points: 1 per level from 3 plus the 15 quest cap', () => {
  assert.equal(maxPassivePoints(100), 113);
  assert.equal(maxPassivePoints(2), 15);
  assert.equal(maxPassivePoints(1), 15);
});

test('grant-all-passives leaves allocated + unspent = max', () => {
  const c = blankCharacter({ name: 'A', classId: 1 });
  c.savedCharacterTree.nodeIDs = [1, 2];
  c.savedCharacterTree.nodePoints = [10, 20];
  applyEdits(c, { level: 100, 'grant-all-passives': true });
  assert.equal(c.savedCharacterTree.unspentPoints, 83);
  applyEdits(c, { 'reset-passives': true, 'grant-all-passives': true });
  assert.equal(c.savedCharacterTree.unspentPoints, 113);
});

test('unlock-idols completes every idol quest, keeping existing records', () => {
  const c = blankCharacter({ name: 'A', classId: 1 });
  c.savedQuests.push({ questID: 1, questStepID: 2, state: 0, questBranch: 0, completeObjectives: [1], failedObjectives: [], nolongerRelevantObjectives: [], objectiveProgress: [], trackStatus: 0 });
  c.focusedQuest = 1;
  applyEdits(c, { 'unlock-idols': true });
  assert.ok(IDOL_QUESTS.every((q) => isQuestComplete(c, q)));
  assert.equal(c.savedQuests.filter((q) => q.questID === 1).length, 1);
  assert.deepEqual(c.savedQuests.find((q) => q.questID === 1).completeObjectives, [1]);
  assert.equal(c.focusedQuest, -1);
  assert.equal(summarize(c).idolQuests, '16/16');
});

test('unlock-idols survives a preset applied in the same edit', () => {
  const c = blankCharacter({ name: 'A', classId: 1 });
  setLevel(c, 50);
  applyEdits(c, { preset: 'campaign-complete-v16', groups: ['campaign'], 'unlock-idols': true });
  assert.ok(IDOL_QUESTS.every((q) => isQuestComplete(c, q)));
});

test('skill slots: swap, clear and hotbar follow-up', async () => {
  const { setSkillSlots, setAbilityBar } = await import('../src/character.js');
  const c = blankCharacter({ name: 'A', classId: 4, mastery: 1 });
  c.chosenMastery = 1;
  setSkillSlots(c, { 0: 'dacn33', 1: 'shiif' }, 5_700_000);
  assert.deepEqual(c.savedSkillTrees.map((t) => [t.slotNumber, t.treeID, t.version, t.unspentPoints]), [[0, 'dacn33', 0, 20], [1, 'shiif', 4, 20]]);
  assert.deepEqual(c.abilityBar, ['flur3', 'dacn33', 'shiif', 'na28', 'ba1']);
  setSkillSlots(c, { 1: '', 0: 'dagg3' }, 5_700_000); // clear + swap in one edit
  assert.deepEqual(c.savedSkillTrees.map((t) => t.treeID), ['dagg3']);
  assert.deepEqual(c.abilityBar, ['flur3', 'dagg3', 'na28', 'na28', 'ba1']);
  assert.throws(() => setSkillSlots(c, { 2: 'mush9' }, 1), /needs the Marksman mastery/);
  assert.throws(() => setSkillSlots(c, { 2: 'dagg3' }, 1), /specialized twice/);
  assert.throws(() => setAbilityBar(c, ['fi9', 'na28', 'na28', 'na28', 'ba1']), /can't go on a Rogue's hotbar/);
});
