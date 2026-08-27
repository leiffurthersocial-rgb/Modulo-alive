import type { World } from '../core/types';
import { SEASONS, type Season } from '../data/crops';

/**
 * WorldTime.
 *
 * The world stores a single scalar (`time.minutes`). Everything else — day,
 * hour, week, season, year — is derived here, so adding seasonal behaviour
 * later means reading these helpers rather than changing the save format.
 */

export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_SEASON = 15;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

/** Game minutes that elapse per second of simulation time at 1x speed. */
export const MINUTES_PER_SIM_SECOND = 2;

export const dayNumber = (minutes: number) =>
  Math.floor(minutes / MINUTES_PER_DAY) + 1;

export const minuteOfDay = (minutes: number) =>
  ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

export const hourOfDay = (minutes: number) => minuteOfDay(minutes) / 60;

export const weekNumber = (minutes: number) =>
  Math.floor((dayNumber(minutes) - 1) / 7) + 1;

export const seasonIndex = (minutes: number) =>
  Math.floor(((dayNumber(minutes) - 1) % DAYS_PER_YEAR) / DAYS_PER_SEASON);

export const seasonOf = (minutes: number): Season => SEASONS[seasonIndex(minutes)];

export const yearNumber = (minutes: number) =>
  Math.floor((dayNumber(minutes) - 1) / DAYS_PER_YEAR) + 1;

export const dayOfSeason = (minutes: number) =>
  (((dayNumber(minutes) - 1) % DAYS_PER_SEASON) + 1);

/**
 * Daylight 0..1. Dawn at 5:30, full light 7:00-18:00, dusk to dark by 21:00.
 */
export function daylight(minutes: number): number {
  const h = hourOfDay(minutes);
  if (h < 4.5) return 0;
  if (h < 7) return (h - 4.5) / 2.5;
  if (h < 18) return 1;
  if (h < 21) return 1 - (h - 18) / 3;
  return 0;
}

export function isNight(minutes: number): boolean {
  return daylight(minutes) < 0.25;
}

export function formatTime(minutes: number): string {
  const m = minuteOfDay(minutes);
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

export function worldClock(w: World) {
  return {
    day: dayNumber(w.time.minutes),
    hour: hourOfDay(w.time.minutes),
    time: formatTime(w.time.minutes),
    season: seasonOf(w.time.minutes),
    dayOfSeason: dayOfSeason(w.time.minutes),
    year: yearNumber(w.time.minutes),
    daylight: daylight(w.time.minutes),
    night: isNight(w.time.minutes),
  };
}
