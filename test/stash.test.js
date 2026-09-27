import assert from 'node:assert/strict';
import test from 'node:test';
import { stashFor } from '../src/stash.js';

const MAY_2025 = Date.parse('2025-05-11T14:35:00Z');
const stashes = [
  { id: 'STASH_0', stashType: 0, cycle: 1, soloCharacterId: null, modified: Date.parse('2026-09-26T23:03:00Z') },
  { id: 'STASH_2_9', stashType: 2, cycle: 1, soloCharacterId: '9', modified: MAY_2025 },
  { id: 'STASH_CYCLE_2_0', stashType: 0, cycle: 2, soloCharacterId: null, modified: MAY_2025 },
];

test('legacy characters use the legacy shared stash', () => {
  assert.equal(stashFor(stashes, { hardcore: false }, 3).id, 'STASH_0');
});

test('a season character uses its season stash while the game still writes it', () => {
  const char = { cycle: 2, hardcore: false, lastPlayed: '2024-07-08T19:19:54-04:00' };
  assert.equal(stashFor(stashes, char, 7).id, 'STASH_CYCLE_2_0');
});

test('an ended season character played since then uses the legacy stash', () => {
  const char = { cycle: 2, hardcore: false, lastPlayed: '2026-09-26T22:59:00-04:00' };
  assert.equal(stashFor(stashes, char, 8).id, 'STASH_0');
});

test('solo challenge characters use their own stash', () => {
  assert.equal(stashFor(stashes, { soloChallenge: true }, 9).id, 'STASH_2_9');
  assert.equal(stashFor(stashes, { soloChallenge: true }, 4), null);
});

test('no stash for a mode the game has not created yet', () => {
  assert.equal(stashFor(stashes, { cycle: 2, hardcore: true, lastPlayed: '2026-01-01T00:00:00Z' }, 5), null);
});
