import {
  RESOURCE_LABEL,
  TILE,
  Terrain,
  type Character,
  type Job,
  type ResourceType,
  type World,
} from '../core/types';
import { WORK_SKILL } from '../core/types';
import { buildingDef } from '../data/buildings';
import { CROPS, CROP_MAP } from '../data/crops';
import { RECIPES } from '../data/recipes';
import {
  NODE_SPEC,
  addResource,
  recentlyLogged,
  idx,
  log,
  removeNode,
  invalidateStorageCapacity,
  spendResources,
  storageCapacity,
  storedTotal,
  takeResource,
  tileToWorldX,
  tileToWorldY,
} from './world';
import { addXp, carryCapacity, workSpeed, yieldMultiplier } from './modifiers';
import { recipeAt } from './jobs';
import { GEAR_MAP, GEAR_SLOTS } from '../data/gear';
import type { Fx } from './fx';
import { say } from './dialogue';
import { adjustRelationship } from './relationships';

/** Sim-seconds per game hour. */
export const SIM_SECONDS_PER_HOUR = 30;

export const TREE_FALL_TIME = 1.1;

export type WorkResult = 'continue' | 'done' | 'fail';

export function jobWorkAmount(w: World, j: Job): number {
  switch (j.type) {
    case 'chop':
    case 'mine':
    case 'forage': {
      const n = w.nodes.get(j.targetId);
      return n ? n.maxHp : 1;
    }
    case 'build': {
      const b = w.buildings.get(j.targetId);
      return b ? buildingDef(b.def).work : 1;
    }
    case 'repair': {
      const b = w.buildings.get(j.targetId);
      return b ? Math.max(6, (b.maxHp - b.hp) * 0.4) : 1;
    }
    case 'till':
      return 9;
    case 'plant':
      return 6;
    case 'tend':
      return 11;
    case 'harvest':
      return 10;
    case 'cook':
      return 16;
    case 'treat':
      return 22;
    case 'gatherWater':
      return 9;
    case 'craft': {
      const r = recipeAt(j.cellIndex);
      return r ? r.work : 20;
    }
    default:
      return 1;
  }
}

/**
 * Apply one step of work. Movement has already put the character in range.
 */
export function performWork(
  w: World,
  c: Character,
  j: Job,
  dt: number,
  fx: Fx
): WorkResult {
  wearGear(w, c, dt, fx);
  const speed = workSpeed(c, j.work);
  const total = jobWorkAmount(w, j);
  const units = speed * dt * 2.2;

  switch (j.type) {
    case 'haulToSite':
      return depositAtSite(w, c, j, fx);

    case 'chop':
    case 'mine':
    case 'forage': {
      const n = w.nodes.get(j.targetId);
      if (!n || n.depleted) return 'fail';
      const before = n.hp;
      n.hp -= units;
      n.shake = 1;
      c.workT += dt;
      j.progress = 1 - Math.max(0, n.hp) / n.maxHp;
      // A visible strike roughly twice a second.
      if (Math.floor(c.workT * 2) !== Math.floor((c.workT - dt) * 2)) {
        const nx = tileToWorldX(n.tx);
        const ny = tileToWorldY(n.ty);
        if (j.type === 'chop') fx.chips(nx, ny + 4, '#c9a06b');
        else if (j.type === 'mine') fx.chips(nx, ny + 4, '#b7b7bd');
        else fx.chips(nx, ny + 2, '#84b061');
      }
      addXp(c, WORK_SKILL[j.work], dt * 1.6);
      if (n.hp <= 0) {
        const spec = NODE_SPEC[n.kind];
        const mult = yieldMultiplier(c, j.work);
        const amount = Math.max(1, Math.round(n.amount * mult));
        pickUp(w, c, spec.res, amount, fx);
        // Bark and cordage are only stripped when there is a use for them —
        // otherwise a long clearing job would bury the stores in fiber.
        if (spec.extra && w.stock[spec.extra.res] < 200 && Math.random() < spec.extra.chance) {
          addResource(w, spec.extra.res, spec.extra.amount);
        }
        n.depleted = true;
        n.hp = 0;
        if (n.kind === 'tree' || n.kind === 'pine' || n.kind === 'deadTree') {
          n.fallT = TREE_FALL_TIME;
          fx.leaves(tileToWorldX(n.tx), tileToWorldY(n.ty));
          fx.shake = Math.max(fx.shake, 0.5);
          w.stats.treesFelled++;
          w.terrain[idx(w, n.tx, n.ty)] = Terrain.Dirt;
          say(w, c, 'chopping');
        } else if (spec.regrowHours > 0) {
          n.regrowAt = w.time.t + spec.regrowHours * SIM_SECONDS_PER_HOUR;
          if (j.type === 'forage') say(w, c, 'foraging');
        } else {
          n.fallT = 0.35;
        }
        addXp(c, WORK_SKILL[j.work], 8);
        return 'done';
      }
      if (before === n.hp) return 'fail';
      return 'continue';
    }

    case 'build': {
      const b = w.buildings.get(j.targetId);
      if (!b || b.state !== 'blueprint') return 'fail';
      const def = buildingDef(b.def);
      b.progress = Math.min(1, b.progress + units / total);
      j.progress = b.progress;
      c.workT += dt;
      b.activeT = 0.4;
      addXp(c, 'construction', dt * 1.8);
      if (Math.random() < dt * 3) {
        fx.chips(
          (b.tx + Math.random() * b.w) * TILE,
          (b.ty + Math.random() * b.h) * TILE,
          '#d8bb85'
        );
      }
      if (b.progress >= 1) {
        b.state = 'built';
        b.hp = b.maxHp;
        invalidateStorageCapacity(w);
        if (def.farm && b.farm) for (const cell of b.farm) cell.tilled = true;
        for (let y = b.ty; y < b.ty + b.h; y++) {
          for (let x = b.tx; x < b.tx + b.w; x++) {
            const i = idx(w, x, y);
            if (w.terrain[i] !== Terrain.Water)
              w.terrain[i] = def.farm ? Terrain.Soil : Terrain.Dirt;
          }
        }
        w.stats.builtCount++;
        fx.sparkle((b.tx + b.w / 2) * TILE, (b.ty + b.h / 2) * TILE, '#ffe9a8');
        fx.float((b.tx + b.w / 2) * TILE, b.ty * TILE, def.label, '#ffe9a8');
        log(w, 'build', `${def.label} finished`, `${c.name} completed the ${def.label}.`, [c.id]);
        say(w, c, 'builtDone');
        c.morale += 4;
        addXp(c, 'construction', 14);
        return 'done';
      }
      if (Math.random() < dt * 0.25) say(w, c, 'building');
      return 'continue';
    }

    case 'repair': {
      const b = w.buildings.get(j.targetId);
      if (!b || b.state !== 'built') return 'fail';
      const repairSkill = 1 + c.skills.repair.level * 0.06;
      j.progress += (units * repairSkill) / total;
      b.hp = Math.min(b.maxHp, b.hp + units * 2.5);
      b.activeT = 0.4;
      addXp(c, 'repair', dt * 1.2);
      if (b.hp >= b.maxHp || j.progress >= 1) {
        takeResource(w, 'wood', 3);
        b.hp = b.maxHp;
        return 'done';
      }
      return 'continue';
    }

    case 'till': {
      const b = w.buildings.get(j.targetId);
      const cell = b?.farm?.[j.cellIndex];
      if (!b || !cell) return 'fail';
      j.progress += units / total;
      if (Math.random() < dt * 2) fx.dust(tileToWorldX(j.tx), tileToWorldY(j.ty), '#9c7b52');
      addXp(c, 'farming', dt * 1.2);
      if (j.progress >= 1) {
        cell.tilled = true;
        return 'done';
      }
      return 'continue';
    }

    case 'plant': {
      const b = w.buildings.get(j.targetId);
      const cell = b?.farm?.[j.cellIndex];
      if (!b || !cell || cell.crop) return 'fail';
      if (w.stock.seeds < 1) return 'fail';
      j.progress += units / total;
      addXp(c, 'farming', dt * 1.2);
      if (j.progress >= 1) {
        const crop = chooseCrop(w);
        takeResource(w, 'seeds', crop.seedCost);
        cell.crop = crop.id;
        cell.growth = 0;
        cell.tended = 0;
        cell.dead = false;
        say(w, c, 'farming');
        return 'done';
      }
      return 'continue';
    }

    case 'tend': {
      const b = w.buildings.get(j.targetId);
      const cell = b?.farm?.[j.cellIndex];
      if (!b || !cell || !cell.crop) return 'fail';
      j.progress += units / total;
      addXp(c, 'farming', dt * 1.1);
      if (Math.random() < dt) fx.dust(tileToWorldX(j.tx), tileToWorldY(j.ty), '#7fa05a');
      if (j.progress >= 1) {
        cell.tended += 10;
        cell.growth = Math.min(0.99, cell.growth + 0.03);
        return 'done';
      }
      return 'continue';
    }

    case 'harvest': {
      const b = w.buildings.get(j.targetId);
      const cell = b?.farm?.[j.cellIndex];
      if (!b || !cell || !cell.crop) return 'fail';
      j.progress += units / total;
      addXp(c, 'farming', dt * 1.4);
      if (j.progress >= 1) {
        const crop = CROP_MAP[cell.crop];
        const tendBonus = 1 + Math.min(0.4, cell.tended / 75);
        const amount = Math.max(
          1,
          Math.round(crop.yieldAmount * yieldMultiplier(c, 'farming') * tendBonus)
        );
        pickUp(w, c, crop.yieldRes, amount, fx);
        // Farming must be seed-positive, or the fields quietly stop — but the
        // surplus is left in the field rather than filling the storehouse.
        if (w.stock.seeds < 40) {
          addResource(w, 'seeds', 1 + (Math.random() < crop.seedReturn ? 1 : 0));
        }
        cell.crop = null;
        cell.growth = 0;
        cell.tended = 0;
        w.stats.harvested += amount;
        addXp(c, 'farming', 9);
        say(w, c, 'harvest');
        return 'done';
      }
      return 'continue';
    }

    case 'cook': {
      const b = w.buildings.get(j.targetId);
      if (!b || b.state !== 'built') return 'fail';
      if (w.stock.rawFood < 3) return 'fail';
      j.progress += units / total;
      b.activeT = 0.4;
      addXp(c, 'cooking', dt * 1.5);
      if (Math.random() < dt * 1.5)
        fx.burst((b.tx + b.w / 2) * TILE, (b.ty + b.h / 2) * TILE - 6, 1, '#d8d0c0', 'dust', 10, 1.2, 3);
      if (j.progress >= 1) {
        const def = buildingDef(b.def);
        const raw = takeResource(w, 'rawFood', 10);
        // Water makes the meal go further; without it the cook does what they can.
        const water = takeResource(w, 'water', 2);
        const quality =
          (def.cooking ?? 1) * yieldMultiplier(c, 'cooking') * (water >= 2 ? 1.25 : 0.85);
        const meals = Math.max(1, Math.round(raw * 0.9 * quality));
        addResource(w, 'food', meals);
        w.stats.mealsCooked += meals;
        fx.float((b.tx + b.w / 2) * TILE, b.ty * TILE, `+${meals} food`, '#ffd88a');
        addXp(c, 'cooking', 10);
        say(w, c, 'cooking');
        return 'done';
      }
      return 'continue';
    }

    case 'craft': {
      const b = w.buildings.get(j.targetId);
      const r = recipeAt(j.cellIndex);
      if (!b || b.state !== 'built' || !r) return 'fail';
      for (const k of Object.keys(r.input) as ResourceType[]) {
        if (w.stock[k] < (r.input[k] ?? 0)) return 'fail';
      }
      const def = buildingDef(b.def);
      j.progress += (units * (def.crafting ?? 1)) / total;
      b.activeT = 0.4;
      addXp(c, 'crafting', dt * 1.5);
      if (j.progress >= 1) {
        spendResources(w, r.input);
        for (const k of Object.keys(r.output) as ResourceType[]) {
          addResource(w, k, r.output[k] ?? 0);
        }
        if (r.gear) w.gear[r.gear] = (w.gear[r.gear] ?? 0) + 1;
        fx.float((b.tx + b.w / 2) * TILE, b.ty * TILE, r.label, '#bcd7ff');
        addXp(c, 'crafting', 9);
        return 'done';
      }
      return 'continue';
    }

    case 'gatherWater': {
      j.progress += units / total;
      if (Math.random() < dt * 2)
        fx.burst(tileToWorldX(j.tx), tileToWorldY(j.ty), 1, '#8fd0ff', 'spark', 18, 0.5, 2);
      if (j.progress >= 1) {
        pickUp(w, c, 'water', 14, fx);
        return 'done';
      }
      return 'continue';
    }

    case 'treat': {
      const patient = w.characters.find((p) => p.id === j.targetId);
      if (!patient || !patient.alive) return 'fail';
      if (w.stock.medicine < 1) return 'fail';
      const station = w.buildings.get(j.fromId);
      const quality = station ? (buildingDef(station.def).medical ?? 1) : 0.6;
      j.progress += (units * quality) / total;
      addXp(c, 'medicine', dt * 2);
      if (Math.random() < dt * 2)
        fx.burst(patient.x, patient.y - 12, 1, '#8ef0b2', 'plus', 10, 0.9, 3);
      if (j.progress >= 1) {
        takeResource(w, 'medicine', 1);
        const skill = c.skills.medicine.level;
        const power = quality * (0.6 + skill * 0.09) * (1 + (c.stats.intelligence - 5) * 0.05);
        let treatedAny = false;
        for (const inj of patient.injuries) {
          if (inj.treated) continue;
          inj.treated = true;
          inj.bleeding = 0;
          inj.remaining *= Math.max(0.25, 1 - power * 0.45);
          treatedAny = true;
        }
        if (patient.sickness > 0) patient.sickness = Math.max(0, patient.sickness - power * 0.4);
        patient.health = Math.min(patient.maxHealth, patient.health + 6 * power);
        patient.morale += 6;
        adjustRelationship(w, c, patient, 6, 'was treated by');
        addXp(c, 'medicine', 12);
        fx.float(patient.x, patient.y - 24, 'treated', '#8ef0b2');
        if (treatedAny)
          log(w, 'good', 'Treated', `${c.name} treated ${patient.name}'s injuries.`, [
            c.id,
            patient.id,
          ]);
        return 'done';
      }
      return 'continue';
    }

    default:
      return 'fail';
  }
}

/** Food first: the fields only turn to fiber and medicine once the larder is safe. */
/**
 * Gear wears out with use. Tools go first, clothing lasts much longer — but
 * everything eventually needs replacing, which keeps the workbench useful.
 */
function wearGear(w: World, c: Character, dt: number, fx: Fx) {
  for (const slot of GEAR_SLOTS) {
    const id = c.equipment[slot];
    if (!id) continue;
    const def = GEAR_MAP[id];
    if (!def || def.wear <= 0) continue;
    if (Math.random() > dt * def.wear) continue;
    c.equipment[slot] = null;
    fx.float(c.x, c.y - 26, `${def.label.toLowerCase()} worn out`, '#ff9d7a');
    log(w, 'info', 'Worn Out', `${c.name}'s ${def.label.toLowerCase()} finally gave out.`, [
      c.id,
    ]);
  }
}

function chooseCrop(w: World) {
  const pop = w.characters.filter((c) => c.alive).length || 1;
  const foodSecure = w.stock.food + w.stock.rawFood > pop * 20;
  if (foodSecure && w.stock.herbs < 10 && w.stock.medicine < 8) return CROP_MAP['healroot'];
  if (foodSecure && w.stock.fiber < 60) return CROP_MAP['flax'];
  if (!foodSecure && Math.random() < 0.35) return CROP_MAP['greens'];
  return CROP_MAP['tubers'];
}

/** Put gathered resources in the character's hands (they haul them home). */
export function pickUp(
  w: World,
  c: Character,
  res: ResourceType,
  amount: number,
  fx: Fx
) {
  const cap = carryCapacity(c);
  if (c.carrying && c.carrying.res !== res) {
    // Drop what they had straight into the stores rather than losing it.
    addResource(w, c.carrying.res, c.carrying.amount);
    c.carrying = null;
  }
  const have = c.carrying?.amount ?? 0;
  const take = Math.min(amount, cap - have);
  const overflow = amount - take;
  if (take > 0) c.carrying = { res, amount: have + take };
  if (overflow > 0) addResource(w, res, overflow);
  fx.float(c.x, c.y - 26, `+${amount} ${RESOURCE_LABEL[res]}`, '#e8f2c8');
}

/**
 * Drop everything the character is carrying into the settlement stores.
 * Anything that does not fit is left on the ground and lost — a full store is
 * a problem the player must solve, never a reason for a survivor to freeze.
 */
export function storeCarried(w: World, c: Character, fx: Fx): boolean {
  if (!c.carrying) return false;
  const res = c.carrying.res;
  const stored = addResource(w, res, c.carrying.amount);
  const lost = c.carrying.amount - stored;
  if (stored > 0) fx.float(c.x, c.y - 20, `${RESOURCE_LABEL[res]} stored`, '#cfe8ff');
  if (lost > 0) {
    say(w, c, 'storageFull');
    fx.float(c.x, c.y - 32, `${Math.round(lost)} wasted`, '#ff9d7a');
    if (!recentlyLogged(w, 'Storage Full', 240)) {
      log(
        w,
        'alert',
        'Storage Full',
        'There is nowhere left to put anything. Supplies are being left to rot — the settlement needs more storage.',
        []
      );
    }
  }
  c.carrying = null;
  return true;
}

function depositAtSite(w: World, c: Character, j: Job, fx: Fx): WorkResult {
  const b = w.buildings.get(j.targetId);
  if (!b || b.state !== 'blueprint' || !j.res) return 'fail';
  if (!c.carrying || c.carrying.res !== j.res) return 'fail';
  const def = buildingDef(b.def);
  const need = (def.cost[j.res] ?? 0) - (b.delivered[j.res] ?? 0);
  const give = Math.min(need, c.carrying.amount);
  b.delivered[j.res] = (b.delivered[j.res] ?? 0) + give;
  c.carrying.amount -= give;
  if (c.carrying.amount <= 0) c.carrying = null;
  fx.dust((b.tx + b.w / 2) * TILE, (b.ty + b.h / 2) * TILE, '#c8b48a');
  addXp(c, 'construction', 2);
  return 'done';
}

export function storageFull(w: World): boolean {
  return storedTotal(w) >= storageCapacity(w);
}
