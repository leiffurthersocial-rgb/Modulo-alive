import type { ResourceType } from '../core/types';
import { GEAR } from './gear';

/**
 * Everything that can be made at a workbench.
 *
 * Gear recipes are derived from data/gear.ts so a new piece of equipment only
 * has to be defined once — it becomes craftable, wearable and drawable in one
 * step.
 */
export interface RecipeDef {
  id: string;
  label: string;
  input: Partial<Record<ResourceType, number>>;
  /** Stockpile output, for consumables. */
  output: Partial<Record<ResourceType, number>>;
  /** Gear id produced, for equipment. */
  gear?: string;
  /** Work units at the bench. */
  work: number;
  desc: string;
  /** The settlement stops crafting this automatically past this amount. */
  autoCap: number;
}

const CONSUMABLES: RecipeDef[] = [
  {
    id: 'medicine',
    label: 'Medicine',
    input: { herbs: 6, fiber: 4 },
    output: { medicine: 2 },
    work: 26,
    autoCap: 14,
    desc: 'Poultices and bandages, brewed down from healroot.',
  },
];

const GEAR_RECIPES: RecipeDef[] = GEAR.map((g) => ({
  id: g.id,
  label: g.label,
  input: g.cost,
  // Tools double as a building material, so they land in the stockpile.
  output: g.id === 'tools' ? { tools: 1 } : {},
  gear: g.id === 'tools' ? undefined : g.id,
  work: g.work,
  autoCap: g.autoCap,
  desc: g.desc,
}));

export const RECIPES: RecipeDef[] = [...CONSUMABLES, ...GEAR_RECIPES];

export const RECIPE_MAP: Record<string, RecipeDef> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r])
);
