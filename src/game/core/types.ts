/**
 * Modulo:Alive — core simulation types.
 *
 * Everything in this file is plain data. The simulation mutates these
 * structures; the renderer and React UI only ever read from them. Keeping the
 * world as serialisable data is what makes save/load (and future migrations)
 * straightforward.
 */

/* ------------------------------------------------------------------ */
/* Resources                                                           */
/* ------------------------------------------------------------------ */

export const RESOURCE_TYPES = [
  'wood',
  'stone',
  'food',
  'rawFood',
  'water',
  'fiber',
  'medicine',
  'herbs',
  'seeds',
  'tools',
  'hide',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type Stockpile = Record<ResourceType, number>;

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  wood: 'Wood',
  stone: 'Stone',
  food: 'Food',
  rawFood: 'Raw Food',
  water: 'Water',
  fiber: 'Fiber',
  medicine: 'Medicine',
  herbs: 'Herbs',
  seeds: 'Seeds',
  tools: 'Tools',
  hide: 'Hide',
};

/** Resources that occupy storage capacity. */
export const STORED_RESOURCES: ResourceType[] = [
  'wood',
  'stone',
  'food',
  'rawFood',
  'water',
  'fiber',
  'medicine',
  'herbs',
  'seeds',
  'tools',
  'hide',
];

export function emptyStockpile(): Stockpile {
  const s = {} as Stockpile;
  for (const r of RESOURCE_TYPES) s[r] = 0;
  return s;
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

export enum Terrain {
  Grass = 0,
  DarkGrass = 1,
  Dirt = 2,
  Soil = 3,
  Water = 4,
  Stone = 5,
  Sand = 6,
  Path = 7,
  Floor = 8,
}

export const TILE = 24; // world pixels per tile

/* ------------------------------------------------------------------ */
/* Resource nodes                                                      */
/* ------------------------------------------------------------------ */

export type NodeKind =
  | 'tree'
  | 'pine'
  | 'deadTree'
  | 'rock'
  | 'berryBush'
  | 'herbPatch'
  | 'reeds'
  | 'stump'
  | 'log';

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  tx: number;
  ty: number;
  hp: number;
  maxHp: number;
  /** Remaining harvestable amount. */
  amount: number;
  /** Sim-seconds timestamp at which a depleted node regrows (-1 = never). */
  regrowAt: number;
  depleted: boolean;
  /** Player flagged this node for removal/harvest. */
  marked: boolean;
  variant: number;
  /** Falling animation timer, counts down from FALL_TIME. */
  fallT: number;
  /** Direction the tree falls (radians). */
  fallDir: number;
  /** Shake impulse from being struck. */
  shake: number;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

export type BuildingState = 'blueprint' | 'built';

export interface FarmCell {
  /** Crop id, or null when the cell is empty. */
  crop: string | null;
  /** 0 = just planted, 1 = ripe. */
  growth: number;
  tilled: boolean;
  /** Sim-seconds of accumulated tending; boosts yield. */
  tended: number;
  dead: boolean;
}

export interface Building {
  id: number;
  def: string;
  tx: number;
  ty: number;
  w: number;
  h: number;
  state: BuildingState;
  /** Construction work progress, 0..1. */
  progress: number;
  /** Materials delivered to the site so far. */
  delivered: Partial<Record<ResourceType, number>>;
  level: number;
  hp: number;
  maxHp: number;
  /** Generic per-building payload (farm cells, bed occupancy, ...). */
  farm?: FarmCell[];
  /** Character id currently sleeping in / using this building. */
  users: number[];
  /** Cosmetic seed so identical buildings do not look identical. */
  variant: number;
  /** Set while a worker is actively operating the building (for animation). */
  activeT: number;
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export type StatId =
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'perception'
  | 'endurance'
  | 'charisma'
  | 'luck';

export const STAT_IDS: StatId[] = [
  'strength',
  'agility',
  'intelligence',
  'perception',
  'endurance',
  'charisma',
  'luck',
];

export const STAT_LABEL: Record<StatId, string> = {
  strength: 'Strength',
  agility: 'Agility',
  intelligence: 'Intelligence',
  perception: 'Perception',
  endurance: 'Endurance',
  charisma: 'Charisma',
  luck: 'Luck',
};

export const STAT_SHORT: Record<StatId, string> = {
  strength: 'STR',
  agility: 'AGI',
  intelligence: 'INT',
  perception: 'PER',
  endurance: 'END',
  charisma: 'CHA',
  luck: 'LCK',
};

export type Stats = Record<StatId, number>;

export type SkillId =
  | 'woodcutting'
  | 'construction'
  | 'farming'
  | 'cooking'
  | 'crafting'
  | 'medicine'
  | 'scavenging'
  | 'exploration'
  | 'combat'
  | 'repair'
  | 'research';

export const SKILL_IDS: SkillId[] = [
  'woodcutting',
  'construction',
  'farming',
  'cooking',
  'crafting',
  'medicine',
  'scavenging',
  'exploration',
  'combat',
  'repair',
  'research',
];

export const SKILL_LABEL: Record<SkillId, string> = {
  woodcutting: 'Woodcutting',
  construction: 'Construction',
  farming: 'Farming',
  cooking: 'Cooking',
  crafting: 'Crafting',
  medicine: 'Medicine',
  scavenging: 'Scavenging',
  exploration: 'Exploration',
  combat: 'Combat',
  repair: 'Repair',
  research: 'Research',
};

export interface Skill {
  level: number;
  xp: number;
}

/** Work categories the player can prioritise per survivor. */
export type WorkType =
  | 'woodcutting'
  | 'construction'
  | 'hauling'
  | 'foraging'
  | 'mining'
  | 'farming'
  | 'cooking'
  | 'medicine'
  | 'crafting';

export const WORK_TYPES: WorkType[] = [
  'woodcutting',
  'construction',
  'hauling',
  'foraging',
  'mining',
  'farming',
  'cooking',
  'medicine',
  'crafting',
];

export const WORK_LABEL: Record<WorkType, string> = {
  woodcutting: 'Woodcutting',
  construction: 'Construction',
  hauling: 'Hauling',
  foraging: 'Foraging',
  mining: 'Mining',
  farming: 'Farming',
  cooking: 'Cooking',
  medicine: 'Medicine',
  crafting: 'Crafting',
};

/** The skill each work category trains and is gated by. */
export const WORK_SKILL: Record<WorkType, SkillId> = {
  woodcutting: 'woodcutting',
  construction: 'construction',
  hauling: 'construction',
  foraging: 'scavenging',
  mining: 'scavenging',
  farming: 'farming',
  cooking: 'cooking',
  medicine: 'medicine',
  crafting: 'crafting',
};

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle:
    | 'short'
    | 'fringe'
    | 'styled'
    | 'mod'
    | 'middlePart'
    | 'buzz'
    | 'long';
  eyes: string;
  build: 'slim' | 'normal' | 'tall' | 'heavy';
  shirt: string;
  trousers: string;
  facialHair?: 'goatee' | 'stubble' | 'none';
}

export interface Injury {
  id: number;
  kind: string;
  label: string;
  /** 0..1, scales the penalty and the healing time. */
  severity: number;
  /** Remaining healing work in sim-seconds. */
  remaining: number;
  treated: boolean;
  bleeding: number;
  bodyPart: string;
}

export type Activity =
  | 'idle'
  | 'work'
  | 'store'
  | 'eat'
  | 'sleep'
  | 'social'
  | 'wander'
  | 'rest'
  | 'explore'
  | 'order';

export type CharState =
  | 'idle'
  | 'moving'
  | 'working'
  | 'sleeping'
  | 'eating'
  | 'socialising'
  | 'exploring'
  | 'downed'
  | 'dead';

export interface Expedition {
  siteId: number;
  /** 'travel' | 'search' | 'return' */
  phase: 'travel' | 'search' | 'return';
  timer: number;
  risk: number;
  loot: Partial<Record<ResourceType, number>>;
}

export interface Character {
  id: number;
  name: string;
  appearance: Appearance;
  stats: Stats;
  skills: Record<SkillId, Skill>;
  traits: string[];

  hunger: number; // 0 (full) .. 100 (starving)
  energy: number; // 100 (rested) .. 0 (exhausted)
  morale: number; // 0..100
  stress: number; // 0..100
  health: number;
  maxHealth: number;

  injuries: Injury[];
  sickness: number; // 0..1 severity of illness

  alive: boolean;
  deathDay: number;
  deathCause: string;
  /** Sim-time of death; the body stays in the world for a while afterwards. */
  deathAt: number;

  /** World pixel position. */
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3; // down, left, right, up
  animT: number;
  moving: boolean;

  path: number[]; // flattened tile coords [tx,ty,tx,ty,...]
  pathIndex: number;
  /** Repath cooldown so blocked characters do not thrash A*. */
  repathT: number;
  stuckT: number;

  state: CharState;
  /** What the character is currently doing when not on a job. */
  activity: Activity;
  /** Building / character id the current activity targets, -1 when none. */
  activityTarget: number;
  /** Countdown used by timed activities (chatting, resting, eating). */
  activityT: number;
  /** Countdown to the next AI decision. */
  thinkT: number;
  jobId: number;
  /** Player-issued order overrides autonomous behaviour. */
  order: PlayerOrder | null;

  carrying: { res: ResourceType; amount: number } | null;
  equipment: { tool: string | null };

  relationships: Record<number, number>;
  priorities: Record<WorkType, number>;
  workEnabled: boolean;

  speech: { text: string; until: number; mood: SpeechMood } | null;
  expedition: Expedition | null;

  lastMealAt: number;
  lastSleepAt: number;
  /** Comfort of the bed currently being slept in (0 when awake / on the ground). */
  sleepComfort: number;
  /** Building the character is sleeping in / claimed, -1 when none. */
  sleepBuildingId: number;
  lastSocialAt: number;
  /** Accumulated work time on the current job, for animation & progress. */
  workT: number;
  /** Cosmetic bob used by the renderer. */
  bob: number;
  thought: string;
}

export type SpeechMood = 'neutral' | 'happy' | 'sad' | 'alarm';

export interface PlayerOrder {
  kind: 'move' | 'work' | 'explore';
  tx: number;
  ty: number;
  targetId?: number;
  jobType?: JobType;
  siteId?: number;
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export type JobType =
  | 'chop'
  | 'mine'
  | 'forage'
  | 'gatherWater'
  | 'haulToSite'
  | 'build'
  | 'deconstruct'
  | 'till'
  | 'plant'
  | 'tend'
  | 'harvest'
  | 'cook'
  | 'treat'
  | 'repair'
  | 'craft'
  | 'storeCarried';

export interface Job {
  id: number;
  type: JobType;
  work: WorkType;
  /** Node / building / farm-cell / character the job acts on. */
  targetKind: 'node' | 'building' | 'farmCell' | 'character' | 'tile';
  targetId: number;
  /** Index into building.farm for farm jobs. */
  cellIndex: number;
  /** Tile the worker must stand on / adjacent to. */
  tx: number;
  ty: number;
  assigned: number; // character id, -1 when unassigned
  progress: number; // 0..1
  /** Extra payload — e.g. which resource to haul. */
  res: ResourceType | null;
  amount: number;
  /** Where hauled material came from / goes to. */
  fromId: number;
  priority: number;
  /** Sim-time before which nobody may take the job again (failure backoff). */
  blockedUntil: number;
  /** How many times a worker gave up on this job; hopeless jobs get culled. */
  fails: number;
}

/* ------------------------------------------------------------------ */
/* Exploration                                                         */
/* ------------------------------------------------------------------ */

export type SiteKind =
  | 'berryGrove'
  | 'oldCamp'
  | 'cabin'
  | 'cave'
  | 'huntingGround'
  | 'wreck'
  | 'ruin'
  | 'supplies'
  | 'unknown';

export interface ExplorationSite {
  id: number;
  kind: SiteKind;
  tx: number;
  ty: number;
  discovered: boolean;
  explored: number; // times explored
  depleted: boolean;
  /** Base danger 0..1, grows with distance from camp. */
  danger: number;
  distance: number;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Events / log                                                        */
/* ------------------------------------------------------------------ */

export type LogKind =
  | 'info'
  | 'good'
  | 'bad'
  | 'story'
  | 'death'
  | 'discovery'
  | 'build'
  | 'alert';

export interface LogEntry {
  id: number;
  day: number;
  time: string;
  title: string;
  body: string;
  kind: LogKind;
  chars: number[];
}

/* ------------------------------------------------------------------ */
/* Effects (purely cosmetic, not saved)                                */
/* ------------------------------------------------------------------ */

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: 'chip' | 'leaf' | 'spark' | 'dust' | 'heart' | 'plus';
  text?: string;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */

export interface WorldTimeState {
  /** Total elapsed sim-seconds since the game began. */
  t: number;
  /** Total elapsed game-minutes. */
  minutes: number;
}

export interface Weather {
  kind: 'clear' | 'overcast' | 'rain' | 'fog';
  t: number; // remaining sim-seconds
  intensity: number;
}

export interface Progression {
  level: number;
  unlocked: string[];
  objectivesDone: string[];
  wallsUnlocked: boolean;
}

export interface World {
  version: number;
  seed: number;
  width: number; // tiles
  height: number;

  terrain: Uint8Array;
  /** node id occupying a tile, -1 = none */
  nodeAt: Int32Array;
  /** building id occupying a tile, -1 = none */
  buildingAt: Int32Array;
  /** cached walkability, recomputed on change */
  blocked: Uint8Array;

  nodes: Map<number, ResourceNode>;
  buildings: Map<number, Building>;
  characters: Character[];
  jobs: Map<number, Job>;
  sites: ExplorationSite[];

  stock: Stockpile;
  log: LogEntry[];

  time: WorldTimeState;
  weather: Weather;
  progression: Progression;

  campCenter: { tx: number; ty: number };

  nextNodeId: number;
  nextBuildingId: number;
  nextJobId: number;
  nextLogId: number;
  nextInjuryId: number;

  /** RNG state (xorshift) so saves reproduce deterministically. */
  rngState: number;

  /** Accumulators for staggered subsystem updates. */
  acc: {
    needs: number;
    ai: number;
    jobs: number;
    events: number;
    social: number;
    growth: number;
    autosave: number;
  };

  stats: {
    daysSurvived: number;
    treesFelled: number;
    builtCount: number;
    mealsCooked: number;
    deaths: number;
    explorations: number;
    harvested: number;
  };
}
