import type { Character, World } from '../core/types';
import { clamp } from '../core/util';
import { buildingDef } from '../data/buildings';
import {
  appetite,
  fatigueRate,
  impairment,
  maxHealthFor,
  stressRate,
  traitAdd,
} from './modifiers';
import { clampNeeds, log, storageCapacity, storedTotal } from './world';
import { hourOfDay, isNight } from './time';

/** Game hours that pass per simulated second at 1x. */
const HOURS_PER_SIM_SECOND = 2 / 60;

/**
 * Needs update on a coarse interval (once per sim-second) rather than per
 * frame — dozens of survivors stay cheap, and the numbers stay readable.
 */
export function updateNeeds(w: World, dt: number) {
  const hours = dt * HOURS_PER_SIM_SECOND;
  const cap = storageCapacity(w);
  const stored = storedTotal(w);
  const foodShort = w.stock.food + w.stock.rawFood < w.characters.length * 3;
  const night = isNight(w.time.minutes);

  let beds = 0;
  let comfortSum = 0;
  let socialAmenity = 0;
  for (const b of w.buildings.values()) {
    if (b.state !== 'built') continue;
    const d = buildingDef(b.def);
    if (d.beds) {
      beds += d.beds;
      comfortSum += (d.comfort ?? 0) * d.beds;
    }
    if (d.social) socialAmenity += d.social;
  }
  const pop = w.characters.filter((c) => c.alive).length;
  const bedRatio = pop > 0 ? clamp(beds / pop, 0, 1) : 1;

  for (const c of w.characters) {
    if (!c.alive) continue;

    /* -------- hunger -------- */
    const hungerRate = c.state === 'sleeping' ? 1.3 : 2.2;
    c.hunger += hungerRate * hours * (0.85 + appetite(c) * 0.15);

    /* -------- energy -------- */
    if (c.state === 'sleeping') {
      const comfort = c.sleepComfort;
      c.energy += (9 + comfort * 9) * hours;
      c.stress -= 3.5 * hours;
    } else {
      let drain = 2.1;
      if (c.state === 'working') drain += 1.1;
      if (c.state === 'exploring') drain += 1.5;
      if (c.moving) drain += 0.3;
      if (night) drain += 0.4;
      c.energy -= drain * hours * fatigueRate(c);
    }

    /* -------- health -------- */
    let hp = 0;
    if (c.hunger >= 100) hp -= 3.4;
    else if (c.hunger > 88) hp -= 0.9;
    if (c.energy <= 0) hp -= 1.2;
    if (c.sickness > 0) hp -= c.sickness * 2.2;
    for (const inj of c.injuries) {
      if (inj.bleeding > 0 && !inj.treated) hp -= inj.bleeding * 2.6;
    }
    if (hp >= 0 && c.hunger < 72 && c.energy > 22) {
      hp += c.state === 'sleeping' ? 2.4 : 1.1;
    }
    c.health += hp * hours;

    /* -------- injuries heal -------- */
    if (c.injuries.length) {
      const healSpeed =
        (1 + (c.stats.endurance - 5) * 0.05) * (c.hunger < 70 ? 1 : 0.6);
      for (let i = c.injuries.length - 1; i >= 0; i--) {
        const inj = c.injuries[i];
        inj.remaining -= dt * healSpeed * (inj.treated ? 2.1 : 1);
        if (inj.treated) inj.bleeding = 0;
        else inj.bleeding = Math.max(0, inj.bleeding - hours * 0.08);
        if (inj.remaining <= 0) {
          c.injuries.splice(i, 1);
          if (inj.severity > 0.45) {
            log(
              w,
              'good',
              'Recovered',
              `${c.name}'s ${inj.label.toLowerCase()} has healed.`,
              [c.id]
            );
          }
        }
      }
    }

    /* -------- sickness -------- */
    if (c.sickness > 0) {
      const rec = (0.02 + (c.stats.endurance - 5) * 0.003) * (c.hunger < 70 ? 1.2 : 0.7);
      c.sickness = Math.max(0, c.sickness - rec * hours);
    }

    /* -------- morale -------- */
    let target = 50;
    target += (bedRatio - 0.5) * 20;
    target += comfortSum > 0 && beds > 0 ? (comfortSum / beds) * 14 : 0;
    target += Math.min(12, socialAmenity * 6);
    target -= c.hunger > 60 ? (c.hunger - 60) * 0.45 : 0;
    target -= c.energy < 35 ? (35 - c.energy) * 0.3 : 0;
    target -= c.stress * 0.22;
    target -= impairment(c) * 30;
    target -= foodShort ? 10 : 0;
    target -= stored >= cap ? 5 : 0;
    target += traitAdd(c, 'moraleDrift') * 12;
    if (c.state === 'socialising') target += 8;
    target = clamp(target, 0, 100);

    const rate = target > c.morale ? 3.2 : 4.4;
    c.morale += clamp(target - c.morale, -rate * hours, rate * hours);

    /* -------- stress -------- */
    let stress = 0;
    if (c.state === 'working') stress += 0.9;
    if (c.state === 'exploring') stress += 2.4;
    if (c.hunger > 70) stress += 1.8;
    if (c.energy < 25) stress += 1.6;
    if (c.injuries.length) stress += 1.4;
    if (c.morale < 30) stress += 1.6;
    if (night && c.state !== 'sleeping') stress += 0.5;
    if (stress > 0) c.stress += stress * hours * stressRate(c);

    let relief = 0;
    if (c.state === 'idle') relief += 2.6;
    if (c.state === 'socialising') relief += 4.2;
    if (c.state === 'sleeping') relief += 4.0;
    if (c.morale > 65) relief += 1.2;
    if (relief > 0) c.stress -= relief * hours;

    c.maxHealth = maxHealthFor(c);
    clampNeeds(c);
  }
}

/** Convenience for the AI: how urgently this character needs something. */
export function needUrgency(c: Character) {
  return {
    food: c.hunger > 92 ? 3 : c.hunger > 72 ? 2 : c.hunger > 52 ? 1 : 0,
    sleep: c.energy < 12 ? 3 : c.energy < 28 ? 2 : c.energy < 45 ? 1 : 0,
    medical:
      c.health < c.maxHealth * 0.35 || c.injuries.some((i) => !i.treated && i.severity > 0.4)
        ? 3
        : c.injuries.some((i) => !i.treated)
          ? 1
          : 0,
    social: c.stress > 72 ? 2 : c.stress > 52 ? 1 : 0,
  };
}

export function hoursUntilBedtime(w: World, sleepHour: number) {
  const h = hourOfDay(w.time.minutes);
  let d = sleepHour - h;
  if (d < 0) d += 24;
  return d;
}
