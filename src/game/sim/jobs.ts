import {
  TILE,
  type Building,
  type Character,
  type Job,
  type JobType,
  type ResourceNode,
  type ResourceType,
  type WorkType,
  type World,
} from '../core/types';
import { WORK_SKILL, WORK_TYPES } from '../core/types';
import { buildingDef } from '../data/buildings';
import { CROP_MAP, CROPS } from '../data/crops';
import { ANIMAL_MAP } from '../data/animals';
import { RECIPES } from '../data/recipes';
import {
  NODE_SPEC,
  accessTile,
  adjacentFreeTile,
  buildingCenterX,
  buildingCenterY,
  findBuildings,
  storageCapacity,
  storedTotal,
  totalFood,
  tileToWorldX,
  tileToWorldY,
} from './world';
import { skillLevel } from './modifiers';
import { hasEffect } from './effects';

export const JOB_WORK: Record<JobType, WorkType> = {
  chop: 'woodcutting',
  mine: 'mining',
  forage: 'foraging',
  hunt: 'hunting',
  gatherWater: 'hauling',
  haulToSite: 'hauling',
  build: 'construction',
  till: 'farming',
  plant: 'farming',
  tend: 'farming',
  harvest: 'farming',
  cook: 'cooking',
  treat: 'medicine',
  repair: 'construction',
  craft: 'crafting',
  storeCarried: 'hauling',
};

export const JOB_LABEL: Record<JobType, string> = {
  chop: 'Cutting wood',
  mine: 'Mining stone',
  forage: 'Foraging',
  hunt: 'Hunting',
  gatherWater: 'Fetching water',
  haulToSite: 'Hauling materials',
  build: 'Building',
  till: 'Tilling soil',
  plant: 'Planting',
  tend: 'Tending crops',
  harvest: 'Harvesting',
  cook: 'Cooking',
  treat: 'Treating the wounded',
  repair: 'Repairing',
  craft: 'Crafting',
  storeCarried: 'Storing supplies',
};

const MAX_JOBS = 90;

export function createJob(
  w: World,
  type: JobType,
  opts: Partial<Job> & { tx: number; ty: number }
): Job {
  const job: Job = {
    id: w.nextJobId++,
    type,
    work: JOB_WORK[type],
    targetKind: opts.targetKind ?? 'tile',
    targetId: opts.targetId ?? -1,
    cellIndex: opts.cellIndex ?? -1,
    tx: opts.tx,
    ty: opts.ty,
    assigned: -1,
    progress: 0,
    res: opts.res ?? null,
    amount: opts.amount ?? 0,
    fromId: opts.fromId ?? -1,
    priority: opts.priority ?? 30,
    blockedUntil: 0,
    fails: 0,
  };
  w.jobs.set(job.id, job);
  return job;
}

export function hasJob(
  w: World,
  type: JobType,
  targetId: number,
  cellIndex = -1
): boolean {
  for (const j of w.jobs.values()) {
    if (j.type === type && j.targetId === targetId && j.cellIndex === cellIndex)
      return true;
  }
  return false;
}

/**
 * A one-pass index of "does a job already exist for this target".
 *
 * Job generation walks thousands of nodes and hundreds of buildings; asking
 * the job map about each one individually is quadratic and was the single
 * biggest cost in a large settlement.
 */
class JobIndex {
  private keys = new Set<string>();

  constructor(w: World) {
    for (const j of w.jobs.values()) this.keys.add(key(j.type, j.targetId, j.cellIndex));
  }

  has(type: JobType, targetId: number, cellIndex = -1) {
    return this.keys.has(key(type, targetId, cellIndex));
  }

  add(type: JobType, targetId: number, cellIndex = -1) {
    this.keys.add(key(type, targetId, cellIndex));
  }
}

function key(type: JobType, targetId: number, cellIndex: number) {
  return `${type}|${targetId}|${cellIndex}`;
}

export function jobCount(w: World, type: JobType): number {
  let n = 0;
  for (const j of w.jobs.values()) if (j.type === type) n++;
  return n;
}

/** Foraging is split by what is being gathered, so berry runs are not
 *  crowded out by a couple of stalled herb or reed jobs. */
function forageCount(w: World, kind: ResourceNode['kind']): number {
  let n = 0;
  for (const j of w.jobs.values()) {
    if (j.type !== 'forage') continue;
    const node = w.nodes.get(j.targetId);
    if (node?.kind === kind) n++;
  }
  return n;
}

export function releaseJob(w: World, c: Character, blockSeconds = 0) {
  if (c.jobId < 0) return;
  const j = w.jobs.get(c.jobId);
  if (j) {
    j.assigned = -1;
    if (blockSeconds > 0) {
      j.blockedUntil = w.time.t + blockSeconds;
      j.fails++;
    }
  }
  c.jobId = -1;
  c.workT = 0;
}

export function finishJob(w: World, c: Character) {
  if (c.jobId < 0) return;
  w.jobs.delete(c.jobId);
  c.jobId = -1;
  c.workT = 0;
}

export function deleteJob(w: World, jobId: number) {
  const j = w.jobs.get(jobId);
  if (!j) return;
  if (j.assigned >= 0) {
    const c = w.characters.find((ch) => ch.id === j.assigned);
    if (c) {
      c.jobId = -1;
      c.workT = 0;
      c.path = [];
    }
  }
  w.jobs.delete(jobId);
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

export function generateJobs(w: World, autoGather = true) {
  if (w.jobs.size >= MAX_JOBS) return;

  const index = new JobIndex(w);
  const pop = w.characters.filter((c) => c.alive).length || 1;
  const food = totalFood(w);
  const capFree = storageCapacity(w) - storedTotal(w);

  const foodCritical = food < pop * 6;

  /* --- Marked nodes: always honoured, whatever the stock levels.
         They step aside for survival work when the larder is empty, so a
         large clearing order cannot starve the camp. --- */
  for (const n of w.nodes.values()) {
    if (!n.marked || n.depleted) continue;
    const spec = NODE_SPEC[n.kind];
    const type: JobType =
      spec.work === 'woodcutting' ? 'chop' : spec.work === 'mining' ? 'mine' : 'forage';
    if (index.has(type, n.id)) continue;
    const at = adjacentFreeTile(w, n.tx, n.ty);
    if (!at) continue;
    createJob(w, type, {
      targetKind: 'node',
      targetId: n.id,
      tx: at.tx,
      ty: at.ty,
      priority: foodCritical && type !== 'forage' ? 20 : 58,
    });
    index.add(type, n.id);
    if (w.jobs.size >= MAX_JOBS) return;
  }

  /* --- Wildlife the player has marked, plus hunting when meat is needed --- */
  for (const a of w.animals) {
    if (a.state === 'dead' || !a.marked) continue;
    if (index.has('hunt', a.id)) continue;
    index.add('hunt', a.id);
    createJob(w, 'hunt', {
      targetKind: 'animal',
      targetId: a.id,
      tx: Math.floor(a.x / TILE),
      ty: Math.floor(a.y / TILE),
      priority: 70,
    });
    if (w.jobs.size >= MAX_JOBS) return;
  }
  if (autoGather && food < pop * 10 && jobCount(w, 'hunt') < 2) {
    // The nearest animal to the camp that nobody is already after.
    let best = null as (typeof w.animals)[number] | null;
    let bestD = Infinity;
    const cx = tileToWorldX(w.campCenter.tx);
    const cy = tileToWorldY(w.campCenter.ty);
    for (const a of w.animals) {
      if (a.state === 'dead' || index.has('hunt', a.id)) continue;
      const d = (a.x - cx) ** 2 + (a.y - cy) ** 2;
      if (d < bestD && d < (46 * TILE) ** 2) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      index.add('hunt', best.id);
      createJob(w, 'hunt', {
        targetKind: 'animal',
        targetId: best.id,
        tx: Math.floor(best.x / TILE),
        ty: Math.floor(best.y / TILE),
        priority: food < pop * 5 ? 84 : 50,
      });
    }
  }

  /* --- Construction sites --- */
  for (const b of w.buildings.values()) {
    if (b.state !== 'blueprint') continue;
    const def = buildingDef(b.def);
    const at = accessTile(w, b);
    if (!at) continue;

    let missingAll = true;
    let needsMaterial = false;
    for (const res of Object.keys(def.cost) as ResourceType[]) {
      const need = def.cost[res] ?? 0;
      const have = b.delivered[res] ?? 0;
      if (have >= need) continue;
      needsMaterial = true;
      if (index.has('haulToSite', b.id, resIndex(res))) continue;
      if (w.stock[res] <= 0) continue;
      index.add('haulToSite', b.id, resIndex(res));
      createJob(w, 'haulToSite', {
        targetKind: 'building',
        targetId: b.id,
        cellIndex: resIndex(res),
        tx: at.tx,
        ty: at.ty,
        res,
        amount: need - have,
        priority: 52,
      });
    }
    if (!needsMaterial) {
      missingAll = false;
      if (!index.has('build', b.id)) {
        index.add('build', b.id);
        createJob(w, 'build', {
          targetKind: 'building',
          targetId: b.id,
          tx: at.tx,
          ty: at.ty,
          priority: 56,
        });
      }
    }
    if (w.jobs.size >= MAX_JOBS) return;
  }

  /* --- Farming --- */
  for (const b of w.buildings.values()) {
    if (b.state !== 'built' || !b.farm) continue;
    for (let i = 0; i < b.farm.length; i++) {
      const cell = b.farm[i];
      const cx = b.tx + (i % b.w);
      const cy = b.ty + Math.floor(i / b.w);
      if (cell.crop && cell.growth >= 1) {
        if (index.has('harvest', b.id, i)) continue;
        index.add('harvest', b.id, i);
        createJob(w, 'harvest', {
          targetKind: 'farmCell',
          targetId: b.id,
          cellIndex: i,
          tx: cx,
          ty: cy,
          priority: 60,
        });
      } else if (!cell.crop && cell.tilled) {
        if (w.stock.seeds < 1) continue;
        if (index.has('plant', b.id, i)) continue;
        index.add('plant', b.id, i);
        createJob(w, 'plant', {
          targetKind: 'farmCell',
          targetId: b.id,
          cellIndex: i,
          tx: cx,
          ty: cy,
          priority: 40,
        });
      } else if (!cell.tilled) {
        if (index.has('till', b.id, i)) continue;
        index.add('till', b.id, i);
        createJob(w, 'till', {
          targetKind: 'farmCell',
          targetId: b.id,
          cellIndex: i,
          tx: cx,
          ty: cy,
          priority: 36,
        });
      } else if (cell.crop && cell.growth < 1 && cell.tended < 30) {
        if (index.has('tend', b.id, i)) continue;
        index.add('tend', b.id, i);
        createJob(w, 'tend', {
          targetKind: 'farmCell',
          targetId: b.id,
          cellIndex: i,
          tx: cx,
          ty: cy,
          priority: 18,
        });
      }
      if (w.jobs.size >= MAX_JOBS) return;
    }
  }

  /* --- Cooking --- */
  const rawStock = w.stock.rawFood + w.stock.rawMeat;
  const cookedStock = w.stock.food + w.stock.cookedMeat;
  if (rawStock >= 4 && cookedStock < pop * 9 && jobCount(w, 'cook') < 2) {
    const kitchen = bestBuilding(w, (b) => !!buildingDef(b.def).cooking);
    if (kitchen) {
      const at = accessTile(w, kitchen);
      if (at) {
        createJob(w, 'cook', {
          targetKind: 'building',
          targetId: kitchen.id,
          tx: at.tx,
          ty: at.ty,
          priority: cookedStock < pop * 2 ? 88 : 46,
        });
      }
    }
  }

  /* --- Medical --- */
  for (const c of w.characters) {
    if (!c.alive) continue;
    const needsCare =
      c.injuries.some((i) => !i.treated) || hasEffect(c, 'fever') || hasEffect(c, 'infected');
    if (!needsCare) continue;
    if (w.stock.medicine < 1) continue;
    if (index.has('treat', c.id)) continue;
    const bed = bestBuilding(w, (b) => !!buildingDef(b.def).medical);
    if (!bed) continue;
    const at = accessTile(w, bed);
    if (!at) continue;
    index.add('treat', c.id);
    createJob(w, 'treat', {
      targetKind: 'character',
      targetId: c.id,
      fromId: bed.id,
      tx: at.tx,
      ty: at.ty,
      priority: 95,
    });
  }

  /* --- Crafting --- */
  if (jobCount(w, 'craft') < 2 && capFree > 20) {
    const bench = bestBuilding(w, (b) => !!buildingDef(b.def).crafting);
    if (bench) {
      for (const r of RECIPES) {
        const have = r.gear
          ? (w.gear[r.gear] ?? 0) + countEquipped(w, r.gear)
          : w.stock[Object.keys(r.output)[0] as ResourceType];
        if (have >= r.autoCap) continue;
        let ok = true;
        for (const k of Object.keys(r.input) as ResourceType[]) {
          if (w.stock[k] < (r.input[k] ?? 0) * 2) ok = false;
        }
        if (!ok) continue;
        if (index.has('craft', bench.id, recipeIndex(r.id))) continue;
        const at = accessTile(w, bench);
        if (!at) continue;
        createJob(w, 'craft', {
          targetKind: 'building',
          targetId: bench.id,
          cellIndex: recipeIndex(r.id),
          tx: at.tx,
          ty: at.ty,
          priority: 28,
        });
        break;
      }
    }
  }

  /* --- Water --- */
  if (w.stock.water < pop * 5 && capFree > 40 && jobCount(w, 'gatherWater') < 1) {
    const well = bestBuilding(w, (b) => !!buildingDef(b.def).water);
    if (well) {
      const at = accessTile(w, well);
      if (at)
        createJob(w, 'gatherWater', {
          targetKind: 'building',
          targetId: well.id,
          tx: at.tx,
          ty: at.ty,
          priority: 42,
        });
    } else {
      const bank = findWaterAccess(w);
      if (bank)
        createJob(w, 'gatherWater', {
          targetKind: 'tile',
          targetId: -1,
          tx: bank.tx,
          ty: bank.ty,
          priority: 42,
        });
    }
  }

  /* --- Repairs --- */
  for (const b of w.buildings.values()) {
    if (b.state !== 'built') continue;
    if (b.hp >= b.maxHp * 0.9) continue;
    if (index.has('repair', b.id)) continue;
    if (w.stock.wood < 3) break;
    const at = accessTile(w, b);
    if (!at) continue;
    index.add('repair', b.id);
    createJob(w, 'repair', {
      targetKind: 'building',
      targetId: b.id,
      tx: at.tx,
      ty: at.ty,
      priority: 44,
    });
  }

  /* --- Autonomous gathering keeps the camp alive without micromanagement.
         Food is deliberately outside the storage-headroom gate: a full store
         must never be able to stop the camp feeding itself. --- */
  {
    const forageTarget = foodCritical ? 6 : food < pop * 14 ? 4 : food < pop * 22 ? 2 : 0;
    const foragePriority = foodCritical ? 94 : food < pop * 14 ? 66 : 40;
    let guard = 0;
    while (forageCount(w, 'berryBush') < forageTarget && guard++ < 8) {
      if (!autoNodeJob(w, index, 'forage', (n) => n.kind === 'berryBush', foragePriority)) break;
    }
  }
  if (capFree > 45) {
    if (w.stock.herbs < 12 && forageCount(w, 'herbPatch') < 2) {
      autoNodeJob(w, index, 'forage', (n) => n.kind === 'herbPatch', 26);
    }
    if (w.stock.fiber < 30 && forageCount(w, 'reeds') < 2) {
      autoNodeJob(w, index, 'forage', (n) => n.kind === 'reeds', 24);
    }
    if (autoGather && w.stock.wood < 45 && jobCount(w, 'chop') < 2 && food > pop * 5) {
      autoNodeJob(
        w,
        index,
        'chop',
        (n) => n.kind === 'tree' || n.kind === 'pine' || n.kind === 'log' || n.kind === 'deadTree',
        w.stock.wood < 25 ? 66 : 34
      );
    }
    if (autoGather && w.stock.stone < 30 && jobCount(w, 'mine') < 1 && food > pop * 5) {
      autoNodeJob(w, index, 'mine', (n) => n.kind === 'rock', w.stock.stone < 20 ? 62 : 34);
    }
  } else if (w.stock.stone < 20 && jobCount(w, 'mine') < 1 && food > pop * 5) {
    // Even with the stores overflowing, a settlement out of stone still needs
    // stone — the per-resource ceiling guarantees there is room for it.
    autoNodeJob(w, index, 'mine', (n) => n.kind === 'rock', 64);
  }
}

/** How many survivors are already wearing this piece of gear. */
function countEquipped(w: World, gearId: string): number {
  let n = 0;
  for (const c of w.characters) {
    if (!c.alive) continue;
    if (
      c.equipment.tool === gearId ||
      c.equipment.head === gearId ||
      c.equipment.body === gearId
    )
      n++;
  }
  return n;
}

function resIndex(r: ResourceType): number {
  return RES_ORDER.indexOf(r);
}
const RES_ORDER: ResourceType[] = [
  'wood',
  'stone',
  'food',
  'rawFood',
  'water',
  'fiber',
  'medicine',
  'herbs',
  'seeds',
  'tools',
];

function recipeIndex(id: string): number {
  return RECIPES.findIndex((r) => r.id === id);
}

export function recipeAt(index: number) {
  return RECIPES[index];
}

function bestBuilding(w: World, pred: (b: Building) => boolean): Building | null {
  let best: Building | null = null;
  let bestScore = -Infinity;
  for (const b of w.buildings.values()) {
    if (b.state !== 'built' || !pred(b)) continue;
    const d = buildingDef(b.def);
    const score = (d.cooking ?? 0) + (d.medical ?? 0) + (d.crafting ?? 0) + (d.water ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function findWaterAccess(w: World): { tx: number; ty: number } | null {
  const { tx: cx, ty: cy } = w.campCenter;
  let best: { tx: number; ty: number } | null = null;
  let bestD = Infinity;
  for (let ty = 0; ty < w.height; ty += 2) {
    for (let tx = 0; tx < w.width; tx += 2) {
      if (w.terrain[ty * w.width + tx] !== 4 /* Water */) continue;
      const at = adjacentFreeTile(w, tx, ty);
      if (!at) continue;
      const d = (at.tx - cx) ** 2 + (at.ty - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = at;
      }
    }
  }
  return best;
}

/**
 * Create a gathering job on the nearest matching node to the camp.
 * @returns false when there is nothing left to assign.
 */
function autoNodeJob(
  w: World,
  index: JobIndex,
  type: JobType,
  pred: (n: ResourceNode) => boolean,
  priority: number
): boolean {
  const cx = tileToWorldX(w.campCenter.tx);
  const cy = tileToWorldY(w.campCenter.ty);
  let best: ResourceNode | null = null;
  let bestD = Infinity;
  for (const n of w.nodes.values()) {
    if (n.depleted || !pred(n)) continue;
    if (index.has(type, n.id)) continue;
    const dx = tileToWorldX(n.tx) - cx;
    const dy = tileToWorldY(n.ty) - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (!best) return false;
  const at = adjacentFreeTile(w, best.tx, best.ty);
  if (!at) return false;
  index.add(type, best.id);
  createJob(w, type, {
    targetKind: 'node',
    targetId: best.id,
    tx: at.tx,
    ty: at.ty,
    priority,
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

/**
 * How many survivors are already working each category. Used to spread the
 * camp across the work that needs doing instead of piling everyone onto
 * whatever happens to be nearest.
 */
export function workCoverage(w: World): Record<WorkType, number> {
  const out = {} as Record<WorkType, number>;
  for (const wt of WORK_TYPES) out[wt] = 0;
  for (const c of w.characters) {
    if (!c.alive || c.jobId < 0) continue;
    const j = w.jobs.get(c.jobId);
    if (j) out[j.work]++;
  }
  return out;
}

/** Score how well a character suits a job; negative means "will not take it". */
export function scoreJob(
  w: World,
  c: Character,
  j: Job,
  coverage?: Record<WorkType, number>
): number {
  if (j.assigned >= 0) return -1;
  if (j.blockedUntil > w.time.t) return -1;
  // Treating yourself is not a thing.
  if (j.type === 'treat' && j.targetId === c.id) return -1;

  // A pinned survivor does that job and nothing else.
  if (c.assignment === 'rest') return -1;
  if (c.assignment !== 'auto' && c.assignment !== j.work) return -1;

  const stars = c.assignment === j.work ? 4 : (c.priorities[j.work] ?? 0);
  if (stars <= 0) return -1;

  const skill = skillLevel(c, WORK_SKILL[j.work]);
  const dx = tileToWorldX(j.tx) - c.x;
  const dy = tileToWorldY(j.ty) - c.y;
  const distTiles = Math.sqrt(dx * dx + dy * dy) / TILE;

  // Work already covered by someone else is worth less to a second pair of
  // hands, unless it is urgent enough to want the help.
  const crowding = coverage ? coverage[j.work] ?? 0 : 0;
  const crowdPenalty = j.priority >= 80 ? crowding * 3 : crowding * 11;

  const pinned = c.assignment === j.work ? 40 : 0;

  return (
    j.priority * (0.4 + stars * 0.22) +
    skill * 2.6 +
    pinned -
    crowdPenalty -
    distTiles * 0.9
  );
}

export function findJobFor(
  w: World,
  c: Character,
  coverage?: Record<WorkType, number>
): Job | null {
  let best: Job | null = null;
  let bestScore = 0;
  for (const j of w.jobs.values()) {
    const s = scoreJob(w, c, j, coverage);
    if (s > bestScore) {
      bestScore = s;
      best = j;
    }
  }
  return best;
}

export function jobWorldPos(w: World, j: Job) {
  return { x: tileToWorldX(j.tx), y: tileToWorldY(j.ty) };
}

export function describeJob(w: World, j: Job): string {
  if (j.type === 'build' || j.type === 'haulToSite' || j.type === 'repair') {
    const b = w.buildings.get(j.targetId);
    if (b) {
      const label = buildingDef(b.def).label;
      if (j.type === 'haulToSite') return `Hauling ${j.res} to ${label}`;
      if (j.type === 'repair') return `Repairing ${label}`;
      return `Building ${label}`;
    }
  }
  if (j.type === 'hunt') {
    const a = w.animals.find((x) => x.id === j.targetId);
    return a ? `Hunting — ${ANIMAL_MAP[a.kind].label}` : 'Hunting';
  }
  if (j.type === 'chop' || j.type === 'mine' || j.type === 'forage') {
    const n = w.nodes.get(j.targetId);
    if (n) return `${JOB_LABEL[j.type]} — ${NODE_SPEC[n.kind].label}`;
  }
  if (j.type === 'plant' || j.type === 'harvest' || j.type === 'tend' || j.type === 'till') {
    const b = w.buildings.get(j.targetId);
    const cell = b?.farm?.[j.cellIndex];
    const crop = cell?.crop ? CROP_MAP[cell.crop]?.label : null;
    return crop ? `${JOB_LABEL[j.type]} — ${crop}` : JOB_LABEL[j.type];
  }
  if (j.type === 'treat') {
    const t = w.characters.find((c) => c.id === j.targetId);
    return t ? `Treating ${t.name}` : JOB_LABEL[j.type];
  }
  if (j.type === 'craft') {
    const r = recipeAt(j.cellIndex);
    return r ? `Crafting ${r.label}` : JOB_LABEL[j.type];
  }
  return JOB_LABEL[j.type];
}

export const ALL_CROPS = CROPS;
