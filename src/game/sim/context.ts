import type { PathFinder } from '../core/pathfinding';
import type { Fx } from './fx';

/** Shared per-step services the simulation needs but the World does not own. */
export interface Ctx {
  pf: PathFinder;
  fx: Fx;
}
