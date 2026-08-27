import {
  emptyStockpile,
  type Building,
  type Character,
  type ExplorationSite,
  type Job,
  type ResourceNode,
  type World,
} from '../core/types';
import { rle, unrle } from '../core/util';
import { idx, recomputeAllBlocked } from './world';
import { SAVE_VERSION } from './worldgen';
import { captureWildTargets } from './regrowth';

const PREFIX = 'modulo-alive:save:';
export const AUTOSAVE_SLOT = 'autosave';
export const SLOTS = ['slot1', 'slot2', 'slot3'];

export interface SaveMeta {
  slot: string;
  day: number;
  minutes: number;
  population: number;
  level: number;
  savedAt: number;
  version: number;
}

interface SavePayload {
  version: number;
  savedAt: number;
  seed: number;
  width: number;
  height: number;
  terrain: number[];
  nodes: ResourceNode[];
  animals: World['animals'];
  buildings: Building[];
  characters: Character[];
  jobs: Job[];
  sites: ExplorationSite[];
  wildTargets: Record<string, number>;
  stock: World['stock'];
  gear: Record<string, number>;
  log: World['log'];
  prompts: World['prompts'];
  nextPromptId: number;
  time: World['time'];
  weather: World['weather'];
  progression: World['progression'];
  campCenter: World['campCenter'];
  nextNodeId: number;
  nextAnimalId: number;
  nextBuildingId: number;
  nextJobId: number;
  nextLogId: number;
  nextInjuryId: number;
  rngState: number;
  acc: World['acc'];
  stats: World['stats'];
}

export function serialize(w: World): SavePayload {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: w.seed,
    width: w.width,
    height: w.height,
    terrain: rle(w.terrain),
    nodes: Array.from(w.nodes.values()),
    animals: w.animals,
    buildings: Array.from(w.buildings.values()),
    characters: w.characters,
    jobs: Array.from(w.jobs.values()),
    sites: w.sites,
    wildTargets: w.wildTargets,
    stock: w.stock,
    gear: w.gear,
    log: w.log.slice(-120),
    prompts: w.prompts,
    nextPromptId: w.nextPromptId,
    time: w.time,
    weather: w.weather,
    progression: w.progression,
    campCenter: w.campCenter,
    nextNodeId: w.nextNodeId,
    nextAnimalId: w.nextAnimalId,
    nextBuildingId: w.nextBuildingId,
    nextJobId: w.nextJobId,
    nextLogId: w.nextLogId,
    nextInjuryId: w.nextInjuryId,
    rngState: w.rngState,
    acc: w.acc,
    stats: w.stats,
  };
}

/**
 * Bring an older payload up to the current shape. Each migration step is
 * additive so old saves keep working as the game grows.
 */
function migrate(data: any): any {
  let d = data;
  if (typeof d.version !== 'number') d.version = 1;
  // Future migrations go here, e.g.:
  // if (d.version < 2) { ...; d.version = 2; }
  return d;
}

export function deserialize(raw: any): World {
  const data = migrate(raw) as SavePayload;
  const n = data.width * data.height;

  const w: World = {
    version: SAVE_VERSION,
    seed: data.seed,
    width: data.width,
    height: data.height,
    terrain: unrle(data.terrain, new Uint8Array(n)) as Uint8Array,
    nodeAt: new Int32Array(n).fill(-1),
    buildingAt: new Int32Array(n).fill(-1),
    blocked: new Uint8Array(n),
    nodes: new Map(),
    buildings: new Map(),
    animals: data.animals ?? [],
    characters: data.characters,
    jobs: new Map(),
    sites: data.sites,
    wildTargets: data.wildTargets ?? {},
    stock: { ...emptyStockpile(), ...data.stock },
    gear: data.gear ?? {},
    log: data.log ?? [],
    prompts: data.prompts ?? [],
    nextPromptId: data.nextPromptId ?? 1,
    time: data.time,
    weather: data.weather ?? { kind: 'clear', t: 300, intensity: 0 },
    progression: data.progression,
    campCenter: data.campCenter,
    nextNodeId: data.nextNodeId,
    nextAnimalId: data.nextAnimalId ?? 1,
    nextBuildingId: data.nextBuildingId,
    nextJobId: data.nextJobId,
    nextLogId: data.nextLogId,
    nextInjuryId: data.nextInjuryId ?? 1,
    rngState: data.rngState >>> 0 || 1,
    acc: data.acc ?? {
      needs: 0,
      ai: 0,
      jobs: 0,
      events: 0,
      social: 0,
      growth: 0,
      autosave: 0,
    },
    stats: Object.assign({ animalsHunted: 0 }, data.stats),
  };

  for (const node of data.nodes) {
    w.nodes.set(node.id, node);
    w.nodeAt[idx(w, node.tx, node.ty)] = node.id;
  }
  for (const b of data.buildings) {
    b.owner = b.owner ?? -1;
    w.buildings.set(b.id, b);
    for (let y = b.ty; y < b.ty + b.h; y++) {
      for (let x = b.tx; x < b.tx + b.w; x++) {
        if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        w.buildingAt[idx(w, x, y)] = b.id;
      }
    }
  }
  for (const j of data.jobs) {
    j.fails = j.fails ?? 0;
    w.jobs.set(j.id, j);
  }

  // Runtime-only fields that older saves may not carry.
  for (const c of w.characters) {
    // Stress and the illness scalar became status effects.
    const legacy = c as unknown as { sickness?: number };
    c.effects = c.effects ?? [];
    if (legacy.sickness && legacy.sickness > 0.05 && !c.effects.some((e) => e.id === 'fever')) {
      c.effects.push({ id: 'fever', until: -1, severity: legacy.sickness });
    }
    delete (c as unknown as Record<string, unknown>).stress;
    delete (c as unknown as Record<string, unknown>).sickness;
    c.workStreak = c.workStreak ?? 0;
    c.speech = null;
    c.path = c.path ?? [];
    c.pathIndex = c.pathIndex ?? 0;
    c.repathT = 0;
    c.stuckT = 0;
    c.thinkT = Math.random() * 0.6;
    c.activity = c.activity ?? 'idle';
    c.activityTarget = c.activityTarget ?? -1;
    c.activityT = c.activityT ?? 0;
    c.sleepComfort = c.sleepComfort ?? 0;
    c.sleepBuildingId = c.sleepBuildingId ?? -1;
    c.relationships = c.relationships ?? {};
    c.equipment = Object.assign({ tool: null, head: null, body: null }, c.equipment ?? {});
    c.assignment = c.assignment ?? 'auto';
  }

  recomputeAllBlocked(w);
  // Older saves predate the regrowth ceilings; take the current land as the mark.
  if (!data.wildTargets || Object.keys(data.wildTargets).length === 0) captureWildTargets(w);
  return w;
}

/* ------------------------------------------------------------------ */
/* localStorage                                                        */
/* ------------------------------------------------------------------ */

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(w: World, slot: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(PREFIX + slot, JSON.stringify(serialize(w)));
    return true;
  } catch (err) {
    console.error('[modulo-alive] save failed', err);
    return false;
  }
}

export function loadGame(slot: string): World | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(PREFIX + slot);
  if (!raw) return null;
  try {
    return deserialize(JSON.parse(raw));
  } catch (err) {
    console.error('[modulo-alive] load failed', err);
    return null;
  }
}

export function deleteSave(slot: string) {
  const s = storage();
  if (!s) return;
  s.removeItem(PREFIX + slot);
}

export function readMeta(slot: string): SaveMeta | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(PREFIX + slot);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return {
      slot,
      day: Math.floor((d.time?.minutes ?? 0) / 1440) + 1,
      minutes: d.time?.minutes ?? 0,
      population: (d.characters ?? []).filter((c: Character) => c.alive).length,
      level: d.progression?.level ?? 1,
      savedAt: d.savedAt ?? 0,
      version: d.version ?? 1,
    };
  } catch {
    return null;
  }
}

export function listSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (const slot of [AUTOSAVE_SLOT, ...SLOTS]) {
    const m = readMeta(slot);
    if (m) out.push(m);
  }
  return out;
}
