// Factions. Rank thresholds from lastepochtools.com (game data version150).
// Save format, from a character that joined in game:
//   character.factions["<id>"] = { id, isMember, hasEverJoined, rank, reputation, favor, factionSpecific }
//   stash.factions["<id>"]     = { rank, reputation, favor, factionSpecific: null }, stash.anyFactionJoinedBefore
// factionSpecific holds per-faction state (Circle of Fortune: prophecy
// constellations). When joining, it is copied from any save that has it.
import { listSlots, readSlot } from './save.js';

const RANKS_TRADE = [1, 900, 2400, 8000, 20000, 40000, 70000, 110000, 180000, 320000, 500000, 800000];

export const FACTIONS = [
  { id: 0, name: 'Circle of Fortune', reputation: RANKS_TRADE, excludes: [1] },
  { id: 1, name: "Merchant's Guild", reputation: RANKS_TRADE, excludes: [0] },
  { id: 2, name: 'Forgotten Knights', reputation: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], excludes: [] },
  { id: 3, name: 'The Weaver', reputation: [1, 1000, 2500, 5000, 10000, 17500, 30000, 50000, 75000, 100000], excludes: [] },
];

export const factionById = (id) => FACTIONS.find((f) => f.id === Number(id));
export const maxRank = (f) => f.reputation.length;

export function describeFactions(char) {
  return Object.values(char.factions ?? {}).map((e) => {
    const f = factionById(e.id);
    return {
      id: e.id,
      name: f?.name ?? `Faction ${e.id}`,
      isMember: Boolean(e.isMember),
      rank: Number(e.rank),
      maxRank: f ? maxRank(f) : null,
      reputation: Number(e.reputation),
      favor: Number(e.favor),
    };
  });
}

// Finds factionSpecific data for a faction in any character save, so a
// character can join without the game having set it up.
export function findFactionTemplate(dir, id) {
  for (const slot of listSlots(dir)) {
    try {
      const entry = readSlot(dir, slot).factions?.[String(id)];
      if (entry && entry.factionSpecific !== undefined) return structuredClone(entry.factionSpecific);
    } catch {}
  }
  return undefined;
}

function resetProgress(specific) {
  // Circle of Fortune prophecies carry kill/use counters; start them fresh.
  if (!specific || typeof specific !== 'object') return specific;
  for (const [k, v] of Object.entries(specific)) {
    if (/Prophecies$/.test(k) && Array.isArray(v)) for (const p of v) Object.assign(p, { currentUses: 0, currentKills: 0 });
  }
  if (Array.isArray(specific.prophecies)) specific.prophecies = [];
  return specific;
}

export function joinFaction(char, id, template) {
  const f = factionById(id);
  if (!f) throw new Error(`Unknown faction ${id}. Options: ${FACTIONS.map((x) => `${x.id}=${x.name}`).join(', ')}`);
  char.factions ??= {};
  for (const other of f.excludes) if (char.factions[other]) char.factions[other].isMember = false;
  const existing = char.factions[f.id];
  if (existing) {
    existing.isMember = true;
    existing.hasEverJoined = true;
    return f;
  }
  if (template === undefined) {
    throw new Error(`No save has ${f.name} data to copy yet. Join ${f.name} once in game with any character, then try again.`);
  }
  char.factions[f.id] = { id: f.id, isMember: true, hasEverJoined: true, rank: 1, reputation: f.reputation[0], favor: 0, factionSpecific: resetProgress(template) };
  return f;
}

// Sets rank (and matching reputation) and/or favor on the character's entry.
export function setFactionProgress(char, id, { rank, favor } = {}) {
  const f = factionById(id);
  const entry = char.factions?.[String(id)];
  if (!f || !entry) throw new Error(`${f?.name ?? 'That faction'} isn't joined on this character`);
  if (rank !== undefined) {
    const r = rank === 'max' ? maxRank(f) : Number(rank);
    if (!Number.isInteger(r) || r < 1 || r > maxRank(f)) throw new Error(`${f.name} rank must be 1-${maxRank(f)}`);
    entry.rank = r;
    entry.reputation = Math.max(Number(entry.reputation) || 0, f.reputation[r - 1]);
    if (r < maxRank(f)) entry.reputation = Math.min(entry.reputation, f.reputation[r] - 1);
  }
  if (favor !== undefined) {
    const v = Number(favor);
    if (!Number.isInteger(v) || v < 0 || v > 2_000_000_000) throw new Error('Favor must be a whole number from 0 to 2,000,000,000');
    entry.favor = v;
  }
  return entry;
}

// Mirrors the character's faction numbers into its shared stash, as the game
// does. Rank and reputation only ever go up there, so editing one character
// can't lower progress another character sharing the stash earned. Favor is
// copied only for factions whose favor was edited (favorEdited: Set of ids).
export function syncStashFactions(stash, char, favorEdited = new Set()) {
  stash.factions ??= {};
  for (const [id, e] of Object.entries(char.factions ?? {})) {
    if (!e.hasEverJoined) continue;
    const isNew = !stash.factions[id];
    const s = (stash.factions[id] ??= { rank: 0, reputation: 0, favor: 0, factionSpecific: null });
    s.rank = Math.max(Number(s.rank) || 0, Number(e.rank) || 0);
    s.reputation = Math.max(Number(s.reputation) || 0, Number(e.reputation) || 0);
    if (isNew || favorEdited.has(Number(id))) s.favor = e.favor;
  }
  if (Object.keys(stash.factions).length) stash.anyFactionJoinedBefore = true;
}
