/**
 * Headless simulation harness.
 *
 * Runs the world without a browser so the core loop can be exercised in CI:
 * it fast-forwards several in-game days and asserts that survivors actually
 * move, work, eat, sleep, build and gather.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { SIM_STEP, stepWorld } from '../src/game/sim/simulation';
import { PathFinder } from '../src/game/core/pathfinding';
import { Fx } from '../src/game/sim/fx';
import { canPlace, log, placeBuilding, storedTotal } from '../src/game/sim/world';
import { RNG } from '../src/game/core/rng';
import { deserialize, serialize } from '../src/game/sim/save';
import { dayNumber, formatTime } from '../src/game/sim/time';
import { startExpedition } from '../src/game/sim/exploration';
import { injure } from '../src/game/sim/medical';
import type { World } from '../src/game/core/types';

const seed = Number(process.argv[2] ?? 424242);
const days = Number(process.argv[3] ?? 6);

const world = createWorld(seed);
const pf = new PathFinder(world.width, world.height);
const fx = new Fx();
const ctx = { pf, fx };

const startPositions = world.characters.map((c) => ({ x: c.x, y: c.y }));

function run(w: World, simSeconds: number) {
  const steps = Math.round(simSeconds / SIM_STEP);
  for (let i = 0; i < steps; i++) {
    stepWorld(w, SIM_STEP, ctx);
    fx.update(SIM_STEP);
  }
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

console.log(`Modulo:Alive headless simulation — seed ${seed}, ${days} game days\n`);
console.log(
  `world ${world.width}x${world.height}, ${world.nodes.size} resource nodes, ` +
    `${world.sites.length} exploration sites, ${world.characters.length} survivors`
);

/* -------- 1. warm-up: characters should start doing things -------- */
run(world, 60); // two game hours

const moved = world.characters.filter(
  (c, i) => Math.hypot(c.x - startPositions[i].x, c.y - startPositions[i].y) > 12
).length;
check('survivors physically move', moved >= 4, `${moved}/8 moved`);
check('jobs are being generated', world.jobs.size > 0, `${world.jobs.size} jobs`);

/* -------- 2. queue construction the player would order -------- */
const rng = new RNG(seed ^ 99);
const cc = world.campCenter;
let placed = 0;
const wanted: [string, number, number][] = [
  ['bedroll', cc.tx + 4, cc.ty + 3],
  ['bedroll', cc.tx + 6, cc.ty + 3],
  ['stockpile', cc.tx - 7, cc.ty - 3],
  ['farmPlot', cc.tx - 4, cc.ty + 4],
];
for (const [def, tx, ty] of wanted) {
  if (canPlace(world, def, tx, ty).ok) {
    placeBuilding(world, def, tx, ty, false, rng);
    placed++;
  }
}
check('blueprints can be placed on cleared ground', placed >= 3, `${placed}/4 placed`);

/* -------- 3. mark some trees for clearing -------- */
let marked = 0;
for (const n of world.nodes.values()) {
  if (n.kind !== 'tree' && n.kind !== 'pine') continue;
  const d = Math.hypot(n.tx - cc.tx, n.ty - cc.ty);
  if (d > 9 && d < 13) {
    n.marked = true;
    marked++;
    if (marked >= 10) break;
  }
}
check('trees can be marked for clearing', marked >= 5, `${marked} marked`);

/* -------- 4. send someone exploring -------- */
const explorer = world.characters.find((c) => c.alive && c.energy > 50);
const site = world.sites.find((s) => s.discovered);
if (explorer && site) startExpedition(world, explorer, site);
check('an expedition can be started', !!explorer?.expedition);

/* -------- 5. long run -------- */
const before = {
  wood: world.stock.wood,
  built: world.stats.builtCount,
  felled: world.stats.treesFelled,
  meals: world.stats.mealsCooked,
  explorations: world.stats.explorations,
};

const simSecondsPerDay = 1440 / 2; // 720 sim-seconds per game day
const t0 = Date.now();
run(world, simSecondsPerDay * days);
const elapsed = Date.now() - t0;

console.log(
  `\nafter ${days} days (${formatTime(world.time.minutes)}, day ${dayNumber(world.time.minutes)}) ` +
    `— simulated in ${elapsed}ms\n`
);

check('trees are actually felled', world.stats.treesFelled > before.felled, `${world.stats.treesFelled} total`);
check('wood is gathered and stored', world.stock.wood > 0, `${Math.round(world.stock.wood)} wood`);
check('buildings get completed', world.stats.builtCount > before.built, `${world.stats.builtCount} built`);
check('food is cooked', world.stats.mealsCooked > before.meals, `${world.stats.mealsCooked} meals`);
check(
  'expedition resolved',
  world.stats.explorations > before.explorations,
  `${world.stats.explorations} expeditions`
);
check('farm produced or is growing', hasCrops(world), cropSummary(world));
check('events fire', world.log.length > 3, `${world.log.length} log entries`);

const alive = world.characters.filter((c) => c.alive);
check('most survivors are alive', alive.length >= 6, `${alive.length}/${world.characters.length}`);
const fed = alive.filter((c) => c.hunger < 90).length;
check('survivors are eating', fed >= alive.length - 1, `${fed} not starving`);
const slept = alive.filter((c) => c.lastSleepAt > 0).length;
check('survivors sleep', slept >= alive.length - 2, `${slept} have slept`);
const skilled = alive.filter((c) =>
  Object.values(c.skills).some((s) => s.xp > 0 || s.level > 0)
).length;
check('skills progress', skilled >= alive.length - 1, `${skilled} gained experience`);

const idleForever = alive.filter((c) => c.activity === 'idle' && !c.moving).length;
check('nobody is frozen', idleForever <= alive.length / 2, `${idleForever} idle at this instant`);

/* -------- 6. injuries and permadeath -------- */
const victim = alive[0] ?? world.characters[0];
injure(world, victim, 'gash', 0.9, 'a test wound', fx);
check('injuries are applied', victim.injuries.length > 0, `${victim.injuries.length} injuries`);
victim.health = 1;
victim.hunger = 100;
run(world, 200);
check(
  'severe harm can kill (permadeath)',
  !victim.alive || victim.health < victim.maxHealth,
  victim.alive ? `${victim.name} survived at ${Math.round(victim.health)} hp` : `${victim.name} died`
);

/* -------- 7. save / load round trip -------- */
const payload = JSON.parse(JSON.stringify(serialize(world)));
const restored = deserialize(payload);
check('save round trip keeps time', Math.abs(restored.time.minutes - world.time.minutes) < 0.01);
check('save round trip keeps survivors', restored.characters.length === world.characters.length);
check('save round trip keeps buildings', restored.buildings.size === world.buildings.size);
check('save round trip keeps nodes', restored.nodes.size === world.nodes.size);
check(
  'save round trip keeps stock',
  Math.abs(storedTotal(restored) - storedTotal(world)) < 0.01,
  `${Math.round(storedTotal(world))} units`
);

const pf2 = new PathFinder(restored.width, restored.height);
const ctx2 = { pf: pf2, fx: new Fx() };
let crashed = '';
try {
  for (let i = 0; i < 2000; i++) stepWorld(restored, SIM_STEP, ctx2);
} catch (err) {
  crashed = String(err);
}
check('loaded world keeps simulating', !crashed, crashed || 'ran 200 more sim-seconds');

/* -------- 8. extended stability -------- */
let longCrash = '';
const t1 = Date.now();
try {
  run(world, simSecondsPerDay * 10);
} catch (err) {
  longCrash = String(err);
}
check(
  'stable over a long game',
  !longCrash,
  longCrash || `day ${dayNumber(world.time.minutes)} reached in ${Date.now() - t1}ms`
);
check('job list does not run away', world.jobs.size < 200, `${world.jobs.size} jobs`);

console.log('\n--- settlement report ---');
console.log(`day ${dayNumber(world.time.minutes)} ${formatTime(world.time.minutes)}`);
console.log(`level ${world.progression.level}, walls unlocked: ${world.progression.wallsUnlocked}`);
console.log(
  `stock: ` +
    Object.entries(world.stock)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k} ${Math.round(v as number)}`)
      .join(', ')
);
console.log(
  `buildings: ${[...world.buildings.values()].filter((b) => b.state === 'built').length} built, ` +
    `${[...world.buildings.values()].filter((b) => b.state === 'blueprint').length} under construction`
);
console.log(`trees felled: ${world.stats.treesFelled}, harvests: ${world.stats.harvested}`);
for (const c of world.characters) {
  console.log(
    `  ${c.alive ? ' ' : '†'} ${c.name.padEnd(9)} ` +
      `hp ${String(Math.round(c.health)).padStart(3)} ` +
      `hun ${String(Math.round(c.hunger)).padStart(3)} ` +
      `en ${String(Math.round(c.energy)).padStart(3)} ` +
      `mor ${String(Math.round(c.morale)).padStart(3)} ` +
      `str ${String(Math.round(c.stress)).padStart(3)} ` +
      `[${c.activity}] traits: ${c.traits.join(', ')}`
  );
}

console.log(
  `\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED: ${failures.join(', ')}`}`
);
process.exit(failures.length === 0 ? 0 : 1);

function hasCrops(w: World) {
  for (const b of w.buildings.values()) {
    if (!b.farm) continue;
    if (b.farm.some((c) => c.crop !== null)) return true;
  }
  return w.stats.harvested > 0;
}

function cropSummary(w: World) {
  let planted = 0;
  let ripe = 0;
  for (const b of w.buildings.values()) {
    if (!b.farm) continue;
    for (const c of b.farm) {
      if (c.crop) planted++;
      if (c.crop && c.growth >= 1) ripe++;
    }
  }
  return `${planted} planted, ${ripe} ripe, ${w.stats.harvested} harvested`;
}
