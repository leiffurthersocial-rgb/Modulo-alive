import { Terrain, type NodeKind, type World } from '../core/types';
import { RNG } from '../core/rng';
import { addNode, idx, rollInt } from './world';

/**
 * The forest grows back.
 *
 * Without this a settlement eventually strips its map bare and the whole
 * economy stalls. New growth deliberately keeps away from the camp and from
 * anything the player has built, so clearing land stays permanent where it
 * matters — the wilderness just refills behind you.
 */

interface GrowthRule {
  kind: NodeKind;
  /** Fallback ceiling, used only if the world never recorded a target. */
  target: number;
  /** Terrain it will take root on. */
  terrain: Terrain[];
  /** Minimum distance from the camp centre, in tiles. */
  minCampDistance: number;
  /** Prefer tiles next to an existing one of the same kind (forests spread). */
  clusters: boolean;
  /** Attempts per growth tick. */
  attempts: number;
}

const RULES: GrowthRule[] = [
  {
    kind: 'tree',
    target: 1500,
    terrain: [Terrain.Grass, Terrain.DarkGrass, Terrain.Dirt],
    minCampDistance: 15,
    clusters: true,
    attempts: 22,
  },
  {
    kind: 'pine',
    target: 600,
    terrain: [Terrain.Grass, Terrain.DarkGrass, Terrain.Stone],
    minCampDistance: 18,
    clusters: true,
    attempts: 12,
  },
  {
    kind: 'rock',
    target: 260,
    terrain: [Terrain.Stone, Terrain.Dirt, Terrain.Grass],
    minCampDistance: 13,
    clusters: false,
    attempts: 8,
  },
  {
    kind: 'berryBush',
    target: 110,
    terrain: [Terrain.Grass, Terrain.DarkGrass, Terrain.Dirt],
    minCampDistance: 8,
    clusters: true,
    attempts: 8,
  },
  {
    kind: 'herbPatch',
    target: 60,
    terrain: [Terrain.Grass, Terrain.DarkGrass, Terrain.Dirt],
    minCampDistance: 8,
    clusters: false,
    attempts: 5,
  },
  {
    kind: 'reeds',
    target: 90,
    terrain: [Terrain.Sand, Terrain.Grass],
    minCampDistance: 7,
    clusters: false,
    attempts: 6,
  },
];

/** How far new growth stays clear of anything standing. */
const BUILDING_BUFFER = 3;

function countKind(w: World, kind: NodeKind): number {
  let n = 0;
  for (const node of w.nodes.values()) if (node.kind === kind && !node.depleted) n++;
  return n;
}

function nearBuilding(w: World, tx: number, ty: number): boolean {
  for (let y = ty - BUILDING_BUFFER; y <= ty + BUILDING_BUFFER; y++) {
    for (let x = tx - BUILDING_BUFFER; x <= tx + BUILDING_BUFFER; x++) {
      if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
      if (w.buildingAt[idx(w, x, y)] >= 0) return true;
    }
  }
  return false;
}

/** A random existing node of this kind, to spread outward from. */
function randomSeedNode(w: World, kind: NodeKind, rng: RNG) {
  const matches: { tx: number; ty: number }[] = [];
  for (const n of w.nodes.values()) {
    if (n.kind === kind && !n.depleted) matches.push({ tx: n.tx, ty: n.ty });
  }
  if (!matches.length) return null;
  return matches[rng.int(0, matches.length)];
}

function hasNeighbourOfKind(w: World, tx: number, ty: number, kind: NodeKind): boolean {
  for (let y = ty - 2; y <= ty + 2; y++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
      const id = w.nodeAt[idx(w, x, y)];
      if (id < 0) continue;
      const n = w.nodes.get(id);
      if (n && n.kind === kind && !n.depleted) return true;
    }
  }
  return false;
}

/**
 * One pass of natural growth. Called on the slow event tick, so the map
 * refills over game days rather than minutes.
 */
export function naturalGrowth(w: World, rng: RNG) {
  const camp = w.campCenter;

  for (const rule of RULES) {
    const target = w.wildTargets?.[rule.kind] ?? rule.target;
    if (target <= 0) continue;
    const have = countKind(w, rule.kind);
    if (have >= target) continue;
    // The further below target, the more eagerly it comes back.
    const pressure = 1 - have / target;
    const attempts = Math.max(1, Math.round(rule.attempts * pressure));

    // Growth spreads outward from what is already there rather than landing at
    // random on a map that is mostly occupied — which is both far more
    // efficient and how a treeline actually creeps back.
    const seed = rule.clusters ? randomSeedNode(w, rule.kind, rng) : null;

    for (let a = 0; a < attempts; a++) {
      let tx: number;
      let ty: number;
      if (seed) {
        const from = randomSeedNode(w, rule.kind, rng) ?? seed;
        tx = from.tx + rng.int(-3, 4);
        ty = from.ty + rng.int(-3, 4);
      } else {
        tx = rollInt(w, 1, w.width - 1);
        ty = rollInt(w, 1, w.height - 1);
      }
      if (tx < 1 || ty < 1 || tx >= w.width - 1 || ty >= w.height - 1) continue;
      const i = idx(w, tx, ty);

      if (w.nodeAt[i] >= 0 || w.buildingAt[i] >= 0) continue;
      if (rule.terrain.indexOf(w.terrain[i] as Terrain) < 0) continue;
      if (Math.hypot(tx - camp.tx, ty - camp.ty) < rule.minCampDistance) continue;
      if (nearBuilding(w, tx, ty)) continue;

      addNode(w, rule.kind, tx, ty, rng);
    }
  }
}

/** Record what the freshly generated map holds, as the regrowth ceiling. */
export function captureWildTargets(w: World) {
  const targets: Record<string, number> = {};
  for (const rule of RULES) targets[rule.kind] = countKind(w, rule.kind);
  w.wildTargets = targets;
}

/** Totals the UI can show so the player can see the land recovering. */
export function wildernessCensus(w: World) {
  let trees = 0;
  let rocks = 0;
  let forage = 0;
  for (const n of w.nodes.values()) {
    if (n.depleted) continue;
    if (n.kind === 'tree' || n.kind === 'pine' || n.kind === 'deadTree') trees++;
    else if (n.kind === 'rock') rocks++;
    else if (n.kind === 'berryBush' || n.kind === 'herbPatch' || n.kind === 'reeds') forage++;
  }
  return { trees, rocks, forage, animals: w.animals.filter((a) => a.state !== 'dead').length };
}
