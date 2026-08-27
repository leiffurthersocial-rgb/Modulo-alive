import {
  TILE,
  Terrain,
  emptyStockpile,
  type ExplorationSite,
  type SiteKind,
  type World,
} from '../core/types';
import { RNG, fbm, makeNoise2D } from '../core/rng';
import { STARTING_SURVIVORS } from '../data/survivors';
import { createCharacter } from './characterFactory';
import {
  addNode,
  idx,
  log,
  placeBuilding,
  recomputeAllBlocked,
  tileToWorldX,
  tileToWorldY,
} from './world';
import { clamp } from '../core/util';

export const WORLD_W = 112;
export const WORLD_H = 86;
export const SAVE_VERSION = 1;

const SITE_NAMES: Record<SiteKind, string[]> = {
  berryGrove: ['Berry Hollow', 'The Bramble', 'Sweetbriar Glade'],
  oldCamp: ['Abandoned Camp', 'Cold Firepit', 'Someone Else’s Camp'],
  cabin: ['Collapsed Cabin', 'The Trapper’s Hut', 'Mossy Cabin'],
  cave: ['Low Cave', 'Split Rock', 'The Undercut'],
  huntingGround: ['Deer Trail', 'The Game Path', 'Quiet Meadow'],
  wreck: ['Rusted Truck', 'The Old Van', 'Wreck in the Ferns'],
  ruin: ['Fallen Wall', 'Overgrown Foundations', 'The Stone Ring'],
  supplies: ['Dropped Crates', 'Buried Cache', 'Scattered Packs'],
  unknown: ['Something Out There', 'Unmarked Place', 'The Far Treeline'],
};

const SITE_KINDS: SiteKind[] = [
  'berryGrove',
  'oldCamp',
  'cabin',
  'cave',
  'huntingGround',
  'wreck',
  'ruin',
  'supplies',
  'unknown',
];

export function createWorld(seed = Math.floor(Math.random() * 0xffffffff)): World {
  const rng = new RNG(seed);
  const width = WORLD_W;
  const height = WORLD_H;
  const n = width * height;

  const w: World = {
    version: SAVE_VERSION,
    seed,
    width,
    height,
    terrain: new Uint8Array(n),
    nodeAt: new Int32Array(n).fill(-1),
    buildingAt: new Int32Array(n).fill(-1),
    blocked: new Uint8Array(n),
    nodes: new Map(),
    buildings: new Map(),
    characters: [],
    jobs: new Map(),
    sites: [],
    stock: emptyStockpile(),
    gear: {},
    log: [],
    time: { t: 0, minutes: 7 * 60 },
    weather: { kind: 'clear', t: 600, intensity: 0 },
    progression: { level: 1, wallsUnlocked: false },
    campCenter: { tx: Math.floor(width / 2), ty: Math.floor(height / 2) },
    nextNodeId: 1,
    nextBuildingId: 1,
    nextJobId: 1,
    nextLogId: 1,
    nextInjuryId: 1,
    rngState: (seed ^ 0x5bf03635) >>> 0 || 1,
    acc: { needs: 0, ai: 0, jobs: 0, events: 0, social: 0, growth: 0, autosave: 0 },
    stats: {
      daysSurvived: 0,
      treesFelled: 0,
      builtCount: 0,
      mealsCooked: 0,
      deaths: 0,
      explorations: 0,
      harvested: 0,
    },
  };

  generateTerrain(w, rng);
  const camp = w.campCenter;
  carveClearing(w, camp.tx, camp.ty, 8.5, rng);
  scatterVegetation(w, rng);
  placeStartingCamp(w, rng);
  placeSites(w, rng);
  spawnSurvivors(w, rng);
  recomputeAllBlocked(w);

  w.stock.wood = 30;
  w.stock.stone = 12;
  w.stock.food = 54;
  w.stock.rawFood = 20;
  w.stock.fiber = 16;
  w.stock.water = 20;
  w.stock.herbs = 4;
  w.stock.medicine = 3;
  w.stock.seeds = 12;

  log(
    w,
    'story',
    'Day One',
    'Eight of you, a fire that keeps going out, and a forest that does not end. Make the camp sustainable.',
    []
  );
  return w;
}

/* ------------------------------------------------------------------ */

function generateTerrain(w: World, rng: RNG) {
  const noise = makeNoise2D(rng.int(1, 1 << 30));
  const noise2 = makeNoise2D(rng.int(1, 1 << 30));
  const streamPhase = rng.range(0, 6.28);
  const streamX = rng.range(0.14, 0.24) * w.width;

  for (let ty = 0; ty < w.height; ty++) {
    for (let tx = 0; tx < w.width; tx++) {
      const i = idx(w, tx, ty);
      const v = fbm(noise, tx * 0.035, ty * 0.035, 4);
      const g = fbm(noise2, tx * 0.09, ty * 0.09, 3);
      let t = Terrain.Grass;
      if (v > 0.6) t = Terrain.DarkGrass;
      else if (v < 0.36) t = g > 0.55 ? Terrain.Dirt : Terrain.Grass;
      if (v > 0.72 && g > 0.62) t = Terrain.Stone;
      w.terrain[i] = t;
    }
  }

  // A stream running roughly north-south on one side of the map.
  for (let ty = 0; ty < w.height; ty++) {
    const cx =
      streamX +
      Math.sin(ty * 0.09 + streamPhase) * 6 +
      Math.sin(ty * 0.031 + streamPhase * 2) * 9;
    const halfWidth = 1.2 + Math.sin(ty * 0.17) * 0.5;
    for (let dx = -4; dx <= 4; dx++) {
      const tx = Math.round(cx + dx);
      if (tx < 0 || tx >= w.width) continue;
      const i = idx(w, tx, ty);
      const d = Math.abs(dx);
      if (d <= halfWidth) w.terrain[i] = Terrain.Water;
      else if (d <= halfWidth + 1.2) w.terrain[i] = Terrain.Sand;
    }
  }

  // A rocky outcrop area, so stone is a place you go rather than a number.
  const rx = Math.floor(w.width * rng.range(0.68, 0.82));
  const ry = Math.floor(w.height * rng.range(0.2, 0.8));
  for (let ty = ry - 7; ty <= ry + 7; ty++) {
    for (let tx = rx - 8; tx <= rx + 8; tx++) {
      if (tx < 0 || ty < 0 || tx >= w.width || ty >= w.height) continue;
      const d = Math.hypot(tx - rx, ty - ry) / 8;
      if (d < 1 && rng.chance(1 - d)) w.terrain[idx(w, tx, ty)] = Terrain.Stone;
    }
  }
}

function carveClearing(w: World, cx: number, cy: number, r: number, rng: RNG) {
  for (let ty = Math.floor(cy - r - 2); ty <= cy + r + 2; ty++) {
    for (let tx = Math.floor(cx - r - 2); tx <= cx + r + 2; tx++) {
      if (tx < 0 || ty < 0 || tx >= w.width || ty >= w.height) continue;
      const d = Math.hypot(tx - cx, ty - cy);
      if (d > r + rng.range(-1, 1.5)) continue;
      const i = idx(w, tx, ty);
      if (w.terrain[i] === Terrain.Water) continue;
      w.terrain[i] = d < r * 0.55 ? Terrain.Dirt : Terrain.Grass;
    }
  }
}

function scatterVegetation(w: World, rng: RNG) {
  const noise = makeNoise2D(rng.int(1, 1 << 30));
  const camp = w.campCenter;

  for (let ty = 0; ty < w.height; ty++) {
    for (let tx = 0; tx < w.width; tx++) {
      const i = idx(w, tx, ty);
      const t = w.terrain[i];
      if (t === Terrain.Water || t === Terrain.Sand) {
        // Reeds along the banks.
        if (t === Terrain.Sand && rng.chance(0.07)) addNode(w, 'reeds', tx, ty, rng);
        continue;
      }
      const dCamp = Math.hypot(tx - camp.tx, ty - camp.ty);
      if (dCamp < 7.5) continue;

      // Density ramps up away from the camp, modulated by noise so the forest
      // has thickets and small natural clearings.
      const density = fbm(noise, tx * 0.055, ty * 0.055, 4);
      const rampe = clamp((dCamp - 7.5) / 8, 0, 1);
      const treeChance = (0.07 + density * 0.66) * rampe;

      if (t === Terrain.Stone) {
        if (rng.chance(0.16)) addNode(w, 'rock', tx, ty, rng);
        else if (rng.chance(0.05 * rampe)) addNode(w, 'pine', tx, ty, rng);
        continue;
      }

      if (rng.chance(treeChance)) {
        const kind = density > 0.58 ? (rng.chance(0.5) ? 'pine' : 'tree') : 'tree';
        addNode(w, kind, tx, ty, rng);
      } else if (rng.chance(0.012 * rampe)) {
        addNode(w, 'deadTree', tx, ty, rng);
      } else if (rng.chance(0.009 + 0.01 * (1 - rampe))) {
        addNode(w, 'berryBush', tx, ty, rng);
      } else if (rng.chance(0.006)) {
        addNode(w, 'herbPatch', tx, ty, rng);
      } else if (rng.chance(0.008)) {
        addNode(w, 'rock', tx, ty, rng);
      } else if (rng.chance(0.006 * rampe)) {
        addNode(w, 'log', tx, ty, rng);
      }
    }
  }

  // The camp must always start within reach of food and stone, whatever the
  // forest generated. Existing trees give way so these read as small glades.
  seedNearCamp(w, rng, 'berryBush', 14, 6, 18);
  seedNearCamp(w, rng, 'herbPatch', 5, 7, 18);
  seedNearCamp(w, rng, 'rock', 12, 6, 20);
}

function seedNearCamp(
  w: World,
  rng: RNG,
  kind: 'berryBush' | 'herbPatch' | 'rock',
  count: number,
  rMin: number,
  rMax: number
) {
  const camp = w.campCenter;
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < 4000) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(rMin, rMax);
    const tx = Math.round(camp.tx + Math.cos(a) * r);
    const ty = Math.round(camp.ty + Math.sin(a) * r);
    if (tx < 1 || ty < 1 || tx >= w.width - 1 || ty >= w.height - 1) continue;
    const i = idx(w, tx, ty);
    if (w.terrain[i] === Terrain.Water || w.buildingAt[i] >= 0) continue;
    const existing = w.nodeAt[i];
    if (existing >= 0) {
      const n = w.nodes.get(existing);
      if (!n) continue;
      // Only clear trees, and only sometimes, so the forest stays dense.
      if (n.kind !== 'tree' && n.kind !== 'pine') continue;
      if (!rng.chance(0.5)) continue;
      w.nodes.delete(existing);
      w.nodeAt[i] = -1;
    }
    if (addNode(w, kind, tx, ty, rng)) placed++;
  }
}

function placeStartingCamp(w: World, rng: RNG) {
  const { tx: cx, ty: cy } = w.campCenter;
  placeBuilding(w, 'campfire', cx - 1, cy - 1, true, rng);
  placeBuilding(w, 'stockpile', cx + 3, cy - 1, true, rng);
  placeBuilding(w, 'workbench', cx - 5, cy + 1, true, rng);
  // Three bedrolls: the camp starts short of beds on purpose.
  placeBuilding(w, 'bedroll', cx - 4, cy - 4, true, rng);
  placeBuilding(w, 'bedroll', cx - 2, cy - 5, true, rng);
  placeBuilding(w, 'bedroll', cx + 1, cy - 5, true, rng);
}

function placeSites(w: World, rng: RNG) {
  const camp = w.campCenter;
  const count = 11;
  let id = 1;
  let guard = 0;
  while (w.sites.length < count && guard++ < 3000) {
    const a = rng.range(0, Math.PI * 2);
    const ring = w.sites.length / count;
    const r = rng.range(16 + ring * 12, 24 + ring * 16);
    const tx = Math.round(camp.tx + Math.cos(a) * r);
    const ty = Math.round(camp.ty + Math.sin(a) * r * 0.85);
    if (tx < 3 || ty < 3 || tx >= w.width - 3 || ty >= w.height - 3) continue;
    const i = idx(w, tx, ty);
    if (w.terrain[i] === Terrain.Water) continue;
    // Keep sites apart.
    let tooClose = false;
    for (const s of w.sites) {
      if (Math.hypot(s.tx - tx, s.ty - ty) < 9) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const kind = rng.pick(SITE_KINDS);
    const distance = Math.hypot(tx - camp.tx, ty - camp.ty);
    const site: ExplorationSite = {
      id: id++,
      kind,
      tx,
      ty,
      discovered: distance < 21,
      explored: 0,
      depleted: false,
      danger: clamp(0.06 + (distance - 14) / 90, 0.04, 0.55),
      distance,
      name: rng.pick(SITE_NAMES[kind]),
    };
    // Clear a small pocket around the site so it is reachable and visible.
    for (let y = ty - 2; y <= ty + 2; y++) {
      for (let x = tx - 2; x <= tx + 2; x++) {
        if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        if (Math.hypot(x - tx, y - ty) > 2.2) continue;
        const ii = idx(w, x, y);
        const nId = w.nodeAt[ii];
        if (nId >= 0) {
          const nd = w.nodes.get(nId);
          if (nd) {
            w.nodes.delete(nId);
            w.nodeAt[ii] = -1;
          }
        }
        if (w.terrain[ii] !== Terrain.Water) w.terrain[ii] = Terrain.Dirt;
      }
    }
    w.sites.push(site);
  }
}

function spawnSurvivors(w: World, rng: RNG) {
  const camp = w.campCenter;
  STARTING_SURVIVORS.forEach((tpl, i) => {
    const a = (i / STARTING_SURVIVORS.length) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = rng.range(2.4, 4.6);
    const x = tileToWorldX(camp.tx) + Math.cos(a) * r * TILE;
    const y = tileToWorldY(camp.ty) + Math.sin(a) * r * TILE;
    const c = createCharacter(
      { id: i, name: tpl.name, appearance: tpl.appearance, x, y },
      tpl,
      rng
    );
    w.characters.push(c);
  });

  // Seed starting relationships: people who have been through something
  // together, with a couple of stronger bonds and one friction point.
  for (const a of w.characters) {
    for (const b of w.characters) {
      if (a.id === b.id) continue;
      if (a.relationships[b.id] !== undefined) continue;
      const v = Math.round(rng.range(28, 62));
      a.relationships[b.id] = v;
      b.relationships[a.id] = clamp(v + Math.round(rng.range(-8, 8)), 0, 100);
    }
  }
  const pairs = rng.sample(w.characters, 4);
  if (pairs.length >= 4) {
    pairs[0].relationships[pairs[1].id] = 78;
    pairs[1].relationships[pairs[0].id] = 76;
    pairs[2].relationships[pairs[3].id] = 18;
    pairs[3].relationships[pairs[2].id] = 15;
  }
}
