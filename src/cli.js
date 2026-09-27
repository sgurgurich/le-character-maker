#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { CLASSES, MAX_SKILL_XP, PROGRESSION_GROUPS, describeClass, resolveClass } from './constants.js';
import { backupSlot, defaultSaveDir, listSlots, readSlot, slotPath, stringifyJson, writeSlot } from './save.js';
import { blankCharacter, summarize } from './character.js';
import { itemDbPath, loadItemDb } from './itemdb.js';
import { describeGear } from './items.js';
import { captureLoadout, listLoadouts } from './loadouts.js';
import { applyEdits, capturePreset, goldInfo, listPresets, materialsArg, planGold, planMaterials, slotArg, targetSlot, updateStash } from './ops.js';
import { materialsSummary } from './materials.js';
import { readFile } from './save.js';
import { describeFactions } from './factions.js';

const HELP = `le-char - Last Epoch offline character tool

Close Last Epoch before writing. Every write backs up the old file to ./backups.

Usage: le-char <command> [options]

Commands:
  list                         List characters in the save folder
  show <slot> [--json]         Show a character (or dump its full JSON)
  create --name N --class C [--mastery M] [--slot S] [--level L] [--preset P]
                               Create a new character from a blank template
  clone <slot> --name N [--slot S]
                               Copy a character into a new slot
  set <slot> [edit options]    Edit an existing character
  delete <slot>                Move a character's save into ./backups
  presets                      List saved progression presets
  capture <slot> <preset> [--groups g1,g2] [--note text]
                               Save a character's progression as a preset
  apply <slot> <preset> [--groups g1,g2]
                               Copy a preset's progression onto a character
  classes                      List class and mastery ids
  gear <slot>                  Show equipped gear, idols and blessings
  materials <slot>             Show the runes, glyphs, shards and keys in the stash
  loadouts                     List saved gear loadouts
  find-item <text>             Look up unique, affix and item type ids by name
  save-loadout <slot> <name> [--gear-groups g1,g2] [--note text]
                               Save a character's gear as a loadout

Edit options (set, create, clone):
  --name N                     Rename
  --level L                    Set level 1-100 (resets xp within the level)
  --class C / --mastery M      Name or id; see "classes"
  --hardcore true|false
  --solo true|false            Solo Challenge (SSF)
  --reset-passives             Unallocate passives and refund points
  --passive-points N           Set unspent passive points (with --reset-passives
                               the refund is replaced by N)
  --grant-all-passives         Unspent = all points levels + quests can give
                               ((level-2) + 15 quest cap) minus allocated
  --unlock-idols               Complete the 16 quests that unlock idol slots
  --join-faction F             Join a faction (0 Circle of Fortune, 1 Merchant's
                               Guild, 2 Forgotten Knights, 3 The Weaver)
  --faction-rank F=R           Set rank (R a number or max), e.g. 1=max
  --faction-favor F=N          Set favor
  --max-factions               Max the rank of every joined faction
  --runes N / --glyphs N       Raise every rune / glyph stack to at least N
  --shards N                   Raise every affix shard type to at least N
  --keys N                     Raise every dungeon/arena key to at least N
  --ancient-bones N            Set Ancient Bones
  --special-materials          Include non-dropping types (Rune of Weaving,
                               Glyph of Insight, Primordial items, ...)
                               Materials live in the stash, shared like gold.
  --gold N                     Set gold. Gold lives in the stash, so this changes
                               it for every character sharing that stash
  --skill-slots 1=dacn33,2=shiif
                               Set specialized skills by slot (1-5); empty clears.
                               New skills start fully levelled with 20 points.
  --ability-bar a,b,c,d,e       Set the 5 hotbar buttons (skill ids, ba1 = basic
                               attack, na28 = empty)
  --skill-xp N|max             Set xp on every specialized skill (max=${MAX_SKILL_XP})
  --clear-items                Remove all equipped/inventory items
  --import-build FILE          Import a lastepochtools planner build (JSON file)
  --import-modules a,b         Only these parts: character, equipment, idols,
                               blessings, passives, skills, quests (default: all)
  --preset P [--groups ...]    Apply a progression preset
  --loadout L                  Replace gear with a saved loadout
  --copy-gear-from S           Replace gear with a copy of slot S's gear
  --gear-groups g1,g2          Limit the two above to: gear, idols, blessings
  --remove-gear 2,5            Remove items from equipment containers
                               (2 helmet 3 body 4 main 5 off 6 gloves 7 belt
                               8 boots 9/10 rings 11 amulet 12 relic)
  --create-items JSON          Create items into equipment slots, e.g.
                               '[{"containerID":4,"spec":{"kind":"unique","uniqueId":243,"uniqueRoll":100,"potential":4}}]'
                               spec kinds: regular {base,sub,affixes:[{id,tier,roll}],forgingPotential},
                               unique {uniqueId,uniqueRoll,potential}, legendary {uniqueId,uniqueRoll,affixes}
                               idols: {"containerID":29,"position":{"x":1,"y":0},"spec":{...}}
  --remove-idols 1:0,3:2       Remove idols by grid position (x:y of top-left cell)
  Replaced gear is always kept in loadouts/_replaced.

Progression groups: ${Object.keys(PROGRESSION_GROUPS).join(', ')}

Options:
  --dir PATH                   Save folder (default: LE_SAVE_DIR or the standard
                               LocalLow path)
  --dry-run                    Show the result without writing
`;

const OPTIONS = {
  dir: { type: 'string' },
  json: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  name: { type: 'string' },
  class: { type: 'string' },
  mastery: { type: 'string' },
  slot: { type: 'string' },
  level: { type: 'string' },
  hardcore: { type: 'string' },
  solo: { type: 'string' },
  'reset-passives': { type: 'boolean' },
  'grant-all-passives': { type: 'boolean' },
  'unlock-idols': { type: 'boolean' },
  'join-faction': { type: 'string' },
  'faction-rank': { type: 'string' },
  'faction-favor': { type: 'string' },
  'max-factions': { type: 'boolean' },
  runes: { type: 'string' },
  glyphs: { type: 'string' },
  shards: { type: 'string' },
  keys: { type: 'string' },
  'ancient-bones': { type: 'string' },
  'special-materials': { type: 'boolean' },
  loadout: { type: 'string' },
  'copy-gear-from': { type: 'string' },
  'gear-groups': { type: 'string' },
  'remove-gear': { type: 'string' },
  'create-items': { type: 'string' },
  'remove-idols': { type: 'string' },
  gold: { type: 'string' },
  'passive-points': { type: 'string' },
  'skill-xp': { type: 'string' },
  'skill-slots': { type: 'string' },
  'ability-bar': { type: 'string' },
  'import-build': { type: 'string' },
  'import-modules': { type: 'string' },
  'clear-items': { type: 'boolean' },
  preset: { type: 'string' },
  groups: { type: 'string' },
  note: { type: 'string' },
  force: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

function printSummary(dir, slot, char) {
  const s = summarize(char);
  const g = goldInfo(dir, char, slot);
  s.factions = describeFactions(char).map((f) => `${f.name}${f.isMember ? '' : ' (left)'} rank ${f.rank}/${f.maxRank} rep ${f.reputation} favor ${f.favor}`);
  s.gold = g.stashId
    ? `${g.gold.toLocaleString('en-US')} (stash ${g.stashId}${g.sharedWith.length ? `, shared with ${g.sharedWith.join(', ')}` : ''})`
    : 'no stash yet';
  console.log(`Slot ${slot}: ${s.name}`);
  for (const [k, v] of Object.entries(s)) {
    if (k === 'name') continue;
    console.log(`  ${k.padEnd(16)} ${Array.isArray(v) ? v.join(', ') || '-' : v}`);
  }
}

// --import-build takes a file path; the edit logic wants the file's contents.
function loadImport(o) {
  if (o['import-build'] && fs.existsSync(o['import-build'])) o['import-build'] = fs.readFileSync(o['import-build'], 'utf8');
  return o;
}

function commit(dir, slot, char, o, warnings = [], ctx = {}) {
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (o.gold !== undefined) planGold(dir, char, slot, o.gold); // throws before anything is written
  const materials = materialsArg(o);
  if (materials) planMaterials(dir, char, slot, materials);
  if (o['dry-run']) {
    console.log('(dry run, nothing written)');
    if (o.gold !== undefined) console.log(`Would set gold to ${o.gold}`);
    printSummary(dir, slot, char);
    return;
  }
  const backup = writeSlot(dir, slot, char);
  if (backup) console.log(`Backed up previous save to ${backup}`);
  console.log(`Wrote ${slotPath(dir, slot)}`);
  const st = updateStash(dir, char, slot, { gold: o.gold !== undefined ? Number(o.gold) : undefined, factions: ctx.factionsChanged, favorEdited: ctx.favorEdited, materials });
  if (st?.skipped) console.warn(`warning: ${st.skipped}`);
  else if (st) {
    const what = [o.gold !== undefined && `gold ${o.gold}`, ctx.factionsChanged && 'faction progress', materials && 'materials'].filter(Boolean).join(', ');
    console.log(`Updated ${what} in stash ${st.stashId}${st.sharedWith.length ? ` (shared with ${st.sharedWith.join(', ')})` : ''}`);
  }
  printSummary(dir, slot, char);
}

const commands = {
  list(dir) {
    const slots = listSlots(dir);
    if (!slots.length) return console.log(`No characters in ${dir}`);
    for (const slot of slots) {
      try {
        const c = readSlot(dir, slot);
        const tags = [c.hardcore && 'HC', (c.soloCharacterChallenge || c.soloChallenge) && 'SSF', c.cycle === undefined && 'legacy']
          .filter(Boolean)
          .join(' ');
        console.log(
          `${String(slot).padStart(3)}  ${c.characterName.padEnd(18)} lvl ${String(c.level).padStart(3)}  ${describeClass(c.characterClass, c.chosenMastery).padEnd(26)} ${tags}`,
        );
      } catch (e) {
        console.log(`${String(slot).padStart(3)}  <unreadable: ${e.message}>`);
      }
    }
  },

  show(dir, [slot], o) {
    const char = readSlot(dir, slotArg(slot));
    if (o.json) console.log(stringifyJson(char, 2));
    else printSummary(dir, slotArg(slot), char);
  },

  classes() {
    CLASSES.forEach((c, i) => console.log(`${i} ${c.name}: ${c.masteries.map((m, j) => `${j}=${m}`).join(', ')}`));
  },

  create(dir, _args, o) {
    if (!o.name || o.class === undefined) throw new Error('create needs --name and --class');
    const classId = resolveClass(o.class);
    const char = blankCharacter({ name: o.name, classId });
    const ctx = { dir };
    const warnings = applyEdits(char, loadImport({ ...o, class: undefined, name: undefined }), ctx);
    if (o.level !== undefined && o['passive-points'] === undefined && !o['grant-all-passives']) {
      warnings.push('New characters start with 0 unspent passive points; pass --grant-all-passives or --passive-points.');
    }
    commit(dir, targetSlot(dir, o), char, o, warnings, ctx);
  },

  clone(dir, [slot], o) {
    if (!o.name) throw new Error('clone needs --name (the game shows both characters otherwise)');
    const char = readSlot(dir, slotArg(slot));
    const ctx = { dir };
    const warnings = applyEdits(char, loadImport(o), ctx);
    commit(dir, targetSlot(dir, o), char, o, warnings, ctx);
  },

  set(dir, [slot], o) {
    const n = slotArg(slot);
    const char = readSlot(dir, n);
    const ctx = { dir };
    commit(dir, n, char, o, applyEdits(char, loadImport(o), ctx), ctx);
  },

  delete(dir, [slot], o) {
    const n = slotArg(slot);
    const file = slotPath(dir, n);
    if (!fs.existsSync(file)) throw new Error(`No character in slot ${n}`);
    if (o['dry-run']) return console.log(`Would move ${file} into backups/`);
    const char = readSlot(dir, n);
    const backup = backupSlot(dir, n);
    fs.rmSync(file);
    console.log(`Removed slot ${n} (${char.characterName}); copy kept at ${backup}`);
  },

  materials(dir, [slot]) {
    const n = slotArg(slot);
    const char = readSlot(dir, n);
    const info = goldInfo(dir, char, n);
    if (!info.stashId) return console.log(info.missing);
    const m = materialsSummary(readFile(dir, info.stashId));
    console.log(`Stash ${info.stashId}${info.sharedWith.length ? ` (shared with ${info.sharedWith.join(', ')})` : ''}`);
    for (const k of ['runes', 'glyphs', 'keys']) {
      console.log(`  ${k.padEnd(8)} ${m[k].total} total: ${m[k].held.map((h) => `${h.name} ${h.quantity}`).join(', ') || '-'}`);
    }
    console.log(`  shards   ${m.shards.total} across ${m.shards.held}/${m.shards.types} types`);
    console.log(`  ancient bones ${m.ancientBones ?? '-'}`);
  },

  gear(dir, [slot]) {
    const char = readSlot(dir, slotArg(slot));
    const db = loadItemDb();
    if (!db) console.warn(`warning: no item database at ${itemDbPath()}; showing ids only`);
    const g = describeGear(char, db);
    const line = (it) => {
      const extra = (it.uniqueRollPct != null ? ` (rolls ${it.uniqueRollPct}%)` : '') + (it.potential !== undefined ? ` ${it.potentialLabel} ${it.potential}` : '');
      const head = `${it.name} [${it.rarity}${it.name !== it.typeName ? ', ' + it.typeName : ''}]${extra}`;
      return [head, ...(it.affixes ?? []).map((a) => `      T${a.tier} ${a.text}`)].join('\n');
    };
    console.log(`${char.characterName}: equipped`);
    for (const e of g.equipped) console.log(`  ${e.slot.padEnd(11)} ${e.item ? line(e.item) : '-'}`);
    console.log(`Idols (${g.idols.length}):`);
    for (const it of g.idols) console.log(`  ${line(it)}`);
    console.log(`Blessings: ${g.blessings.map((b) => b.name).join(', ') || '-'}`);
    console.log(`Inventory items: ${g.inventoryCount}`);
  },

  'find-item'(dir, words) {
    const db = loadItemDb();
    if (!db) throw new Error(`No item database at ${itemDbPath()}`);
    const q = words.join(' ').toLowerCase();
    if (!q) throw new Error('find-item needs a search term');
    for (const u of db.uniques.values()) if (u.name?.toLowerCase().includes(q) && !u.hideFromPlayers) console.log(`unique ${String(u.uniqueId).padStart(4)}  ${u.name} (${db.bases.get(u.baseTypeId)?.name}${u.isSetItem ? ', set' : ''})`);
    for (const a of db.affixes.values()) if (a.name?.toLowerCase().includes(q)) console.log(`affix  ${String(a.affixId).padStart(4)}  ${a.name} (${a.type === 0 ? 'prefix' : 'suffix'}, T1-T${a.tiers.length}, bases ${a.canRollOn.join(',')})`);
    for (const b of db.bases.values()) for (const sub of b.subs.values()) if (sub.name?.toLowerCase().includes(q)) console.log(`type   ${b.baseTypeId}/${sub.subTypeId}  ${sub.name} (${b.name}, level ${sub.levelRequirement})`);
  },

  loadouts() {
    const list = listLoadouts();
    if (!list.length) return console.log('No loadouts yet. Create one with "le-char save-loadout".');
    for (const l of list) console.log(`${l.name.padEnd(28)} ${Object.entries(l.counts).map(([k, v]) => `${k} ${v}`).join(', ').padEnd(34)} ${l.note ?? ''}`);
  },

  'save-loadout'(dir, [slot, name], o) {
    if (!name) throw new Error('save-loadout needs a name: le-char save-loadout <slot> <name>');
    const groups = o['gear-groups']?.split(',').map((g) => g.trim());
    const { file } = captureLoadout(readSlot(dir, slotArg(slot)), name, { groups, note: o.note, force: o.force });
    console.log(`Saved loadout "${name}" to ${file}`);
  },

  presets() {
    const presets = listPresets();
    if (!presets.length) return console.log('No presets yet. Create one with "le-char capture".');
    for (const p of presets) {
      console.log(`${p.name.padEnd(28)} groups: ${Object.keys(p.groups).join(',').padEnd(30)} v${p.saveVersion ?? '?'}  ${p.note ?? ''}`);
    }
  },

  capture(dir, [slot, name], o) {
    if (!name) throw new Error('capture needs a preset name: le-char capture <slot> <preset>');
    const { file, groups } = capturePreset(readSlot(dir, slotArg(slot)), name, o);
    console.log(`Saved preset "${name}" (${groups.join(', ')}) to ${file}`);
  },

  apply(dir, [slot, name], o) {
    if (!name) throw new Error('apply needs a preset name: le-char apply <slot> <preset>');
    const n = slotArg(slot);
    const char = readSlot(dir, n);
    commit(dir, n, char, o, applyEdits(char, { preset: name, groups: o.groups }));
  },
};

function main(argv) {
  const { values: o, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [cmd, ...args] = positionals;
  if (o.help || !cmd) return console.log(HELP);
  const fn = commands[cmd];
  if (!fn) throw new Error(`Unknown command "${cmd}". Run with --help.`);
  fn(o.dir ?? defaultSaveDir(), args, o);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
