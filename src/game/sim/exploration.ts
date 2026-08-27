import {
  RESOURCE_LABEL,
  type Character,
  type ExplorationSite,
  type ResourceType,
  type World,
} from '../core/types';
import { clamp } from '../core/util';
import { addResource, log, roll, rollPick, rollRange, tileToWorldX, tileToWorldY } from './world';
import { addXp, courageFactor, fortune, skillLevel } from './modifiers';
import { injure } from './medical';
import { say } from './dialogue';
import type { Fx } from './fx';
import { SIM_SECONDS_PER_HOUR } from './tasks';

export interface SiteProfile {
  label: string;
  loot: Partial<Record<ResourceType, [number, number]>>;
  searchHours: number;
  desc: string;
}

export const SITE_PROFILES: Record<ExplorationSite['kind'], SiteProfile> = {
  berryGrove: {
    label: 'Berry Grove',
    loot: { rawFood: [14, 34], herbs: [0, 5], seeds: [1, 5] },
    searchHours: 1.6,
    desc: 'Thick brambles heavy with fruit.',
  },
  oldCamp: {
    label: 'Abandoned Camp',
    loot: { wood: [8, 22], fiber: [4, 14], food: [0, 8], tools: [0, 1] },
    searchHours: 2,
    desc: 'A cold firepit and things left behind in a hurry.',
  },
  cabin: {
    label: 'Cabin',
    loot: { wood: [20, 46], tools: [0, 2], medicine: [0, 3], fiber: [4, 12] },
    searchHours: 2.6,
    desc: 'Half its roof is gone, but the timber is good.',
  },
  cave: {
    label: 'Cave',
    loot: { stone: [18, 44], herbs: [0, 6] },
    searchHours: 2.4,
    desc: 'Cold air and the sound of dripping water.',
  },
  huntingGround: {
    label: 'Hunting Ground',
    loot: { rawFood: [14, 44], fiber: [3, 10] },
    searchHours: 2.8,
    desc: 'Tracks everywhere. Something big passes through here.',
  },
  wreck: {
    label: 'Wreck',
    loot: { tools: [1, 3], stone: [0, 8], fiber: [2, 10] },
    searchHours: 2.2,
    desc: 'Rusted through, but the fittings are still worth taking.',
  },
  ruin: {
    label: 'Ruin',
    loot: { stone: [22, 50], tools: [0, 1] },
    searchHours: 2.5,
    desc: 'Old walls, older than the road that must have served them.',
  },
  supplies: {
    label: 'Supply Cache',
    loot: { food: [8, 22], medicine: [1, 4], tools: [0, 2], seeds: [2, 8] },
    searchHours: 1.4,
    desc: 'Someone meant to come back for this.',
  },
  unknown: {
    label: 'Unknown Place',
    loot: { wood: [4, 16], stone: [4, 16], herbs: [0, 6], medicine: [0, 2] },
    searchHours: 3,
    desc: 'Nobody has been out this far yet.',
  },
};

export function canExplore(c: Character): boolean {
  return (
    c.alive &&
    !c.expedition &&
    c.state !== 'downed' &&
    c.energy > 30 &&
    c.hunger < 80 &&
    c.health > c.maxHealth * 0.5
  );
}

export function startExpedition(w: World, c: Character, site: ExplorationSite) {
  const profile = SITE_PROFILES[site.kind];
  c.expedition = {
    siteId: site.id,
    phase: 'travel',
    timer: 0,
    risk: site.danger,
    loot: {},
  };
  c.state = 'exploring';
  c.activity = 'explore';
  c.jobId = -1;
  say(w, c, 'exploreOut', true);
  log(
    w,
    'info',
    'Expedition',
    `${c.name} set out for ${site.name}. ${profile.desc}`,
    [c.id]
  );
}

export function siteById(w: World, id: number): ExplorationSite | null {
  return w.sites.find((s) => s.id === id) ?? null;
}

/** Called once the explorer has reached the site. */
export function beginSearch(w: World, c: Character, site: ExplorationSite) {
  if (!c.expedition) return;
  const profile = SITE_PROFILES[site.kind];
  const skill = skillLevel(c, 'exploration');
  const hours = profile.searchHours * clamp(1 - skill * 0.045, 0.5, 1.2);
  c.expedition.phase = 'search';
  c.expedition.timer = hours * SIM_SECONDS_PER_HOUR;
  site.discovered = true;
}

/** Roll the outcome of a completed search. */
export function resolveSearch(w: World, c: Character, site: ExplorationSite, fx: Fx) {
  if (!c.expedition) return;
  const profile = SITE_PROFILES[site.kind];
  const luck = fortune(c);
  const perception = c.stats.perception;
  const skill = skillLevel(c, 'exploration');
  const findMult =
    (0.55 + perception * 0.08 + skill * 0.05) * luck * (site.depleted ? 0.35 : 1);

  const loot: Partial<Record<ResourceType, number>> = {};
  for (const key of Object.keys(profile.loot) as ResourceType[]) {
    const range = profile.loot[key];
    if (!range) continue;
    const base = rollRange(w, range[0], range[1]);
    const amount = Math.round(base * findMult);
    if (amount > 0) loot[key] = amount;
  }
  c.expedition.loot = loot;
  w.stats.explorations++;
  site.explored++;
  if (site.explored >= 3) site.depleted = true;

  addXp(c, 'exploration', 18);
  addXp(c, 'scavenging', 9);

  // Danger roll — bravery, endurance and luck all matter here.
  const exposure =
    site.danger *
    courageFactor(c) *
    (1 - (c.stats.endurance - 5) * 0.03) *
    (1 - Math.min(0.45, skillLevel(c, 'combat') * 0.05)) *
    (1 / luck);
  const r = roll(w);
  if (r < exposure * 0.55) {
    const severity = clamp(rollRange(w, 0.15, 0.35) + site.danger * 0.6, 0.12, 0.95);
    const cause = rollPick(w, [
      'a fall on loose rock',
      'a startled animal',
      'a collapsing beam',
      'a hidden snare',
      'a bad step in the dark',
    ]);
    injure(w, c, null, severity, cause, fx);
    addXp(c, 'combat', 14);
  } else if (r < exposure * 0.8) {
    addXp(c, 'combat', 6);
    c.morale -= 8;
    c.energy -= 12;
    log(
      w,
      'bad',
      'A Close Call',
      `${c.name} got turned around near ${site.name} and lost hours finding the way back.`,
      [c.id]
    );
  } else if (roll(w) < 0.16 * luck) {
    // Discover a further site.
    const undiscovered = w.sites.filter((s) => !s.discovered);
    if (undiscovered.length) {
      const found = rollPick(w, undiscovered);
      found.discovered = true;
      log(
        w,
        'discovery',
        'New Ground',
        `${c.name} spotted ${found.name} from a rise beyond ${site.name}.`,
        [c.id]
      );
      c.morale += 6;
    }
  }

  c.expedition.phase = 'return';
  c.energy -= 8;
}

/** Called when the explorer walks back into camp. */
export function completeExpedition(w: World, c: Character, fx: Fx) {
  if (!c.expedition) return;
  const site = siteById(w, c.expedition.siteId);
  const loot = c.expedition.loot;
  const parts: string[] = [];
  let any = 0;
  for (const key of Object.keys(loot) as ResourceType[]) {
    const amount = loot[key] ?? 0;
    if (amount <= 0) continue;
    const stored = addResource(w, key, amount);
    if (stored > 0) parts.push(`${stored} ${RESOURCE_LABEL[key].toLowerCase()}`);
    any += stored;
  }
  c.expedition = null;
  c.state = 'idle';
  c.activity = 'idle';
  say(w, c, 'exploreBack', true);
  if (any > 0) {
    fx.sparkle(c.x, c.y - 14, '#ffe9a8');
    c.morale += 7;
    log(
      w,
      'discovery',
      'Returned from the forest',
      `${c.name} came back from ${site?.name ?? 'the forest'} with ${parts.join(', ')}.`,
      [c.id]
    );
  } else {
    c.morale -= 3;
    log(
      w,
      'info',
      'Returned empty-handed',
      `${c.name} searched ${site?.name ?? 'the forest'} and found nothing worth carrying.`,
      [c.id]
    );
  }
}

export function siteWorldPos(site: ExplorationSite) {
  return { x: tileToWorldX(site.tx), y: tileToWorldY(site.ty) };
}
