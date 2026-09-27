#!/usr/bin/env node
// Local GUI: serves gui/index.html plus a small JSON API on 127.0.0.1, opens it
// in an Edge/Chrome app window, and exits once that window has been closed.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { CLASSES, MAX_LEVEL, MAX_SKILL_XP, PROGRESSION_GROUPS } from './constants.js';
import { backupDir, backupSlot, defaultSaveDir, gameSaveDir, listSlots, readFile, readSlot, slotPath, stringifyJson, writeSlot } from './save.js';
import { blankCharacter, summarize } from './character.js';
import { applyEdits, capturePreset, goldInfo, listPresets, materialsArg, planGold, planMaterials, slotArg, targetSlot, updateStash } from './ops.js';
import { materialsSummary } from './materials.js';
import { catalogForSlot, previewItem } from './craft.js';
import { IMPORT_MODULES, parseBuild, previewBuild } from './letools.js';
import { CONTAINERS, EQUIP_SLOTS, decodeItem, isIdolBase, slotsForBase } from './items.js';
import { FACTIONS, describeFactions, findFactionTemplate } from './factions.js';
import { MAX_GOLD, listStashes } from './stash.js';
import { APP_VERSION, IS_EXE, codeVersion, readAsset, seedUserDir } from './paths.js';
import { itemDbStatus, loadItemDb, saveItemDb } from './itemdb.js';
import { checkForUpdate, installUpdate, REPO } from './update.js';
import { describeGear } from './items.js';
import { GEAR_GROUPS, captureLoadout, listLoadouts } from './loadouts.js';
import { IDOL_QUESTS, QUEST_PASSIVE_CAP, isQuestComplete } from './quests.js';
import { skillName, skillsForClass } from './skills.js';

const PORT = Number(process.env.LE_CHAR_PORT) || 47315;
// Identifies the code this server started with, so a relaunch after an update
// replaces a still-running old server instead of reusing it.
const CODE_VERSION = codeVersion();
seedUserDir();
const LOG = path.join(os.tmpdir(), 'le-char-gui.log');
const saveDir = defaultSaveDir();

function log(msg) {
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
}

// The game only ever writes its own save folder, so a copy elsewhere (LE_SAVE_DIR)
// is safe to edit while it runs.
const guardsGameFolder = path.resolve(saveDir).toLowerCase() === path.resolve(gameSaveDir()).toLowerCase();

function isGameRunning() {
  if (process.platform !== 'win32' || !guardsGameFolder) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', 'IMAGENAME eq Last Epoch.exe', '/NH'], { windowsHide: true }, (err, out) =>
      resolve(!err && /Last Epoch\.exe/i.test(out)),
    );
  });
}

function characterView(slot, stashes) {
  try {
    const c = readSlot(saveDir, slot);
    const tree = c.savedCharacterTree ?? { unspentPoints: 0 };
    return {
      slot,
      ...summarize(c),
      goldInfo: goldInfo(saveDir, c, slot, stashes),
      factions: describeFactions(c),
      classId: c.characterClass,
      masteryId: c.chosenMastery,
      solo: Boolean(c.soloCharacterChallenge ?? c.soloChallenge),
      legacy: c.cycle === undefined,
      unspentPoints: Number(tree.unspentPoints),
      skillTrees: c.savedSkillTrees.map((t) => ({ id: t.treeID, name: skillName(t.treeID), xp: Number(t.xp), slot: t.slotNumber })),
      abilityBar: c.abilityBar ?? [],
      classSkills: skillsForClass(c.characterClass).map((s) => ({ id: s.id, name: s.name, mastery: s.mastery, level: s.level })),
      idolQuestList: IDOL_QUESTS.map((q) => ({ id: q.id, name: q.name, chapter: q.chapter, main: q.main, done: isQuestComplete(c, q) })),
    };
  } catch (e) {
    return { slot, error: e.message };
  }
}

async function state() {
  let characters = [];
  let error = null;
  try {
    const stashes = listStashes(saveDir);
    characters = listSlots(saveDir).map((slot) => characterView(slot, stashes));
  } catch (e) {
    error = e.message;
  }
  return {
    saveDir,
    error,
    gameRunning: await isGameRunning(),
    characters,
    presets: listPresets().map((p) => ({ name: p.name, note: p.note, saveVersion: p.saveVersion, groups: Object.keys(p.groups) })),
    classes: CLASSES,
    groups: Object.keys(PROGRESSION_GROUPS),
    maxLevel: MAX_LEVEL,
    maxSkillXp: MAX_SKILL_XP,
    questPassiveCap: QUEST_PASSIVE_CAP,
    maxGold: MAX_GOLD,
    importModules: IMPORT_MODULES,
    app: { version: APP_VERSION, isExe: IS_EXE, repo: REPO },
    factionList: FACTIONS.map((f) => ({ id: f.id, name: f.name, maxRank: f.reputation.length, excludes: f.excludes, canJoin: findFactionTemplate(saveDir, f.id) !== undefined })),
    loadouts: listLoadouts(),
    gearGroups: Object.keys(GEAR_GROUPS),
    itemDb: itemDbStatus(),
  };
}

// Writes the character, then its stash gold if requested. Gold is validated
// first so a bad value can't leave a half-applied save.
function saveCharacter(slot, char, body, ctx = {}) {
  const wantsGold = body.gold !== undefined && body.gold !== '';
  const plan = wantsGold ? planGold(saveDir, char, slot, body.gold) : null;
  const materials = materialsArg(body);
  if (materials) planMaterials(saveDir, char, slot, materials);
  const backup = writeSlot(saveDir, slot, char);
  const st = updateStash(saveDir, char, slot, { gold: plan?.gold, factions: ctx.factionsChanged, favorEdited: ctx.favorEdited, materials });
  return {
    backup,
    gold: plan && { stashId: plan.stashId, gold: plan.gold, sharedWith: plan.sharedWith },
    factionsShared: ctx.factionsChanged && st?.sharedWith?.length ? st.sharedWith : null,
    stashNote: st?.skipped ?? null,
    materials: materials ? { stashId: st?.stashId, sharedWith: st?.sharedWith ?? [], granted: st?.granted } : null,
  };
}

async function guardWrite() {
  if (await isGameRunning()) {
    throw Object.assign(new Error('Last Epoch is running. Close the game before saving; it would overwrite your changes.'), { status: 409 });
  }
}

function openFolder(dir) {
  fs.mkdirSync(dir, { recursive: true });
  spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
}

const routes = [
  ['GET', /^\/api\/state$/, () => state()],

  ['POST', /^\/api\/characters$/, async (_m, body) => {
    await guardWrite();
    if (!body.name || body.class === undefined) throw new Error('Name and class are required');
    const char = blankCharacter({ name: body.name, classId: Number(body.class) });
    const ctx = { dir: saveDir };
    const warnings = applyEdits(char, { ...body, class: undefined, name: undefined }, ctx);
    const slot = targetSlot(saveDir, body);
    return { slot, warnings, ...saveCharacter(slot, char, body, ctx) };
  }],

  ['POST', /^\/api\/characters\/(\d+)$/, async ([, s], body) => {
    await guardWrite();
    const slot = slotArg(s);
    const char = readSlot(saveDir, slot);
    const ctx = { dir: saveDir };
    const warnings = applyEdits(char, body, ctx);
    return { slot, warnings, ...saveCharacter(slot, char, body, ctx) };
  }],

  ['POST', /^\/api\/characters\/(\d+)\/clone$/, async ([, s], body) => {
    await guardWrite();
    if (!body.name) throw new Error('The copy needs a name');
    const char = readSlot(saveDir, slotArg(s));
    const ctx = { dir: saveDir };
    const warnings = applyEdits(char, body, ctx);
    const slot = targetSlot(saveDir, {});
    return { slot, warnings, ...saveCharacter(slot, char, body, ctx) };
  }],

  ['DELETE', /^\/api\/characters\/(\d+)$/, async ([, s]) => {
    await guardWrite();
    const slot = slotArg(s);
    readSlot(saveDir, slot); // 404s cleanly if missing
    const backup = backupSlot(saveDir, slot);
    fs.rmSync(slotPath(saveDir, slot));
    return { backup };
  }],

  ['POST', /^\/api\/characters\/(\d+)\/capture$/, async ([, s], body) => {
    const { file, groups } = capturePreset(readSlot(saveDir, slotArg(s)), String(body.name ?? ''), body);
    return { file, groups };
  }],

  ['POST', /^\/api\/update\/check$/, async (_m, body) => checkForUpdate({ force: Boolean(body.force) })],

  ['POST', /^\/api\/update\/install$/, async () => {
    const r = await installUpdate();
    setTimeout(() => process.exit(0), 600); // the swap script waits for this exit
    return r;
  }],

  ['POST', /^\/api\/itemdb$/, async (_m, body) => saveItemDb(String(body.text ?? ''))],

  ['POST', /^\/api\/import\/preview$/, async (_m, body) => previewBuild(parseBuild(body.build))],

  ['GET', /^\/api\/catalog\/(\d+)$/, async ([, c]) => catalogForSlot(Number(c))],

  ['POST', /^\/api\/items\/preview$/, async (_m, body) => {
    const { data, item } = previewItem(body.spec ?? {});
    const warnings = [];
    if (body.containerID !== undefined) {
      const cid = Number(body.containerID);
      const { base } = decodeItem(data);
      const fits = cid === CONTAINERS.IDOLS ? isIdolBase(base) : slotsForBase(base).includes(cid);
      if (!fits) throw new Error(`${item.name} doesn't go in the ${cid === CONTAINERS.IDOLS ? 'idol grid' : EQUIP_SLOTS[cid] ?? 'chosen'} slot`);
    }
    if (body.slot !== undefined) {
      const char = readSlot(saveDir, slotArg(body.slot));
      if (item.classRequirement && !(item.classRequirement & (1 << char.characterClass))) warnings.push(`${char.characterName}'s class can't use this item.`);
      if (item.levelRequirement > char.level) warnings.push(`Needs level ${item.levelRequirement}.`);
    }
    return { item, warnings };
  }],

  ['GET', /^\/api\/characters\/(\d+)\/materials$/, async ([, s]) => {
    const slot = slotArg(s);
    const info = goldInfo(saveDir, readSlot(saveDir, slot), slot);
    if (!info.stashId) return { missing: info.missing };
    return { stashId: info.stashId, sharedWith: info.sharedWith, ...materialsSummary(readFile(saveDir, info.stashId)) };
  }],

  ['GET', /^\/api\/characters\/(\d+)\/gear$/, async ([, s]) => describeGear(readSlot(saveDir, slotArg(s)), loadItemDb())],

  ['POST', /^\/api\/characters\/(\d+)\/loadout$/, async ([, s], body) => {
    const { file } = captureLoadout(readSlot(saveDir, slotArg(s)), String(body.name ?? ''), body);
    return { file };
  }],

  ['POST', /^\/api\/open\/(saves|backups)$/, async ([, which]) => {
    openFolder(which === 'saves' ? saveDir : backupDir());
    return {};
  }],
];

// Browser-window lifetime: exit shortly after the last window disconnects.
const clients = new Set();
let exitTimer = setTimeout(() => process.exit(0), 60_000); // nobody ever connected

function trackClient(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 1000\n\n');
  clients.add(res);
  clearTimeout(exitTimer);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
    if (!clients.size) exitTimer = setTimeout(() => process.exit(0), 8_000); // allows a reload
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (d) => (data += d));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(stringifyJson(body));
}

const server = http.createServer(async (req, res) => {
  // Only this machine, only this origin: blocks DNS rebinding and cross-site writes.
  if (req.headers.host !== `127.0.0.1:${PORT}` && req.headers.host !== `localhost:${PORT}`) {
    return send(res, 403, { error: 'Forbidden host' });
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(readAsset('gui/index.html'));
  }
  if (req.method === 'GET' && url.pathname === '/api/ping') return send(res, 200, { app: 'le-char', codeVersion: CODE_VERSION });
  if (req.method === 'POST' && url.pathname === '/api/shutdown' && req.headers['x-le-char'] === '1') {
    send(res, 200, { ok: true });
    return setTimeout(() => process.exit(0), 100);
  }
  if (req.method === 'GET' && url.pathname === '/api/events') return trackClient(req, res);

  if (req.method !== 'GET' && req.headers['x-le-char'] !== '1') return send(res, 403, { error: 'Missing app header' });

  for (const [method, re, handler] of routes) {
    const m = req.method === method && url.pathname.match(re);
    if (!m) continue;
    try {
      return send(res, 200, await handler(m, req.method === 'GET' ? {} : await readBody(req)));
    } catch (e) {
      log(`${req.method} ${url.pathname}: ${e.stack}`);
      return send(res, e.status ?? (/No character/.test(e.message) ? 404 : 400), { error: e.message });
    }
  }
  send(res, 404, { error: 'Not found' });
});

function findBrowser() {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = pf.flatMap((p) => [
    path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]);
  return candidates.find((c) => fs.existsSync(c));
}

function openWindow() {
  const url = `http://127.0.0.1:${PORT}/`;
  const browser = findBrowser();
  if (browser) {
    spawn(browser, [`--app=${url}`, '--window-size=1180,800'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
}

server.on('error', async (e) => {
  if (e.code !== 'EADDRINUSE') {
    log(e.stack);
    process.exit(1);
  }
  // Already running. Same code: open another window onto it. Older code (the
  // app was updated since it started): ask it to quit and take over the port.
  try {
    const r = await (await fetch(`http://127.0.0.1:${PORT}/api/ping`)).json();
    if (r.app === 'le-char') {
      if (r.codeVersion === CODE_VERSION) {
        if (process.argv.includes('--open') && !process.env.LE_CHAR_NO_OPEN) openWindow();
        process.exit(0);
      }
      if (!replacing) {
        replacing = true;
        await fetch(`http://127.0.0.1:${PORT}/api/shutdown`, { method: 'POST', headers: { 'X-LE-Char': '1' } }).catch(() => {});
        setTimeout(() => server.listen(PORT, '127.0.0.1'), 700);
        return;
      }
    }
  } catch {}
  log(`Port ${PORT} is in use by another program. Set LE_CHAR_PORT to pick another.`);
  process.exit(1);
});
let replacing = false;

process.on('uncaughtException', (e) => log(e.stack));

server.listen(PORT, '127.0.0.1', () => {
  console.log(`le-char GUI on http://127.0.0.1:${PORT}/`);
  if (process.argv.includes('--open') && !process.env.LE_CHAR_NO_OPEN) openWindow();
});
