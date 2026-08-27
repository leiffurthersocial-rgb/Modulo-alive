import type { Character, Injury, World } from '../core/types';
import { clamp } from '../core/util';
import { log, roll, rollPick, rollRange } from './world';
import { toughness } from './modifiers';
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
  const damage = 8 + sev * 42;
  c.health -= damage;
  c.stress += 12 * sev;
  c.morale -= 8 * sev;
  fx.burst(c.x, c.y - 10, 6, '#c0392b', 'spark', 30, 0.6, 2);
  fx.float(c.x, c.y - 28, `-${Math.round(damage)}`, '#ff7a6a');
  say(w, c, 'hurt', true);
  log(
    w,
    'bad',
    'Injury',
    `${c.name} suffered a ${kind.label.toLowerCase()} to the ${inj.bodyPart} — ${cause}.`,
    [c.id]
  );
  if (c.health <= 0) kill(w, c, cause, fx);
  return inj;
}

export function makeSick(w: World, c: Character, severity: number, cause: string) {
  if (!c.alive) return;
  c.sickness = clamp(c.sickness + severity, 0, 1);
  c.morale -= 6;
  log(w, 'bad', 'Illness', `${c.name} has fallen ill — ${cause}.`, [c.id]);
}

export function kill(w: World, c: Character, cause: string, fx: Fx) {
  if (!c.alive) return;
  c.alive = false;
  c.state = 'dead';
  c.health = 0;
  c.path = [];
  c.jobId = -1;
  c.carrying = null;
  c.expedition = null;
  c.deathCause = cause;
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

/** Called on the slow event tick — starvation, exhaustion, untreated wounds. */
export function checkMortality(w: World, fx: Fx) {
  for (const c of w.characters) {
    if (!c.alive) continue;
    if (c.health <= 0) {
      let cause = 'untreated injuries';
      if (c.hunger >= 100) cause = 'starvation';
      else if (c.sickness > 0.6) cause = 'illness';
      else if (c.energy <= 0) cause = 'exhaustion';
      kill(w, c, cause, fx);
      continue;
    }
    if (c.health < c.maxHealth * 0.2 && c.state !== 'sleeping' && c.state !== 'downed') {
      c.state = 'downed';
      c.path = [];
    } else if (c.state === 'downed' && c.health > c.maxHealth * 0.3) {
      c.state = 'idle';
    }
    // Chronic hunger and filth occasionally turn into illness.
    if (c.sickness <= 0 && c.hunger > 85 && roll(w) < 0.004) {
      makeSick(w, c, rollRange(w, 0.2, 0.45), 'weakened by hunger');
    }
  }
}

export function injurySummary(c: Character): string {
  if (!c.injuries.length) return c.sickness > 0.05 ? 'Ill' : 'Healthy';
  const worst = c.injuries.reduce((a, b) => (a.severity > b.severity ? a : b));
  return `${worst.label} (${worst.bodyPart})${worst.treated ? ' — treated' : ''}`;
}
