// characterClass -> { name, masteries[chosenMastery] }. Mastery 0 = none chosen.
export const CLASSES = [
  { name: 'Primalist', masteries: ['None', 'Beastmaster', 'Shaman', 'Druid'] },
  { name: 'Mage', masteries: ['None', 'Sorcerer', 'Spellblade', 'Runemaster'] },
  { name: 'Sentinel', masteries: ['None', 'Void Knight', 'Forge Guard', 'Paladin'] },
  { name: 'Acolyte', masteries: ['None', 'Necromancer', 'Lich', 'Warlock'] },
  { name: 'Rogue', masteries: ['None', 'Bladedancer', 'Marksman', 'Falconer'] },
];

export const MAX_LEVEL = 100;

// Current passive (class) tree data version per class, from lastepochtools'
// planner data (game data version150). Older trees may be refunded by the game.
export const CLASS_TREE_VERSIONS = [12, 7, 12, 3, 0];

export const withArticle = (word) => `${/^[AEIOU]/i.test(word) ? 'an' : 'a'} ${word}`;

// Skill tree xp seen on fully leveled skills in real saves.
export const MAX_SKILL_XP = 5_700_000;

// Save fields that make up "where the character is in the game". Presets
// capture and apply these groups wholesale.
export const PROGRESSION_GROUPS = {
  campaign: [
    'savedQuests',
    'focusedQuest',
    'unlockedWaypointScenes',
    'oneTimeEvents',
    'sceneProgresses',
    'openedOneShotCaches',
    'portalUnlocked',
    'reachedTown',
    'lastVisitedTownScene',
  ],
  monolith: [
    'savedMonolithQuests',
    'timelineCompletion',
    'timelineDifficultyCompletion',
    'timelineDifficultyUnlocks',
    'blessingsDiscovered',
    'monolithEchoesConquered',
    'monolithTimelinesConquered',
  ],
  dungeons: ['dungeonCompletion'],
  arena: ['arenaTiersCompleted', 'maxWave'],
};

export function resolveClass(value) {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (Number.isInteger(n) && CLASSES[n]) return n;
  const i = CLASSES.findIndex((c) => c.name.toLowerCase() === String(value).toLowerCase());
  if (i === -1) throw new Error(`Unknown class "${value}". Options: ${CLASSES.map((c, i) => `${i}=${c.name}`).join(', ')}`);
  return i;
}

export function resolveMastery(classId, value) {
  if (value === undefined) return undefined;
  const list = CLASSES[classId].masteries;
  const n = Number(value);
  if (Number.isInteger(n) && list[n]) return n;
  const i = list.findIndex((m) => m.toLowerCase().replace(/\s/g, '') === String(value).toLowerCase().replace(/\s/g, ''));
  if (i === -1) throw new Error(`Unknown ${CLASSES[classId].name} mastery "${value}". Options: ${list.map((m, i) => `${i}=${m}`).join(', ')}`);
  return i;
}

export function describeClass(classId, mastery) {
  const c = CLASSES[classId];
  if (!c) return `class#${classId}`;
  return mastery ? `${c.masteries[mastery] ?? `mastery#${mastery}`} (${c.name})` : c.name;
}
