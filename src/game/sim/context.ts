import type { WorkType } from '../core/types';
import type { PathFinder } from '../core/pathfinding';
import type { Fx } from './fx';

/** Shared per-step services the simulation needs but the World does not own. */
export interface Ctx {
  pf: PathFinder;
  fx: Fx;
  /**
   * How many survivors are on each kind of work this tick. Recomputed once per
   * step and shared, so job picking can spread people out without every
   * character re-counting the whole camp.
   */
  coverage?: Record<WorkType, number>;
  /**
   * When false the camp only gathers what it needs to stay alive, leaving the
   * rest of the woodcutting and mining for the player to direct.
   */
  autoGather?: boolean;
}
