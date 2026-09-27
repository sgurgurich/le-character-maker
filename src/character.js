import { CLASSES, MAX_LEVEL, PROGRESSION_GROUPS } from './constants.js';
import { IDOL_QUESTS, isQuestComplete, maxPassivePoints } from './quests.js';
import { BASIC_ATTACK, DEFAULT_ABILITY_BARS, EMPTY_ABILITY, SKILLS, SKILL_SLOTS, skillName, skillsForClass } from './skills.js';

// A fresh character matching the save schema of competitiveCharacterVersion 17
// (the version the game wrote in mid-2024 / 2025).
export function blankCharacter({ name, classId, mastery = 0, cycle = 2 }) {
  return {
    aberrothKillTracking: null,
    uberAberrothKillTracking: null,
    hardcoreDeathTracking: null,
    levelTracking: null,
    partitionKey: null,
    characterName: name,
    level: 1,
    currentExp: 0,
    hardcore: false,
    died: false,
    deaths: 0,
    masochist: false,
    closedPassivesTooltip: false,
    closedSkillsTooltip: false,
    closedMonolithTooltip: false,
    closedIdolsTooltip: false,
    closedMinSkillLevelTutorial: false,
    characterClass: classId,
    savedItems: [],
    savedCharacterTree: { treeID: '', version: 5, nodeIDs: [], nodePoints: [], unspentPoints: 0, nodesTaken: null },
    savedSkillTrees: [],
    savedWeaverTree: { version: 0, nodeIDs: [], nodePoints: [] },
    characterTreeNodeProgression: [],
    unlockedWaypointScenes: [],
    openedOneShotCaches: [],
    abilityBar: defaultAbilityBar(classId),
    moveButtonBehaviour: 0,
    werebearAbilityBar: [],
    sprigganFormAbilityBar: [],
    swarmbladeAbilityBar: [],
    portalUnlocked: false,
    reachedTown: false,
    soloChallenge: false,
    soloCharacterChallenge: false,
    respecs: 0,
    uniquesPickedUp: 0,
    savedQuests: [],
    savedMonolithQuests: [],
    maxWave: 0,
    competitiveCharacterVersion: 17,
    oneTimeEvents: [],
    focusedQuest: -1,
    sceneProgresses: [],
    monolithRuns: [],
    timelineCompletion: [],
    timelineDifficultyCompletion: [],
    timelineDifficultyUnlocks: [],
    currentMonolithRunTimelineID: 0,
    currentMonolithRunDifficultyIndex: 0,
    currentMonolithRunToSetBack: 0,
    currentMonolithRunToSetBackDifficultyIndex: 0,
    previousMonolithEchoTimelineID: 0,
    previousMonolithEchoDifficultyIndex: 0,
    monolithEchoesConquered: 0,
    monolithTimelinesConquered: 0,
    monolithOptions: [],
    activeMonolithMods: [],
    monolithDepth: 0,
    hasRerolledMonolithOptions: false,
    chosenMastery: mastery,
    originalMastery: 0,
    clickedUnlockMasteriesButton: mastery > 0,
    currentArenaRunWaves: 0,
    previousArenaRunWaves: 0,
    arenaTiersCompleted: [],
    blessingsDiscovered: [],
    openBlessings: [],
    dungeonCompletion: [],
    lanternLuminance: 0,
    soulEmbers: 0,
    _ts: 0,
    lastPlayed: new Date().toISOString(),
    cycle,
    factions: {},
    nemesisData: { timesEmpowered: 0, levelLastPopulated: 1, encounterType: 0, minCLevel: 0, candidateMinCLevel: 0, timesBelowMinCLevel: 0 },
    championMinLevel: 0,
    createdAt: null,
    lastVisitedTownScene: null,
    id: '0',
    seqNo: 0,
    _etag: null,
    version: 0,
  };
}

export function setLevel(char, level) {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new Error(`Level must be an integer 1-${MAX_LEVEL}`);
  }
  char.level = level;
  char.currentExp = 0; // xp is progress within the current level
  if (char.nemesisData) char.nemesisData.levelLastPopulated = level;
}

// Clears all allocated passives and refunds them as unspent points.
export function resetPassives(char, points) {
  const tree = char.savedCharacterTree;
  const spent = tree.nodePoints.reduce((a, b) => a + b, 0);
  tree.nodeIDs = [];
  tree.nodePoints = [];
  tree.unspentPoints = points ?? spent + tree.unspentPoints;
  if (Array.isArray(tree.nodesTaken)) tree.nodesTaken = [];
}

// Unspent = everything levels and quests can grant, minus what's allocated.
export function grantAllPassives(char) {
  const tree = char.savedCharacterTree;
  const spent = tree.nodePoints.reduce((a, b) => a + Number(b), 0);
  tree.unspentPoints = Math.max(0, maxPassivePoints(char.level) - spent);
}

// Moves each quest to its final step, adding a record if the character never
// started it. Objectives already recorded are kept.
export function completeQuests(char, quests) {
  const usesTrackStatus = char.savedQuests.some((q) => 'trackStatus' in q) || char.competitiveCharacterVersion >= 17;
  for (const quest of quests) {
    let rec = char.savedQuests.find((q) => q.questID === quest.id);
    if (!rec) {
      rec = {
        questID: quest.id,
        questStepID: 0,
        state: 0,
        questBranch: 0,
        completeObjectives: [],
        failedObjectives: [],
        nolongerRelevantObjectives: [],
        objectiveProgress: [],
      };
      if (usesTrackStatus) rec.trackStatus = 0;
      char.savedQuests.push(rec);
    }
    rec.questStepID = quest.completedStepId;
    if (char.focusedQuest === quest.id) char.focusedQuest = -1;
  }
}

export function unlockAllIdolSlots(char) {
  completeQuests(char, IDOL_QUESTS);
}

// Points a freshly specialized, fully levelled skill gets to spend (base skill
// level 20; +levels from gear are added by the game).
const NEW_SKILL_POINTS = 20;

// slots: { [slotNumber]: treeId or '' to clear }. Unchanged slots keep their
// allocated nodes. The hotbar follows: a replaced skill's button gets the new
// one, and a newly added skill fills the first empty button.
export function setSkillSlots(char, slots, xp) {
  const warnings = [];
  const trees = [...char.savedSkillTrees];
  const bySlot = new Map(trees.map((t) => [t.slotNumber, t]));
  // Clears first, so their hotbar buttons are free for skills added in the same edit.
  const entries = Object.entries(slots).sort(([, a], [, b]) => Number(Boolean(a)) - Number(Boolean(b)));
  for (const [slotKey, id] of entries) {
    const slot = Number(slotKey);
    if (!Number.isInteger(slot) || slot < 0 || slot >= SKILL_SLOTS) throw new Error(`Skill slot must be 1-${SKILL_SLOTS}`);
    const old = bySlot.get(slot);
    if (old?.treeID === id) continue;
    if (id) {
      const skill = SKILLS.get(id);
      if (!skill) throw new Error(`Unknown skill ${id}`);
      if (skill.classId !== char.characterClass) throw new Error(`${skill.name} isn't a ${CLASSES[char.characterClass].name} skill`);
      if (skill.mastery && skill.mastery !== char.chosenMastery) {
        throw new Error(`${skill.name} needs the ${CLASSES[skill.classId].masteries[skill.mastery]} mastery`);
      }
      bySlot.set(slot, {
        treeID: id, slotNumber: slot, xp, version: skill.version,
        nodeIDs: [], nodePoints: [], unspentPoints: NEW_SKILL_POINTS, nodesTaken: null, abilityXP: 0,
      });
    } else {
      bySlot.delete(slot);
    }
    const bar = char.abilityBar ?? [];
    const at = old ? bar.indexOf(old.treeID) : -1;
    if (id && !bar.includes(id)) {
      const free = at >= 0 ? at : bar.indexOf(EMPTY_ABILITY);
      if (free >= 0) bar[free] = id;
      else warnings.push(`${SKILLS.get(id).name} isn't on the hotbar (no free button).`);
    } else if (!id && at >= 0) {
      bar[at] = EMPTY_ABILITY;
    }
    char.abilityBar = bar;
  }
  const ids = [...bySlot.values()].map((t) => t.treeID);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`${SKILLS.get(dup)?.name ?? dup} is specialized twice`);
  char.savedSkillTrees = [...bySlot.values()].sort((a, b) => a.slotNumber - b.slotNumber);
  return warnings;
}

// Sets the 5 hotbar buttons. Allowed: this class's skills, basic attack, empty.
export function setAbilityBar(char, bar) {
  if (!Array.isArray(bar) || bar.length !== SKILL_SLOTS) throw new Error(`The hotbar has ${SKILL_SLOTS} buttons`);
  const allowed = new Set([EMPTY_ABILITY, BASIC_ATTACK, ...skillsForClass(char.characterClass).map((s) => s.id), ...(char.abilityBar ?? [])]);
  for (const id of bar) if (!allowed.has(id)) throw new Error(`${skillName(id)} can't go on a ${CLASSES[char.characterClass].name}'s hotbar`);
  const skills = bar.filter((id) => id !== EMPTY_ABILITY);
  const dup = skills.find((id, i) => skills.indexOf(id) !== i);
  if (dup) throw new Error(`${skillName(dup)} is on the hotbar twice`);
  char.abilityBar = [...bar];
}

export function defaultAbilityBar(classId) {
  return [...(DEFAULT_ABILITY_BARS[classId] ?? DEFAULT_ABILITY_BARS[0])];
}

export function setSkillXp(char, xp) {
  for (const t of char.savedSkillTrees) t.xp = xp;
}

export function extractProgression(char, groups) {
  const out = {};
  for (const g of groups) {
    const fields = PROGRESSION_GROUPS[g];
    if (!fields) throw new Error(`Unknown group "${g}". Options: ${Object.keys(PROGRESSION_GROUPS).join(', ')}`);
    out[g] = Object.fromEntries(fields.filter((f) => f in char).map((f) => [f, structuredClone(char[f])]));
  }
  return out;
}

export function applyProgression(char, preset, groups = Object.keys(preset.groups)) {
  for (const g of groups) {
    const fields = preset.groups[g];
    if (!fields) throw new Error(`Preset "${preset.name}" has no "${g}" group`);
    for (const [k, v] of Object.entries(fields)) char[k] = structuredClone(v);
  }
}

export function summarize(char) {
  const c = CLASSES[char.characterClass];
  const tree = char.savedCharacterTree ?? { nodePoints: [], unspentPoints: 0 };
  return {
    name: char.characterName,
    class: c?.name ?? char.characterClass,
    mastery: c?.masteries[char.chosenMastery] ?? char.chosenMastery,
    level: char.level,
    currentExp: char.currentExp,
    hardcore: char.hardcore,
    soloChallenge: char.soloCharacterChallenge ?? char.soloChallenge,
    cycle: char.cycle ?? 'legacy',
    saveVersion: char.competitiveCharacterVersion,
    passivesSpent: tree.nodePoints.reduce((a, b) => a + b, 0),
    passivesUnspent: tree.unspentPoints,
    passivesMax: maxPassivePoints(char.level),
    idolQuests: `${IDOL_QUESTS.filter((q) => isQuestComplete(char, q)).length}/${IDOL_QUESTS.length}`,
    skills: char.savedSkillTrees.map((t) => `${skillName(t.treeID)} (xp ${t.xp})`),
    items: char.savedItems.length,
    quests: char.savedQuests.length,
    monolithQuests: char.savedMonolithQuests.length,
    waypoints: char.unlockedWaypointScenes.length,
    lastPlayed: char.lastPlayed,
  };
}
