import { TILE, type Animal, type AnimalKind, type Character, type World } from '../core/types';
import { ANIMALS, ANIMAL_MAP, CARCASS_TIME, type AnimalDef } from '../data/animals';
import { clamp } from '../core/util';
import { log, roll, rollInt, rollRange, tileBlocked, worldToTileX, worldToTileY } from './world';
import { injure } from './medical';
import { applyEffect } from './effects';
import type { Fx } from './fx';

/** Roughly how many animals the forest supports at once. */
const TARGET_POPULATION = 26;
/** Sim-seconds between repopulation attempts. */
const RESPAWN_INTERVAL = 45;

export function animalDef(a: Animal): AnimalDef {
  return ANIMAL_MAP[a.kind];
}

export function spawnAnimal(w: World, kind: AnimalKind, x: number, y: number): Animal {
  const def = ANIMAL_MAP[kind];
  const a: Animal = {
    id: w.nextAnimalId++,
    kind,
    x,
    y,
    hp: def.hp,
    maxHp: def.hp,
    dir: 0,
    animT: 0,
    state: 'graze',
    vx: 0,
    vy: 0,
    timer: rollRange(w, 1, 4),
    targetId: -1,
    marked: false,
    deadAt: 0,
    variant: rollInt(w, 0, 3),
  };
  w.animals.push(a);
  return a;
}

function pickKind(w: World): AnimalKind {
  let total = 0;
  for (const d of ANIMALS) total += d.weight;
  let r = roll(w) * total;
  for (const d of ANIMALS) {
    r -= d.weight;
    if (r <= 0) return d.kind;
  }
  return 'rabbit';
}

/** Seed the forest with wildlife, well away from the camp. */
export function populateWildlife(w: World, count = TARGET_POPULATION) {
  let guard = 0;
  while (w.animals.length < count && guard++ < 900) {
    const tx = rollInt(w, 2, w.width - 2);
    const ty = rollInt(w, 2, w.height - 2);
    if (tileBlocked(w, tx, ty)) continue;
    const d = Math.hypot(tx - w.campCenter.tx, ty - w.campCenter.ty);
    if (d < 16) continue;
    spawnAnimal(w, pickKind(w), tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }
}

function nearestPerson(w: World, a: Animal, within: number): Character | null {
  let best: Character | null = null;
  let bestD = within * within;
  for (const c of w.characters) {
    if (!c.alive || c.state === 'sleeping') continue;
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Push the animal along its heading, sliding off anything it cannot cross. */
function step(w: World, a: Animal, dt: number, speedTiles: number) {
  const len = Math.hypot(a.vx, a.vy);
  if (len < 0.001) return;
  const nx = a.vx / len;
  const ny = a.vy / len;
  const dist = speedTiles * TILE * dt;
  const tx = a.x + nx * dist;
  const ty = a.y + ny * dist;

  if (!tileBlocked(w, worldToTileX(tx), worldToTileY(a.y))) a.x = tx;
  else a.vx = -a.vx;
  if (!tileBlocked(w, worldToTileY(ty) >= 0 ? worldToTileX(a.x) : 0, worldToTileY(ty))) a.y = ty;
  else a.vy = -a.vy;

  a.x = clamp(a.x, TILE, (w.width - 1) * TILE);
  a.y = clamp(a.y, TILE, (w.height - 1) * TILE);
  a.animT += dt * speedTiles * 2.4;
  if (Math.abs(nx) > Math.abs(ny)) a.dir = nx > 0 ? 2 : 1;
  else a.dir = ny > 0 ? 0 : 3;
}

export function updateWildlife(w: World, dt: number, fx: Fx) {
  for (let i = w.animals.length - 1; i >= 0; i--) {
    const a = w.animals[i];
    const def = animalDef(a);

    if (a.state === 'dead') {
      if (w.time.t - a.deadAt > CARCASS_TIME) w.animals.splice(i, 1);
      continue;
    }

    a.timer -= dt;

    // An animal that has just bolted stays bolted for a while. Without this a
    // boar re-charges the moment it stops, and gores the same person to death.
    const spooked = a.state === 'flee' && a.timer > 0;
    const threat = spooked ? null : nearestPerson(w, a, def.alertRange * TILE);

    if (threat) {
      const dx = a.x - threat.x;
      const dy = a.y - threat.y;
      const dist = Math.hypot(dx, dy) || 1;
      // A cornered boar turns on whoever is closest — but a badly wounded one
      // breaks and runs like anything else would.
      const badlyHurt = a.hp < a.maxHp * 0.35;
      if (def.aggressive && !badlyHurt && dist < TILE * 2.5) {
        a.state = 'charge';
        a.targetId = threat.id;
        a.vx = -dx / dist;
        a.vy = -dy / dist;
        if (dist < TILE * 1.1) {
          // Contact. It hurts, and then the animal breaks off.
          if (roll(w) < dt * 0.22) {
            injure(w, threat, 'gash', rollRange(w, 0.15, 0.35), 'a charging boar', fx);
            // Everyone who saw it is rattled.
            for (const o of w.characters) {
              if (!o.alive || o.id === threat.id) continue;
              if (Math.hypot(o.x - a.x, o.y - a.y) < TILE * 8) {
                applyEffect(w, o, 'panicked', rollRange(w, 0.5, 2));
              }
            }
            a.state = 'flee';
            a.timer = 26; // long enough to actually leave
            a.targetId = -1;
            const away = Math.hypot(dx, dy) || 1;
            a.vx = dx / away;
            a.vy = dy / away;
          }
        }
      } else {
        a.state = 'flee';
        a.targetId = -1;
        a.vx = dx / dist;
        a.vy = dy / dist;
        a.timer = Math.max(a.timer, 1.5);
      }
    } else if (a.state === 'flee' || a.state === 'charge') {
      if (a.timer <= 0) {
        a.state = 'graze';
        a.timer = rollRange(w, 2, 6);
      }
    }

    if (a.state === 'graze' && a.timer <= 0) {
      // Amble somewhere new, or stand and graze a while.
      if (roll(w) < 0.55) {
        let ang = roll(w) * Math.PI * 2;
        // Now and then they drift toward the meadows near the settlement,
        // which keeps hunting a live option instead of a long expedition.
        // Only the harmless ones drift toward the settlement's meadows.
        if (!def.aggressive && roll(w) < 0.3) {
          const dx = w.campCenter.tx * TILE - a.x;
          const dy = w.campCenter.ty * TILE - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 22 * TILE) ang = Math.atan2(dy, dx) + rollRange(w, -0.6, 0.6);
        }
        a.vx = Math.cos(ang);
        a.vy = Math.sin(ang);
        a.state = 'wander';
        a.timer = rollRange(w, 1.5, 4);
      } else {
        a.vx = 0;
        a.vy = 0;
        a.timer = rollRange(w, 2, 5);
      }
    } else if (a.state === 'wander' && a.timer <= 0) {
      a.state = 'graze';
      a.timer = rollRange(w, 1, 4);
    }

    const speed =
      a.state === 'flee' || a.state === 'charge'
        ? def.fleeSpeed
        : a.state === 'wander'
          ? def.speed
          : 0;
    if (speed > 0) step(w, a, dt, speed);
  }
}

/**
 * Slowly restock the forest so hunting stays sustainable. Carcasses do not
 * count toward the population, so a good hunt is always replaced.
 */
export function repopulateWildlife(w: World) {
  const alive = w.animals.filter((a) => a.state !== 'dead').length;
  if (alive >= TARGET_POPULATION) return;
  // A couple at a time, so the forest refills over game days.
  const wanted = Math.min(2, TARGET_POPULATION - alive);
  let born = 0;
  let guard = 0;
  while (born < wanted && guard++ < 400) {
    const tx = rollInt(w, 2, w.width - 2);
    const ty = rollInt(w, 2, w.height - 2);
    if (tileBlocked(w, tx, ty)) continue;
    if (Math.hypot(tx - w.campCenter.tx, ty - w.campCenter.ty) < 14) continue;
    spawnAnimal(w, pickKind(w), tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    born++;
  }
}

export const WILDLIFE_RESPAWN_INTERVAL = RESPAWN_INTERVAL;

export function killAnimal(w: World, a: Animal, hunter: Character, fx: Fx) {
  a.state = 'dead';
  a.hp = 0;
  a.marked = false;
  a.deadAt = w.time.t;
  a.vx = 0;
  a.vy = 0;
  w.stats.animalsHunted++;
  applyEffect(w, hunter, 'emboldened', 8);
  fx.burst(a.x, a.y - 6, 8, '#a33f2a', 'spark', 26, 0.7, 2);
  log(
    w,
    'good',
    'A Good Hunt',
    `${hunter.name} brought down a ${animalDef(a).label.toLowerCase()}.`,
    [hunter.id]
  );
}

export function animalAt(w: World, x: number, y: number, radius = 18): Animal | null {
  let best: Animal | null = null;
  let bestD = radius * radius;
  for (const a of w.animals) {
    if (a.state === 'dead') continue;
    const dx = a.x - x;
    const dy = a.y - y - 6;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function findAnimal(w: World, id: number): Animal | null {
  return w.animals.find((a) => a.id === id && a.state !== 'dead') ?? null;
}
