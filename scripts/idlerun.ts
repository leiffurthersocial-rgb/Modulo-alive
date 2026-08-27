import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';
import { dayNumber } from '../src/game/sim/time';

/** How the camp fares with zero player input — the baseline difficulty curve. */
const seed = Number(process.argv[2] ?? 7);
const world = createWorld(seed);
const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };
for (let day = 1; day <= 12; day++) {
  for (let i = 0; i < 7200; i++) stepWorld(world, SIM_STEP, ctx);
  const alive = world.characters.filter((c) => c.alive);
  const avg = (f: (c: any) => number) =>
    alive.length ? Math.round(alive.reduce((s, c) => s + f(c), 0) / alive.length) : 0;
  console.log(
    `seed ${seed} day ${String(dayNumber(world.time.minutes)).padStart(2)} ` +
      `alive ${alive.length} food ${Math.round(world.stock.food)}/${Math.round(world.stock.rawFood)} ` +
      `wood ${Math.round(world.stock.wood)} built ${world.stats.builtCount} felled ${world.stats.treesFelled} ` +
      `| hun ${avg((c) => c.hunger)} en ${avg((c) => c.energy)} mor ${avg((c) => c.morale)} str ${avg((c) => c.stress)} ` +
      `hp ${avg((c) => c.health)}`
  );
}
