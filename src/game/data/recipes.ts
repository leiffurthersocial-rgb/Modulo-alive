import type { ResourceType } from '../core/types';

export interface RecipeDef {
  id: string;
  label: string;
  input: Partial<Record<ResourceType, number>>;
  output: Partial<Record<ResourceType, number>>;
  /** Work units at the bench. */
  work: number;
  desc: string;
  /** The settlement stops crafting this automatically past this amount. */
  autoCap: number;
}

export const RECIPES: RecipeDef[] = [
  {
    id: 'tools',
    label: 'Tools',
    input: { wood: 12, stone: 8 },
    output: { tools: 1 },
    work: 30,
    autoCap: 6,
    desc: 'Axes and saws. Workers carrying tools do every job faster.',
  },
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

export const RECIPE_MAP: Record<string, RecipeDef> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r])
);
