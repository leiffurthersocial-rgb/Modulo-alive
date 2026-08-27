import type { World } from '../core/types';
import { CROP_MAP } from '../data/crops';
import { seasonOf } from './time';
import { SIM_SECONDS_PER_HOUR } from './tasks';

/**
 * Crop growth. Seasons already resolve here — V1 keeps every crop plantable
 * all year, but the seasonal yield multiplier is live, so switching to strict
 * seasonal planting later is a one-line change in jobs.ts.
 */
export function growthTick(w: World, dt: number) {
  const hours = dt / SIM_SECONDS_PER_HOUR;
  const season = seasonOf(w.time.minutes);
  const rainBoost = w.weather.kind === 'rain' ? 1.25 : w.weather.kind === 'fog' ? 1.05 : 1;

  for (const b of w.buildings.values()) {
    if (b.state !== 'built' || !b.farm) continue;
    for (const cell of b.farm) {
      if (!cell.crop || cell.growth >= 1) continue;
      const crop = CROP_MAP[cell.crop];
      if (!crop) {
        cell.crop = null;
        continue;
      }
      const seasonMul = crop.seasonYield[season] ?? 1;
      const tendMul = 1 + Math.min(0.35, cell.tended / 90);
      const rate = (1 / crop.growHours) * seasonMul * tendMul * rainBoost;
      cell.growth = Math.min(1, cell.growth + rate * hours);
    }
  }
}

/** Berry bushes, herb patches and reeds coming back. */
export function regrowthTick(w: World) {
  for (const n of w.nodes.values()) {
    if (!n.depleted || n.regrowAt < 0) continue;
    if (w.time.t < n.regrowAt) continue;
    n.depleted = false;
    n.hp = n.maxHp;
    n.regrowAt = -1;
    n.marked = false;
    n.fallT = 0;
  }
}
