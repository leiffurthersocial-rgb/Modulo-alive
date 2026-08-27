import type { ResourceType } from '../core/types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/**
 * Crops carry their seasonal data already, even though V1 runs a single
 * evergreen growing season. When seasons are switched on, `plantSeasons` and
 * `seasonYield` start being read by farming.ts — no data migration required.
 */
export interface CropDef {
  id: string;
  label: string;
  /** Game-hours from planting to ripe (before skill / tending modifiers). */
  growHours: number;
  yieldRes: ResourceType;
  yieldAmount: number;
  seedCost: number;
  /** Chance a harvest also returns seeds. */
  seedReturn: number;
  colorYoung: string;
  colorRipe: string;
  /** Future seasonal support. */
  plantSeasons: Season[];
  seasonYield: Record<Season, number>;
  desc: string;
}

export const CROPS: CropDef[] = [
  {
    id: 'tubers',
    label: 'Tubers',
    growHours: 26,
    yieldRes: 'rawFood',
    yieldAmount: 15,
    seedCost: 1,
    seedReturn: 0.7,
    colorYoung: '#6b9a4a',
    colorRipe: '#c8a44a',
    plantSeasons: ['spring', 'summer', 'autumn'],
    seasonYield: { spring: 1, summer: 1.1, autumn: 1, winter: 0.3 },
    desc: 'Hardy, filling, unglamorous. The backbone of the camp diet.',
  },
  {
    id: 'greens',
    label: 'Field Greens',
    growHours: 16,
    yieldRes: 'rawFood',
    yieldAmount: 9,
    seedCost: 1,
    seedReturn: 0.75,
    colorYoung: '#7fbb55',
    colorRipe: '#a8d967',
    plantSeasons: ['spring', 'summer'],
    seasonYield: { spring: 1.2, summer: 1, autumn: 0.8, winter: 0.2 },
    desc: 'Fast growing and light. Good for topping up a thin larder.',
  },
  {
    id: 'flax',
    label: 'Flax',
    growHours: 26,
    yieldRes: 'fiber',
    yieldAmount: 12,
    seedCost: 1,
    seedReturn: 0.6,
    colorYoung: '#8fae7a',
    colorRipe: '#d6cf8a',
    plantSeasons: ['spring', 'summer'],
    seasonYield: { spring: 1, summer: 1.15, autumn: 0.9, winter: 0.2 },
    desc: 'Fiber for rope, bedding and bandages.',
  },
  {
    id: 'healroot',
    label: 'Healroot',
    growHours: 40,
    yieldRes: 'herbs',
    yieldAmount: 7,
    seedCost: 2,
    seedReturn: 0.4,
    colorYoung: '#6a9c8a',
    colorRipe: '#94d3b3',
    plantSeasons: ['spring', 'autumn'],
    seasonYield: { spring: 1.1, summer: 0.9, autumn: 1, winter: 0.4 },
    desc: 'Bitter, useless as food, essential when someone is bleeding.',
  },
];

export const CROP_MAP: Record<string, CropDef> = Object.fromEntries(
  CROPS.map((c) => [c.id, c])
);
