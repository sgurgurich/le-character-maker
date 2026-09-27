// Specializable skills by internal tree id (savedSkillTrees[].treeID), from
// lastepochtools.com planner data (game data version150).
// [treeId, name, classId, mastery (0 = base class), unlock level]
// Base-class rows with a level after the first block unlock via class passive
// points rather than character level.
const ROWS = [
  ['wo42', 'Summon Wolf', 0, 0, 1], ['ga2st', 'Gathering Storm', 0, 0, 2], ['fl13', 'Fury Leap', 0, 0, 3],
  ['th39', 'Summon Thorn Totem', 0, 0, 4], ['sw43', 'Swipe', 0, 0, 5], ['ts85i', 'Tempest Strike', 0, 0, 10],
  ['mas54', 'Maelstrom', 0, 0, 12], ['uph41', 'Upheaval', 0, 0, 14], ['eb5656', "Eterra's Blessing", 0, 0, 5],
  ['wc57', 'Warcry', 0, 0, 10], ['ssc50', 'Summon Storm Crows', 0, 0, 15], ['st31et', 'Serpent Strike', 0, 0, 20],
  ['srtor', 'Summon Raptor', 0, 1, 0], ['be36ar', 'Summon Bear', 0, 1, 5], ['sc36pi', 'Summon Scorpion', 0, 1, 15],
  ['sf37', 'Summon Frenzy Totem', 0, 1, 25], ['sa36oh', 'Summon Sabertooth', 0, 1, 35],
  ['st38ml', 'Summon Storm Totem', 0, 2, 0], ['to50', 'Tornado', 0, 2, 5], ['eq5s', 'Earthquake', 0, 2, 15],
  ['av75ch', 'Avalanche', 0, 2, 25], ['su3lem', 'Summon Tide Elemental', 0, 2, 30],
  ['wb8fo', 'Werebear Form', 0, 3, 0], ['sf5rd', 'Spriggan Form', 0, 3, 5], ['sp38', 'Summon Spriggan', 0, 3, 15],
  ['sbf4m', 'Swarmblade Form', 0, 3, 25], ['er6no', 'Entangling Roots', 0, 3, 35],

  ['lb23il', 'Lightning Blast', 1, 0, 1], ['fi9', 'Fireball', 1, 0, 2], ['sw31a', 'Snap Freeze', 1, 0, 3],
  ['en6', 'Elemental Nova', 1, 0, 4], ['ms26', 'Mana Strike', 1, 0, 5], ['fw3d', 'Flame Ward', 1, 0, 7],
  ['te44', 'Teleport', 1, 0, 9], ['frc87w', 'Frost Claw', 1, 0, 12], ['st47ic', 'Static', 1, 0, 15],
  ['gl14', 'Glacier', 1, 0, 5], ['dig5', 'Disintegrate', 1, 0, 10], ['vo54', 'Volcanic Orb', 1, 0, 15],
  ['vm53dx', 'Focus', 1, 0, 20],
  ['me27', 'Meteor', 1, 1, 0], ['so35a', 'Static Orb', 1, 1, 5], ['ib5g3', 'Ice Barrage', 1, 1, 15],
  ['arcas', 'Arcane Ascendance', 1, 1, 30], ['bh2', 'Black Hole', 1, 1, 40],
  ['ss3tre', 'Shatter Strike', 1, 2, 0], ['fr11mv', 'Flame Reave', 1, 2, 5], ['sb44eQ', 'Enchant Weapon', 1, 2, 15],
  ['f1b4d', 'Firebrand', 1, 2, 30], ['su5g3', 'Surge', 1, 2, 40],
  ['rn7iv', 'Runic Invocation', 1, 3, 0], ['fl71ds', 'Flame Rush', 1, 3, 5], ['fr4wl', 'Frost Wall', 1, 3, 15],
  ['fb8fe', 'Runebolt', 1, 3, 30], ['gy2dm', 'Glyph of Dominion', 1, 3, 35],

  ['gs15de', 'Vengeance', 2, 0, 1], ['va53st', 'Warpath', 2, 0, 2], ['ht16aw', 'Hammer Throw', 2, 0, 3],
  ['lu25ng', 'Lunge', 2, 0, 4], ['sndr1', 'Rive', 2, 0, 5], ['sb4h', 'Shield Bash', 2, 0, 7],
  ['javeli', 'Javelin', 2, 0, 18], ['v01cv', 'Void Cleave', 2, 0, 19], ['re82ke', 'Rebuke', 2, 0, 5],
  ['sr31hu', 'Shield Rush', 2, 0, 10], ['multis', 'Multistrike', 2, 0, 15], ['sm87r4', 'Smite', 2, 0, 20],
  ['es6ai', 'Erasing Strike', 2, 1, 0], ['vr53sl', 'Volatile Reversal', 2, 1, 5], ['ab0lh', 'Abyssal Echoes', 2, 1, 10],
  ['do5vr', 'Devouring Orb', 2, 1, 15], ['an0my', 'Anomaly', 2, 1, 30],
  ['fs3e3', 'Forge Strike', 2, 2, 0], ['st31io', 'Shield Throw', 2, 2, 5], ['ma6hdr', 'Manifest Armor', 2, 2, 15],
  ['rs31hi', 'Ring of Shields', 2, 2, 30], ['st4th', "Smelter's Wrath", 2, 2, 40],
  ['ah443', 'Holy Aura', 2, 3, 0], ['hh7pa3', 'Healing Hands', 2, 3, 5], ['ra1an', 'Radiant Lance', 2, 3, 15],
  ['pa67ju', 'Judgement', 2, 3, 30], ['si4lgl', 'Symbols of Hope', 2, 3, 35],

  ['rb31pl', 'Rip Blood', 3, 0, 1], ['ss37kl', 'Summon Skeleton', 3, 0, 2], ['bp2nk', 'Marrow Shards', 3, 0, 3],
  ['ws54hm', 'Wandering Spirits', 3, 0, 4], ['ha84', 'Harvest', 3, 0, 5], ['bc53', 'Bone Curse', 3, 0, 7],
  ['ts50pl', 'Transplant', 3, 0, 9], ['svz81', 'Summon Volatile Zombie', 3, 0, 16], ['hs18gu', 'Hungering Souls', 3, 0, 5],
  ['bg36nl', 'Summon Bone Golem', 3, 0, 10], ['sp5g2', 'Spirit Plague', 3, 0, 15], ['is40', 'Infernal Shade', 3, 0, 20],
  ['sw42ih', 'Summon Wraith', 3, 1, 0], ['sm4g', 'Summon Skeletal Mage', 3, 1, 5], ['sf31rc', 'Sacrifice', 3, 1, 10],
  ['ds4d3', 'Dread Shade', 3, 1, 30], ['aa710', 'Assemble Abomination', 3, 1, 40],
  ['rf1azz', 'Reaper Form', 3, 2, 0], ['dl73', 'Drain Life', 3, 2, 5], ['ad0ry', 'Aura of Decay', 3, 2, 10],
  ['fl44', 'Flay', 3, 2, 30], ['ds34l', 'Death Seal', 3, 2, 35],
  ['ch0fs', 'Chthonic Fissure', 3, 3, 0], ['ch4bo', 'Chaos Bolts', 3, 3, 5], ['gh0fl', 'Ghostflame', 3, 3, 15],
  ['fe8at', 'Soul Feast', 3, 3, 30], ['pr5fm', 'Profane Veil', 3, 3, 35],

  ['flur3', 'Flurry', 4, 0, 1], ['srk21', 'Shurikens', 4, 0, 2], ['sh4re', 'Shadow Rend', 4, 0, 3],
  ['aacfl', 'Acid Flask', 4, 0, 4], ['pun22', 'Puncture', 4, 0, 5], ['shiif', 'Shift', 4, 0, 6],
  ['cstri', 'Cinder Strike', 4, 0, 7], ['deeco', 'Decoy', 4, 0, 16], ['smbmb', 'Smoke Bomb', 4, 0, 5],
  ['bl5st', 'Bladestorm', 4, 0, 10], ['ba1574', 'Ballista', 4, 0, 15], ['ub5d9', 'Umbral Blades', 4, 0, 20],
  ['dacn33', 'Dancing Strikes', 4, 1, 0], ['dagg3', 'Shadow Cascade', 4, 1, 5], ['dr4sl', 'Dreamslash', 4, 1, 10],
  ['mira59', 'Lethal Mirage', 4, 1, 30], ['sync5', 'Synchronized Strike', 4, 1, 35],
  ['detar', 'Detonating Arrow', 4, 2, 0], ['mush9', 'Multishot', 4, 2, 5], ['dqv5', 'Dark Quiver', 4, 2, 15],
  ['htsk5', 'Heartseeker', 4, 2, 30], ['exvol8', 'Hail of Arrows', 4, 2, 35],
  ['falc0', 'Falconry', 4, 3, 0], ['ex4tp', 'Explosive Trap', 4, 3, 5], ['ne01t', 'Net', 4, 3, 15],
  ['aa989', 'Aerial Assault', 4, 3, 30], ['db992', 'Dive Bomb', 4, 3, 35],
];

// Current skill-tree data version per tree (savedSkillTrees[].version); new
// specializations are written with it so the game doesn't treat them as outdated.
const TREE_VERSIONS = {
  av75ch: 2, wb8fo: 3, eq5s: 1, er6no: 3, eb5656: 0, sf37: 3, fl13: 3, ga2st: 1, mas54: 3, st31et: 1,
  sf5rd: 4, st38ml: 0, be36ar: 2, su3lem: 0, srtor: 3, sa36oh: 2, sc36pi: 4, sp38: 1, ssc50: 0, wo42: 1,
  sbf4m: 3, sw43: 2, ts85i: 2, th39: 4, to50: 0, uph41: 0, wc57: 1, arcas: 2, bh2: 0, dig5: 7,
  sb44eQ: 3, fi9: 1, f1b4d: 2, fr11mv: 2, fl71ds: 0, fw3d: 1, vm53dx: 2, frc87w: 1, fr4wl: 0, gl14: 1,
  gy2dm: 0, ib5g3: 0, lb23il: 5, ms26: 1, me27: 2, en6: 0, fb8fe: 2, rn7iv: 0, ss3tre: 1, sw31a: 1,
  so35a: 4, st47ic: 4, su5g3: 0, te44: 1, vo54: 1, ab0lh: 2, an0my: 0, do5vr: 1, es6ai: 1, fs3e3: 2,
  ht16aw: 0, hh7pa3: 0, ah443: 2, javeli: 2, pa67ju: 8, lu25ng: 2, ma6hdr: 2, multis: 0, ra1an: 0, re82ke: 0,
  rs31hi: 1, sndr1: 4, sb4h: 1, sr31hu: 0, st31io: 1, si4lgl: 5, st4th: 0, sm87r4: 1, gs15de: 3, v01cv: 1,
  vr53sl: 2, va53st: 2, aa710: 2, ad0ry: 1, bc53: 1, ch4bo: 0, ch0fs: 0, ds34l: 1, dl73: 1, ds4d3: 5,
  fl44: 0, gh0fl: 0, ha84: 1, hs18gu: 1, is40: 0, bp2nk: 0, pr5fm: 0, rf1azz: 1, rb31pl: 3, sf31rc: 1,
  fe8at: 7, sp5g2: 1, bg36nl: 2, sm4g: 2, ss37kl: 2, sw42ih: 1, ts50pl: 3, svz81: 0, ws54hm: 2, aacfl: 0,
  aa989: 0, ba1574: 1, bl5st: 0, cstri: 0, dacn33: 0, dqv5: 0, deeco: 1, detar: 0, db992: 0, dr4sl: 0,
  ex4tp: 0, falc0: 0, flur3: 1, exvol8: 0, htsk5: 1, mira59: 1, mush9: 0, ne01t: 1, pun22: 7, dagg3: 0,
  sh4re: 0, shiif: 4, srk21: 1, smbmb: 1, sync5: 0, ub5d9: 1,
};

// Each class's default hotbar: starting skill, three empty buttons (na28), basic attack.
export const EMPTY_ABILITY = 'na28';
export const BASIC_ATTACK = 'ba1';
export const DEFAULT_ABILITY_BARS = [
  ['wo42', 'na28', 'na28', 'na28', 'ba1'],
  ['lb23il', 'na28', 'na28', 'na28', 'ba1'],
  ['gs15de', 'na28', 'na28', 'na28', 'ba1'],
  ['rb31pl', 'na28', 'na28', 'na28', 'ba1'],
  ['flur3', 'na28', 'na28', 'na28', 'ba1'],
];

export const SKILL_SLOTS = 5;

export const SKILLS = new Map(ROWS.map(([id, name, classId, mastery, level]) => [id, { id, name, classId, mastery, level, version: TREE_VERSIONS[id] ?? 0 }]));

export const skillsForClass = (classId) => [...SKILLS.values()].filter((s) => s.classId === classId);

export function skillName(treeId) {
  if (treeId === EMPTY_ABILITY) return 'Empty';
  if (treeId === BASIC_ATTACK) return 'Basic attack';
  return SKILLS.get(treeId)?.name ?? treeId;
}
