import { TILE, type Character, type World } from '../core/types';
import type { PathFinder } from '../core/pathfinding';
import { moveSpeed } from './modifiers';
import {
  adjacentFreeTile,
  surfaceSpeed,
  tileBlocked,
  tileToWorldX,
  tileToWorldY,
  worldToTileX,
  worldToTileY,
} from './world';

export type MoveResult = 'moving' | 'arrived' | 'blocked';

export function charTileX(c: Character) {
  return worldToTileX(c.x);
}
export function charTileY(c: Character) {
  return worldToTileY(c.y);
}

/**
 * Plan a route. Returns false when no path exists — callers surface that as
 * visible behaviour (a complaint, a dropped job) rather than teleporting.
 */
export function setDestination(
  w: World,
  c: Character,
  tx: number,
  ty: number,
  pf: PathFinder,
  adjacent = false
): boolean {
  const sx = charTileX(c);
  const sy = charTileY(c);
  let gx = tx;
  let gy = ty;
  if (tileBlocked(w, gx, gy)) {
    const free = adjacentFreeTile(w, gx, gy);
    if (!free) {
      c.path = [];
      return false;
    }
    gx = free.tx;
    gy = free.ty;
  }
  if (sx === gx && sy === gy) {
    c.path = [];
    c.pathIndex = 0;
    return true;
  }
  const path = pf.find(w.blocked, sx, sy, gx, gy, { adjacent });
  if (!path) {
    c.path = [];
    c.stuckT += 1;
    return false;
  }
  c.path = path;
  c.pathIndex = 0;
  c.stuckT = 0;
  return true;
}

export function hasPath(c: Character) {
  return c.pathIndex < c.path.length;
}

export function clearPath(c: Character) {
  c.path = [];
  c.pathIndex = 0;
  c.moving = false;
}

export function updateMovement(
  w: World,
  c: Character,
  dt: number,
  pf: PathFinder
): MoveResult {
  if (c.repathT > 0) c.repathT -= dt;
  if (!hasPath(c)) {
    c.moving = false;
    return 'arrived';
  }

  const tx = c.path[c.pathIndex];
  const ty = c.path[c.pathIndex + 1];

  // The world changes under people's feet — a felled tree, a new wall.
  if (tileBlocked(w, tx, ty)) {
    if (c.repathT <= 0) {
      c.repathT = 0.6;
      const gx = c.path[c.path.length - 2];
      const gy = c.path[c.path.length - 1];
      if (!setDestination(w, c, gx, gy, pf)) return 'blocked';
      return 'moving';
    }
    return 'blocked';
  }

  const targetX = tileToWorldX(tx);
  const targetY = tileToWorldY(ty);
  const dx = targetX - c.x;
  const dy = targetY - c.y;
  const d = Math.hypot(dx, dy);

  const surface = surfaceSpeed(w, charTileX(c), charTileY(c));
  const speed = moveSpeed(c, w) * surface * TILE;
  const step = speed * dt;

  if (d <= step) {
    c.x = targetX;
    c.y = targetY;
    c.pathIndex += 2;
    c.moving = true;
    if (!hasPath(c)) {
      c.moving = false;
      return 'arrived';
    }
    return 'moving';
  }

  const nx = dx / d;
  const ny = dy / d;
  c.x += nx * step;
  c.y += ny * step;
  c.moving = true;
  c.animT += dt * (speed / TILE) * 2.4;

  if (Math.abs(nx) > Math.abs(ny)) c.dir = nx > 0 ? 2 : 1;
  else c.dir = ny > 0 ? 0 : 3;

  return 'moving';
}

/** Straight-line distance in tiles. */
export function tileDistance(c: Character, tx: number, ty: number) {
  return Math.hypot(c.x - tileToWorldX(tx), c.y - tileToWorldY(ty)) / TILE;
}

export function isNear(c: Character, tx: number, ty: number, tiles = 1.45) {
  return tileDistance(c, tx, ty) <= tiles;
}

/** Gentle separation so survivors do not stack into one pixel. */
export function separate(w: World, dt: number) {
  const chars = w.characters;
  for (let i = 0; i < chars.length; i++) {
    const a = chars[i];
    if (!a.alive || a.state === 'sleeping' || a.state === 'exploring') continue;
    for (let k = i + 1; k < chars.length; k++) {
      const b = chars[k];
      if (!b.alive || b.state === 'sleeping' || b.state === 'exploring') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const min = TILE * 0.6;
      if (d2 > min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = ((min - d) / min) * 12 * dt;
      const nx = dx / d;
      const ny = dy / d;
      if (!tileBlocked(w, worldToTileX(a.x - nx * 4), worldToTileY(a.y - ny * 4))) {
        a.x -= nx * push;
        a.y -= ny * push;
      }
      if (!tileBlocked(w, worldToTileX(b.x + nx * 4), worldToTileY(b.y + ny * 4))) {
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}
