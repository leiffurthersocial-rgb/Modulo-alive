import {
  SKILL_IDS,
  STAT_IDS,
  WORK_TYPES,
  type Character,
  type Skill,
  type SkillId,
  type StatId,
  type Stats,
  type WorkType,
} from '../core/types';
import { TRAITS, TRAIT_CONFLICTS, TRAIT_MAP } from '../data/traits';
import type { SurvivorTemplate } from '../data/survivors';
import { RNG } from '../core/rng';
import { clamp } from '../core/util';
import { maxHealthFor } from './modifiers';

function rollStats(rng: RNG, tpl: SurvivorTemplate): Stats {
  const s = {} as Stats;
  for (const id of STAT_IDS) {
    // Points-buy feel: most stats land 4-7, occasionally 2 or 9.
    let v = Math.round(rng.gaussian(5.4, 2.6));
    v = clamp(v, 2, 9);
    s[id] = v;
  }
  if (tpl.fixedStats) {
    for (const k of Object.keys(tpl.fixedStats) as StatId[]) {
      s[k] = tpl.fixedStats[k]!;
    }
  }
  if (tpl.statBias) {
    for (const k of Object.keys(tpl.statBias) as StatId[]) {
      s[k] = clamp(s[k] + tpl.statBias[k]!, 1, 10);
    }
  }
  if (tpl.statFloor) {
    for (const k of Object.keys(tpl.statFloor) as StatId[]) {
      s[k] = Math.max(s[k], tpl.statFloor[k]!);
    }
  }
  return s;
}

function conflictsWith(chosen: string[], candidate: string): boolean {
  for (const group of TRAIT_CONFLICTS) {
    if (group.indexOf(candidate) < 0) continue;
    for (const c of chosen) if (c !== candidate && group.indexOf(c) >= 0) return true;
  }
  return false;
}

function rollTraits(rng: RNG, tpl: SurvivorTemplate): string[] {
  if (tpl.fixedTraits) return tpl.fixedTraits.slice();
  const chosen: string[] = tpl.forcedTraits ? tpl.forcedTraits.slice() : [];
  const want = chosen.length + (rng.chance(0.45) ? 3 : 2);
  const pool = TRAITS.map((t) => t.id);
  rng.shuffle(pool);
  for (const id of pool) {
    if (chosen.length >= want) break;
    if (chosen.indexOf(id) >= 0) continue;
    if (conflictsWith(chosen, id)) continue;
    chosen.push(id);
  }
  return chosen;
}

function rollSkills(rng: RNG, stats: Stats, traits: string[]): Record<SkillId, Skill> {
  const out = {} as Record<SkillId, Skill>;
  for (const id of SKILL_IDS) {
    let lvl = rng.chance(0.35) ? rng.int(1, 4) : 0;
    out[id] = { level: lvl, xp: 0 };
  }
  // Give everyone one thing they are visibly decent at.
  const focus = SKILL_IDS[rng.int(0, SKILL_IDS.length)];
  out[focus].level = Math.max(out[focus].level, rng.int(3, 6));

  for (const t of traits) {
    const def = TRAIT_MAP[t];
    if (!def?.skills) continue;
    for (const k of Object.keys(def.skills) as SkillId[]) {
      out[k].level = clamp(out[k].level + def.skills[k]!, 0, 20);
    }
  }
  return out;
}

function defaultPriorities(
  rng: RNG,
  skills: Record<SkillId, Skill>
): Record<WorkType, number> {
  const p = {} as Record<WorkType, number>;
  for (const wt of WORK_TYPES) p[wt] = 3;
  // Bias everyone slightly toward what they are good at, so a fresh camp is
  // not eight identical workers.
  p.hauling = 3;
  p.medicine = skills.medicine.level >= 3 ? 4 : 2;
  p.cooking = skills.cooking.level >= 3 ? 4 : 2;
  p.crafting = skills.crafting.level >= 3 ? 4 : 2;
  p.woodcutting = skills.woodcutting.level >= 3 ? 4 : 3;
  p.farming = skills.farming.level >= 3 ? 4 : 3;
  return p;
}

export interface CharacterInit {
  id: number;
  name: string;
  appearance: Character['appearance'];
  x: number;
  y: number;
}

export function createCharacter(
  init: CharacterInit,
  tpl: SurvivorTemplate,
  rng: RNG
): Character {
  const stats = rollStats(rng, tpl);
  const traits = rollTraits(rng, tpl);
  for (const t of traits) {
    const def = TRAIT_MAP[t];
    if (!def?.stats) continue;
    for (const k of Object.keys(def.stats) as StatId[]) {
      stats[k] = clamp(stats[k] + def.stats[k]!, 1, 10);
    }
  }
  if (tpl.statFloor) {
    for (const k of Object.keys(tpl.statFloor) as StatId[]) {
      stats[k] = Math.max(stats[k], tpl.statFloor[k]!);
    }
  }
  const skills = rollSkills(rng, stats, traits);

  const c: Character = {
    id: init.id,
    name: init.name,
    appearance: init.appearance,
    stats,
    skills,
    traits,

    hunger: rng.range(10, 40),
    energy: rng.range(55, 95),
    morale: rng.range(50, 72),
    stress: rng.range(5, 25),
    health: 100,
    maxHealth: 100,

    injuries: [],
    sickness: 0,

    alive: true,
    deathDay: 0,
    deathCause: '',
    deathAt: 0,

    x: init.x,
    y: init.y,
    dir: 0,
    animT: rng.range(0, 6),
    moving: false,

    path: [],
    pathIndex: 0,
    repathT: 0,
    stuckT: 0,

    state: 'idle',
    activity: 'idle',
    activityTarget: -1,
    activityT: 0,
    thinkT: rng.range(0, 0.6),
    jobId: -1,
    order: null,

    carrying: null,
    equipment: { tool: null },

    relationships: {},
    priorities: defaultPriorities(rng, skills),
    workEnabled: true,

    speech: null,
    expedition: null,

    lastMealAt: 0,
    lastSleepAt: 0,
    sleepComfort: 0,
    sleepBuildingId: -1,
    lastSocialAt: 0,
    workT: 0,
    bob: rng.range(0, 6.28),
    thought: '',
  };
  c.maxHealth = maxHealthFor(c);
  c.health = c.maxHealth;
  return c;
}
