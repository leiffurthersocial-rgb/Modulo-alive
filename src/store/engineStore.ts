'use client';

import { useSyncExternalStore } from 'react';
import { GameEngine } from '@/game/engine';

let engine: GameEngine | null = null;

/** The engine is a browser-only singleton; it is never created during SSR. */
export function getEngine(): GameEngine {
  if (!engine) engine = new GameEngine();
  return engine;
}

export function hasEngine() {
  return engine !== null;
}

const serverSnapshot = 0;

/**
 * Re-renders the calling component whenever the engine publishes a new frame
 * of UI state (about eight times a second, plus immediately on player action).
 */
export function useEngine(): GameEngine {
  const e = getEngine();
  useSyncExternalStore(e.subscribe, e.getSnapshot, () => serverSnapshot);
  return e;
}
