import type { ResourceType } from '../core/types';

/**
 * Wearable and carried gear.
 *
 * Every field here is read by the simulation and drawn by the renderer — if a
 * survivor is wearing it, you can see it on them in the world.
 */
export type GearSlot = 'tool' | 'head' | 'body';

export interface GearDef {
  id: string;
  label: string;
  slot: GearSlot;
  desc: string;
  /** Crafting cost at a workbench. */
  cost: Partial<Record<ResourceType, number>>;
  /** Work units at the bench. */
  work: number;
  /** The settlement stops making these once it has this many spare. */
  autoCap: number;
  /** Multiplier on general work speed. */
  workSpeed?: number;
  /** Multiplier on incoming injury severity. */
  protection?: number;
  /** Multiplier on stress accumulation. */
  stress?: number;
  /** Flat morale bonus while worn. */
  morale?: number;
  /** How quickly it wears out per second of work (0 = never). */
  wear: number;
  /* --- rendering --- */
  color: string;
  accent: string;
}

export const GEAR: GearDef[] = [
  {
    id: 'tools',
    label: 'Tool Set',
    slot: 'tool',
    desc: 'An axe, a saw and a mallet. Every kind of work goes faster.',
    cost: { wood: 12, stone: 8 },
    work: 30,
    autoCap: 4,
    workSpeed: 1.2,
    wear: 0.0006,
    color: '#b9b9c2',
    accent: '#6b4c30',
  },
  {
    id: 'workHat',
    label: 'Woven Hat',
    slot: 'head',
    desc: 'Keeps the sun and the rain off. Less wearing to work a long day.',
    cost: { fiber: 14 },
    work: 18,
    autoCap: 3,
    stress: 0.85,
    morale: 3,
    wear: 0.00012,
    color: '#c9b676',
    accent: '#9c8a52',
  },
  {
    id: 'paddedVest',
    label: 'Padded Vest',
    slot: 'body',
    desc: 'Layered fiber and bark. Takes the worst out of a bad fall or a bite.',
    cost: { fiber: 24, wood: 6 },
    work: 34,
    autoCap: 3,
    protection: 0.65,
    wear: 0.00008,
    color: '#7c6a4a',
    accent: '#5d4f36',
  },
];

export const GEAR_MAP: Record<string, GearDef> = Object.fromEntries(
  GEAR.map((g) => [g.id, g])
);

export const GEAR_SLOTS: GearSlot[] = ['tool', 'head', 'body'];

export const SLOT_LABEL: Record<GearSlot, string> = {
  tool: 'Tools',
  head: 'Head',
  body: 'Body',
};

/** Gear ids are also stockpile resource ids for the two that already exist. */
export function gearStockKey(id: string): ResourceType | null {
  return id === 'tools' ? 'tools' : null;
}
