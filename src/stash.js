// Gold lives in stash files, not characters. Each stash is shared by every
// character of the same cycle and mode, except Solo Challenge stashes, which
// belong to a single character:
//   STASH_0            legacy, standard          (stashType 0, cycle 1)
//   STASH_CYCLE_2_0    cycle 2, standard         (stashType 0, cycle 2)
//   STASH_2_9          Solo Challenge, slot 9    (stashType 2, soloChallengeCharacterId "9")
import fs from 'node:fs';
import path from 'node:path';
import { readFile, writeFile } from './save.js';

export const STASH_TYPE = { standard: 0, hardcore: 1, solo: 2 };

// The game stores gold as a 32-bit int; stay well clear of overflow on pickup.
export const MAX_GOLD = 2_000_000_000;

export function listStashes(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^STASH_[\w]+$/.test(f) && !/_TAB_\d+$/.test(f))
    .flatMap((id) => {
      try {
        const s = readFile(dir, id);
        const modified = fs.statSync(path.join(dir, id)).mtimeMs;
        return [{ id, stashType: s.stashType, cycle: s.cycle, soloCharacterId: s.soloChallengeCharacterId || null, gold: Number(s.gold), modified }];
      } catch {
        return [];
      }
    });
}

function isSolo(char) {
  return Boolean(char.soloCharacterChallenge ?? char.soloChallenge);
}

// Legacy stashes say cycle 1; legacy characters have no cycle field.
const LEGACY_CYCLE = 1;

// When a season ends its characters keep their cycle number but move to the
// legacy stash, and the season stash stops being written. Saves don't record
// the current season, so a season counts as over once any of its characters
// was played after its stash was last written.
function seasonStashIsLive(stash, chars) {
  if (stash.modified === undefined) return true;
  return !chars.some((c) => {
    const played = Date.parse(c.lastPlayed ?? '');
    return Number.isFinite(played) && played > stash.modified + 60_000;
  });
}

// others: the rest of the characters, used as evidence of a season ending.
export function stashFor(stashes, char, slot, others = []) {
  if (isSolo(char)) {
    return stashes.find((s) => s.stashType === STASH_TYPE.solo && s.soloCharacterId === String(slot)) ?? null;
  }
  const type = char.hardcore ? STASH_TYPE.hardcore : STASH_TYPE.standard;
  const cycle = char.cycle ?? LEGACY_CYCLE;
  if (cycle !== LEGACY_CYCLE) {
    const season = stashes.find((s) => s.stashType === type && s.cycle === cycle);
    const sameSeason = [char, ...others].filter((c) => (c.cycle ?? LEGACY_CYCLE) === cycle);
    if (season && seasonStashIsLive(season, sameSeason)) return season;
  }
  return stashes.find((s) => s.stashType === type && s.cycle === LEGACY_CYCLE) ?? null;
}

// Explains why a character has no stash yet (the game creates it on first load).
export function missingStashReason(char) {
  const kind = isSolo(char) ? 'Solo Challenge' : char.hardcore ? 'hardcore' : 'standard';
  return `No ${kind} stash exists for this character yet. Load it in game once so the game creates one, then try again.`;
}

export function setGold(dir, stashId, gold) {
  if (!Number.isInteger(gold) || gold < 0 || gold > MAX_GOLD) {
    throw new Error(`Gold must be a whole number from 0 to ${MAX_GOLD.toLocaleString('en-US')}`);
  }
  const stash = readFile(dir, stashId);
  stash.gold = gold;
  return writeFile(dir, stashId, stash);
}
