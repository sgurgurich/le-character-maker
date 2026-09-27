# LE Character Maker

[![CI](https://github.com/sgurgurich/le-character-maker/actions/workflows/ci.yml/badge.svg)](https://github.com/sgurgurich/le-character-maker/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/sgurgurich/le-character-maker)](https://github.com/sgurgurich/le-character-maker/releases/latest)

Create and edit **Last Epoch offline characters** for build testing:

- Level 100, every passive point and all idol slots in one click.
- Create any item: rares, exalted items, uniques, sets, legendaries and idols.
- Import a build from lastepochtools.com.
- Choose skills and the hotbar.
- Set factions, gold and crafting materials.

**[Download for Windows](https://sgurgurich.github.io/le-character-maker/)**: a single exe with nothing to install. It updates itself.

> Offline characters only. A fan-made tool, not affiliated with Eleventh Hour Games or lastepochtools.com. Back up your saves; the app also backs up every save it writes.

## Using the app

1. Run `LE-Character-Maker.exe`. It opens in its own window and finds your offline saves.
2. **Item data (once).** Click **Item data** in the sidebar and follow the steps. You export the item data from lastepochtools.com with a bookmark and load the file. The app doesn't redistribute that data.
3. Pick or create a character, click **Make build-ready**, add gear, then **Save**. Close Last Epoch before saving.

Your presets, loadouts, backups and item data are kept in `%LOCALAPPDATA%\LE Character Maker`. When you open the app, it checks GitHub for a newer release and offers to install it. **Check for updates** does the same on demand. Updates are verified against the SHA-256 checksum published with each release.

## Development

Needs Node 22+ (the code uses `JSON.rawJSON`, JSON.parse source access and `node:sea`). The app itself has no runtime dependencies.

```bash
npm install        # build tools only (esbuild, postject)
npm test
npm start          # run the app from source
npm run build      # dist/LE-Character-Maker.exe + .sha256
```

**Releasing:**

1. Bump `version` in `package.json` and commit.
2. Push a matching tag: `git tag v1.0.1 && git push origin v1.0.1`.
3. The Release workflow tests, builds and publishes the exe and its checksum. Installed apps then offer the update on their next launch.

**Download page:** `docs/` is deployed to GitHub Pages by the Pages workflow. It reads the latest release from the GitHub API, so it doesn't need redeploying per release.

## Running from source

Double-click `le-char-gui.vbs`, or a desktop shortcut pointing at `wscript.exe "<repo>\le-char-gui.vbs"`. It does three things:
- starts `src/server.js` without a console window
- serves `gui/index.html` on `127.0.0.1:47315` (set `LE_CHAR_PORT` to use another port)
- opens it in an Edge or Chrome app window

The server exits a few seconds after you close the window. Launching again while it's running opens another window; if the app was updated since that server started, the new launch replaces the old server.

Each character has four tabs: **Character** (name, class, level, mode), **Progression** (passives, skills, idol slots, presets, factions), **Gear** (equipment, idols, loadouts, item creator) and **Stash** (gold and materials, shared with other characters). Nothing is written until you save:

- **Queued actions.** One-off actions such as "Grant all" or "Reset tree" are buttons. Once queued, a button shows the result; click it again to undo.
- **Pending changes.** The bar at the bottom lists every pending change in plain words, and × undoes a single one.
- **Tab dots.** A dot marks tabs with unsaved changes.
- **Saving.** Ctrl+S saves.
- **Build-ready.** **Make build-ready** queues everything a level 100 test character needs; review the queue, then save.

While `Last Epoch.exe` is running, saving is disabled. Server errors go to `%TEMP%\le-char-gui.log`.

## CLI

```bash
node src/cli.js list
node src/cli.js create --name Paly --class sentinel --mastery paladin --level 90 --passive-points 100 --preset campaign-complete-v16
node src/cli.js set 7 --level 100 --skill-xp max
node src/cli.js clone 0 --name WarlockAlt --level 80
node src/cli.js capture 9 my-endgame --note "campaign done, monolith unlocked"
node src/cli.js apply 3 my-endgame --groups campaign
node src/cli.js --help
```

**Close Last Epoch before writing.** The game keeps characters in memory and will overwrite your edits on exit.

## Save format

Offline saves live in `%USERPROFILE%\AppData\LocalLow\Eleventh Hour Games\Last Epoch\Saves` (override with `--dir` or `LE_SAVE_DIR`).

- `1CHARACTERSLOT_BETA_<n>` is a character. The file is the literal `EPOCH` followed by JSON. `.bak` and `_temp` copies are the game's own.
- Some numbers (`sceneProgresses[].savedProgress`) are 64-bit and floats are written as `0.0`. The parser keeps these verbatim, so fields you don't edit are written back byte for byte.
- `cycle` present means a cycle character; missing means legacy. `competitiveCharacterVersion` is the save schema version.

## Progression presets

Quest state is stored as numeric IDs (quests, objectives, scene names, one-time event flags) that aren't documented anywhere. So instead of hand-editing IDs, you **capture** the state from a real character that reached the point you want, then **apply** it to others. Presets live in `presets/` and have these groups:

| group      | fields |
|------------|--------|
| `campaign` | savedQuests, waypoints, oneTimeEvents, sceneProgresses, portal/town flags |
| `monolith` | monolith quests, timeline completion + difficulty unlocks, blessings |
| `dungeons` | dungeonCompletion |
| `arena`    | arenaTiersCompleted, maxWave |

`campaign-complete-v16` was captured from a pre-1.0 save (version 16): the prologue was reworked since then, so it lacks the new prologue quests (127/128). Capture a fresh preset from an up-to-date character when you have one.

## Backups

Every write copies the previous file to `backups/` first. `delete` also moves the file there. To restore a backup, copy it back over the slot file.

## Build-test characters

The main use case is a level 100 character with everything unlocked. In the GUI, **New character** defaults to exactly that. **Make build-ready** does the same for an existing character. From the CLI:

```bash
node src/cli.js create --name Rune --class mage --mastery runemaster --level 100 --grant-all-passives --unlock-idols --preset campaign-complete-v16
```

- **Passives:** `--grant-all-passives` sets unspent points to the maximum minus what's allocated. The maximum is 1 point per level from level 3 onward, plus 15 from quests (the game caps quest rewards at 15), so 113 at level 100.
- **Idol slots:** the save has no idol-slot field; the game counts completed quests. `--unlock-idols` moves the 16 idol-slot quests to their final step. Quest IDs and final steps are in `src/quests.js`, taken from lastepochtools.com's checklist data (game data `version150`). A quest is complete when `savedQuests[].questStepID` equals its final step, which matches existing saves.

## Gold

Gold isn't stored on the character. It's in the stash file the character uses (`--gold N` in the CLI, or the Gold card in the GUI):

| Stash | Used by |
|---|---|
| `STASH_0` | all legacy standard characters |
| `STASH_CYCLE_<n>_0` | all cycle `<n>` standard characters |
| `STASH_2_<slot>` | one Solo Challenge character |

Characters are matched to stashes by the `stashType`, `cycle` and `soloChallengeCharacterId` fields inside each stash file. Setting gold on a shared stash changes it for every character on that stash, and the tool lists them.

A new hardcore or Solo Challenge character has no stash until you load it in game once. I've assumed hardcore stashes use `stashType` 1, but haven't confirmed it. Gold is capped at 2 billion, because the game stores it as a 32-bit number.

## Import from LE Tools

Builds from the [lastepochtools.com planner](https://www.lastepochtools.com/planner/) can be imported. Use **Import build…** in the sidebar, or **⋯ → Import from LE Tools…** on a character.

1. Drag the dialog's **Copy LE Tools build** button to your bookmarks bar (once).
2. Open a build on the planner and click the bookmark. It copies the build the page loaded; in the page's console, `copy(_loadedBuildSnapshot)` does the same.
3. Paste. A preview shows the class, gear, idols, skills and passives.
4. Import **everything**, or choose parts: class/mastery/level, equipment, idols, blessings, passive tree, skills & hotbar, completed quests.
5. Import into the current character (queued, review, then save) or into a new character. **Also unlock all idol slots** is on by default.

What gets rebuilt:

- **Items:** exact, from the planner's ids, including legendaries, sealed affixes and unique rolls.
- **Idols:** placed on the grid (the planner's cells are 1-based).
- **Blessings:** each goes in its timeline's slot.
- **Passive and skill trees:** node allocations are copied. Skills get max xp, and the hotbar is copied too.
- **Quests:** the ones the tool knows are marked complete.

The tool warns when a build's passive or skill trees are older than the game's current trees (the game may refund those points), and when gear doesn't suit the character's class. Passives and skills for another class are refused unless class is imported too. Corrupted affixes aren't imported yet.

CLI: `--import-build build.json` (a file holding the copied build) and `--import-modules equipment,idols`.

How the planner's fields map onto the save, all checked against real saves:

- `ir` is the 3 implicit-roll bytes after rarity.
- `ur` is the 8 unique-roll bytes.
- The sealed affix is stored first and flagged in the count byte.
- Blessing timelines 1–7 go in containers 33–39, and 8–10 in 43–45.

## Skills and hotbar

The **Skills** card on the Progression tab shows the 5 specialization slots (`savedSkillTrees[].slotNumber` 0–4) and the 5-button hotbar (`abilityBar`).

- **Specialization slots.** Pick any skill for your class. Skills from other masteries are shown but disabled, and a skill can't be in two slots.
- **New skills.** A new skill starts fully levelled (5,700,000 xp) with 20 unspent points. It is written with the game's current tree version (from lastepochtools' planner data, in `src/skills.js`) so the game doesn't reset it.
- **Hotbar follow-up.** A new skill takes the replaced skill's hotbar button, or the first empty one (`na28`); clearing a slot empties its button. Each hotbar button can also be set directly, to any class skill, basic attack (`ba1`) or empty.

In the CLI: `--skill-slots 1=dacn33,5=` (slots numbered 1–5, empty clears) and `--ability-bar mira59,smbmb,srk21,shiif,dacn33`. New characters now get their class's default hotbar.

## Crafting materials and currencies

Use the **Crafting materials** card ("Fill everything" gives 999 of every rune, glyph and affix shard, and 99 of every key), or in the CLI:

```bash
node src/cli.js materials 8
node src/cli.js set 8 --runes 999 --glyphs 999 --shards 999 --keys 99 --ancient-bones 50000
```

Amounts are minimums: stacks are raised to N and never lowered. By default only types that drop normally are granted. `--special-materials` (or the checkbox) adds non-dropping ones such as Rune of Weaving, Glyph of Insight and the Primordial items. Obsolete types are never added. **Make build-ready** fills materials too.

Everything is stored in the stash (shared like gold):

- `savedShards: [{shardType, quantity}]`: the shard type is the affix id.
- `materialsList`: runes (base 102) and glyphs (base 103), each a `[5, x, x, base, sub]` stack.
- `keysList`: keys (base 104), with `containerID` 100 and position `y` = subtype.
- `ancientBones`

## Factions

Use the **Factions** card, or `--join-faction`, `--faction-rank 0=max`, `--faction-favor 0=N` and `--max-factions` in the CLI. **Make build-ready** maxes every joined faction.

| id | faction | max rank |
|---|---|---|
| 0 | Circle of Fortune | 12 (800,000 rep) |
| 1 | Merchant's Guild | 12 (800,000 rep) |
| 2 | Forgotten Knights | 10 |
| 3 | The Weaver | 10 (100,000 rep) |

The character stores `factions["<id>"] = { id, isMember, hasEverJoined, rank, reputation, favor, factionSpecific }`, and its stash keeps a copy of rank, reputation and favor. The tool mirrors changes into the stash, where rank and reputation only ever go up, because other characters share that progress.

`factionSpecific` holds each faction's own state (for Circle of Fortune, the prophecy constellations). To join a faction, the tool copies it from any save that has it. So a faction can only be joined from the tool after one character has joined it in game.

## Stashes and seasons

A character keeps its cycle number after its season ends, but the game then moves it to the legacy stash. Saves don't record which season is current. So the tool treats a season's stash as ended once any character from that season has been played after the stash was last written. Your cycle 2 characters therefore share `STASH_0`, which matches what the game writes.

## Gear and loadouts

The **Gear** card (or `le-char gear <slot>`) shows each equipped item with its name, rarity, affix tiers and rolled values, plus idols and blessings. You can:

- **Remove** an equipped item: use ✕ in the GUI, or `--remove-gear 2,5` in the CLI.
- **Copy** another character's gear, idols and blessings: `--copy-gear-from <slot>`.
- **Save a loadout**: `save-loadout <slot> <name>`. Loadouts are stored verbatim in `loadouts/`, and `--loadout <name>` applies one to any character. `--gear-groups gear,idols,blessings` limits which parts are replaced.

Whatever gets replaced or removed is saved as a loadout in `loadouts/_replaced/` (the last 30 are kept), so nothing is lost. The tool warns when an item is locked to another class or needs a higher level. Items go only into their own slots; nothing is placed into the inventory grid.

### Item creator

Click **＋ Create** on any gear slot. You can make:

- **Rare / Exalted**: pick the item type, forging potential, and up to 2 prefixes and 2 suffixes, each with a tier and a roll %. Affixes above T5 make the item Exalted.
- **Unique or Set**: pick a unique, a roll % for its mods, and optionally Legendary Potential (0–4). Weaver uniques take Weaver's Will (0–28) instead.
- **Legendary**: a unique plus up to 4 affixes, at any tier.

- **Idols**: the Gear card draws the idol grid. Click **＋** on a free cell to create an idol there (only sizes that fit are offered), or click an idol to remove it. Idols take one prefix and one suffix, have no forging potential, and can be unique but not legendary. The grid is 5×5 without its corners and centre, as observed in real saves; positions are the top-left cell. In the CLI, use `{"containerID":29,"position":{"x":1,"y":0},"spec":{…}}` and `--remove-idols 1:0`.

A live preview shows the item and warns about class and level requirements. Items are staged in the gear list and written when you save; the previous item in the slot is kept under `loadouts/_replaced`.

The creator only offers affixes that can roll on the chosen item type. It enforces the prefix/suffix limits, tier ranges and slot rules, and won't make a set item legendary.

From the CLI:

```bash
node src/cli.js find-item dragonsong        # look up unique/affix/type ids
node src/cli.js set 8 --create-items '[{"containerID":4,"spec":{"kind":"unique","uniqueId":243,"uniqueRoll":100,"potential":4}}]'
```

The encoder is the exact inverse of the decoder: all 656 decodable items in real saves re-encode byte for byte, including legendaries and uniques with Legendary Potential or Weaver's Will. On v5 items, byte 6 is a flag byte; flag `4` means a unique stores its potential instead of an affix count. Created items don't support sealed affixes or corrupted items yet.

### Item database

Item, affix and unique names come from lastepochtools.com's data (`version150`, Season 5), cached in `data/itemdb.json` (falls back to `%LOCALAPPDATA%\le-char\itemdb.json`; override with `LE_ITEMDB`). `data/` is git-ignored because it's their compiled data. Skill names live in `src/skills.js`. The site sits behind Cloudflare, so the cache was built once from a real browser session. Without the cache, items show as ids.

### Item format

`savedItems[].data` holds the item bytes. v5 is the current format; v1 is from older saves.

```
v1: [1, base, sub, rarity, seed×3, body...]
v5: [5, ?, ?, base, sub, rarity, ?, seed×3, body...]
regular body: [forgingPotential, count, affix×count, ...]
unique/set/legendary (rarity 7/8/9): [uniqueId hi, lo, roll×8, count, affix×count, ...]
count: low 4 bits = affixes, 0x80 = one is sealed
affix: [tier<<4 | id>>8, id & 0xff, roll 0-255]
```

This was checked against every item in real saves. All 164 v5 affixes are valid for their item type, and unique ids match their base and subtype. Format v2 (early 2024) isn't decoded; those items are shown as unknown but are still copied correctly.

## Known unknowns
- **Skill xp:** 5,700,000 is what fully leveled skills show in existing saves.
- **Steam Cloud** syncs this folder, so an older cloud copy can win. If edits vanish, disable cloud sync for Last Epoch while editing.
