/**
 * Fiber has to be gettable.
 *
 * It goes into beds, bandages, hats and vests, so a camp that cannot keep a
 * stock of it stalls. This measures how much a hands-off camp accumulates,
 * and how far it has to walk to find any.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';
import { TILE } from '../src/game/core/types';

const seeds = [7, 42, 1234, 999];
let worstNearest = 0;
let lowestStock = Infinity;

for (const seed of seeds) {
  const world = createWorld(seed);
  const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };

  // How far is the closest fiber source to the fire on day one?
  let nearest = Infinity;
  let sources = 0;
  for (const n of world.nodes.values()) {
    if (n.kind !== 'nettles' && n.kind !== 'reeds') continue;
    sources++;
    const d = Math.hypot(n.tx - world.campCenter.tx, n.ty - world.campCenter.ty);
    nearest = Math.min(nearest, d);
  }
  worstNearest = Math.max(worstNearest, nearest);

  const start = world.stock.fiber;
  const marks: number[] = [];
  for (let day = 1; day <= 12; day++) {
    for (let i = 0; i < 7200; i++) stepWorld(world, SIM_STEP, ctx);
    marks.push(Math.round(world.stock.fiber));
  }
  const low = Math.min(...marks.slice(2));
  lowestStock = Math.min(lowestStock, low);

  console.log(
    `seed ${String(seed).padStart(4)} — ${sources} fiber patches, nearest ${nearest.toFixed(0)} tiles; ` +
      `fiber ${start} -> ${marks.join(' ')}`
  );
}

console.log(
  `\nworst case: nearest fiber ${worstNearest.toFixed(0)} tiles from camp, ` +
    `lowest sustained stock ${lowestStock}`
);

const fails: string[] = [];
if (worstNearest > 14) fails.push('nearest fiber is too far from camp');
if (lowestStock < 25) fails.push('camps still run dry of fiber');
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'FIBER SUPPLY OK');
process.exit(fails.length ? 1 : 0);
