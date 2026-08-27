/**
 * Temporary status effects.
 *
 * Every field here is read by the simulation — an effect is never a label.
 * Conditional effects are re-derived each needs tick from the survivor's
 * state; timed effects are applied by events and expire on the world clock.
 */
export interface StatusEffectDef {
  id: string;
  label: string;
  desc: string;
  tone: 'good' | 'bad';
  /** Multiplier on how much work they get done. */
  workSpeed?: number;
  /** Multiplier on walking speed. */
  moveSpeed?: number;
  /** Multiplier on how fast energy drains. */
  fatigue?: number;
  /** Multiplier on how fast hunger builds. */
  hungerRate?: number;
  /** Flat morale change per game hour. */
  moralePerHour?: number;
  /** Flat health change per game hour. */
  healthPerHour?: number;
  /** Multiplier on skill experience gained. */
  learnRate?: number;
  /** Multiplier on the chance of hurting themselves at work. */
  accident?: number;
  /** Multiplier on injury severity taken. */
  vulnerability?: number;
  /**
   * Derived from the survivor's condition every tick rather than applied by an
   * event. These cannot be cured directly — you fix the cause.
   */
  conditional?: boolean;
  /** Effects that cannot both be active; the later one wins. */
  conflicts?: string[];
  /** Shown as a small marker above the character in the world. */
  marker?: string;
}

export const EFFECTS: StatusEffectDef[] = [
  /* ---------------- hunger ---------------- */
  {
    id: 'starving',
    label: 'Starving',
    desc: 'Barely able to stand. Work crawls and their body is eating itself.',
    tone: 'bad',
    conditional: true,
    workSpeed: 0.5,
    moveSpeed: 0.78,
    healthPerHour: -3.2,
    moralePerHour: -3,
    accident: 1.8,
    conflicts: ['hungry', 'wellFed'],
    marker: '🍽',
  },
  {
    id: 'hungry',
    label: 'Hungry',
    desc: 'Distracted by an empty stomach. Slower, and quicker to complain.',
    tone: 'bad',
    conditional: true,
    workSpeed: 0.86,
    moralePerHour: -0.8,
    conflicts: ['starving', 'wellFed'],
  },
  {
    id: 'wellFed',
    label: 'Well Fed',
    desc: 'A full stomach. Steady hands and a better mood.',
    tone: 'good',
    conditional: true,
    workSpeed: 1.07,
    moralePerHour: 0.7,
    conflicts: ['hungry', 'starving'],
  },

  /* ---------------- rest ---------------- */
  {
    id: 'exhausted',
    label: 'Exhausted',
    desc: 'Running on nothing. Half speed, and dangerously clumsy with tools.',
    tone: 'bad',
    conditional: true,
    workSpeed: 0.48,
    moveSpeed: 0.72,
    accident: 2.4,
    moralePerHour: -1.6,
    conflicts: ['tired', 'wellRested'],
    marker: '💤',
  },
  {
    id: 'tired',
    label: 'Tired',
    desc: 'Flagging. Work is slower and mistakes creep in.',
    tone: 'bad',
    conditional: true,
    workSpeed: 0.86,
    accident: 1.35,
    conflicts: ['exhausted', 'wellRested'],
  },
  {
    id: 'wellRested',
    label: 'Well Rested',
    desc: 'Slept properly. Sharper, faster, and learns quicker.',
    tone: 'good',
    conditional: true,
    workSpeed: 1.09,
    learnRate: 1.2,
    moralePerHour: 0.6,
    conflicts: ['tired', 'exhausted'],
  },
  {
    id: 'sleepDeprived',
    label: 'Sleep Deprived',
    desc: 'Has not slept properly in over a day. Slow, careless, and miserable.',
    tone: 'bad',
    workSpeed: 0.68,
    moveSpeed: 0.9,
    accident: 2,
    learnRate: 0.65,
    moralePerHour: -1.8,
    healthPerHour: -0.4,
    marker: '💤',
  },

  /* ---------------- illness and injury ---------------- */
  {
    id: 'fever',
    label: 'Fever',
    desc: 'Burning up. Weak, unsteady, and slowly getting worse without care.',
    tone: 'bad',
    workSpeed: 0.55,
    moveSpeed: 0.82,
    healthPerHour: -1.8,
    fatigue: 1.35,
    moralePerHour: -1.2,
    vulnerability: 1.3,
    marker: '🤒',
  },
  {
    id: 'infected',
    label: 'Infected Wound',
    desc: 'An untreated wound has turned. It will not heal on its own.',
    tone: 'bad',
    healthPerHour: -2.2,
    workSpeed: 0.75,
    moralePerHour: -1,
    marker: '🤒',
  },
  {
    id: 'inPain',
    label: 'In Pain',
    desc: 'Hurt badly enough that everything is harder.',
    tone: 'bad',
    conditional: true,
    workSpeed: 0.7,
    moveSpeed: 0.8,
    moralePerHour: -1,
  },
  {
    id: 'recovering',
    label: 'Recovering',
    desc: 'Patched up and on the mend. Taking it easy for a while.',
    tone: 'good',
    workSpeed: 0.9,
    healthPerHour: 1.6,
  },

  {
    id: 'critical',
    label: 'Critical',
    desc: 'Collapsed and barely conscious. Without treatment they may not last.',
    tone: 'bad',
    workSpeed: 0,
    moveSpeed: 0,
    moralePerHour: -3,
    healthPerHour: -0.15,
    // Barely conscious: they are not burning through rations lying there.
    hungerRate: 0.3,
    fatigue: 0.4,
    marker: '⚕',
  },

  /* ---------------- weather and comfort ---------------- */
  {
    id: 'soaked',
    label: 'Soaked',
    desc: 'Wet through and cold. Tiring work, and a fever waiting to happen.',
    tone: 'bad',
    workSpeed: 0.88,
    fatigue: 1.25,
    moralePerHour: -1.2,
    vulnerability: 1.15,
  },
  {
    id: 'overworked',
    label: 'Overworked',
    desc: 'Has not stopped in far too long. Everything is an effort.',
    tone: 'bad',
    workSpeed: 0.8,
    fatigue: 1.2,
    moralePerHour: -1.4,
    accident: 1.4,
  },

  /* ---------------- mood ---------------- */
  {
    id: 'grieving',
    label: 'Grieving',
    desc: 'Lost someone. Going through the motions.',
    tone: 'bad',
    workSpeed: 0.82,
    moralePerHour: -1.5,
    learnRate: 0.8,
  },
  {
    id: 'inspired',
    label: 'Inspired',
    desc: 'Something went right. Working with real purpose.',
    tone: 'good',
    workSpeed: 1.18,
    moralePerHour: 1.6,
    learnRate: 1.25,
  },
  {
    id: 'content',
    label: 'Content',
    desc: 'Fed, rested and among friends. As good as it gets out here.',
    tone: 'good',
    conditional: true,
    workSpeed: 1.05,
    moralePerHour: 0.5,
  },
];

export const EFFECT_MAP: Record<string, StatusEffectDef> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e])
);
