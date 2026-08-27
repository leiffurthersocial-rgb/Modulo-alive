import type { World } from '../core/types';
import { MINUTES_PER_SIM_SECOND } from './time';
import { updateCharacter, abandonBed } from './ai';
import { separate } from './movement';
import { generateJobs, workCoverage } from './jobs';
import { updateNeeds } from './needs';
import { growthTick, regrowthTick } from './farming';
import { socialTick } from './relationships';
import { eventTick } from './events';
import { checkMortality } from './medical';
import { checkProgression } from './progression';
import { removeNode } from './world';
import type { Ctx } from './context';

/** Fixed simulation step, in sim-seconds. */
export const SIM_STEP = 0.1;

const NEEDS_INTERVAL = 1.0;
const JOB_INTERVAL = 1.5;
const SOCIAL_INTERVAL = 5.0;
const EVENT_INTERVAL = 30; // one game hour
const GROWTH_INTERVAL = 2.0;

/**
 * One fixed simulation step. Rendering never calls into this; the engine
 * accumulates real time, scales it by the speed setting and steps this
 * function a whole number of times.
 */
export function stepWorld(w: World, dt: number, ctx: Ctx) {
  const prevMinutes = w.time.minutes;
  w.time.t += dt;
  w.time.minutes += dt * MINUTES_PER_SIM_SECOND;

  const prevDay = Math.floor(prevMinutes / 1440);
  const day = Math.floor(w.time.minutes / 1440);
  if (day !== prevDay) w.stats.daysSurvived = day;

  /* -------- world objects -------- */
  let toRemove: number[] | null = null;
  for (const n of w.nodes.values()) {
    if (n.shake > 0) n.shake = Math.max(0, n.shake - dt * 3.2);
    if (n.fallT > 0) {
      n.fallT -= dt;
      if (n.fallT <= 0) {
        (toRemove ??= []).push(n.id);
      }
    }
  }
  if (toRemove) {
    for (const id of toRemove) {
      const n = w.nodes.get(id);
      if (n) removeNode(w, n);
    }
  }
  for (const b of w.buildings.values()) {
    if (b.activeT > 0) b.activeT = Math.max(0, b.activeT - dt);
  }

  /* -------- characters -------- */
  ctx.coverage = workCoverage(w);
  for (const c of w.characters) {
    if (!c.alive) continue;
    updateCharacter(w, c, dt, ctx);
  }
  separate(w, dt);

  /* -------- staggered subsystems -------- */
  w.acc.needs += dt;
  if (w.acc.needs >= NEEDS_INTERVAL) {
    updateNeeds(w, w.acc.needs);
    w.acc.needs = 0;
  }

  w.acc.jobs += dt;
  if (w.acc.jobs >= JOB_INTERVAL) {
    generateJobs(w);
    pruneJobs(w);
    w.acc.jobs = 0;
  }

  w.acc.growth += dt;
  if (w.acc.growth >= GROWTH_INTERVAL) {
    growthTick(w, w.acc.growth);
    regrowthTick(w);
    w.acc.growth = 0;
  }

  w.acc.social += dt;
  if (w.acc.social >= SOCIAL_INTERVAL) {
    socialTick(w, ctx.fx);
    w.acc.social = 0;
  }

  w.acc.events += dt;
  if (w.acc.events >= EVENT_INTERVAL) {
    eventTick(w, ctx.fx);
    checkMortality(w, ctx.fx);
    checkProgression(w);
    tidyDead(w);
    w.acc.events = 0;
  }
}

/** Drop jobs whose target has vanished, and unstick orphaned assignments. */
function pruneJobs(w: World) {
  const dead: number[] = [];
  for (const j of w.jobs.values()) {
    let valid = true;
    if (j.targetKind === 'node') {
      const n = w.nodes.get(j.targetId);
      if (!n || n.depleted) valid = false;
    } else if (j.targetKind === 'building' || j.targetKind === 'farmCell') {
      const b = w.buildings.get(j.targetId);
      if (!b) valid = false;
      else if (j.type === 'build' && b.state !== 'blueprint') valid = false;
      else if (j.type === 'haulToSite' && b.state !== 'blueprint') valid = false;
      else if (j.targetKind === 'farmCell') {
        const cell = b.farm?.[j.cellIndex];
        if (!cell) valid = false;
        else if (j.type === 'harvest' && (!cell.crop || cell.growth < 1)) valid = false;
        else if (j.type === 'plant' && cell.crop) valid = false;
        else if (j.type === 'till' && cell.tilled) valid = false;
      }
    } else if (j.targetKind === 'character') {
      const c = w.characters.find((x) => x.id === j.targetId);
      if (!c || !c.alive) valid = false;
      else if (j.type === 'treat' && !c.injuries.some((i) => !i.treated) && c.sickness <= 0.05)
        valid = false;
    }
    if (j.assigned >= 0) {
      const owner = w.characters.find((x) => x.id === j.assigned);
      if (!owner || !owner.alive || owner.jobId !== j.id) j.assigned = -1;
    }
    // A job nobody can reach is worse than no job: it holds a slot forever.
    if (j.fails >= 4) {
      valid = false;
      if (j.targetKind === 'node') {
        const n = w.nodes.get(j.targetId);
        if (n) n.marked = false;
      }
    }
    if (!valid) dead.push(j.id);
  }
  for (const id of dead) {
    const j = w.jobs.get(id);
    if (j && j.assigned >= 0) {
      const owner = w.characters.find((x) => x.id === j.assigned);
      if (owner) {
        owner.jobId = -1;
        owner.activity = 'idle';
      }
    }
    w.jobs.delete(id);
  }
}

function tidyDead(w: World) {
  for (const c of w.characters) {
    if (c.alive) continue;
    if (c.sleepBuildingId >= 0) abandonBed(w, c);
  }
}
