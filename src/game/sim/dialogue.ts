import type { Character, World } from '../core/types';
import { pickLine } from '../data/dialogue';
import { roll } from './world';
import { hasEffect } from './effects';

const SPEECH_DURATION = 3.4;

/** Show a contextual speech bubble, unless the character is already talking. */
export function say(w: World, c: Character, bucket: string, force = false) {
  if (!c.alive) return;
  if (!force && c.speech && c.speech.until > w.time.t) return;
  const line = pickLine(bucket, roll(w));
  if (!line) return;
  c.speech = { text: line.text, until: w.time.t + SPEECH_DURATION, mood: line.mood };
}

export function sayText(
  w: World,
  c: Character,
  text: string,
  mood: Character['speech'] extends { mood: infer M } ? M : never
) {
  c.speech = { text, until: w.time.t + SPEECH_DURATION, mood };
}

/** Occasional ambient chatter driven by the character's current condition. */
export function ambientChatter(w: World, c: Character) {
  if (c.speech && c.speech.until > w.time.t) return;
  const r = roll(w);
  if (c.hunger > 92) return say(w, c, 'starving');
  if (c.hunger > 72 && r < 0.5) return say(w, c, 'hungry');
  if (c.energy < 22 && r < 0.5) return say(w, c, 'tired');
  if (hasEffect(c, 'sleepDeprived') && r < 0.5) return say(w, c, 'stressed');
  if (c.injuries.length && r < 0.3) return say(w, c, 'hurt');
  if (hasEffect(c, 'fever') && r < 0.5) return say(w, c, 'sick');
  if (c.morale < 25 && r < 0.4) return say(w, c, 'miserable');
  if (c.morale > 78 && r < 0.25) return say(w, c, 'happy');
}
