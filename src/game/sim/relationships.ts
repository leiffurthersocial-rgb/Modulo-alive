import { TILE, type Character, type World } from '../core/types';
import { clamp } from '../core/util';
import { socialFactor } from './modifiers';
import { log, recentlyLogged, roll, rollPick } from './world';
import { applyEffect, hasEffect } from './effects';
import { say } from './dialogue';
import type { Fx } from './fx';

export function relationship(a: Character, b: Character): number {
  return a.relationships[b.id] ?? 35;
}

export function adjustRelationship(
  w: World,
  a: Character,
  b: Character,
  amount: number,
  _reason: string
) {
  const scaled = amount * (amount > 0 ? socialFactor(a) : 1);
  a.relationships[b.id] = clamp(relationship(a, b) + scaled, 0, 100);
  const back = amount * (amount > 0 ? socialFactor(b) : 1) * 0.85;
  b.relationships[a.id] = clamp(relationship(b, a) + back, 0, 100);
}

export function relationshipLabel(v: number): string {
  if (v >= 85) return 'Inseparable';
  if (v >= 70) return 'Close friends';
  if (v >= 55) return 'Friends';
  if (v >= 40) return 'Friendly';
  if (v >= 25) return 'Acquaintances';
  if (v >= 12) return 'Cold';
  return 'Hostile';
}

const POSITIVE_TOPICS = [
  'traded stories by the fire',
  'shared a meal in the quiet',
  'worked a long shift side by side',
  'sat up talking long after the others turned in',
  'split the last of the berries between them',
];

const NEGATIVE_TOPICS = [
  'snapped at',
  'argued about the rations with',
  'blamed the missing supplies on',
  'refused to help',
];

/**
 * Social tick: characters standing near each other build (or damage)
 * relationships. Called on a slow interval.
 */
export function socialTick(w: World, fx: Fx) {
  const living = w.characters.filter((c) => c.alive);
  for (let i = 0; i < living.length; i++) {
    const a = living[i];
    if (a.state === 'sleeping' || a.state === 'exploring') continue;
    for (let k = i + 1; k < living.length; k++) {
      const b = living[k];
      if (b.state === 'sleeping' || b.state === 'exploring') continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy > (TILE * 2.6) ** 2) continue;

      if (roll(w) > 0.3) continue; // most passing encounters are just that
      const rel = relationship(a, b);
      // Friction comes from real hardship: hunger, low spirits, and being
      // worn down enough to snap at someone.
      const worn = (x: Character) =>
        (hasEffect(x, 'sleepDeprived') ? 0.3 : 0) + (hasEffect(x, 'overworked') ? 0.2 : 0);
      const tension =
        worn(a) +
        worn(b) +
        (a.hunger > 78 || b.hunger > 78 ? 0.3 : 0) +
        (a.morale < 30 || b.morale < 30 ? 0.25 : 0);
      const argue = roll(w) < tension * 0.16 && rel < 70;

      if (argue) {
        adjustRelationship(w, a, b, -rollPickNum(w, 2, 6), 'argued');
        a.morale -= 4;
        b.morale -= 5;
        say(w, a, 'stressed', true);
        if (roll(w) < 0.2 && !recentlyLogged(w, 'The Argument', 720)) {
          log(
            w,
            'story',
            'The Argument',
            `${a.name} ${rollPick(w, NEGATIVE_TOPICS)} ${b.name}. Their relationship suffered.`,
            [a.id, b.id]
          );
        }
      } else if (roll(w) < 0.5) {
        const gain = rollPickNum(w, 0.12, 0.5) * ((socialFactor(a) + socialFactor(b)) / 2);
        adjustRelationship(w, a, b, gain, 'talked');
        a.morale += 0.7 * socialFactor(a);
        b.morale += 0.7 * socialFactor(b);
        a.lastSocialAt = w.time.t;
        b.lastSocialAt = w.time.t;
        if (roll(w) < 0.25) say(w, a, 'social');
        if (rel > 65 && roll(w) < 0.12) fx.hearts((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (rel > 74 && roll(w) < 0.004 && !recentlyLogged(w, 'Good Company', 600)) {
          log(
            w,
            'story',
            'Good Company',
            `${a.name} and ${b.name} ${rollPick(w, POSITIVE_TOPICS)}.`,
            [a.id, b.id]
          );
        }
      }
    }
  }
}

function rollPickNum(w: World, a: number, b: number) {
  return a + roll(w) * (b - a);
}

/** Everyone reacts to a death, weighted by how close they were. */
export function grieve(w: World, dead: Character) {
  for (const c of w.characters) {
    if (!c.alive || c.id === dead.id) continue;
    const rel = relationship(c, dead);
    const hit = 6 + (rel / 100) * 26;
    c.morale -= hit;
    // Close friends carry it for days.
    applyEffect(w, c, 'grieving', rel > 55 ? 36 : 14, clamp(rel / 100 + 0.3, 0.3, 1));
    if (rel > 55) say(w, c, 'grief', true);
  }
}

export function bestFriend(w: World, c: Character): Character | null {
  let best: Character | null = null;
  let bestV = 50;
  for (const o of w.characters) {
    if (!o.alive || o.id === c.id) continue;
    const v = relationship(c, o);
    if (v > bestV) {
      bestV = v;
      best = o;
    }
  }
  return best;
}
