// Quests that grant passive points, idol slots or attribute points, from the
// lastepochtools.com checklist (game data version150, Season 5). A quest is
// complete in a save when its savedQuests[].questStepID equals completedStepId.
// [id, name, chapter, main, completedStepId, idolSlots, passivePoints]
const ROWS = [
  [1, 'The Void Assault', 1, true, 4, 1, 0],
  [3, "Erza's Ledger", 1, false, 12, 0, 1],
  [9, 'The Lesser Refuge', 2, false, 38, 0, 2],
  [12, 'A Study in Time', 3, false, 54, 0, 1],
  [20, "The Admiral's Dreadnought", 3, true, 106, 1, 0],
  [24, "The Oracle's Aid", 4, true, 128, 0, 1],
  [30, 'Hidden Gems', 4, false, 168, 0, 1],
  [32, 'The Immortal Citadel', 5, true, 189, 0, 1],
  [33, "Alric's Revenge", 5, false, 187, 0, 1],
  [35, 'An Ancient Hunt', 2, false, 202, 1, 0],
  [36, 'The Sapphire Tablet', 4, false, 209, 1, 1],
  [37, 'The Corrupted Lake', 3, false, 217, 1, 1],
  [39, 'The Power of Mastery', 1, true, 230, 0, 1],
  [45, 'The Lance of Heorot', 6, true, 261, 1, 0],
  [46, 'Liberating the Nomads', 6, false, 266, 1, 0],
  [47, 'A Heoborean Cure', 6, false, 270, 1, 0],
  [49, 'Evacuation', 1, false, 284, 0, 1],
  [57, 'Lagon', 7, true, 332, 0, 1],
  [58, "Liath's Tower", 7, false, 339, 1, 1],
  [93, 'Destroying the Siege Camp', 7, false, 487, 0, 1],
  [94, 'Finding Pannion', 1, true, 493, 0, 1],
  [97, 'The Upper District', 1, false, 510, 0, 1],
  [117, 'Arjani, the Ruby Commander', 8, false, 601, 1, 0],
  [119, 'Desert Treasure', 8, false, 615, 1, 1],
  [120, 'Oasis Hunt', 8, false, 621, 0, 1],
  [121, "Harton's Idol", 8, false, 626, 1, 0],
  [122, 'Too Greedily, Too Deep', 8, false, 632, 1, 0],
  [124, 'Apophis and Majasa', 8, true, 656, 0, 1],
  [128, 'The Keepers', 0, true, 687, 0, 1],
  [129, "The Keepers' Vault", 0, true, 696, 0, 1],
  [131, 'Storeroom Saboteurs', 0, false, 714, 0, 1],
  [151, 'Temple of Eterra', 9, true, 830, 0, 1],
  [158, 'Temporal Sanctum', 4, false, 853, 1, 2],
  [159, 'Lightless Arbor', 2, false, 855, 1, 2],
  [160, 'Soulfire Bastion', 3, false, 857, 1, 2],
];

export const REWARD_QUESTS = ROWS.map(([id, name, chapter, main, completedStepId, idolSlots, passivePoints]) => ({
  id, name, chapter, main, completedStepId, idolSlots, passivePoints,
}));

export const IDOL_QUESTS = REWARD_QUESTS.filter((q) => q.idolSlots > 0);

// The game caps passive points from quest rewards at 15 even though the
// quests above offer more in total.
export const QUEST_PASSIVE_CAP = 15;

// One point per level from level 3 onward, plus the quest cap: 113 at level 100.
export function maxPassivePoints(level) {
  return Math.max(0, level - 2) + QUEST_PASSIVE_CAP;
}

export function isQuestComplete(char, quest) {
  return char.savedQuests.some((q) => q.questID === quest.id && q.questStepID === quest.completedStepId);
}
