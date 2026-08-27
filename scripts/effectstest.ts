/**
 * Status effects have to be reachable and have to bite. This drives each of
 * the new ones into existence and checks it actually changes the numbers.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';
import { EFFECTS } from '../src/game/data/effects';
import { applyEffect, hasEffect } from '../src/game/sim/effects';
import { workSpeed } from '../src/game/sim/modifiers';

const world = createWorld(88);
const ctx = { pf: new PathFinder(world.width, world.height), fx: new Fx() };
const fails: string[] = [];
const run = (steps: number) => {
  for (let i = 0; i < steps; i++) stepWorld(world, SIM_STEP, ctx);
};
run(600);

// Each timed effect measurably changes how much work someone gets done.
const subject = world.characters[0];
for (const def of EFFECTS) {
  if (def.conditional) continue;
  if (!def.workSpeed) continue;
  subject.effects = [];
  const before = workSpeed(subject, 'construction');
  applyEffect(world, subject, def.id, 6);
  const after = workSpeed(subject, 'construction');
  const changed = Math.abs(after - before) > 1e-6;
  console.log(
    `${def.label.padEnd(18)} work ${before.toFixed(2)} -> ${after.toFixed(2)} ` +
      `${changed ? '' : '  <-- no effect'}`
  );
  if (!changed) fails.push(`${def.id} does not change work speed`);
}
subject.effects = [];

// Misery drives the conditional mind effects.
const victim = world.characters[1];
victim.morale = 8;
run(120);
if (!hasEffect(victim, 'breakingDown')) fails.push('very low morale does not cause a breakdown');
console.log(`\nmorale 8  -> ${victim.effects.map((e) => e.id).join(', ')}`);

victim.morale = 20;
run(120);
if (!hasEffect(victim, 'despair')) fails.push('low morale does not cause despair');
console.log(`morale 20 -> ${victim.effects.map((e) => e.id).join(', ')}`);

// Someone breaking down stops working.
victim.morale = 5;
run(400);
const working = victim.state === 'working';
if (working) fails.push('a survivor breaking down kept working');
console.log(`breaking down -> state "${victim.state}", job ${victim.jobId}`);

// Running the stores dry of water leaves people parched. The camp refills its
// own water, so hold the stores empty while we check.
const drinker = world.characters[2];
for (let i = 0; i < 400; i++) {
  world.stock.water = 0;
  stepWorld(world, SIM_STEP, ctx);
}
if (!hasEffect(drinker, 'parched')) fails.push('no water does not make anyone parched');
console.log(`no water   -> ${drinker.effects.map((e) => e.id).join(', ')}`);

console.log('');
console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'EFFECTS OK');
process.exit(fails.length ? 1 : 0);
