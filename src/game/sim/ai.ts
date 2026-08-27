import {
  TILE,
  type Building,
  type Character,
  type ResourceType,
  type World,
} from '../core/types';
import type { PathFinder } from '../core/pathfinding';
import { buildingDef } from '../data/buildings';
import { appetite, schedule, socialFactor } from './modifiers';
import { needUrgency } from './needs';
import {
  accessTile,
  addResource,
  adjacentFreeTile,
  buildingCenterX,
  buildingCenterY,
  findBuildings,
  log,
  nearestBuilding,
  roll,
  rollInt,
  takeResource,
  tileBlocked,
  totalFood,
  tileToWorldX,
  tileToWorldY,
} from './world';
import {
  charTileX,
  charTileY,
  clearPath,
  hasPath,
  isNear,
  setDestination,
  updateMovement,
} from './movement';
import { describeJob, findJobFor, releaseJob, finishJob } from './jobs';
import type { Job } from '../core/types';
import { performWork, storeCarried, SIM_SECONDS_PER_HOUR } from './tasks';
import { ambientChatter, say } from './dialogue';
import { hourOfDay, isNight } from './time';
import type { Fx } from './fx';
import {
  beginSearch,
  completeExpedition,
  resolveSearch,
  siteById,
} from './exploration';
import { makeSick } from './medical';
import { findAnimal } from './wildlife';
import type { Ctx } from './context';
import { GEAR, gearStockKey } from '../data/gear';

/**
 * Priority-based autonomous behaviour.
 *
 *   emergency need  >  scheduled need  >  player order  >  assigned work
 *   >  work priority  >  social / rest  >  wander
 *
 * A survivor is never frozen: if nothing else applies they find something to
 * do, which is what makes the camp read as a place people live in.
 */

/**
 * How close a worker has to be to the tile they work from. Kept tight so
 * survivors are visibly at the tree, not standing a few metres off it.
 */
const WORK_REACH = 0.55;

const THINK_MIN = 0.45;
const THINK_MAX = 0.9;

export function updateCharacter(w: World, c: Character, dt: number, ctx: Ctx) {
  if (!c.alive) return;

  if (c.speech && c.speech.until < w.time.t) c.speech = null;
  c.bob += dt * (c.moving ? 7 : 2.2);

  if (c.state === 'downed') {
    c.moving = false;
    clearPath(c);
    if (c.jobId >= 0) releaseJob(w, c);
    return;
  }

  c.thinkT -= dt;
  if (c.thinkT <= 0) {
    c.thinkT = THINK_MIN + roll(w) * (THINK_MAX - THINK_MIN);
    think(w, c, ctx);
    if (roll(w) < 0.08) ambientChatter(w, c);
  }

  act(w, c, dt, ctx);
}

/* ------------------------------------------------------------------ */
/* Decision                                                            */
/* ------------------------------------------------------------------ */

function think(w: World, c: Character, ctx: Ctx) {
  const urg = needUrgency(c);
  const night = isNight(w.time.minutes);
  const hour = hourOfDay(w.time.minutes);
  const sched = schedule(c);

  // Expeditions run to completion; only a real emergency pulls someone home.
  if (c.expedition) {
    if (c.health < c.maxHealth * 0.3 && c.expedition.phase !== 'return') {
      c.expedition.phase = 'return';
      log(w, 'bad', 'Turning back', `${c.name} is hurt and heading back to camp.`, [c.id]);
    }
    c.activity = 'explore';
    return;
  }

  // A meal or a night's sleep already in progress is left to finish; without
  // this the character would restart the activity every think tick and never
  // actually eat or rest.
  if (c.activity === 'eat') return;
  if (c.activity === 'sleep' && c.state !== 'sleeping') return;

  /* -------- 1. emergencies -------- */
  if (urg.sleep >= 3) return startSleep(w, c, ctx);
  if (urg.food >= 3 && foodAvailable(w)) return startEat(w, c, ctx);

  /* -------- 2. scheduled rest -------- */
  const pastBedtime = wrappedAfter(hour, sched.sleep, sched.wake);
  if (pastBedtime && c.energy < 78 && urg.food < 2) return startSleep(w, c, ctx);
  if (urg.sleep >= 2 && (night || c.energy < 20)) return startSleep(w, c, ctx);

  /* -------- 3. eating -------- */
  if (urg.food >= 2 && foodAvailable(w)) return startEat(w, c, ctx);
  if (urg.food >= 1 && foodAvailable(w) && mealTime(hour)) return startEat(w, c, ctx);

  // Wake up if they were sleeping and are done.
  if (c.state === 'sleeping') {
    const rested = c.energy > 92 || (!night && c.energy > 62 && hour > sched.wake);
    if (!rested) {
      c.activity = 'sleep';
      return;
    }
    wake(w, c);
  }

  /* -------- 4. hands full -------- */
  if (c.carrying && (c.jobId < 0 || !jobNeedsCarry(w, c))) {
    return startStore(w, c, ctx);
  }

  /* -------- 5. player order -------- */
  if (c.order) {
    c.activity = 'order';
    return;
  }

  /* -------- 6. work -------- */
  if (c.workEnabled && c.assignment !== 'rest' && c.state !== 'sleeping') {
    if (c.jobId >= 0) {
      const j = w.jobs.get(c.jobId);
      if (j && j.assigned === c.id) {
        c.activity = 'work';
        return;
      }
      c.jobId = -1;
    }
    const job = findJobFor(w, c, ctx.coverage);
    if (job) {
      job.assigned = c.id;
      c.jobId = job.id;
      c.workT = 0;
      c.activity = 'work';
      c.path = [];
      if (ctx.coverage) ctx.coverage[job.work] = (ctx.coverage[job.work] ?? 0) + 1;
      equipAvailableGear(w, c);
      return;
    }
  }

  /* -------- 7. social / decompress -------- */
  if ((c.morale < 52 || roll(w) < 0.25) && !night) {
    const partner = findSocialPartner(w, c);
    if (partner) {
      c.activity = 'social';
      c.activityTarget = partner.id;
      c.activityT = 4 + roll(w) * 6;
      return;
    }
  }
  if (night && !c.expedition) {
    const fire = nearestBuilding(w, c.x, c.y, (b) => b.state === 'built' && !!buildingDef(b.def).light);
    if (fire) {
      c.activity = 'rest';
      c.activityTarget = fire.id;
      c.activityT = 6 + roll(w) * 8;
      return;
    }
  }

  /* -------- 8. wander -------- */
  if (c.activity !== 'wander' || !hasPath(c)) {
    c.activity = 'wander';
    c.activityTarget = -1;
    c.activityT = 2 + roll(w) * 5;
    wanderTo(w, c, ctx);
  }
}

/**
 * Take any spare gear out of the stores. Survivors kit themselves out when
 * they start work, so crafting a hat or a vest visibly changes the camp.
 */
export function equipAvailableGear(w: World, c: Character) {
  for (const g of GEAR) {
    if (c.equipment[g.slot]) continue;
    const stockKey = gearStockKey(g.id);
    if (stockKey) {
      if (w.stock[stockKey] < 1) continue;
      takeResource(w, stockKey, 1);
    } else {
      if ((w.gear[g.id] ?? 0) < 1) continue;
      w.gear[g.id] = (w.gear[g.id] ?? 0) - 1;
    }
    c.equipment[g.slot] = g.id;
  }
}

/* ------------------------------------------------------------------ */
/* Action                                                              */
/* ------------------------------------------------------------------ */

function act(w: World, c: Character, dt: number, ctx: Ctx) {
  switch (c.activity) {
    case 'work':
      return actWork(w, c, dt, ctx);
    case 'store':
      return actStore(w, c, dt, ctx);
    case 'eat':
      return actEat(w, c, dt, ctx);
    case 'sleep':
      return actSleep(w, c, dt, ctx);
    case 'social':
      return actSocial(w, c, dt, ctx);
    case 'rest':
      return actRest(w, c, dt, ctx);
    case 'explore':
      return actExplore(w, c, dt, ctx);
    case 'order':
      return actOrder(w, c, dt, ctx);
    case 'wander':
      return actWander(w, c, dt, ctx);
    default:
      c.state = 'idle';
      c.moving = false;
      return;
  }
}

function actWork(w: World, c: Character, dt: number, ctx: Ctx) {
  const j = w.jobs.get(c.jobId);
  if (!j || j.assigned !== c.id) {
    c.jobId = -1;
    c.activity = 'idle';
    return;
  }

  // Hauling has a pickup leg first.
  if (j.type === 'haulToSite' && j.res) {
    const needed = !c.carrying || c.carrying.res !== j.res;
    if (needed) {
      const src = nearestBuilding(
        w,
        c.x,
        c.y,
        (b) => b.state === 'built' && !!buildingDef(b.def).storage
      );
      const target = src
        ? accessTile(w, src)
        : { tx: w.campCenter.tx, ty: w.campCenter.ty };
      if (!target) {
        releaseJob(w, c, 4);
        c.activity = 'idle';
        return;
      }
      if (!isNear(c, target.tx, target.ty, 1.4)) {
        moveToward(w, c, target.tx, target.ty, dt, ctx, () => {
          releaseJob(w, c, 5);
          c.activity = 'idle';
        });
        c.state = 'moving';
        return;
      }
      const want = Math.min(j.amount, 40);
      const got = takeResource(w, j.res, want);
      if (got <= 0) {
        releaseJob(w, c, 6);
        c.activity = 'idle';
        return;
      }
      c.carrying = { res: j.res, amount: got };
      say(w, c, 'hauling');
      return;
    }
  }

  // Patients move too — and a collapsed one has to be reached where they lie.
  if (j.type === 'treat') {
    const patient = w.characters.find((p) => p.id === j.targetId);
    if (!patient || !patient.alive) {
      releaseJob(w, c, 2);
      c.activity = 'idle';
      return;
    }
    const px = Math.floor(patient.x / TILE);
    const py = Math.floor(patient.y / TILE);
    if (Math.hypot(patient.x - c.x, patient.y - c.y) > TILE * 1.4) {
      c.state = 'moving';
      if (c.repathT <= 0 && (j.tx !== px || j.ty !== py)) {
        j.tx = px;
        j.ty = py;
        clearPath(c);
      }
      moveToward(w, c, px, py, dt, ctx, () => {
        releaseJob(w, c, 8);
        c.activity = 'idle';
      });
      return;
    }
    c.state = 'working';
    c.moving = false;
    faceTile(c, px, py);
    const res = performWork(w, c, j, dt, ctx.fx);
    if (res === 'done') {
      finishJob(w, c);
      if (c.order && c.order.kind === 'work') c.order = null;
      c.activity = 'idle';
      c.thinkT = 0;
    } else if (res === 'fail') {
      releaseJob(w, c, 6);
      c.activity = 'idle';
      c.thinkT = 0;
    }
    return;
  }

  // Prey moves, so a hunt re-aims at wherever the animal is now.
  let goalX = j.tx;
  let goalY = j.ty;
  if (j.type === 'hunt') {
    const animal = findAnimal(w, j.targetId);
    if (!animal) {
      releaseJob(w, c, 2);
      c.activity = 'idle';
      return;
    }
    goalX = Math.floor(animal.x / TILE);
    goalY = Math.floor(animal.y / TILE);
    const dx = animal.x - c.x;
    const dy = animal.y - c.y;
    if (Math.hypot(dx, dy) > TILE * 1.15) {
      c.state = 'moving';
      // Repath often; the target will not stay put.
      if (c.repathT <= 0) clearPath(c);
      moveToward(w, c, goalX, goalY, dt, ctx, () => {
        releaseJob(w, c, 10);
        c.activity = 'idle';
      });
      return;
    }
    c.state = 'working';
    c.moving = false;
    faceTile(c, goalX, goalY);
    const res = performWork(w, c, j, dt, ctx.fx);
    if (res === 'done') {
      finishJob(w, c);
      if (c.order && c.order.kind === 'work') c.order = null;
      c.activity = c.carrying ? 'store' : 'idle';
      c.thinkT = 0;
    } else if (res === 'fail') {
      releaseJob(w, c, 6);
      c.activity = 'idle';
      c.thinkT = 0;
    }
    return;
  }

  if (!isNear(c, j.tx, j.ty, WORK_REACH)) {
    c.state = 'moving';
    moveToward(w, c, j.tx, j.ty, dt, ctx, () => {
      say(w, c, 'stressed');
      releaseJob(w, c, 8);
      c.activity = 'idle';
    });
    return;
  }

  c.state = 'working';
  c.moving = false;
  // Settle onto the work tile so the swing connects with the target.
  const k = Math.min(1, dt * 8);
  c.x += (tileToWorldX(j.tx) - c.x) * k;
  c.y += (tileToWorldY(j.ty) - c.y) * k;
  faceWork(w, c, j);
  const res = performWork(w, c, j, dt, ctx.fx);
  if (res === 'done') {
    finishJob(w, c);
    if (c.order && c.order.kind === 'work') c.order = null;
    c.activity = c.carrying ? 'store' : 'idle';
    c.thinkT = 0;
  } else if (res === 'fail') {
    releaseJob(w, c, 6);
    c.activity = 'idle';
    c.thinkT = 0;
  }
}

function jobNeedsCarry(w: World, c: Character): boolean {
  const j = w.jobs.get(c.jobId);
  if (!j) return false;
  return j.type === 'haulToSite' && !!c.carrying && c.carrying.res === j.res;
}

function startStore(w: World, c: Character, ctx: Ctx) {
  c.activity = 'store';
  const store = nearestBuilding(
    w,
    c.x,
    c.y,
    (b) => b.state === 'built' && !!buildingDef(b.def).storage
  );
  c.activityTarget = store ? store.id : -1;
}

function actStore(w: World, c: Character, dt: number, ctx: Ctx) {
  if (!c.carrying) {
    c.activity = 'idle';
    c.thinkT = 0;
    return;
  }
  let target: { tx: number; ty: number } | null = null;
  const store = w.buildings.get(c.activityTarget);
  if (store && store.state === 'built') target = accessTile(w, store);
  if (!target) {
    const alt = nearestBuilding(
      w,
      c.x,
      c.y,
      (b) => b.state === 'built' && !!buildingDef(b.def).storage
    );
    if (alt) {
      c.activityTarget = alt.id;
      target = accessTile(w, alt);
    }
  }
  if (!target) target = { tx: w.campCenter.tx, ty: w.campCenter.ty };

  if (!isNear(c, target.tx, target.ty, 1.4)) {
    c.state = 'moving';
    moveToward(w, c, target.tx, target.ty, dt, ctx, () => {
      // Nowhere to put it — dump it where they stand rather than freeze.
      if (c.carrying) addResource(w, c.carrying.res, c.carrying.amount);
      c.carrying = null;
      c.activity = 'idle';
    });
    return;
  }
  c.state = 'working';
  c.moving = false;
  storeCarried(w, c, ctx.fx);
  if (!c.carrying) {
    c.activity = 'idle';
    c.thinkT = 0;
  } else {
    // Storage is full; hold on to it and try again shortly.
    c.activityT -= dt;
    if (c.activityT < -4) {
      c.activity = 'idle';
      c.activityT = 0;
    }
  }
}

/* -------- eating -------- */

function foodAvailable(w: World) {
  return totalFood(w) > 0;
}

/** Best first: a cooked meal beats raw scraps by a wide margin. */
const MEAL_ORDER: { res: ResourceType; quality: number; raw: boolean }[] = [
  { res: 'cookedMeat', quality: 1.15, raw: false },
  { res: 'food', quality: 1, raw: false },
  { res: 'rawMeat', quality: 0.5, raw: true },
  { res: 'rawFood', quality: 0.6, raw: true },
];

function mealTime(hour: number) {
  return (hour > 7 && hour < 9) || (hour > 12 && hour < 14) || (hour > 18 && hour < 20);
}

function startEat(w: World, c: Character, ctx: Ctx) {
  c.activity = 'eat';
  c.activityT = 3.5;
  const spot =
    nearestBuilding(w, c.x, c.y, (b) => b.state === 'built' && !!buildingDef(b.def).social) ??
    nearestBuilding(w, c.x, c.y, (b) => b.state === 'built' && !!buildingDef(b.def).cooking) ??
    nearestBuilding(w, c.x, c.y, (b) => b.state === 'built' && !!buildingDef(b.def).storage);
  c.activityTarget = spot ? spot.id : -1;
}

function actEat(w: World, c: Character, dt: number, ctx: Ctx) {
  const spot = w.buildings.get(c.activityTarget);
  const target = spot ? accessTile(w, spot) : { tx: w.campCenter.tx, ty: w.campCenter.ty };
  if (target && !isNear(c, target.tx, target.ty, 1.5)) {
    c.state = 'moving';
    moveToward(w, c, target.tx, target.ty, dt, ctx, () => {
      c.activityTarget = -1;
    });
    return;
  }
  c.state = 'eating';
  c.moving = false;
  c.activityT -= dt;
  if (c.activityT > 0) return;

  const portion = Math.max(3, Math.round(6 * appetite(c)));
  let ate = 0;
  let quality = 1;
  let ateRaw = false;
  for (const option of MEAL_ORDER) {
    ate = takeResource(w, option.res, portion);
    if (ate > 0) {
      quality = option.quality;
      ateRaw = option.raw;
      break;
    }
  }
  if (ateRaw && ate > 0 && roll(w) < 0.08) makeSick(w, c, 0.25, 'ate raw food');
  if (ate <= 0) {
    say(w, c, 'noFood', true);
    c.morale -= 4;
    c.activity = 'idle';
    c.thinkT = 0;
    return;
  }
  const relief = (ate / portion) * 72 * quality;
  c.hunger = Math.max(0, c.hunger - relief);
  const drank = takeResource(w, 'water', 1);
  c.morale += 3 * quality + (drank > 0 ? 1 : -1);
  c.lastMealAt = w.time.t;
  ctx.fx.float(c.x, c.y - 24, ateRaw ? 'raw food' : 'a hot meal', '#ffd88a');
  c.activity = 'idle';
  c.thinkT = 0;
}

/* -------- sleeping -------- */

function startSleep(w: World, c: Character, ctx: Ctx) {
  c.activity = 'sleep';
  if (c.jobId >= 0) releaseJob(w, c);
  const bed = claimBed(w, c);
  if (bed) {
    if (!bed.users.includes(c.id)) bed.users.push(c.id);
    c.sleepBuildingId = bed.id;
    c.sleepComfort = buildingDef(bed.def).comfort ?? 0.3;
  } else {
    c.sleepBuildingId = -1;
    c.sleepComfort = 0.12;
    if (roll(w) < 0.3) say(w, c, 'noBeds');
  }
}

/**
 * Beds belong to people.
 *
 * A survivor keeps the same bed night after night, which is both nicer to
 * watch and stops the whole camp shuffling between bedrolls every evening.
 * An unclaimed bed goes to whoever needs one first.
 */
export function claimBed(w: World, c: Character): Building | null {
  const owned = c.sleepBuildingId >= 0 ? w.buildings.get(c.sleepBuildingId) : null;
  if (owned && owned.state === 'built' && owned.owner === c.id) return owned;

  let best: Building | null = null;
  let bestScore = -Infinity;
  for (const b of w.buildings.values()) {
    if (b.state !== 'built') continue;
    const def = buildingDef(b.def);
    if (!def.beds) continue;
    if (b.owner >= 0 && b.owner !== c.id) {
      const holder = w.characters.find((o) => o.id === b.owner);
      if (holder && holder.alive) continue;
      b.owner = -1; // the owner is gone; the bed is free again
    }
    if (b.users.filter((id) => id !== c.id).length >= def.beds) continue;
    const dx = buildingCenterX(b) - c.x;
    const dy = buildingCenterY(b) - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy) / TILE;
    const score = (def.comfort ?? 0) * 30 - dist * 0.5 + (b.owner === c.id ? 100 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  if (best) best.owner = c.id;
  return best;
}

/** The tile a sleeper lies on — the middle of the bed, not its edge. */
export function bedTile(b: Building): { tx: number; ty: number } {
  return {
    tx: b.tx + Math.floor((b.w - 1) / 2),
    ty: b.ty + Math.floor((b.h - 1) / 2),
  };
}

export function releaseBed(w: World, c: Character) {
  if (c.sleepBuildingId < 0) return;
  const b = w.buildings.get(c.sleepBuildingId);
  if (b) b.users = b.users.filter((id) => id !== c.id);
  c.sleepComfort = 0;
  // The claim survives — they come back to the same bed tomorrow night.
}

/** Give up a bed entirely (on death, or when it is taken down). */
export function abandonBed(w: World, c: Character) {
  const b = c.sleepBuildingId >= 0 ? w.buildings.get(c.sleepBuildingId) : null;
  if (b) {
    b.users = b.users.filter((id) => id !== c.id);
    if (b.owner === c.id) b.owner = -1;
  }
  c.sleepBuildingId = -1;
  c.sleepComfort = 0;
}

function actSleep(w: World, c: Character, dt: number, ctx: Ctx) {
  const bed = c.sleepBuildingId >= 0 ? w.buildings.get(c.sleepBuildingId) : null;
  let target: { tx: number; ty: number } | null = null;
  if (bed && bed.state === 'built') {
    // Aim for the bed itself, so they are visibly lying in it.
    const bt = bedTile(bed);
    target = tileBlocked(w, bt.tx, bt.ty) ? accessTile(w, bed) : bt;
  } else {
    const fire = nearestBuilding(
      w,
      c.x,
      c.y,
      (b) => b.state === 'built' && !!buildingDef(b.def).light
    );
    target = fire ? accessTile(w, fire) : { tx: w.campCenter.tx, ty: w.campCenter.ty };
  }
  if (target && !isNear(c, target.tx, target.ty, 0.5)) {
    c.state = 'moving';
    moveToward(w, c, target.tx, target.ty, dt, ctx, () => {
      c.sleepComfort = 0.12;
      abandonBed(w, c);
    });
    return;
  }
  if (target) {
    // Settle exactly onto the bed so the sprite lines up with it, and stay
    // there — a sleeper half off the mattress looks like a bug.
    c.x = tileToWorldX(target.tx);
    c.y = tileToWorldY(target.ty);
  }
  c.state = 'sleeping';
  c.moving = false;
  c.lastSleepAt = w.time.t;
}

function wake(w: World, c: Character) {
  releaseBed(w, c);
  c.state = 'idle';
  c.activity = 'idle';
  c.sleepComfort = 0;
}

/* -------- social -------- */

function findSocialPartner(w: World, c: Character): Character | null {
  let best: Character | null = null;
  let bestScore = -Infinity;
  for (const o of w.characters) {
    if (!o.alive || o.id === c.id) continue;
    if (o.state === 'sleeping' || o.state === 'exploring' || o.state === 'downed') continue;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy) / TILE;
    if (dist > 22) continue;
    const rel = c.relationships[o.id] ?? 35;
    const score = rel * 0.5 - dist * 1.4 + socialFactor(c) * 6;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

function actSocial(w: World, c: Character, dt: number, ctx: Ctx) {
  const other = w.characters.find((o) => o.id === c.activityTarget);
  if (!other || !other.alive || other.state === 'sleeping') {
    c.activity = 'idle';
    c.thinkT = 0;
    return;
  }
  const tx = charTileX(other);
  const ty = charTileY(other);
  if (!isNear(c, tx, ty, 1.9)) {
    c.state = 'moving';
    moveToward(w, c, tx, ty, dt, ctx, () => {
      c.activity = 'idle';
    });
    return;
  }
  c.state = 'socialising';
  c.moving = false;
  faceTile(c, tx, ty);
  c.activityT -= dt;
  if (c.activityT <= 0) {
    c.activity = 'idle';
    c.thinkT = 0;
  }
}

/* -------- resting by the fire -------- */

function actRest(w: World, c: Character, dt: number, ctx: Ctx) {
  const b = w.buildings.get(c.activityTarget);
  const target = b ? accessTile(w, b) : { tx: w.campCenter.tx, ty: w.campCenter.ty };
  if (target && !isNear(c, target.tx, target.ty, 2.2)) {
    c.state = 'moving';
    moveToward(w, c, target.tx, target.ty, dt, ctx, () => {
      c.activity = 'idle';
    });
    return;
  }
  c.state = 'idle';
  c.moving = false;
  c.activityT -= dt;
  if (roll(w) < dt * 0.05) say(w, c, 'night');
  if (c.activityT <= 0) {
    c.activity = 'idle';
    c.thinkT = 0;
  }
}

/* -------- wandering -------- */

function wanderTo(w: World, c: Character, ctx: Ctx) {
  const { tx: cx, ty: cy } = w.campCenter;
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = roll(w) * Math.PI * 2;
    const r = 2 + roll(w) * 9;
    const tx = Math.round(cx + Math.cos(a) * r);
    const ty = Math.round(cy + Math.sin(a) * r);
    if (tileBlocked(w, tx, ty)) continue;
    if (setDestination(w, c, tx, ty, ctx.pf)) return;
  }
}

function actWander(w: World, c: Character, dt: number, ctx: Ctx) {
  if (hasPath(c)) {
    c.state = 'moving';
    const r = updateMovement(w, c, dt, ctx.pf);
    if (r === 'blocked') {
      clearPath(c);
      c.activity = 'idle';
    }
    return;
  }
  c.state = 'idle';
  c.moving = false;
  c.activityT -= dt;
  if (c.activityT <= 0) {
    c.activity = 'idle';
    c.thinkT = 0;
  }
}

/* -------- player orders -------- */

function actOrder(w: World, c: Character, dt: number, ctx: Ctx) {
  const order = c.order;
  if (!order) {
    c.activity = 'idle';
    return;
  }
  if (order.kind === 'move') {
    if (isNear(c, order.tx, order.ty, 0.8)) {
      c.order = null;
      c.activity = 'idle';
      c.state = 'idle';
      c.thinkT = 0;
      return;
    }
    c.state = 'moving';
    moveToward(w, c, order.tx, order.ty, dt, ctx, () => {
      say(w, c, 'stressed', true);
      ctx.fx.float(c.x, c.y - 26, 'no way through', '#ff9d7a');
      c.order = null;
      c.activity = 'idle';
    });
    return;
  }
  if (order.kind === 'work') {
    const j = order.targetId !== undefined ? w.jobs.get(order.targetId) : null;
    if (!j) {
      c.order = null;
      c.activity = 'idle';
      c.thinkT = 0;
      return;
    }
    if (j.assigned !== c.id) {
      if (j.assigned >= 0) {
        const prev = w.characters.find((o) => o.id === j.assigned);
        if (prev) {
          prev.jobId = -1;
          prev.activity = 'idle';
        }
      }
      j.assigned = c.id;
      c.jobId = j.id;
      c.workT = 0;
    }
    c.activity = 'work';
    actWork(w, c, dt, ctx);
    return;
  }
  if (order.kind === 'explore') {
    c.order = null;
    c.activity = 'explore';
    return;
  }
}

/* -------- exploration -------- */

function actExplore(w: World, c: Character, dt: number, ctx: Ctx) {
  const exp = c.expedition;
  if (!exp) {
    c.activity = 'idle';
    c.state = 'idle';
    return;
  }
  const site = siteById(w, exp.siteId);
  if (!site) {
    c.expedition = null;
    c.activity = 'idle';
    return;
  }
  c.state = 'exploring';

  if (exp.phase === 'travel') {
    if (isNear(c, site.tx, site.ty, 1.6)) {
      beginSearch(w, c, site);
      return;
    }
    moveToward(w, c, site.tx, site.ty, dt, ctx, () => {
      ctx.fx.float(c.x, c.y - 26, 'no route', '#ff9d7a');
      exp.phase = 'return';
    });
    return;
  }

  if (exp.phase === 'search') {
    c.moving = false;
    exp.timer -= dt;
    if (roll(w) < dt * 0.6) {
      ctx.fx.dust(c.x + (roll(w) - 0.5) * 24, c.y + (roll(w) - 0.5) * 20, '#a99070');
    }
    if (exp.timer <= 0) resolveSearch(w, c, site, ctx.fx);
    return;
  }

  // returning
  const home = w.campCenter;
  if (isNear(c, home.tx, home.ty, 3)) {
    completeExpedition(w, c, ctx.fx);
    return;
  }
  moveToward(w, c, home.tx, home.ty, dt, ctx, () => {
    // Genuinely lost — they tire and try again next tick.
    c.energy -= 2;
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function moveToward(
  w: World,
  c: Character,
  tx: number,
  ty: number,
  dt: number,
  ctx: Ctx,
  onFail: () => void
) {
  if (!hasPath(c)) {
    if (c.repathT > 0) {
      c.repathT -= dt;
      return;
    }
    if (!setDestination(w, c, tx, ty, ctx.pf)) {
      c.repathT = 1.2;
      c.stuckT += 1;
      if (c.stuckT >= 3) {
        c.stuckT = 0;
        onFail();
      }
      return;
    }
  }
  const r = updateMovement(w, c, dt, ctx.pf);
  if (r === 'blocked') {
    clearPath(c);
    c.repathT = 0.5;
    c.stuckT += 1;
    if (c.stuckT >= 4) {
      c.stuckT = 0;
      onFail();
    }
  } else if (r === 'arrived') {
    const dx = Math.abs(c.x - tileToWorldX(tx));
    const dy = Math.abs(c.y - tileToWorldY(ty));
    if (dx > TILE * 2.2 || dy > TILE * 2.2) {
      // Ended up somewhere else entirely — try once more.
      if (!setDestination(w, c, tx, ty, ctx.pf)) {
        c.stuckT += 1;
        if (c.stuckT >= 3) {
          c.stuckT = 0;
          onFail();
        }
      }
    }
  }
}

/** Face what is actually being worked on, not the tile stood on. */
function faceWork(w: World, c: Character, j: Job) {
  if (j.targetKind === 'node') {
    const n = w.nodes.get(j.targetId);
    if (n) return faceTile(c, n.tx, n.ty);
  }
  if (j.targetKind === 'building' || j.targetKind === 'farmCell') {
    const b = w.buildings.get(j.targetId);
    if (b) {
      if (j.cellIndex >= 0 && b.farm) {
        return faceTile(c, b.tx + (j.cellIndex % b.w), b.ty + Math.floor(j.cellIndex / b.w));
      }
      return faceTile(c, Math.floor(b.tx + b.w / 2), Math.floor(b.ty + b.h / 2));
    }
  }
  faceTile(c, j.tx, j.ty);
}

function faceTile(c: Character, tx: number, ty: number) {
  const dx = tileToWorldX(tx) - c.x;
  const dy = tileToWorldY(ty) - c.y;
  if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? 2 : 1;
  else c.dir = dy > 0 ? 0 : 3;
}

/** True when `h` is inside the wrapped window [from, to). */
function wrappedAfter(h: number, from: number, to: number) {
  const f = ((from % 24) + 24) % 24;
  const t = ((to % 24) + 24) % 24;
  if (f < t) return h >= f && h < t;
  return h >= f || h < t;
}

export function currentActivityLabel(w: World, c: Character): string {
  if (!c.alive) return 'Dead';
  if (c.state === 'downed') return 'Badly hurt';
  if (c.expedition) {
    const site = siteById(w, c.expedition.siteId);
    const where = site ? site.name : 'the forest';
    if (c.expedition.phase === 'travel') return `Travelling to ${where}`;
    if (c.expedition.phase === 'search') return `Searching ${where}`;
    return 'Returning to camp';
  }
  if (c.state === 'sleeping') return 'Sleeping';
  if (c.state === 'eating') return 'Eating';
  if (c.state === 'socialising') return 'Talking';
  if (c.activity === 'store') return 'Storing supplies';
  if (c.activity === 'eat') return 'Heading to eat';
  if (c.activity === 'sleep') return 'Going to bed';
  if (c.activity === 'social') return 'Looking for company';
  if (c.activity === 'rest') return 'Resting by the fire';
  if (c.activity === 'order') return c.order?.kind === 'move' ? 'Moving' : 'Following orders';
  if (c.jobId >= 0) {
    const j = w.jobs.get(c.jobId);
    if (j) return describeJob(w, j);
  }
  if (c.moving) return 'Walking';
  return 'Idle';
}
