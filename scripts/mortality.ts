/**
 * Mortality balance.
 *
 * The design rule is: running out of health means collapsing, not dying.
 * A collapsed survivor is usually saved — but not always, so the stakes are
 * real. This measures both halves of that.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';
import { injure } from '../src/game/sim/medical';
import type { World } from '../src/game/core/types';

const seeds = [11, 22, 33, 44, 55, 66];
let collapsed = 0;
let killedOutright = 0;
let diedAfterCollapse = 0;
let survivedCollapse = 0;
let otherDeaths = 0;

function run(world: World, days: number, ctx: { pf: PathFinder; fx: Fx }) {
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 7200; i++) stepWorld(world, SIM_STEP, ctx);
  }
}

for (const seed of seeds) {
  const world = createWorld(seed);
  const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };
  run(world, 3, ctx);

  // Three survivors take wounds far past what they can absorb.
  const victims = world.characters.filter((c) => c.alive).slice(0, 3);
  for (const v of victims) {
    for (let k = 0; k < 6; k++) injure(world, v, 'gash', 1, 'a catastrophe', ctx.fx);
  }
  // The collapse is applied by injure() itself, immediately.
  const downedNow = victims.filter((v) => v.alive && v.criticalSince >= 0);
  const deadNow = victims.filter((v) => !v.alive);
  collapsed += downedNow.length;
  killedOutright += deadNow.length;

  const wereDown = new Set(downedNow.map((v) => v.id));
  run(world, 12, ctx);

  for (const v of victims) {
    if (!wereDown.has(v.id)) continue;
    if (v.alive) survivedCollapse++;
    else diedAfterCollapse++;
  }
  otherDeaths += world.characters.filter(
    (c) => !c.alive && !victims.some((v) => v.id === c.id)
  ).length;

  const alive = world.characters.filter((c) => c.alive).length;
  console.log(
    `seed ${String(seed).padStart(3)} — ${downedNow.length}/3 collapsed, ` +
      `${deadNow.length} killed outright, ${alive} alive after two more weeks`
  );
}

/* -------- and the risk has to be real -------- */
// With nobody left to treat them, a collapsed survivor should eventually die.
let lonelyDeaths = 0;
const lonelyRuns = 8;
for (let i = 0; i < lonelyRuns; i++) {
  const world = createWorld(700 + i);
  const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };
  // Strip the camp down to one person, so no help is coming.
  const lone = world.characters[0];
  world.characters = [lone];
  world.stock.medicine = 0;
  for (let k = 0; k < 6; k++) injure(world, lone, 'gash', 1, 'a catastrophe', ctx.fx);
  run(world, 6, ctx);
  if (!lone.alive) lonelyDeaths++;
}
console.log(
  `
left untreated with nobody to help: ${lonelyDeaths}/${lonelyRuns} died within six days`
);

const total = seeds.length * 3;
console.log(
  `\n${total} survivors pushed past zero health:\n` +
    `  collapsed instead of dying: ${collapsed}\n` +
    `  killed outright:            ${killedOutright}\n` +
    `  pulled through afterwards:  ${survivedCollapse}\n` +
    `  died while critical:        ${diedAfterCollapse}\n` +
    `  unrelated deaths:           ${otherDeaths}`
);

const fails: string[] = [];
// Nobody should ever die the instant their health runs out.
if (killedOutright > 0) fails.push('someone was killed outright instead of collapsing');
if (collapsed !== total) fails.push('not everyone who ran out of health collapsed');
// Most collapses should be survived, but the risk must be real.
if (survivedCollapse < collapsed * 0.5) fails.push('too few pull through');
if (otherDeaths > seeds.length) fails.push('too many unrelated deaths');
// Permadeath has to still mean something.
if (lonelyDeaths === 0) fails.push('an untreated collapse is never fatal');

console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nMORTALITY BALANCE OK');
process.exit(fails.length ? 1 : 0);
