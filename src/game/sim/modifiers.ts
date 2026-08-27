import type { Character, SkillId, StatId, WorkType, World } from '../core/types';
import { WORK_SKILL } from '../core/types';
import { TRAIT_MAP, type TraitDef } from '../data/traits';
import { clamp } from '../core/util';

/**
 * Every derived number the simulation uses comes from here, so a trait or a
 * stat can never be decorative: if it is in the data, it is read below.
 */

export function traitDefs(c: Character): TraitDef[] {
  const out: TraitDef[] = [];
  for (const id of c.traits) {
    const d = TRAIT_MAP[id];
    if (d) out.push(d);
  }
  return out;
}

export function traitMul(c: Character, key: keyof TraitDef): number {
  let m = 1;
  for (const id of c.traits) {
    const d = TRAIT_MAP[id];
    if (!d) continue;
    const v = d[key];
    if (typeof v === 'number') m *= v;
  }
  return m;
}

export function traitAdd(c: Character, key: keyof TraitDef): number {
  let s = 0;
  for (const id of c.traits) {
    const d = TRAIT_MAP[id];
    if (!d) continue;
    const v = d[key];
    if (typeof v === 'number') s += v;
  }
  return s;
}

export function hasTrait(c: Character, id: string): boolean {
  return c.traits.indexOf(id) >= 0;
}

export function stat(c: Character, s: StatId): number {
  return c.stats[s];
}

export function skillLevel(c: Character, s: SkillId): number {
  return c.skills[s]?.level ?? 0;
}

/** 0..1 penalty from untreated injuries and illness. */
export function impairment(c: Character): number {
  let p = 0;
  for (const inj of c.injuries) {
    p += inj.severity * (inj.treated ? 0.35 : 1) * 0.45;
  }
  p += c.sickness * 0.5;
  return clamp(p, 0, 0.85);
}

export function maxHealthFor(c: Character): number {
  return 60 + c.stats.endurance * 5;
}

/** Tiles per second. */
export function moveSpeed(c: Character, world: World): number {
  const base = 1.75 + c.stats.agility * 0.09;
  const tired = c.energy < 25 ? 0.72 : c.energy < 50 ? 0.9 : 1;
  const hungry = c.hunger > 85 ? 0.8 : 1;
  const load = c.carrying ? 1 - Math.min(0.28, c.carrying.amount / (carryCapacity(c) * 4)) : 1;
  const hurt = 1 - impairment(c) * 0.55;
  return base * tired * hungry * load * Math.max(0.25, hurt);
}

export function carryCapacity(c: Character): number {
  return 20 + c.stats.strength * 6;
}

/** Multiplier on how much work a character completes per second. */
export function workSpeed(c: Character, work: WorkType): number {
  const skill = WORK_SKILL[work];
  const lvl = skillLevel(c, skill);
  let statTerm = 1;
  switch (work) {
    case 'woodcutting':
    case 'mining':
      statTerm = 0.55 + c.stats.strength * 0.075 + c.stats.endurance * 0.02;
      break;
    case 'construction':
      statTerm = 0.55 + c.stats.strength * 0.05 + c.stats.intelligence * 0.035;
      break;
    case 'hauling':
      statTerm = 0.6 + c.stats.strength * 0.05 + c.stats.agility * 0.03;
      break;
    case 'foraging':
      statTerm = 0.55 + c.stats.perception * 0.07 + c.stats.agility * 0.03;
      break;
    case 'farming':
      statTerm = 0.6 + c.stats.agility * 0.045 + c.stats.perception * 0.035;
      break;
    case 'cooking':
      statTerm = 0.6 + c.stats.intelligence * 0.05 + c.stats.perception * 0.03;
      break;
    case 'medicine':
      statTerm = 0.5 + c.stats.intelligence * 0.08 + c.stats.perception * 0.03;
      break;
    case 'crafting':
      statTerm = 0.55 + c.stats.intelligence * 0.07 + c.stats.agility * 0.03;
      break;
  }

  const skillTerm = 1 + lvl * 0.075;
  let m = traitMul(c, 'workSpeed');
  for (const id of c.traits) {
    const d = TRAIT_MAP[id];
    const b = d?.workBonus?.[work];
    if (typeof b === 'number') m *= b;
  }

  const moraleTerm = 0.75 + (c.morale / 100) * 0.4;
  const stressTerm = 1 - (c.stress / 100) * 0.35;
  const energyTerm = c.energy < 20 ? 0.6 : c.energy < 40 ? 0.85 : 1;
  const hungerTerm = c.hunger > 90 ? 0.65 : c.hunger > 70 ? 0.88 : 1;
  const hurtTerm = 1 - impairment(c) * 0.6;
  const toolTerm = c.equipment.tool ? 1.2 : 1;

  return (
    statTerm *
    skillTerm *
    m *
    moraleTerm *
    stressTerm *
    energyTerm *
    hungerTerm *
    toolTerm *
    Math.max(0.2, hurtTerm)
  );
}

/** How much of a job's yield the character actually extracts. */
export function yieldMultiplier(c: Character, work: WorkType): number {
  const lvl = skillLevel(c, WORK_SKILL[work]);
  const luck = 1 + (c.stats.luck - 5) * 0.02 * traitMul(c, 'fortune');
  return (1 + lvl * 0.04) * clamp(luck, 0.7, 1.5);
}

export function learnRate(c: Character): number {
  return traitMul(c, 'learnRate') * (1 + (c.stats.intelligence - 5) * 0.04);
}

export function fatigueRate(c: Character): number {
  return traitMul(c, 'fatigue') * (1 - (c.stats.endurance - 5) * 0.03);
}

export function stressRate(c: Character): number {
  return traitMul(c, 'stressGain') * (1 - (c.stats.endurance - 5) * 0.015);
}

export function socialFactor(c: Character): number {
  return traitMul(c, 'social') * (1 + (c.stats.charisma - 5) * 0.05);
}

export function courageFactor(c: Character): number {
  return traitMul(c, 'courage');
}

export function toughness(c: Character): number {
  return traitMul(c, 'toughness') * (1 - (c.stats.endurance - 5) * 0.03);
}

export function fortune(c: Character): number {
  return traitMul(c, 'fortune') * (1 + (c.stats.luck - 5) * 0.03);
}

export function appetite(c: Character): number {
  return traitMul(c, 'appetite');
}

/** Preferred bedtime / wake hours, shifted by Night Owl / Early Riser. */
export function schedule(c: Character) {
  const shift = traitAdd(c, 'scheduleShift');
  return {
    wake: 6.5 + shift,
    sleep: 21.5 + shift,
  };
}

export function addXp(c: Character, skill: SkillId, amount: number): boolean {
  const s = c.skills[skill];
  if (!s) return false;
  s.xp += amount * learnRate(c);
  let levelled = false;
  while (s.xp >= xpForLevel(s.level) && s.level < 20) {
    s.xp -= xpForLevel(s.level);
    s.level++;
    levelled = true;
  }
  return levelled;
}

export function xpForLevel(level: number): number {
  return 60 + level * 42;
}

/** Combined 0..1 wellbeing used for morale drift and UI mood faces. */
export function wellbeing(c: Character): number {
  return clamp(
    (c.morale / 100) * 0.4 +
      (1 - c.stress / 100) * 0.2 +
      (1 - c.hunger / 100) * 0.2 +
      (c.energy / 100) * 0.1 +
      (c.health / c.maxHealth) * 0.1,
    0,
    1
  );
}
