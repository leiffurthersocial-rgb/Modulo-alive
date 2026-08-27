import {
  TILE,
  WORK_TYPES,
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
import { TRADE_KEYS, hasPrompt, makeTradeOptions, pushPrompt } from './prompts';
import { ANIMAL_MAP } from '../data/animals';
import { RESOURCE_LABEL, WORK_LABEL } from '../core/types';

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
  // Something worth noticing should happen most game days.
  const chance = clamp(0.2 + strain * 0.14, 0.14, 0.45);
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

  // A stranger asks to join — the player decides.
  const snap = settlementSnapshot(w);
  if (food > pop * 10 && pop < 16 && !hasPrompt(w, 'newcomer')) {
    out.push({
      weight: 6,
      run: (w, fx) => {
        const c = recruitStranger(w);
        if (!c) return;
        fx.sparkle(c.x, c.y - 12, '#ffe9a8');
        const short = snap.beds <= pop;
        pushPrompt(w, {
          kind: 'newcomer',
          title: 'A Stranger at the Treeline',
          tone: 'neutral',
          body:
            `${c.name} walked out of the forest with nothing but a coat and asked to stay. ` +
            `They say they are good at ${WORK_LABEL[c.favouriteWork].toLowerCase()}.` +
            (short ? ' There is no spare bed for them.' : ''),
          options: [
            {
              id: 'accept',
              label: `Let ${c.name} stay`,
              desc: short
                ? 'Another pair of hands — but somebody will be sleeping rough.'
                : 'Another pair of hands, and another mouth to feed.',
            },
            {
              id: 'refuse',
              label: 'Send them away',
              desc: 'Keeps the larder safe. The others will not like it.',
            },
          ],
          data: { charId: c.id },
          chars: [c.id],
        });
      },
    });
  }

  // A trader passes through.
  if (!hasPrompt(w, 'trader') && buildings.length >= 4) {
    out.push({
      weight: 7,
      run: (w) => {
        // Offer something the camp is short of, for something it has spare.
        const wants = TRADE_KEYS.filter((k) => w.stock[k] >= 30);
        const needs = TRADE_KEYS.filter((k) => w.stock[k] < 20);
        if (!wants.length || !needs.length) return;
        const giveRes = rollPick(w, wants);
        const getRes = rollPick(w, needs);
        const giveAmount = Math.round(rollRange(w, 18, 34));
        const getAmount = Math.round(rollRange(w, 10, 22));
        pushPrompt(w, {
          kind: 'trader',
          title: 'A Trader on the Path',
          tone: 'neutral',
          body:
            `A pedlar with a heavy pack stops at the treeline. They will take ` +
            `${giveAmount} ${RESOURCE_LABEL[giveRes].toLowerCase()} for ` +
            `${getAmount} ${RESOURCE_LABEL[getRes].toLowerCase()}.`,
          options: makeTradeOptions(w, giveRes, giveAmount, getRes, getAmount),
          data: {
            giveIndex: TRADE_KEYS.indexOf(giveRes),
            getIndex: TRADE_KEYS.indexOf(getRes),
            giveAmount,
            getAmount,
          },
          chars: [],
        });
      },
    });
  }

  // A wandering forager offers to share a find.
  if (!hasPrompt(w, 'forager')) {
    out.push({
      weight: 5,
      run: (w) => {
        const getRes = rollPick(w, ['rawFood', 'herbs', 'fiber', 'seeds'] as const);
        const amount = Math.round(rollRange(w, 12, 30));
        pushPrompt(w, {
          kind: 'forager',
          title: 'A Wanderer with a Full Basket',
          tone: 'good',
          body:
            `Someone thin and travel-worn offers to share what they gathered, ` +
            `if you will let them warm up by the fire for a night.`,
          options: [
            {
              id: 'accept',
              label: 'Share the fire',
              desc: `They leave ${amount} ${RESOURCE_LABEL[getRes].toLowerCase()} behind.`,
            },
            { id: 'refuse', label: 'Wave them past', desc: 'No risk, no gain.' },
          ],
          data: { getIndex: TRADE_KEYS.indexOf(getRes), getAmount: amount },
          chars: [],
        });
      },
    });
  }

  /* ---------------- more things that can happen ---------------- */

  out.push({
    weight: 8,
    run: (w, fx) => {
      const c = rollPick(w, living);
      applyEffect(w, c, 'inspired', rollRange(w, 6, 14));
      log(
        w,
        'good',
        'A Good Day',
        `${c.name} got more done before noon than most manage in a day.`,
        [c.id]
      );
      fx.sparkle(c.x, c.y - 14, '#ffe9a8');
    },
  });

  if (w.animals.some((a) => a.state !== 'dead')) {
    out.push({
      weight: 9,
      run: (w) => {
        const near = w.animals.filter(
          (a) =>
            a.state !== 'dead' &&
            Math.hypot(a.x / TILE - w.campCenter.tx, a.y / TILE - w.campCenter.ty) < 30
        );
        if (!near.length) return;
        const a = rollPick(w, near);
        a.marked = true;
        log(
          w,
          'info',
          'Tracks by the Camp',
          `${ANIMAL_MAP[a.kind].label} sign close to the settlement. Worth sending a hunter.`,
          []
        );
      },
    });
  }

  const beds = findBuildings(w, (b) => b.state === 'built' && !!buildingDef(b.def).beds);
  if (beds.length) {
    out.push({
      weight: 5,
      run: (w) => {
        const c = rollPick(w, living);
        applyEffect(w, c, 'sleepDeprived', -1, 0.5);
        log(
          w,
          'bad',
          'A Bad Night',
          `${c.name} lay awake most of the night listening to the trees.`,
          [c.id]
        );
      },
    });
  }

  out.push({
    weight: 6,
    run: (w) => {
      const found = rollPick(w, ['fiber', 'herbs', 'seeds', 'stone'] as const);
      const amount = Math.round(rollRange(w, 8, 20));
      addResource(w, found, amount);
      log(
        w,
        'good',
        'Something Useful',
        `A search of the old stores turned up ${amount} ${RESOURCE_LABEL[found].toLowerCase()}.`,
        []
      );
    },
  });

  out.push({
    weight: 6,
    run: (w, fx) => {
      const c = rollPick(w, living);
      const other = rollPick(w, living.filter((x) => x.id !== c.id));
      if (!other) return;
      adjustRelationship(w, c, other, rollRange(w, 6, 14), 'shared a hard shift');
      applyEffect(w, c, 'inspired', 6);
      fx.hearts((c.x + other.x) / 2, (c.y + other.y) / 2);
      log(
        w,
        'story',
        'Covering for Each Other',
        `${c.name} took the worst of a job so ${other.name} would not have to. It was noticed.`,
        [c.id, other.id]
      );
    },
  });

  if (w.stock.medicine < 3) {
    out.push({
      weight: 7,
      run: (w) => {
        addResource(w, 'herbs', Math.round(rollRange(w, 8, 18)));
        log(
          w,
          'good',
          'Healroot in the Hollow',
          'Someone came across a thick stand of healroot while out walking.',
          []
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
    bestWork: rollPick(w, WORK_TYPES),
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
