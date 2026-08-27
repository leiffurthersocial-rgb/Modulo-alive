import type { ActiveEffect, Character, World } from '../core/types';
import { EFFECT_MAP, type StatusEffectDef } from '../data/effects';
import { clamp } from '../core/util';
import { impairment } from './modifiers';

/** Sim-seconds per game hour. Kept local to avoid a cycle with tasks.ts. */
const SECONDS_PER_HOUR = 30;

export function hasEffect(c: Character, id: string): boolean {
  return c.effects.some((e) => e.id === id);
}

export function getEffect(c: Character, id: string): ActiveEffect | undefined {
  return c.effects.find((e) => e.id === id);
}

export function effectDefs(c: Character): { def: StatusEffectDef; active: ActiveEffect }[] {
  const out: { def: StatusEffectDef; active: ActiveEffect }[] = [];
  for (const e of c.effects) {
    const def = EFFECT_MAP[e.id];
    if (def) out.push({ def, active: e });
  }
  return out;
}

/**
 * Apply (or refresh) a timed effect.
 * @param hours how long it lasts in game hours; -1 for conditional effects.
 */
export function applyEffect(
  w: World,
  c: Character,
  id: string,
  hours: number,
  severity = 1
): void {
  const def = EFFECT_MAP[id];
  if (!def) return;
  if (def.conflicts) {
    for (const other of def.conflicts) removeEffect(c, other);
  }
  const until = hours < 0 ? -1 : w.time.t + hours * SECONDS_PER_HOUR;
  const existing = getEffect(c, id);
  if (existing) {
    existing.until = until < 0 ? -1 : Math.max(existing.until, until);
    existing.severity = clamp(Math.max(existing.severity, severity), 0.1, 1);
    return;
  }
  c.effects.push({ id, until, severity: clamp(severity, 0.1, 1) });
}

export function removeEffect(c: Character, id: string): boolean {
  const i = c.effects.findIndex((e) => e.id === id);
  if (i < 0) return false;
  c.effects.splice(i, 1);
  return true;
}

/** Scale a multiplier-style modifier by the effect's severity. */
function scaled(value: number, severity: number): number {
  return 1 + (value - 1) * severity;
}

/** Combined multiplier across every active effect for a multiplier field. */
export function effectMultiplier(
  c: Character,
  key: 'workSpeed' | 'moveSpeed' | 'fatigue' | 'hungerRate' | 'learnRate' | 'accident' | 'vulnerability'
): number {
  let m = 1;
  for (const e of c.effects) {
    const def = EFFECT_MAP[e.id];
    const v = def?.[key];
    if (typeof v === 'number') m *= scaled(v, e.severity);
  }
  return m;
}

/** Combined per-hour total across every active effect for an additive field. */
export function effectPerHour(c: Character, key: 'moralePerHour' | 'healthPerHour'): number {
  let sum = 0;
  for (const e of c.effects) {
    const def = EFFECT_MAP[e.id];
    const v = def?.[key];
    if (typeof v === 'number') sum += v * e.severity;
  }
  return sum;
}

/**
 * Re-derive the condition-driven effects and drop anything that has expired.
 * Called once per needs tick.
 */
export function updateEffects(
  w: World,
  c: Character,
  hoursSinceSleep: number,
  hasWater: boolean
) {
  // Expire timed effects.
  for (let i = c.effects.length - 1; i >= 0; i--) {
    const e = c.effects[i];
    if (e.until >= 0 && w.time.t >= e.until) c.effects.splice(i, 1);
  }

  const set = (id: string, on: boolean, severity = 1) => {
    if (on) applyEffect(w, c, id, -1, severity);
    else {
      const existing = getEffect(c, id);
      if (existing && existing.until < 0) removeEffect(c, id);
    }
  };

  /* -------- hunger -------- */
  set('starving', c.hunger >= 92, clamp((c.hunger - 92) / 8 + 0.5, 0.5, 1));
  set('hungry', c.hunger >= 68 && c.hunger < 92);
  set('wellFed', c.hunger <= 22);

  /* -------- rest -------- */
  set('exhausted', c.energy <= 14);
  set('tired', c.energy > 14 && c.energy <= 36);
  set('wellRested', c.energy >= 88);

  // Sleep deprivation builds after a full day awake and only clears with sleep.
  if (c.state === 'sleeping' && c.energy > 70) {
    removeEffect(c, 'sleepDeprived');
  } else if (hoursSinceSleep > 22) {
    applyEffect(w, c, 'sleepDeprived', -1, clamp((hoursSinceSleep - 22) / 14, 0.35, 1));
  }

  /* -------- injury -------- */
  const pain = impairment(c);
  set('inPain', pain > 0.3, clamp(pain, 0.3, 1));

  /* -------- weather -------- */
  const outside = c.state !== 'sleeping';
  if (w.weather.kind === 'rain' && outside) {
    applyEffect(w, c, 'soaked', 1.5, w.weather.intensity);
  }

  /* -------- thirst -------- */
  set('parched', !hasWater && c.state !== 'sleeping');

  /* -------- the mind gives before the body does -------- */
  // Sustained misery drags a survivor down, and at the bottom they stop
  // functioning altogether until someone pulls them back.
  set('despair', c.morale < 26 && c.morale >= 12);
  set('breakingDown', c.morale < 12);

  /* -------- blistered: long swings with no tools -------- */
  if (c.state === 'working' && !c.equipment.tool && c.workStreak > 6) {
    applyEffect(w, c, 'blistered', 4, clamp((c.workStreak - 6) / 8, 0.3, 1));
  }

  /* -------- deep in the work -------- */
  if (
    c.state === 'working' &&
    c.jobId >= 0 &&
    c.workStreak > 3 &&
    c.morale > 55 &&
    w.jobs.get(c.jobId)?.work === c.favouriteWork
  ) {
    applyEffect(w, c, 'focused', 2);
  }

  /* -------- contentment -------- */
  set(
    'content',
    c.hunger < 45 && c.energy > 55 && c.morale > 62 && c.injuries.length === 0 && pain === 0
  );
}

/** A short, readable summary for the UI. */
export function effectSummary(c: Character): string {
  const defs = effectDefs(c);
  if (!defs.length) return 'Nothing notable';
  return defs.map((d) => d.def.label).join(', ');
}
