import type { Appearance, StatId } from '../core/types';

/**
 * The eight starting survivors.
 *
 * Appearance is fixed and authored. Stats and traits are generated per new
 * game, with a few authored nudges (`statBias`, `forcedTraits`) so the
 * characters the design calls out actually feel that way. Swapping the random
 * generation for fully fixed characters later is a matter of filling in
 * `fixedTraits` / `fixedStats` here — no other file needs to change.
 */
export interface SurvivorTemplate {
  name: string;
  appearance: Appearance;
  /** Flat additions applied on top of the rolled stats. */
  statBias?: Partial<Record<StatId, number>>;
  /** Minimum value for a stat after rolling + bias. */
  statFloor?: Partial<Record<StatId, number>>;
  /** Traits always granted (in addition to the random ones). */
  forcedTraits?: string[];
  /** Set these to switch a character from random to authored traits. */
  fixedTraits?: string[];
  fixedStats?: Partial<Record<StatId, number>>;
  blurb: string;
}

const SKIN_LIGHT = '#e8b48c';
const SKIN_MID = '#d69a6e';
const SKIN_TAN = '#c98a5c';
const SKIN_BROWN = '#8a5a34';

export const STARTING_SURVIVORS: SurvivorTemplate[] = [
  {
    name: 'Robin',
    blurb: 'Steady hands, quiet mornings, always the first to notice a problem.',
    appearance: {
      skin: SKIN_LIGHT,
      hair: '#e3c15c',
      hairStyle: 'short',
      eyes: '#5b3a21',
      build: 'normal',
      shirt: '#5c8f5a',
      trousers: '#41465c',
      facialHair: 'none',
    },
  },
  {
    name: 'Leif',
    blurb: 'Broad shoulders and a brown fringe he never bothers to cut.',
    appearance: {
      skin: SKIN_LIGHT,
      hair: '#6b4526',
      hairStyle: 'fringe',
      eyes: '#8a8f95',
      build: 'normal',
      shirt: '#7a5230',
      trousers: '#3b3f52',
      facialHair: 'none',
    },
    statBias: { strength: 3, endurance: 1 },
    statFloor: { strength: 8 },
  },
  {
    name: 'Jovan',
    blurb: 'Tall, easy to talk to, and somehow always mid-conversation.',
    appearance: {
      skin: SKIN_MID,
      hair: '#3b2416',
      hairStyle: 'fringe',
      eyes: '#4a2d18',
      build: 'tall',
      shirt: '#4a6f9c',
      trousers: '#3a3d4f',
      facialHair: 'none',
    },
    statBias: { charisma: 4 },
    statFloor: { charisma: 9 },
  },
  {
    name: 'Leonidas',
    blurb: 'Heavyset, deliberate, and capable of carrying an unreasonable amount.',
    appearance: {
      skin: SKIN_TAN,
      hair: '#2f1d12',
      hairStyle: 'styled',
      eyes: '#4a2d18',
      build: 'heavy',
      shirt: '#8c4b3c',
      trousers: '#40352c',
      facialHair: 'stubble',
    },
    statBias: { strength: 3, endurance: 2, agility: -1 },
    statFloor: { strength: 8 },
  },
  {
    name: 'Erim',
    blurb: 'Black hair, neat goatee, and strong opinions about the cooking.',
    appearance: {
      skin: SKIN_MID,
      hair: '#151515',
      hairStyle: 'short',
      eyes: '#3d2415',
      build: 'normal',
      shirt: '#6a5b8c',
      trousers: '#333747',
      facialHair: 'goatee',
    },
  },
  {
    name: 'Till',
    blurb: 'A sharp blonde mod cut and the patience for repetitive work.',
    appearance: {
      skin: SKIN_LIGHT,
      hair: '#d9bd63',
      hairStyle: 'mod',
      eyes: '#5b86b5',
      build: 'normal',
      shirt: '#c2b280',
      trousers: '#4a4f63',
      facialHair: 'none',
    },
  },
  {
    name: 'Lenni',
    blurb: 'Brown hair parted down the middle; happiest at the treeline.',
    appearance: {
      skin: SKIN_LIGHT,
      hair: '#7a5230',
      hairStyle: 'middlePart',
      eyes: '#4a2d18',
      build: 'normal',
      shirt: '#4e8c86',
      trousers: '#3d4152',
      facialHair: 'none',
    },
  },
  {
    name: 'Tusya',
    blurb: 'Buzz cut, brown skin, and a habit of finishing what she starts.',
    appearance: {
      skin: SKIN_BROWN,
      hair: '#101010',
      hairStyle: 'buzz',
      eyes: '#2e1a0e',
      build: 'normal',
      shirt: '#b5734a',
      trousers: '#38404d',
      facialHair: 'none',
    },
  },
];

/** Names used when new survivors join the camp later on. */
export const WANDERER_NAMES = [
  'Mira',
  'Ostor',
  'Yuki',
  'Bram',
  'Nadia',
  'Kel',
  'Sana',
  'Orin',
  'Petra',
  'Dax',
  'Iva',
  'Roan',
];

export const WANDERER_SKINS = [SKIN_LIGHT, SKIN_MID, SKIN_TAN, SKIN_BROWN];
export const WANDERER_HAIR = [
  '#e3c15c',
  '#6b4526',
  '#3b2416',
  '#151515',
  '#a33f2a',
  '#8f8f8f',
];
export const WANDERER_SHIRTS = [
  '#5c8f5a',
  '#4a6f9c',
  '#8c4b3c',
  '#6a5b8c',
  '#4e8c86',
  '#b5734a',
];
