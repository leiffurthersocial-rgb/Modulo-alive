import {
  TILE,
  type Building,
  type Character,
  type World,
} from '../core/types';
import { clamp } from '../core/util';
import { buildingDef } from '../data/buildings';
import {
  WANDERER_HAIR,
  WANDERER_NAMES,
  WANDERER_SHIRTS,
  WANDERER_SKINS,
  type SurvivorTemplate,
} from '../data/survivors';
import { createCharacter } from './characterFactory';
import { RNG } from '../core/rng';
import {
  addResource,
  buildingCenterX,
  buildingCenterY,
  findBuildings,
  livingCharacters,
  log,
  roll,
  rollInt,
  rollPick,
  rollRange,
  recentlyLogged,
  takeResource,
  tileToWorldX,
  totalFood,
  tileToWorldY,
} from './world';
import { injure, makeSick } from './medical';
import { adjustRelationship, bestFriend, relationship } from './relationships';
import { say } from './dialogue';
import { hourOfDay, isNight } from './time';
import type { Fx } from './fx';
import { fortune } from './modifiers';
import { applyEffect } from './effects';
import { settlementSnapshot } from './progression';

/** Runs roughly once per game hour. */
export function eventTick(w: World, fx: Fx) {
  updateWeather(w);
  emergentStories(w, fx);

  const living = livingCharacters(w);
  if (!living.length) return;

  // Base chance per hour, higher at night and when the camp is struggling.
  const pop = living.length;
  const food = totalFood(w);
  const strain =
    (food < pop * 4 ? 0.5 : 0) +
    (living.filter((c) => c.morale < 35).length / pop) * 0.5 +
    (isNight(w.time.minutes) ? 0.2 : 0);
  const chance = clamp(0.1 + strain * 0.12, 0.06, 0.34);
  if (roll(w) > chance) return;

  const table = buildEventTable(w, living);
  let total = 0;
  for (const e of table) total += e.weight;
  let r = roll(w) * total;
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) {
      e.run(w, fx);
      return;
    }
  }
}

interface EventOption {
  weight: number;
  run: (w: World, fx: Fx) => void;
}

function buildEventTable(w: World, living: Character[]): EventOption[] {
  const pop = living.length;
  const food = totalFood(w);
  const buildings = findBuildings(w, (b) => b.state === 'built');
  const out: EventOption[] = [];

  out.push({
    weight: 12,
    run: (w, fx) => {
      const c = rollPick(w, living.filter((x) => x.state === 'working')) ?? rollPick(w, living);
      if (!c) return;
      injure(w, c, null, rollRange(w, 0.12, 0.4), 'a slip while working', fx);
    },
  });

  out.push({
    weight: food < pop * 3 ? 20 : 3,
    run: (w) => {
      for (const c of living) c.morale -= 8;
      say(w, rollPick(w, living), 'noFood', true);
      log(
        w,
        'alert',
        'Food Shortage',
        'The stores are nearly empty. People are talking about it.',
        []
      );
    },
  });

  out.push({
    weight: 9,
    run: (w, fx) => {
      const c = rollPick(w, living);
      makeSick(w, c, rollRange(w, 0.2, 0.5), 'a fever came on overnight');
    },
  });

  if (buildings.length) {
    out.push({
      weight: 7,
      run: (w, fx) => {
        const b = rollPick(w, buildings);
        const dmg = rollRange(w, 0.15, 0.4) * b.maxHp;
        b.hp = Math.max(1, b.hp - dmg);
        log(
          w,
          'bad',
          'Storm Damage',
          `Wind and rain tore at the ${buildingDef(b.def).label}. It needs repairs.`,
          []
        );
        fx.dust(buildingCenterX(b), buildingCenterY(b), '#9c9c9c');
      },
    });

    const withFire = buildings.filter((b) => (buildingDef(b.def).light ?? 0) > 0);
    if (withFire.length) {
      out.push({
        weight: 4,
        run: (w, fx) => {
          const b = rollPick(w, withFire);
          b.hp = Math.max(1, b.hp * 0.45);
          const c = rollPick(w, living);
          injure(w, c, 'burn', rollRange(w, 0.15, 0.45), 'a flare-up at the fire', fx);
          fx.burst(buildingCenterX(b), buildingCenterY(b), 16, '#ff8b3d', 'spark', 50, 0.9, 3);
          log(
            w,
            'bad',
            'Fire!',
            `A fire got out of hand at the ${buildingDef(b.def).label}. ${c.name} was burned putting it out.`,
            [c.id]
          );
        },
      });
    }
  }

  const toolUsers = living.filter((c) => c.equipment.tool);
  if (w.stock.tools > 0 || toolUsers.length) {
    out.push({
      weight: 6,
      run: (w) => {
        if (toolUsers.length) {
          const c = rollPick(w, toolUsers);
          c.equipment.tool = null;
          log(w, 'bad', 'Equipment Broke', `${c.name}'s tools snapped mid-swing.`, [c.id]);
        } else {
          takeResource(w, 'tools', 1);
          log(w, 'bad', 'Equipment Broke', 'A set of tools rusted through in storage.', []);
        }
      },
    });
  }

  out.push({
    weight: 6,
    run: (w) => {
      // Raw meat is the first thing to turn.
      const res = w.stock.rawMeat > 4 ? 'rawMeat' : 'rawFood';
      const lost = Math.min(w.stock[res], Math.round(rollRange(w, 4, 14)));
      if (lost <= 0) return;
      takeResource(w, res, lost);
      log(
        w,
        'bad',
        'Spoiled Supplies',
        `${lost} units of ${res === 'rawMeat' ? 'meat' : 'produce'} had gone bad by the time anyone checked.`,
        []
      );
    },
  });

  out.push({
    weight: 8,
    run: (w, fx) => {
      const c = rollPick(w, living);
      const severity = rollRange(w, 0.2, 0.55);
      injure(w, c, 'bite', severity, 'something came out of the treeline', fx);
      for (const o of living) o.morale -= 3;
      log(
        w,
        'bad',
        'Animal Attack',
        `Something big came through the camp edge. ${c.name} did not get away clean.`,
        [c.id]
      );
    },
  });

  out.push({
    weight: 10,
    run: (w) => {
      for (const c of living) c.morale -= 2;
      log(
        w,
        'info',
        'A Strange Sound',
        'Something moved out beyond the firelight. Nobody slept well.',
        []
      );
    },
  });

  const undiscovered = w.sites.filter((s) => !s.discovered);
  if (undiscovered.length) {
    out.push({
      weight: 8,
      run: (w) => {
        const s = rollPick(w, undiscovered);
        s.discovered = true;
        log(
          w,
          'discovery',
          'Smoke on the Horizon',
          `Someone noticed ${s.name} from the treeline. It is marked on the map now.`,
          []
        );
      },
    });
  }

  // A stranger asks to join — only if the camp can plausibly feed and house them.
  const snap = settlementSnapshot(w);
  if (food > pop * 16 && pop < 16 && snap.beds > pop) {
    out.push({
      weight: 4,
      run: (w, fx) => {
        const c = recruitStranger(w);
        if (!c) return;
        fx.sparkle(c.x, c.y - 12, '#ffe9a8');
        log(
          w,
          'story',
          'A Stranger at the Treeline',
          `${c.name} walked out of the forest with nothing but a coat, and asked to stay. The camp said yes.`,
          [c.id]
        );
      },
    });
  }

  out.push({
    weight: 7,
    run: (w, fx) => {
      const c = rollPick(w, living);
      const amount = Math.round(rollRange(w, 6, 20) * fortune(c));
      addResource(w, 'rawFood', amount);
      c.morale += 6;
      log(
        w,
        'good',
        'Good Fortune',
        `${c.name} stumbled onto a heavy crop of mushrooms and brought back ${amount} food.`,
        [c.id]
      );
      fx.sparkle(c.x, c.y - 14, '#b6f08e');
    },
  });

  return out;
}

/* ------------------------------------------------------------------ */

function recruitStranger(w: World): Character | null {
  const used = new Set(w.characters.map((c) => c.name));
  const available = WANDERER_NAMES.filter((n) => !used.has(n));
  if (!available.length) return null;
  const rng = new RNG(w.rngState ^ 0x1234567);
  const name = rollPick(w, available);
  const tpl: SurvivorTemplate = {
    name,
    blurb: 'Walked out of the forest one evening and stayed.',
    appearance: {
      skin: rollPick(w, WANDERER_SKINS),
      hair: rollPick(w, WANDERER_HAIR),
      hairStyle: rollPick(w, ['short', 'fringe', 'styled', 'mod', 'middlePart', 'buzz', 'long'] as const),
      eyes: rollPick(w, ['#4a2d18', '#5b86b5', '#3d6b43', '#8a8f95']),
      build: rollPick(w, ['slim', 'normal', 'tall', 'heavy'] as const),
      shirt: rollPick(w, WANDERER_SHIRTS),
      trousers: '#3d4152',
      facialHair: 'none',
    },
  };
  const id = w.characters.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  const c = createCharacter(
    {
      id,
      name,
      appearance: tpl.appearance,
      x: tileToWorldX(w.campCenter.tx) + rollRange(w, -3, 3) * TILE,
      y: tileToWorldY(w.campCenter.ty) + rollRange(w, -3, 3) * TILE,
    },
    tpl,
    rng
  );
  w.rngState = rng.state;
  for (const o of w.characters) {
    if (!o.alive) continue;
    const v = Math.round(rollRange(w, 20, 40));
    c.relationships[o.id] = v;
    o.relationships[c.id] = v;
  }
  w.characters.push(c);
  return c;
}

/* ------------------------------------------------------------------ */
/* Emergent stories from actual state                                  */
/* ------------------------------------------------------------------ */

function emergentStories(w: World, fx: Fx) {
  const living = livingCharacters(w);
  const hour = hourOfDay(w.time.minutes);

  // Someone working through the small hours, with a friend nearby.
  if (hour > 1 && hour < 4 && roll(w) < 0.35 && !recentlyLogged(w, 'A Long Night', 1440)) {
    const workers = living.filter((c) => c.state === 'working');
    if (workers.length) {
      const c = rollPick(w, workers);
      const near = living.find(
        (o) =>
          o.id !== c.id &&
          o.state !== 'sleeping' &&
          Math.hypot(o.x - c.x, o.y - c.y) < TILE * 6
      );
      if (near) {
        adjustRelationship(w, c, near, 7, 'worked a long night together');
        c.energy -= 6;
        near.energy -= 4;
        applyEffect(w, c, 'sleepDeprived', -1, 0.6);
        log(
          w,
          'story',
          'A Long Night',
          `${c.name} worked straight through the night. ${near.name} stayed up and worked alongside them. Neither slept, but something between them shifted.`,
          [c.id, near.id]
        );
        fx.hearts((c.x + near.x) / 2, (c.y + near.y) / 2);
        return;
      }
    }
  }

  // Rations and resentment.
  if (
    w.stock.food + w.stock.rawFood < living.length * 2 &&
    roll(w) < 0.25 &&
    living.length > 2 &&
    !recentlyLogged(w, 'The Argument', 720)
  ) {
    const a = rollPick(w, living);
    const b = rollPick(w, living.filter((x) => x.id !== a.id));
    if (a && b) {
      adjustRelationship(w, a, b, -rollRange(w, 5, 12), 'accused of taking extra food');
      a.morale -= 6;
      b.morale -= 8;
      log(
        w,
        'story',
        'The Argument',
        `${a.name} accused ${b.name} of taking more than their share. Nobody could prove anything, which made it worse.`,
        [a.id, b.id]
      );
    }
  }

  // A friendship deepening into something the camp notices.
  if (roll(w) < 0.06 && !recentlyLogged(w, 'Inseparable', 4320)) {
    for (const c of living) {
      const f = bestFriend(w, c);
      if (f && relationship(c, f) > 88 && roll(w) < 0.3) {
        applyEffect(w, c, 'inspired', 10);
        applyEffect(w, f, 'inspired', 10);
        log(
          w,
          'story',
          'Inseparable',
          `${c.name} and ${f.name} have become the pair everyone else plans around.`,
          [c.id, f.id]
        );
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */

function updateWeather(w: World) {
  w.weather.t -= 30;
  if (w.weather.t > 0) return;
  const r = roll(w);
  if (r < 0.52) w.weather.kind = 'clear';
  else if (r < 0.76) w.weather.kind = 'overcast';
  else if (r < 0.93) w.weather.kind = 'rain';
  else w.weather.kind = 'fog';
  w.weather.intensity = rollRange(w, 0.4, 1);
  w.weather.t = rollRange(w, 3, 9) * 30;
  if (w.weather.kind === 'rain') {
    log(w, 'info', 'Rain', 'Rain moved in over the forest.', []);
  }
}
