/** The land has to refill, or a long game strips the map and stalls. */
import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';

const world = createWorld(4242);
const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };
const count = (kinds: string[]) =>
  [...world.nodes.values()].filter((n) => kinds.includes(n.kind) && !n.depleted).length;

// Strip a wide belt of forest and rock, as a long game would.
let removed = 0;
for (const n of [...world.nodes.values()]) {
  const d = Math.hypot(n.tx - world.campCenter.tx, n.ty - world.campCenter.ty);
  if (d > 16 && d < 44) {
    world.nodes.delete(n.id);
    world.nodeAt[n.ty * world.width + n.tx] = -1;
    removed++;
  }
}
const t0 = count(['tree', 'pine']);
const r0 = count(['rock']);
const f0 = count(['berryBush', 'herbPatch', 'reeds']);
const a0 = world.animals.filter((a) => a.state !== 'dead').length;
for (const a of world.animals) a.state = 'dead';
console.log(`stripped ${removed} nodes — trees ${t0}, rocks ${r0}, forage ${f0}`);

// Twenty game days of recovery.
for (let d = 0; d < 20; d++) for (let i = 0; i < 7200; i++) stepWorld(world, SIM_STEP, ctx);

const t1 = count(['tree', 'pine']);
const r1 = count(['rock']);
const f1 = count(['berryBush', 'herbPatch', 'reeds']);
const a1 = world.animals.filter((a) => a.state !== 'dead').length;
console.log(`after 20 days   — trees ${t1}, rocks ${r1}, forage ${f1}, animals ${a0} -> ${a1}`);

const fails: string[] = [];
if (t1 <= t0) fails.push('forest did not regrow');
if (r1 <= r0) fails.push('rock did not reappear');
if (f1 <= f0) fails.push('forage did not regrow');
if (a1 < 8) fails.push('wildlife did not repopulate');
console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'REGROWTH OK');
process.exit(fails.length ? 1 : 0);
