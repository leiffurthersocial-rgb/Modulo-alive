import {
  RESOURCE_TYPES,
  STORED_RESOURCES,
  TILE,
  Terrain,
  type Building,
  type Character,
  type LogEntry,
  type LogKind,
  type ResourceNode,
  type ResourceType,
  type World,
} from '../core/types';
import { buildingDef } from '../data/buildings';
import { RNG } from '../core/rng';
import { clamp } from '../core/util';
import { dayNumber, formatTime } from './time';

/* ------------------------------------------------------------------ */
/* Tile helpers                                                        */
/* ------------------------------------------------------------------ */

export const idx = (w: World, tx: number, ty: number) => ty * w.width + tx;

export const inBounds = (w: World, tx: number, ty: number) =>
  tx >= 0 && ty >= 0 && tx < w.width && ty < w.height;

export const tileToWorldX = (tx: number) => tx * TILE + TILE / 2;
export const tileToWorldY = (ty: number) => ty * TILE + TILE / 2;
export const worldToTileX = (x: number) => Math.floor(x / TILE);
export const worldToTileY = (y: number) => Math.floor(y / TILE);

const BLOCKING_NODES: Record<string, boolean> = {
  tree: true,
  pine: true,
  deadTree: true,
  rock: true,
  stump: true,
  log: true,
  berryBush: false,
  herbPatch: false,
  reeds: false,
};

export function tileBlocked(w: World, tx: number, ty: number): boolean {
  if (!inBounds(w, tx, ty)) return true;
  return w.blocked[idx(w, tx, ty)] === 1;
}

export function recomputeTile(w: World, tx: number, ty: number) {
  if (!inBounds(w, tx, ty)) return;
  const i = idx(w, tx, ty);
  let blocked = 0;
  if (w.terrain[i] === Terrain.Water) blocked = 1;
  const nId = w.nodeAt[i];
  if (nId >= 0) {
    const n = w.nodes.get(nId);
    if (n && !n.depleted && BLOCKING_NODES[n.kind]) blocked = 1;
  }
  const bId = w.buildingAt[i];
  if (bId >= 0) {
    const b = w.buildings.get(bId);
    if (b && b.state === 'built' && buildingDef(b.def).solid) blocked = 1;
  }
  w.blocked[i] = blocked;
}

export function recomputeAllBlocked(w: World) {
  for (let ty = 0; ty < w.height; ty++) {
    for (let tx = 0; tx < w.width; tx++) recomputeTile(w, tx, ty);
  }
}

/** Movement speed multiplier from the surface a character is standing on. */
export function surfaceSpeed(w: World, tx: number, ty: number): number {
  if (!inBounds(w, tx, ty)) return 1;
  const i = idx(w, tx, ty);
  const bId = w.buildingAt[i];
  if (bId >= 0) {
    const b = w.buildings.get(bId);
    if (b && b.state === 'built') {
      const d = buildingDef(b.def);
      if (d.speed) return d.speed;
    }
  }
  const t = w.terrain[i];
  if (t === Terrain.Path) return 1.3;
  if (t === Terrain.Dirt) return 1.05;
  if (t === Terrain.Soil) return 0.85;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export function addNode(
  w: World,
  kind: ResourceNode['kind'],
  tx: number,
  ty: number,
  rng: RNG
): ResourceNode | null {
  if (!inBounds(w, tx, ty)) return null;
  const i = idx(w, tx, ty);
  if (w.nodeAt[i] >= 0 || w.buildingAt[i] >= 0) return null;
  if (w.terrain[i] === Terrain.Water) return null;

  const spec = NODE_SPEC[kind];
  const node: ResourceNode = {
    id: w.nextNodeId++,
    kind,
    tx,
    ty,
    hp: spec.hp,
    maxHp: spec.hp,
    amount: Math.round(spec.amount * rng.range(0.8, 1.25)),
    regrowAt: -1,
    depleted: false,
    marked: false,
    variant: rng.int(0, 4),
    fallT: 0,
    fallDir: rng.range(-1, 1),
    shake: 0,
  };
  w.nodes.set(node.id, node);
  w.nodeAt[i] = node.id;
  recomputeTile(w, tx, ty);
  return node;
}

export function removeNode(w: World, node: ResourceNode) {
  const i = idx(w, node.tx, node.ty);
  if (w.nodeAt[i] === node.id) w.nodeAt[i] = -1;
  w.nodes.delete(node.id);
  recomputeTile(w, node.tx, node.ty);
}

export interface NodeSpec {
  hp: number;
  amount: number;
  res: ResourceType;
  /** Secondary drop. */
  extra?: { res: ResourceType; amount: number; chance: number };
  regrowHours: number;
  work: 'woodcutting' | 'mining' | 'foraging';
  label: string;
}

export const NODE_SPEC: Record<ResourceNode['kind'], NodeSpec> = {
  tree: {
    hp: 100,
    amount: 26,
    res: 'wood',
    extra: { res: 'fiber', amount: 7, chance: 0.85 },
    regrowHours: -1,
    work: 'woodcutting',
    label: 'Oak',
  },
  pine: {
    hp: 88,
    amount: 22,
    res: 'wood',
    extra: { res: 'fiber', amount: 5, chance: 0.7 },
    regrowHours: -1,
    work: 'woodcutting',
    label: 'Pine',
  },
  deadTree: {
    hp: 55,
    amount: 15,
    res: 'wood',
    regrowHours: -1,
    work: 'woodcutting',
    label: 'Dead Tree',
  },
  rock: {
    hp: 130,
    amount: 42,
    res: 'stone',
    regrowHours: -1,
    work: 'mining',
    label: 'Rock',
  },
  berryBush: {
    hp: 22,
    amount: 18,
    res: 'rawFood',
    regrowHours: 16,
    work: 'foraging',
    label: 'Berry Bush',
  },
  herbPatch: {
    hp: 18,
    amount: 6,
    res: 'herbs',
    regrowHours: 44,
    work: 'foraging',
    label: 'Herb Patch',
  },
  reeds: {
    hp: 16,
    amount: 16,
    res: 'fiber',
    regrowHours: 16,
    work: 'foraging',
    label: 'Reeds',
  },
  nettles: {
    hp: 14,
    amount: 14,
    res: 'fiber',
    regrowHours: 12,
    work: 'foraging',
    label: 'Nettle Patch',
  },
  stump: {
    hp: 40,
    amount: 6,
    res: 'wood',
    regrowHours: -1,
    work: 'woodcutting',
    label: 'Stump',
  },
  log: {
    hp: 30,
    amount: 10,
    res: 'wood',
    regrowHours: -1,
    work: 'woodcutting',
    label: 'Fallen Log',
  },
};

/* ------------------------------------------------------------------ */
/* Stockpile                                                           */
/* ------------------------------------------------------------------ */

/**
 * Storage capacity is read on every resource transfer, and a late-game
 * settlement can have hundreds of buildings, so it is memoised and
 * invalidated explicitly whenever the building set changes.
 */
const capacityCache = new WeakMap<World, { version: number; value: number }>();
const capacityVersion = new WeakMap<World, number>();

export function invalidateStorageCapacity(w: World) {
  capacityVersion.set(w, (capacityVersion.get(w) ?? 0) + 1);
}

export function storageCapacity(w: World): number {
  const version = capacityVersion.get(w) ?? 0;
  const cached = capacityCache.get(w);
  if (cached && cached.version === version) return cached.value;
  let cap = 200; // what fits around the fire and under the tarps
  for (const b of w.buildings.values()) {
    if (b.state !== 'built') continue;
    const d = buildingDef(b.def);
    if (d.storage) cap += d.storage;
  }
  capacityCache.set(w, { version, value: cap });
  return cap;
}

export function storedTotal(w: World): number {
  let t = 0;
  for (const r of STORED_RESOURCES) t += w.stock[r];
  return t;
}

/**
 * Storage rules. Food keeps a reserved slice of the store, and no single
 * resource may swallow it all — otherwise a big timber haul can lock the
 * settlement out of the stone it needs to build more storage.
 */
const RESERVED_FOR_FOOD = 0.18;
const PER_RESOURCE_SHARE = 0.4;
const FOOD_RESOURCES: ResourceType[] = [
  'food',
  'rawFood',
  'rawMeat',
  'cookedMeat',
  'medicine',
  'herbs',
];

export function resourceCeiling(w: World, res: ResourceType): number {
  const cap = storageCapacity(w);
  if (FOOD_RESOURCES.indexOf(res) >= 0) return cap;
  if (res === 'seeds') return 40;
  return Math.max(120, cap * PER_RESOURCE_SHARE);
}

/** @returns the amount actually stored (capacity may clip it). */
export function addResource(w: World, res: ResourceType, amount: number): number {
  if (amount <= 0) return 0;
  const cap = storageCapacity(w);
  const isFood = FOOD_RESOURCES.indexOf(res) >= 0;
  const usable = isFood ? cap : cap * (1 - RESERVED_FOR_FOOD);
  const globalFree = Math.max(0, usable - storedTotal(w));
  const ownFree = Math.max(0, resourceCeiling(w, res) - w.stock[res]);
  const put = Math.min(amount, globalFree, ownFree);
  w.stock[res] += put;
  return put;
}

export function takeResource(w: World, res: ResourceType, amount: number): number {
  const got = Math.min(amount, w.stock[res]);
  w.stock[res] -= got;
  return got;
}

export function hasResources(
  w: World,
  cost: Partial<Record<ResourceType, number>>
): boolean {
  for (const k of Object.keys(cost) as ResourceType[]) {
    if (w.stock[k] < (cost[k] ?? 0)) return false;
  }
  return true;
}

export function spendResources(
  w: World,
  cost: Partial<Record<ResourceType, number>>
) {
  for (const k of Object.keys(cost) as ResourceType[]) {
    w.stock[k] = Math.max(0, w.stock[k] - (cost[k] ?? 0));
  }
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

/** Placement rules without the per-type cap — used when moving what exists. */
export function canPlaceIgnoringLimit(
  w: World,
  defId: string,
  tx: number,
  ty: number
): { ok: boolean; reason: string } {
  return canPlace(w, defId, tx, ty, true);
}

export function canPlace(
  w: World,
  defId: string,
  tx: number,
  ty: number,
  ignoreLimit = false
): { ok: boolean; reason: string } {
  const d = buildingDef(defId);
  for (let y = ty; y < ty + d.h; y++) {
    for (let x = tx; x < tx + d.w; x++) {
      if (!inBounds(w, x, y)) return { ok: false, reason: 'Outside the map' };
      const i = idx(w, x, y);
      if (w.terrain[i] === Terrain.Water)
        return { ok: false, reason: 'Cannot build on water' };
      if (w.buildingAt[i] >= 0) return { ok: false, reason: 'Space occupied' };
      const nId = w.nodeAt[i];
      if (nId >= 0) {
        const n = w.nodes.get(nId);
        if (n && !n.depleted)
          return { ok: false, reason: 'Clear the trees and rocks first' };
      }
      if (d.farm && w.terrain[i] === Terrain.Stone)
        return { ok: false, reason: 'Soil is too rocky to farm' };
    }
  }
  if (!ignoreLimit && d.maxCount !== undefined && countBuildings(w, defId) >= d.maxCount) {
    return {
      ok: false,
      reason:
        d.maxCount === 1
          ? `The camp only needs one ${d.label}`
          : `Limit reached — ${d.maxCount} ${d.label}`,
    };
  }
  if (d.requires) {
    for (const req of d.requires) {
      let found = false;
      for (const b of w.buildings.values()) {
        if (b.def === req && b.state === 'built') {
          found = true;
          break;
        }
      }
      if (!found)
        return { ok: false, reason: `Requires ${buildingDef(req).label}` };
    }
  }
  return { ok: true, reason: '' };
}

/** How many of a structure exist, counting ones still under construction. */
export function countBuildings(w: World, defId: string): number {
  let n = 0;
  for (const b of w.buildings.values()) if (b.def === defId) n++;
  return n;
}

export function placeBuilding(
  w: World,
  defId: string,
  tx: number,
  ty: number,
  built: boolean,
  rng: RNG
): Building {
  const d = buildingDef(defId);
  const b: Building = {
    id: w.nextBuildingId++,
    def: defId,
    tx,
    ty,
    w: d.w,
    h: d.h,
    state: built ? 'built' : 'blueprint',
    progress: built ? 1 : 0,
    delivered: {},
    level: 1,
    upgradeFrom: null,
    hp: d.hp,
    maxHp: d.hp,
    users: [],
    owner: -1,
    variant: rng.int(0, 4),
    activeT: 0,
  };
  if (d.farm) {
    b.farm = [];
    for (let i = 0; i < d.w * d.h; i++) {
      b.farm.push({ crop: null, growth: 0, tilled: built, tended: 0, dead: false });
    }
  }
  w.buildings.set(b.id, b);
  invalidateStorageCapacity(w);
  for (let y = ty; y < ty + d.h; y++) {
    for (let x = tx; x < tx + d.w; x++) {
      w.buildingAt[idx(w, x, y)] = b.id;
      recomputeTile(w, x, y);
    }
  }
  return b;
}

export function removeBuilding(w: World, b: Building) {
  for (let y = b.ty; y < b.ty + b.h; y++) {
    for (let x = b.tx; x < b.tx + b.w; x++) {
      const i = idx(w, x, y);
      if (w.buildingAt[i] === b.id) w.buildingAt[i] = -1;
      recomputeTile(w, x, y);
    }
  }
  w.buildings.delete(b.id);
  invalidateStorageCapacity(w);
}

export function buildingCenterX(b: Building) {
  return (b.tx + b.w / 2) * TILE;
}
export function buildingCenterY(b: Building) {
  return (b.ty + b.h / 2) * TILE;
}

/** A free walkable tile adjacent to (or inside) a building footprint. */
export function accessTile(
  w: World,
  b: Building
): { tx: number; ty: number } | null {
  const d = buildingDef(b.def);
  // Non-solid buildings can be stood on directly.
  if (!d.solid) {
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        if (!tileBlocked(w, x, y)) return { tx: x, ty: y };
      }
    }
  }
  for (let y = b.ty - 1; y <= b.ty + b.h; y++) {
    for (let x = b.tx - 1; x <= b.tx + b.w; x++) {
      const edge =
        x === b.tx - 1 || x === b.tx + b.w || y === b.ty - 1 || y === b.ty + b.h;
      if (!edge) continue;
      if (!tileBlocked(w, x, y)) return { tx: x, ty: y };
    }
  }
  return null;
}

export function adjacentFreeTile(
  w: World,
  tx: number,
  ty: number
): { tx: number; ty: number } | null {
  const order = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [dx, dy] of order) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (!tileBlocked(w, nx, ny)) return { tx: nx, ty: ny };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function livingCharacters(w: World): Character[] {
  return w.characters.filter((c) => c.alive);
}

export function findBuildings(w: World, pred: (b: Building) => boolean): Building[] {
  const out: Building[] = [];
  for (const b of w.buildings.values()) if (pred(b)) out.push(b);
  return out;
}

export function nearestBuilding(
  w: World,
  x: number,
  y: number,
  pred: (b: Building) => boolean
): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  for (const b of w.buildings.values()) {
    if (!pred(b)) continue;
    const dx = buildingCenterX(b) - x;
    const dy = buildingCenterY(b) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function nearestNode(
  w: World,
  x: number,
  y: number,
  pred: (n: ResourceNode) => boolean,
  maxDist = Infinity
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestD = maxDist * maxDist;
  for (const n of w.nodes.values()) {
    if (!pred(n)) continue;
    const dx = tileToWorldX(n.tx) - x;
    const dy = tileToWorldY(n.ty) - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Log                                                                 */
/* ------------------------------------------------------------------ */

export function log(
  w: World,
  kind: LogKind,
  title: string,
  body: string,
  chars: number[] = []
): LogEntry {
  const e: LogEntry = {
    id: w.nextLogId++,
    day: dayNumber(w.time.minutes),
    time: formatTime(w.time.minutes),
    title,
    body,
    kind,
    chars,
  };
  w.log.push(e);
  if (w.log.length > 300) w.log.splice(0, w.log.length - 300);
  return e;
}

/** True when an entry with this title appeared within the last N game minutes. */
export function recentlyLogged(w: World, title: string, withinMinutes: number): boolean {
  const nowDay = dayNumber(w.time.minutes);
  const nowMin = w.time.minutes;
  for (let i = w.log.length - 1; i >= 0 && i >= w.log.length - 40; i--) {
    const e = w.log[i];
    if (e.title !== title) continue;
    const [hh, mm] = e.time.split(':').map(Number);
    const entryMinutes = (e.day - 1) * 1440 + hh * 60 + mm;
    if (nowMin - entryMinutes <= withinMinutes) return true;
    if (nowDay - e.day > 2) break;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function worldRng(w: World): RNG {
  const r = new RNG(w.rngState);
  return r;
}

/** Draw from the world RNG and persist the advanced state. */
export function roll(w: World): number {
  let x = w.rngState >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  w.rngState = x;
  return x / 0x100000000;
}

export function rollRange(w: World, a: number, b: number) {
  return a + roll(w) * (b - a);
}

export function rollInt(w: World, a: number, b: number) {
  return Math.floor(rollRange(w, a, b));
}

export function rollPick<T>(w: World, arr: readonly T[]): T {
  return arr[Math.floor(roll(w) * arr.length) % arr.length];
}

export function clampNeeds(c: Character) {
  c.hunger = clamp(c.hunger, 0, 100);
  c.energy = clamp(c.energy, 0, 100);
  c.morale = clamp(c.morale, 0, 100);
  c.health = clamp(c.health, 0, c.maxHealth);
}

/** Everything edible, cooked or not. */
export const FOOD_TYPES: ResourceType[] = ['food', 'cookedMeat', 'rawFood', 'rawMeat'];

export function totalFood(w: World): number {
  let t = 0;
  for (const r of FOOD_TYPES) t += w.stock[r];
  return t;
}

export function totalResources(w: World): number {
  let t = 0;
  for (const r of RESOURCE_TYPES) t += w.stock[r];
  return t;
}
