import type { SkillId, StatId, WorkType } from '../core/types';

/**
 * Traits are real gameplay modifiers, not labels. Every field here is read by
 * the simulation (see modifiers.ts) — nothing is decorative.
 */
export interface TraitDef {
  id: string;
  label: string;
  desc: string;
  /** Positive / negative / neutral, used for UI colouring only. */
  tone: 'good' | 'bad' | 'mixed';
  /** Multiplier on general work speed. */
  workSpeed?: number;
  /** Multiplier on fatigue (energy drain) rate. */
  fatigue?: number;
  /** Multiplier on how hard they take bad conditions (morale drain). */
  hardship?: number;
  /** Flat morale added per morale tick. */
  moraleDrift?: number;
  /** Multiplier on skill XP gain. */
  learnRate?: number;
  /** Per-work-type speed multipliers. */
  workBonus?: Partial<Record<WorkType, number>>;
  /** Flat stat offsets applied at character creation. */
  stats?: Partial<Record<StatId, number>>;
  /** Flat skill level offsets applied at character creation. */
  skills?: Partial<Record<SkillId, number>>;
  /** Multiplier on damage taken from events / hazards. */
  toughness?: number;
  /** Multiplier on morale gained from social interaction. */
  social?: number;
  /** Multiplier on how much danger scares them during exploration. */
  courage?: number;
  /** Preferred waking hours shift, in game hours. */
  scheduleShift?: number;
  /** Multiplier on food eaten per meal. */
  appetite?: number;
  /** Multiplier on luck-driven roll outcomes. */
  fortune?: number;
}

export const TRAITS: TraitDef[] = [
  {
    id: 'hardWorker',
    label: 'Hard Worker',
    desc: '+12% work speed, but tires 10% faster.',
    tone: 'mixed',
    workSpeed: 1.12,
    fatigue: 1.1,
  },
  {
    id: 'lazy',
    label: 'Lazy',
    desc: '-12% work speed, but shrugs off hardship when left alone.',
    tone: 'bad',
    workSpeed: 0.88,
    hardship: 0.8,
  },
  {
    id: 'brave',
    label: 'Brave',
    desc: 'Handles danger well; better exploration and combat outcomes.',
    tone: 'good',
    courage: 0.6,
    skills: { combat: 1 },
  },
  {
    id: 'cowardly',
    label: 'Cowardly',
    desc: 'Frightened easily; takes bad days hard and fares worse in danger.',
    tone: 'bad',
    courage: 1.5,
    hardship: 1.2,
  },
  {
    id: 'optimistic',
    label: 'Optimistic',
    desc: 'Morale drifts upward and bad news lands softer.',
    tone: 'good',
    moraleDrift: 0.5,
    hardship: 0.85,
  },
  {
    id: 'pessimistic',
    label: 'Pessimistic',
    desc: 'Morale drifts downward over time.',
    tone: 'bad',
    moraleDrift: -0.45,
  },
  {
    id: 'social',
    label: 'Social',
    desc: 'Gains extra morale from being around others.',
    tone: 'good',
    social: 1.6,
    stats: { charisma: 1 },
  },
  {
    id: 'introverted',
    label: 'Introverted',
    desc: 'Gains little from company, but is content working alone.',
    tone: 'mixed',
    social: 0.45,
    hardship: 0.9,
  },
  {
    id: 'generous',
    label: 'Generous',
    desc: 'Improves relationships faster.',
    tone: 'good',
    social: 1.25,
  },
  {
    id: 'greedy',
    label: 'Greedy',
    desc: 'Eats more and strains relationships when supplies are short.',
    tone: 'bad',
    appetite: 1.35,
    social: 0.8,
  },
  {
    id: 'nightOwl',
    label: 'Night Owl',
    desc: 'Works well late; sleeps and wakes later.',
    tone: 'mixed',
    scheduleShift: 3,
  },
  {
    id: 'earlyRiser',
    label: 'Early Riser',
    desc: 'Up before dawn, asleep early.',
    tone: 'mixed',
    scheduleShift: -2,
  },
  {
    id: 'mechanic',
    label: 'Mechanic',
    desc: 'Faster construction and repairs.',
    tone: 'good',
    workBonus: { construction: 1.25 },
    skills: { construction: 2, repair: 2 },
  },
  {
    id: 'medic',
    label: 'Medic',
    desc: 'Treats injuries faster and more effectively.',
    tone: 'good',
    workBonus: { medicine: 1.35 },
    skills: { medicine: 3 },
  },
  {
    id: 'scavenger',
    label: 'Scavenger',
    desc: 'Finds more when foraging and exploring.',
    tone: 'good',
    workBonus: { foraging: 1.3 },
    skills: { scavenging: 2, exploration: 1 },
  },
  {
    id: 'leader',
    label: 'Leader',
    desc: 'Nearby survivors work slightly faster and keep morale.',
    tone: 'good',
    stats: { charisma: 2 },
    social: 1.3,
  },
  {
    id: 'hotHeaded',
    label: 'Hot-Headed',
    desc: 'Strong worker, but takes setbacks badly and argues easily.',
    tone: 'mixed',
    workSpeed: 1.06,
    hardship: 1.3,
    social: 0.7,
  },
  {
    id: 'calm',
    label: 'Calm',
    desc: 'Takes hardship in their stride and rarely panics.',
    tone: 'good',
    hardship: 0.7,
    courage: 0.8,
  },
  {
    id: 'curious',
    label: 'Curious',
    desc: 'Explores faster and discovers more.',
    tone: 'good',
    skills: { exploration: 2 },
    stats: { perception: 1 },
  },
  {
    id: 'tough',
    label: 'Tough',
    desc: 'Takes less damage and recovers faster.',
    tone: 'good',
    toughness: 0.7,
    stats: { endurance: 1 },
  },
  {
    id: 'fragile',
    label: 'Fragile',
    desc: 'Injuries hit harder and linger.',
    tone: 'bad',
    toughness: 1.4,
    stats: { endurance: -1 },
  },
  {
    id: 'fastLearner',
    label: 'Fast Learner',
    desc: 'Gains skill experience 45% faster.',
    tone: 'good',
    learnRate: 1.45,
  },
  {
    id: 'hunter',
    label: 'Hunter',
    desc: 'Reads tracks and holds their nerve. Far better at bringing game down.',
    tone: 'good',
    workBonus: { hunting: 1.35 },
    skills: { combat: 3, exploration: 1 },
    courage: 0.75,
  },
  {
    id: 'cook',
    label: 'Cook',
    desc: 'Makes a little go a long way. Meals stretch further.',
    tone: 'good',
    workBonus: { cooking: 1.35 },
    skills: { cooking: 3 },
  },
  {
    id: 'artisan',
    label: 'Artisan',
    desc: 'Neat, patient hands. Crafts faster and wastes less.',
    tone: 'good',
    workBonus: { crafting: 1.35 },
    skills: { crafting: 3, repair: 1 },
  },
  {
    id: 'prospector',
    label: 'Prospector',
    desc: 'Knows where the good stone is and how to break it.',
    tone: 'good',
    workBonus: { mining: 1.35 },
    skills: { scavenging: 2 },
  },
  {
    id: 'packMule',
    label: 'Pack Mule',
    desc: 'Carries more, further, without complaining about it.',
    tone: 'good',
    workBonus: { hauling: 1.3 },
    stats: { strength: 1, endurance: 1 },
  },
  {
    id: 'greenThumb',
    label: 'Green Thumb',
    desc: 'Crops grow better under their care.',
    tone: 'good',
    workBonus: { farming: 1.3 },
    skills: { farming: 2 },
  },
  {
    id: 'lumberjack',
    label: 'Lumberjack',
    desc: 'Fells trees noticeably faster.',
    tone: 'good',
    workBonus: { woodcutting: 1.3 },
    skills: { woodcutting: 2 },
  },
  {
    id: 'lucky',
    label: 'Lucky',
    desc: 'Random rolls tend to go their way.',
    tone: 'good',
    fortune: 1.3,
    stats: { luck: 2 },
  },
  {
    id: 'unlucky',
    label: 'Unlucky',
    desc: 'Random rolls tend to go against them.',
    tone: 'bad',
    fortune: 0.72,
    stats: { luck: -2 },
  },
];

export const TRAIT_MAP: Record<string, TraitDef> = Object.fromEntries(
  TRAITS.map((t) => [t.id, t])
);

/** Traits that must never appear together on one survivor. */
/** The trait that marks someone out as the camp's specialist in a job. */
export const WORK_TRAIT: Record<string, string> = {
  woodcutting: 'lumberjack',
  construction: 'mechanic',
  hauling: 'packMule',
  foraging: 'scavenger',
  hunting: 'hunter',
  mining: 'prospector',
  farming: 'greenThumb',
  cooking: 'cook',
  medicine: 'medic',
  crafting: 'artisan',
};

export const TRAIT_CONFLICTS: string[][] = [
  ['hardWorker', 'lazy'],
  ['brave', 'cowardly'],
  ['optimistic', 'pessimistic'],
  ['social', 'introverted'],
  ['generous', 'greedy'],
  ['nightOwl', 'earlyRiser'],
  ['tough', 'fragile'],
  ['hotHeaded', 'calm'],
  ['lucky', 'unlucky'],
];
