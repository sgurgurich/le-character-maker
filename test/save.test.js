import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSave, serializeSave } from '../src/save.js';
import { blankCharacter, setLevel } from '../src/character.js';

test('round-trips 64-bit integers without precision loss', () => {
  const text = 'EPOCH{"sceneProgresses":[{"scene":"Z42","savedProgress":17451465738010628,"version":1}],"x":1.5,"abilityXP":0.0}';
  assert.equal(serializeSave(parseSave(text)), text);
});

test('blank character survives a round trip', () => {
  const c = blankCharacter({ name: 'A', classId: 2 });
  setLevel(c, 42);
  assert.deepEqual(parseSave(serializeSave(c)), c);
});

test('setLevel rejects out of range', () => {
  assert.throws(() => setLevel(blankCharacter({ name: 'A', classId: 0 }), 101));
});
