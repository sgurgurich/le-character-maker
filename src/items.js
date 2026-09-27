// Item byte format (savedItems[].data), worked out from real saves:
//
//   v1: [1, base, sub, rarity, seed×3, ...body]
//   v5: [5, x, x, base, sub, rarity, y, seed×3, ...body]      (x, y unknown; kept as-is)
//
//   body, regular items:  [forgingPotential, count, affix×count, ...rest]
//   body, unique/set/legendary (rarity 7/8/9):
//                         [uniqueId hi, uniqueId lo, roll×8, count, affix×count, ...rest]
//
//   count: low 4 bits = number of affixes, 0x80 = one of them is sealed.
//   affix: 3 bytes = tier (high nibble, 0-based) | affixId (12 bits) | roll (0-255).
//   Regular items store rarity = number of non-sealed affixes (0 normal ... 4).
//
// Verified against every v1/v5 item in real saves: all v5 affixes resolve to
// affixes that can roll on that base, and unique ids match base/subtype.

export const CONTAINERS = {
  INVENTORY: 1,
  IDOLS: 29,
};

export const EQUIP_SLOTS = {
  2: 'Helmet',
  3: 'Body Armor',
  4: 'Main Hand',
  5: 'Off Hand',
  6: 'Gloves',
  7: 'Belt',
  8: 'Boots',
  9: 'Ring',
  10: 'Ring',
  11: 'Amulet',
  12: 'Relic',
};

// Blessing slots observed in saves.
export const BLESSING_CONTAINERS = [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45];

// Idols sit on a 5×5 grid in container 29 without its four corners and centre
// (20 cells, matching the 20 idol slots); positions are the top-left cell.
export const IDOL_BASES = [25, 26, 27, 28, 29, 30, 31, 32, 33];
export const IDOL_GRID = 5;
export const isIdolBase = (base) => IDOL_BASES.includes(base);

export function isIdolCell(x, y) {
  if (x < 0 || y < 0 || x >= IDOL_GRID || y >= IDOL_GRID) return false;
  const edge = (v) => v === 0 || v === IDOL_GRID - 1;
  if (edge(x) && edge(y)) return false;
  return !(x === 2 && y === 2);
}

export function idolCells(size, x, y) {
  const cells = [];
  for (let dx = 0; dx < size.x; dx++) for (let dy = 0; dy < size.y; dy++) cells.push([x + dx, y + dy]);
  return cells;
}

const ONE_HANDED = [5, 6, 7, 8, 9, 10];
const TWO_HANDED = [12, 13, 14, 15, 16, 23];
const OFF_HAND = [17, 18, 19];

// Which equipment containers each base type may go in.
export function slotsForBase(base) {
  const fixed = { 0: [2], 1: [3], 2: [7], 3: [8], 4: [6], 20: [11], 21: [9, 10], 22: [12] };
  if (fixed[base]) return fixed[base];
  if (ONE_HANDED.includes(base)) return [4, 5]; // off hand for dual wielding
  if (TWO_HANDED.includes(base)) return [4];
  if (OFF_HAND.includes(base)) return [5];
  return [];
}

export const isTwoHanded = (base) => TWO_HANDED.includes(base);

export const RARITY = { NORMAL: 0, UNIQUE: 7, SET: 8, LEGENDARY: 9 };
// v5 byte 6 flag: unique carries Legendary Potential / Weaver's Will instead of affixes.
const FLAG_POTENTIAL = 4;
const hasUniqueBody = (rarity) => rarity >= RARITY.UNIQUE && rarity <= RARITY.LEGENDARY;

export function decodeItem(data) {
  const version = data[0];
  if (version !== 1 && version !== 5) return { version, supported: false };
  const v5 = version === 5;
  const o = v5 ? 2 : 0;
  const item = {
    version,
    supported: true,
    extra: v5 ? [data[1], data[2], data[6]] : null,
    base: data[1 + o],
    sub: data[2 + o],
    rarity: data[3 + o],
  };
  let i = v5 ? 7 : 4;
  if (data.length < i + 3) return { ...item, short: true }; // shards, runes, keys: tiny records
  item.seed = data.slice(i, i + 3);
  i += 3;
  if (hasUniqueBody(item.rarity)) {
    item.uniqueId = (data[i] << 8) | data[i + 1];
    item.uniqueRolls = data.slice(i + 2, i + 10);
    i += 10;
  } else {
    item.forgingPotential = data[i++];
  }
  // Uniques with Legendary Potential / Weaver's Will: flag 4 on v5 (byte 6);
  // on v1 the byte simply isn't followed by affix data.
  if (hasUniqueBody(item.rarity)) {
    const byte = data[i] ?? 0;
    const hasPotential = v5 ? Boolean(data[6] & FLAG_POTENTIAL) : byte > 0 && data.length - (i + 1) < 3 * (byte & 0x0f);
    if (hasPotential) {
      item.potential = byte;
      item.affixes = [];
      item.rest = data.slice(i + 1);
      return item;
    }
  }
  const countByte = data[i++] ?? 0;
  const count = countByte & 0x0f;
  item.sealed = Boolean(countByte & 0x80);
  item.affixes = [];
  for (let k = 0; k < count && i + 2 < data.length; k++, i += 3) {
    const [a, b, roll] = data.slice(i, i + 3);
    item.affixes.push({ tier: a >> 4, id: ((a & 0x0f) << 8) | b, roll });
  }
  item.rest = data.slice(i);
  return item;
}

// Inverse of decodeItem. For an item decoded from a save, encodeItem(decoded)
// reproduces the original bytes exactly (checked in tests against every item).
export function encodeItem(item) {
  const v5 = (item.version ?? 5) === 5;
  const [x0, x1, y] = item.extra ?? [0, 0, 0];
  const out = v5 ? [5, x0, x1, item.base, item.sub, item.rarity, y] : [1, item.base, item.sub, item.rarity];
  out.push(...(item.seed ?? [0, 0, 0]));
  const affixes = item.affixes ?? [];
  const affixBytes = affixes.flatMap((a) => [(a.tier << 4) | (a.id >> 8), a.id & 0xff, a.roll]);
  const count = affixes.length | (item.sealed ? 0x80 : 0);
  if (hasUniqueBody(item.rarity)) {
    const rolls = item.uniqueRolls ?? [];
    out.push(item.uniqueId >> 8, item.uniqueId & 0xff, ...Array.from({ length: 8 }, (_, i) => rolls[i] ?? 0));
    if (item.potential !== undefined) out.push(item.potential, ...(item.rest ?? []));
    else out.push(count, ...affixBytes, ...(item.rest ?? []));
  } else {
    out.push(item.forgingPotential ?? 0, count, ...affixBytes, ...(item.rest ?? [0]));
  }
  return out;
}

function formatValue(min, max, roll) {
  const v = min + (max - min) * (roll / 255);
  const isPercent = Math.abs(max) <= 2 && !(Number.isInteger(min) && Number.isInteger(max));
  if (isPercent) return `${Math.round(v * 1000) / 10}%`;
  return String(Math.round(v));
}

const RARITY_LABEL = (item) => {
  if (item.rarity === RARITY.UNIQUE) return 'Unique';
  if (item.rarity === RARITY.SET) return 'Set';
  if (item.rarity === RARITY.LEGENDARY) return 'Legendary';
  if (item.affixes?.some((a) => a.tier >= 5)) return 'Exalted';
  if (item.rarity >= 3) return 'Rare';
  if (item.rarity >= 1) return 'Magic';
  return 'Normal';
};

// Human-readable view of a decoded item. Works without the item DB (ids only).
export function describeItem(data, db) {
  const item = decodeItem(data);
  if (!item.supported) return { name: `Unknown item (format v${item.version})`, rarity: 'Unknown', supported: false };
  const base = db?.bases.get(item.base);
  const sub = base?.subs.get(item.sub);
  const unique = item.uniqueId !== undefined ? db?.uniques.get(item.uniqueId) : null;
  const out = {
    supported: true,
    base: item.base,
    sub: item.sub,
    baseName: base?.name ?? `Base ${item.base}`,
    typeName: sub?.name ?? `${base?.name ?? 'Base ' + item.base} #${item.sub}`,
    name: unique?.name ?? sub?.name ?? base?.name ?? `Item ${item.base}/${item.sub}`,
    rarity: RARITY_LABEL(item),
    levelRequirement: unique?.overrideLevelRequirement ? unique.levelRequirement : sub?.levelRequirement ?? 0,
    classRequirement: sub?.classRequirement ?? 0,
    size: base?.size ?? { x: 1, y: 1 },
    forgingPotential: item.forgingPotential,
    potential: item.potential,
    potentialLabel: item.potential === undefined ? undefined : unique?.legendaryType === 1 ? "Weaver's Will" : 'Legendary Potential',
    sealed: item.sealed,
    uniqueId: item.uniqueId,
    setName: unique?.isSetItem ? db.setNames[unique.setId] : undefined,
    affixes: (item.affixes ?? []).map((a) => {
      const def = db?.affixes.get(a.id);
      const tier = def?.tiers[a.tier];
      return {
        id: a.id,
        tier: a.tier + 1,
        roll: a.roll,
        name: def?.name ?? `Affix #${a.id}`,
        kind: def ? (def.type === 0 ? 'prefix' : 'suffix') : null,
        text: tier
          ? tier.rolls.map((r, n) => `${formatValue(r.min, r.max, a.roll)} ${def.propertyNames[n] ?? ''}`.trim()).join(', ')
          : def?.name ?? `Affix #${a.id}`,
      };
    }),
  };
  if (item.uniqueRolls && unique) {
    const rollable = unique.mods.filter((m) => m.canRoll);
    out.uniqueRollPct = rollable.length
      ? Math.round((rollable.reduce((s, m) => s + (item.uniqueRolls[m.rollId] ?? 0), 0) / rollable.length / 255) * 100)
      : null;
  }
  return out;
}

// Equipped gear, idols and blessings of a character, described for display.
export function describeGear(char, db) {
  const view = (it, index) => ({ index, containerID: it.containerID, position: it.inventoryPosition, ...describeItem(it.data, db) });
  const items = char.savedItems.map(view);
  return {
    equipped: Object.entries(EQUIP_SLOTS).map(([c, slot]) => ({
      containerID: Number(c),
      slot,
      item: items.find((it) => it.containerID === Number(c)) ?? null,
    })),
    idols: items.filter((it) => it.containerID === CONTAINERS.IDOLS),
    blessings: items.filter((it) => BLESSING_CONTAINERS.includes(it.containerID)),
    inventoryCount: items.filter((it) => it.containerID === CONTAINERS.INVENTORY).length,
  };
}
