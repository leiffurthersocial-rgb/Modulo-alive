import type { ResourceType } from '../core/types';

export type BuildCategory =
  | 'shelter'
  | 'food'
  | 'storage'
  | 'production'
  | 'farming'
  | 'medical'
  | 'social'
  | 'defense'
  | 'infra';

export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  shelter: 'Housing',
  food: 'Food',
  storage: 'Storage',
  production: 'Production',
  farming: 'Farming',
  medical: 'Medical',
  social: 'Social',
  defense: 'Defense',
  infra: 'Grounds',
};

export const CATEGORY_ORDER: BuildCategory[] = [
  'shelter',
  'food',
  'farming',
  'storage',
  'production',
  'medical',
  'social',
  'infra',
  'defense',
];

export interface BuildingDef {
  id: string;
  label: string;
  category: BuildCategory;
  w: number;
  h: number;
  cost: Partial<Record<ResourceType, number>>;
  /** Construction work units (a average builder does ~1/sec). */
  work: number;
  desc: string;
  hp: number;

  /** Storage capacity added to the settlement. */
  storage?: number;
  /** How many survivors can sleep here. */
  beds?: number;
  /** Sleep quality 0..1 — affects energy recovery and morale. */
  comfort?: number;
  /** Light radius in tiles (night lighting + safety). */
  light?: number;
  /** Cooking station: converts raw food into meals. */
  cooking?: number;
  /** Water production per game hour. */
  water?: number;
  /** Crafting throughput multiplier. */
  crafting?: number;
  /** Medical treatment quality multiplier. */
  medical?: number;
  /** Morale per visit. */
  social?: number;
  /** Farm plot — creates w*h crop cells. */
  farm?: boolean;
  /** Blocks movement (walls). */
  solid?: boolean;
  /** Movement speed multiplier when walking over it. */
  speed?: number;
  /** Progression level required before it appears in the build menu. */
  minLevel?: number;
  /** Requires at least one built building of these ids. */
  requires?: string[];
  /** Upgrade target. */
  upgradeTo?: string;
  /** Only reachable as an upgrade, not directly buildable. */
  upgradeOnly?: boolean;
  /** Starting structures are placed pre-built during world generation. */
  starter?: boolean;
}

export const BUILDINGS: BuildingDef[] = [
  /* ---------------- Shelter ---------------- */
  {
    id: 'bedroll',
    label: 'Bedroll',
    category: 'shelter',
    w: 1,
    h: 2,
    cost: { wood: 4, fiber: 6 },
    work: 18,
    hp: 40,
    beds: 1,
    comfort: 0.3,
    desc: 'A rough bed on the ground. Better than the bare dirt, barely.',
    upgradeTo: 'woodBed',
  },
  {
    id: 'woodBed',
    label: 'Wooden Bed',
    category: 'shelter',
    w: 1,
    h: 2,
    cost: { wood: 22, fiber: 10 },
    work: 40,
    hp: 90,
    beds: 1,
    comfort: 0.6,
    desc: 'A proper frame and a straw mattress. Survivors wake up rested.',
    upgradeTo: 'cabinBed',
    minLevel: 2,
  },
  {
    id: 'cabinBed',
    label: 'Cabin Bunk',
    category: 'shelter',
    w: 2,
    h: 2,
    cost: { wood: 55, stone: 15, fiber: 20 },
    work: 80,
    hp: 160,
    beds: 2,
    comfort: 0.85,
    desc: 'Walls, a roof and two bunks. The best rest in camp.',
    minLevel: 3,
    upgradeOnly: false,
  },

  /* ---------------- Food ---------------- */
  {
    id: 'campfire',
    label: 'Campfire',
    category: 'food',
    w: 2,
    h: 2,
    cost: { wood: 12, stone: 6 },
    work: 20,
    hp: 60,
    cooking: 0.7,
    light: 6.5,
    social: 0.6,
    desc: 'Warmth, light and a place to burn a meal.',
    upgradeTo: 'cookingStation',
    starter: true,
  },
  {
    id: 'cookingStation',
    label: 'Cooking Station',
    category: 'food',
    w: 2,
    h: 2,
    cost: { wood: 30, stone: 18 },
    work: 45,
    hp: 110,
    cooking: 1.15,
    light: 5,
    social: 0.4,
    desc: 'A stone hearth and a work surface. Fewer burnt meals.',
    upgradeTo: 'kitchen',
    minLevel: 2,
  },
  {
    id: 'kitchen',
    label: 'Kitchen',
    category: 'food',
    w: 3,
    h: 2,
    cost: { wood: 70, stone: 40, tools: 2 },
    work: 95,
    hp: 200,
    cooking: 1.7,
    light: 4,
    social: 0.5,
    desc: 'Proper cookware. Meals go further and taste better.',
    minLevel: 3,
  },

  /* ---------------- Farming ---------------- */
  {
    id: 'farmPlot',
    label: 'Farm Plot',
    category: 'farming',
    w: 3,
    h: 3,
    cost: { wood: 8, fiber: 10 },
    work: 40,
    hp: 40,
    farm: true,
    speed: 0.85,
    desc: 'Tilled soil for nine crop beds. Needs clear, tree-free ground.',
  },

  /* ---------------- Storage ---------------- */
  {
    id: 'stockpile',
    label: 'Supply Pile',
    category: 'storage',
    w: 2,
    h: 2,
    cost: { wood: 6 },
    work: 12,
    hp: 40,
    storage: 260,
    desc: 'A tarp and some crates. Somewhere to put things down.',
    upgradeTo: 'storageShed',
    starter: true,
  },
  {
    id: 'storageShed',
    label: 'Storage Shed',
    category: 'storage',
    w: 3,
    h: 2,
    cost: { wood: 40, stone: 10 },
    work: 55,
    hp: 140,
    storage: 650,
    desc: 'Dry, covered, and lockable. Holds far more than a tarp.',
    upgradeTo: 'warehouse',
    minLevel: 2,
  },
  {
    id: 'warehouse',
    label: 'Warehouse',
    category: 'storage',
    w: 4,
    h: 3,
    cost: { wood: 130, stone: 70, tools: 2 },
    work: 150,
    hp: 300,
    storage: 1600,
    desc: 'The settlement can finally stop throwing surplus away.',
    minLevel: 3,
  },

  /* ---------------- Production ---------------- */
  {
    id: 'workbench',
    label: 'Workbench',
    category: 'production',
    w: 2,
    h: 2,
    cost: { wood: 20, stone: 5 },
    work: 30,
    hp: 90,
    crafting: 1,
    desc: 'Turns wood, stone and fiber into tools and medicine.',
    upgradeTo: 'workshop',
    starter: true,
  },
  {
    id: 'workshop',
    label: 'Workshop',
    category: 'production',
    w: 3,
    h: 2,
    cost: { wood: 75, stone: 35, tools: 1 },
    work: 100,
    hp: 190,
    crafting: 1.8,
    desc: 'Racks, vices and space to work. Crafting is much faster.',
    minLevel: 3,
  },
  {
    id: 'well',
    label: 'Well',
    category: 'production',
    w: 2,
    h: 2,
    cost: { wood: 15, stone: 35 },
    work: 70,
    hp: 160,
    water: 6,
    desc: 'A reliable water supply, no trip to the stream required.',
    minLevel: 2,
  },

  /* ---------------- Medical ---------------- */
  {
    id: 'medicalTent',
    label: 'Medical Tent',
    category: 'medical',
    w: 2,
    h: 2,
    cost: { wood: 25, fiber: 20 },
    work: 45,
    hp: 80,
    medical: 1,
    beds: 1,
    comfort: 0.4,
    desc: 'Somewhere to lie down and be patched up.',
    upgradeTo: 'clinic',
  },
  {
    id: 'clinic',
    label: 'Clinic',
    category: 'medical',
    w: 3,
    h: 2,
    cost: { wood: 65, stone: 30, fiber: 20, tools: 1 },
    work: 105,
    hp: 180,
    medical: 2,
    beds: 2,
    comfort: 0.6,
    desc: 'Clean surfaces, stocked shelves, real recoveries.',
    minLevel: 3,
  },

  /* ---------------- Social ---------------- */
  {
    id: 'diningArea',
    label: 'Dining Area',
    category: 'social',
    w: 3,
    h: 2,
    cost: { wood: 28 },
    work: 40,
    hp: 90,
    social: 1.1,
    desc: 'Benches and a long table. Eating together helps morale.',
    minLevel: 2,
  },
  {
    id: 'commonHall',
    label: 'Common Hall',
    category: 'social',
    w: 3,
    h: 3,
    cost: { wood: 90, stone: 30, fiber: 25 },
    work: 120,
    hp: 220,
    social: 2,
    light: 4,
    desc: 'A roof to gather under. The camp starts to feel like a home.',
    minLevel: 3,
  },

  /* ---------------- Grounds ---------------- */
  {
    id: 'path',
    label: 'Gravel Path',
    category: 'infra',
    w: 1,
    h: 1,
    cost: { stone: 2 },
    work: 4,
    hp: 30,
    speed: 1.35,
    desc: 'Survivors move noticeably faster along laid paths.',
  },
  {
    id: 'torchPost',
    label: 'Torch Post',
    category: 'infra',
    w: 1,
    h: 1,
    cost: { wood: 6, fiber: 3 },
    work: 8,
    hp: 30,
    light: 5,
    desc: 'Keeps a corner of the camp lit through the night.',
  },

  /* ---------------- Defense ---------------- */
  {
    id: 'wall',
    label: 'Palisade Wall',
    category: 'defense',
    w: 1,
    h: 1,
    cost: { wood: 10, stone: 4 },
    work: 14,
    hp: 220,
    solid: true,
    minLevel: 3,
    desc: 'Sharpened logs. This is not a camp any more — it is a home.',
  },
  {
    id: 'gate',
    label: 'Gate',
    category: 'defense',
    w: 1,
    h: 1,
    cost: { wood: 22, stone: 8, tools: 1 },
    work: 26,
    hp: 240,
    minLevel: 3,
    requires: ['wall'],
    desc: 'A way through the palisade that can be shut.',
  },
  {
    id: 'watchtower',
    label: 'Watchtower',
    category: 'defense',
    w: 2,
    h: 2,
    cost: { wood: 70, stone: 40, tools: 1 },
    work: 120,
    hp: 300,
    light: 7,
    minLevel: 4,
    requires: ['wall'],
    desc: 'Spots trouble in the treeline before it reaches the fire.',
  },
];

export const BUILDING_MAP: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b])
);

export function buildingDef(id: string): BuildingDef {
  const d = BUILDING_MAP[id];
  if (!d) throw new Error(`Unknown building def: ${id}`);
  return d;
}

/** Progression tiers — index 0 is unused, level starts at 1. */
export const PROGRESSION_TIERS = [
  { level: 1, name: 'Survival Camp', desc: 'Eight people and a fire.' },
  {
    level: 2,
    name: 'Established Camp',
    desc: 'Beds, storage and a steady supply of wood.',
    req: { buildings: 6, beds: 4, pop: 4 },
  },
  {
    level: 3,
    name: 'Settlement',
    desc: 'Farmland, cooked food and somewhere to treat the wounded.',
    req: { buildings: 11, beds: 6, farms: 1, cooking: 1, medical: 1 },
  },
  {
    level: 4,
    name: 'Stronghold',
    desc: 'A walled home with a workshop and a watch.',
    req: { buildings: 18, beds: 8, workshop: 1, walls: 8 },
  },
];
