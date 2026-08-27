import type { AnimalKind, ResourceType } from '../core/types';

/**
 * Wildlife.
 *
 * Animals are live entities in the world, not a table roll: they wander the
 * forest, notice people, and either bolt or turn and fight. Hunting them is a
 * real job with a real risk attached.
 */
export interface AnimalDef {
  kind: AnimalKind;
  label: string;
  hp: number;
  /** Tiles per second when calm / when running. */
  speed: number;
  fleeSpeed: number;
  /** How close a person can get before it reacts, in tiles. */
  alertRange: number;
  /** Boars turn and charge instead of running. */
  aggressive: boolean;
  /** Damage per second while charging. */
  attack: number;
  /** What the carcass yields. */
  yields: Partial<Record<ResourceType, number>>;
  /** Rough share of the wildlife population. */
  weight: number;
  /* rendering */
  body: string;
  belly: string;
  detail: string;
  size: number;
}

export const ANIMALS: AnimalDef[] = [
  {
    kind: 'rabbit',
    label: 'Rabbit',
    hp: 14,
    speed: 1.6,
    fleeSpeed: 4.2,
    alertRange: 6,
    aggressive: false,
    attack: 0,
    yields: { rawMeat: 9, fiber: 2 },
    weight: 5,
    body: '#9a8a74',
    belly: '#e6ded0',
    detail: '#6d5f4e',
    size: 0.55,
  },
  {
    kind: 'deer',
    label: 'Deer',
    hp: 34,
    speed: 1.1,
    fleeSpeed: 3.4,
    alertRange: 8,
    aggressive: false,
    attack: 0,
    yields: { rawMeat: 30, fiber: 6 },
    weight: 3,
    body: '#a8763f',
    belly: '#e0c8a2',
    detail: '#5c3f22',
    size: 1,
  },
  {
    kind: 'boar',
    label: 'Boar',
    hp: 62,
    speed: 0.9,
    fleeSpeed: 2.6,
    alertRange: 6.5,
    aggressive: true,
    attack: 7,
    yields: { rawMeat: 40, fiber: 10 },
    weight: 2,
    body: '#59493c',
    belly: '#7a6a58',
    detail: '#2e251d',
    size: 0.95,
  },
];

export const ANIMAL_MAP: Record<AnimalKind, AnimalDef> = Object.fromEntries(
  ANIMALS.map((a) => [a.kind, a])
) as Record<AnimalKind, AnimalDef>;

/** How long a carcass stays in the world after it is butchered, in sim-seconds. */
export const CARCASS_TIME = 25;
