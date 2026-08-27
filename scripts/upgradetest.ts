/**
 * The settlement is meant to improve what it has, not carpet the map.
 * Upper tiers must be unreachable except by upgrading the tier below.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { BUILDINGS, buildingDef } from '../src/game/data/buildings';
import { canBuildDirectly, upgradeSourceOf } from '../src/game/sim/progression';
import { canPlace, countBuildings, placeBuilding } from '../src/game/sim/world';
import { RNG } from '../src/game/core/rng';

const w = createWorld(31);
const rng = new RNG(7);
w.progression.level = 4;
w.progression.wallsUnlocked = true;
const fails: string[] = [];

// Every upgrade-only structure must have something that upgrades into it.
for (const def of BUILDINGS) {
  if (!def.upgradeOnly) continue;
  const from = upgradeSourceOf(def.id);
  if (!from) fails.push(`${def.id} is upgrade-only but nothing upgrades into it`);
  if (canBuildDirectly(w, def.id)) fails.push(`${def.id} can still be placed directly`);
}

// Every chain has a placeable entry point.
const chains = BUILDINGS.filter((d) => d.upgradeTo);
for (const def of chains) {
  let root = def.id;
  let guard = 0;
  while (guard++ < 8) {
    const from = upgradeSourceOf(root);
    if (!from) break;
    root = from;
  }
  if (!canBuildDirectly(w, root)) fails.push(`chain ending at ${def.upgradeTo} has no placeable root`);
}

// Caps are enforced: keep placing until the game refuses.
const cx = w.campCenter.tx;
const cy = w.campCenter.ty;
for (const id of ['campfire', 'workbench', 'farmPlot', 'bedroll']) {
  const def = buildingDef(id);
  let placed = 0;
  for (let i = 0; i < 40; i++) {
    const tx = cx - 30 + ((i * 4) % 60);
    const ty = cy - 26 + Math.floor((i * 4) / 60) * 4;
    // Clear the ground first so only the cap can refuse us.
    for (let y = ty - 1; y <= ty + def.h; y++)
      for (let x = tx - 1; x <= tx + def.w; x++) {
        if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
        const n = w.nodeAt[y * w.width + x];
        if (n >= 0) { w.nodes.delete(n); w.nodeAt[y * w.width + x] = -1; }
        if (w.terrain[y * w.width + x] === 4) w.terrain[y * w.width + x] = 2;
      }
    if (!canPlace(w, id, tx, ty).ok) continue;
    placeBuilding(w, id, tx, ty, true, rng);
    placed++;
  }
  const total = countBuildings(w, id);
  const cap = def.maxCount ?? Infinity;
  console.log(`${def.label.padEnd(16)} cap ${String(cap).padStart(2)} — ended with ${total}`);
  if (total > cap) fails.push(`${id} exceeded its cap (${total} > ${cap})`);
}

console.log('');
console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'BUILD LIMITS OK');
process.exit(fails.length ? 1 : 0);
