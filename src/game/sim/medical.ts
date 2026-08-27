import type { Character, Injury, World } from '../core/types';
import { clamp } from '../core/util';
import { addResource, log, roll, rollPick, rollRange } from './world';
import { toughness } from './modifiers';
import { GEAR_SLOTS, gearStockKey } from '../data/gear';
import { applyEffect, hasEffect, removeEffect } from './effects';
import { grieve } from './relationships';
import { say } from './dialogue';
import type { Fx } from './fx';

interface InjuryKind {
  kind: string;
  label: string;
  bleeding: number;
  /** Base healing time in sim-seconds at severity 1. */
  heal: number;
  parts: string[];
}

const INJURY_KINDS: InjuryKind[] = [
  { kind: 'cut', label: 'Deep Cut', bleeding: 0.5, heal: 260, parts: ['arm', 'leg', 'hand'] },
  { kind: 'bruise', label: 'Bad Bruise', bleeding: 0, heal: 150, parts: ['ribs', 'shoulder', 'back'] },
  { kind: 'sprain', label: 'Sprain', bleeding: 0, heal: 210, parts: ['ankle', 'wrist'] },
  { kind: 'break', label: 'Fracture', bleeding: 0.15, heal: 520, parts: ['arm', 'leg', 'rib'] },
  { kind: 'burn', label: 'Burn', bleeding: 0.1, heal: 300, parts: ['hand', 'arm', 'face'] },
  { kind: 'bite', label: 'Animal Bite', bleeding: 0.7, heal: 340, parts: ['leg', 'arm'] },
  { kind: 'gash', label: 'Gash', bleeding: 0.9, heal: 400, parts: ['side', 'thigh', 'scalp'] },
];

export function injure(
  w: World,
  c: Character,
  kindId: string | null,
  severity: number,
  cause: string,
  fx: Fx
): Injury | null {
  if (!c.alive) return null;
  const kind =
    (kindId ? INJURY_KINDS.find((k) => k.kind === kindId) : null) ?? rollPick(w, INJURY_KINDS);
  const sev = clamp(severity * toughness(c), 0.08, 1);
  const inj: Injury = {
    id: w.nextInjuryId++,
    kind: kind.kind,
    label: kind.label,
    severity: sev,
    remaining: kind.heal * sev,
    treated: false,
    bleeding: kind.bleeding * sev,
    bodyPart: rollPick(w, kind.parts),
  };
  c.injuries.push(inj);
  // Already down? Further harm is blunted — the point of collapsing is that
  // it buys time for someone to reach them.
  const damage = (6 + sev * 30) * (c.criticalSince >= 0 ? 0.35 : 1);
  c.health -= damage;
  c.morale -= 8 * sev;
  // A serious wound left alone can turn.
  if (sev > 0.45) applyEffect(w, c, 'inPain', -1, sev);
  fx.burst(c.x, c.y - 10, 6, '#c0392b', 'spark', 30, 0.6, 2);
  fx.float(c.x, c.y - 28, `-${Math.round(damage)}`, '#ff7a6a');
  say(w, c, 'hurt', true);
  // Getting hurt badly frightens most people and infuriates a few.
  if (sev > 0.35) {
    if (c.morale < 40 && roll(w) < 0.35) applyEffect(w, c, 'enraged', rollRange(w, 3, 8));
    else if (roll(w) < 0.5) applyEffect(w, c, 'panicked', rollRange(w, 1, 3));
    else applyEffect(w, c, 'paranoid', rollRange(w, 6, 14));
  }
  log(
    w,
    'bad',
    'Injury',
    `${c.name} suffered a ${kind.label.toLowerCase()} to the ${inj.bodyPart} — ${cause}.`,
    [c.id]
  );
  // Running out of health does not kill outright — checkMortality turns it
  // into a collapse, which somebody still has a chance to treat.
  if (c.health <= 0) collapse(w, c, fx);
  return inj;
}

/** Illness is a fever that runs its course — or does not, without medicine. */
export function makeSick(w: World, c: Character, severity: number, cause: string) {
  if (!c.alive) return;
  applyEffect(w, c, 'fever', 18 + severity * 30, clamp(severity, 0.2, 1));
  c.morale -= 6;
  log(w, 'bad', 'Illness', `${c.name} has come down with a fever — ${cause}.`, [c.id]);
}

export function kill(w: World, c: Character, cause: string, fx: Fx) {
  if (!c.alive) return;
  c.alive = false;
  c.state = 'dead';
  c.health = 0;
  c.path = [];
  c.jobId = -1;
  if (c.carrying) {
    addResource(w, c.carrying.res, c.carrying.amount);
    c.carrying = null;
  }
  for (const slot of GEAR_SLOTS) {
    const id = c.equipment[slot];
    if (!id) continue;
    const stockKey = gearStockKey(id);
    if (stockKey) addResource(w, stockKey, 1);
    else w.gear[id] = (w.gear[id] ?? 0) + 1;
    c.equipment[slot] = null;
  }
  c.expedition = null;
  c.deathCause = cause;
  c.criticalSince = -1;
  c.deathDay = Math.floor(w.time.minutes / 1440) + 1;
  c.deathAt = w.time.t;
  w.stats.deaths++;
  fx.burst(c.x, c.y - 10, 14, '#6f6f7a', 'dust', 24, 1.6, 3);
  fx.shake = Math.max(fx.shake, 0.9);
  log(
    w,
    'death',
    `${c.name} has died`,
    `${c.name} died on day ${c.deathDay}. Cause: ${cause}. The camp will not be the same.`,
    [c.id]
  );
  grieve(w, c);
}

/** Drop a survivor into the critical state. Survivable, if someone hurries. */
export function collapse(w: World, c: Character, fx: Fx) {
  if (!c.alive || c.criticalSince >= 0) return;
  c.criticalSince = w.time.t;
  c.health = 1;
  c.state = 'downed';
  c.path = [];
  c.jobId = -1;
  applyEffect(w, c, 'critical', -1, 1);
  fx.burst(c.x, c.y - 8, 10, '#c0392b', 'spark', 22, 0.9, 2);
  fx.shake = Math.max(fx.shake, 0.5);
  log(
    w,
    'alert',
    `${c.name} has collapsed`,
    `${c.name} is critical and cannot move. Somebody needs to treat them, now.`,
    [c.id]
  );
  for (const o of w.characters) if (o.alive && o.id !== c.id) o.morale -= 5;
}

/**
 * Called on the slow event tick.
 *
 * Dying outright is deliberately rare: a survivor who runs out of health
 * collapses into a critical state instead, and only dies if nobody reaches
 * them in time. The odds are never zero, though.
 */
export function checkMortality(w: World, fx: Fx) {
  const hours = EVENT_INTERVAL_HOURS;
  for (const c of w.characters) {
    if (!c.alive) continue;

    if (c.health <= 0) {
      if (c.criticalSince < 0) collapse(w, c, fx);
      else c.health = Math.max(0.1, c.health);
    }

    if (c.criticalSince >= 0) {
      const treated = c.injuries.every((i) => i.treated) && !hasEffect(c, 'infected');
      const hoursDown = (w.time.t - c.criticalSince) / 30;
      if (treated && c.health > c.maxHealth * 0.25) {
        // Pulled through.
        c.criticalSince = -1;
        removeEffect(c, 'critical');
        c.state = 'idle';
        applyEffect(w, c, 'recovering', 14);
        log(w, 'good', 'Pulled Through', `${c.name} is out of danger.`, [c.id]);
      } else {
        // The longer they lie there untended, the worse the odds get.
        // Untreated, the odds worsen the longer they lie there — but even a
        // full day untended is usually survivable. Treated, death is rare.
        const perHour = treated ? 0.001 : 0.004 + Math.min(0.01, hoursDown * 0.001);
        if (roll(w) < perHour * hours) {
          kill(w, c, causeOfDeath(c), fx);
          continue;
        }
      }
    }

    if (c.state === 'downed' && c.criticalSince < 0 && c.health > c.maxHealth * 0.3) {
      c.state = 'idle';
    } else if (
      c.criticalSince < 0 &&
      c.health < c.maxHealth * 0.18 &&
      c.state !== 'sleeping' &&
      c.state !== 'downed'
    ) {
      c.state = 'downed';
      c.path = [];
    }

    // Chronic hunger, soaking rain and untreated wounds all invite worse.
    if (!hasEffect(c, 'fever') && c.hunger > 85 && roll(w) < 0.004) {
      makeSick(w, c, rollRange(w, 0.2, 0.45), 'weakened by hunger');
    }
    if (!hasEffect(c, 'fever') && hasEffect(c, 'soaked') && roll(w) < 0.003) {
      makeSick(w, c, rollRange(w, 0.15, 0.35), 'chilled to the bone');
    }
    const bad = c.injuries.find((i) => !i.treated && i.severity > 0.4);
    if (bad && !hasEffect(c, 'infected') && roll(w) < 0.006) {
      applyEffect(w, c, 'infected', -1, bad.severity);
      log(w, 'bad', 'Infection', `${c.name}'s ${bad.label.toLowerCase()} has turned septic.`, [
        c.id,
      ]);
    }
  }
}

/** One game hour passes between mortality checks. */
const EVENT_INTERVAL_HOURS = 1;

function causeOfDeath(c: Character): string {
  if (c.hunger >= 100) return 'starvation';
  if (hasEffect(c, 'fever')) return 'fever';
  if (hasEffect(c, 'infected')) return 'an infected wound';
  if (c.injuries.length) return 'their injuries';
  return 'exhaustion';
}

export function injurySummary(c: Character): string {
  if (!c.injuries.length) return hasEffect(c, 'fever') ? 'Feverish' : 'Healthy';
  const worst = c.injuries.reduce((a, b) => (a.severity > b.severity ? a : b));
  return `${worst.label} (${worst.bodyPart})${worst.treated ? ' — treated' : ''}`;
}
