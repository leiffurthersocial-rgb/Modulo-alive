import type { World } from '../core/types';
import { BUILDING_MAP, PROGRESSION_TIERS, buildingDef } from '../data/buildings';
import { log } from './world';

export interface ProgressReq {
  buildings?: number;
  beds?: number;
  pop?: number;
  farms?: number;
  cooking?: number;
  medical?: number;
  workshop?: number;
  walls?: number;
}

export function settlementSnapshot(w: World) {
  let buildings = 0;
  let beds = 0;
  let farms = 0;
  let cooking = 0;
  let medical = 0;
  let workshop = 0;
  let walls = 0;
  for (const b of w.buildings.values()) {
    if (b.state !== 'built') continue;
    buildings++;
    const d = buildingDef(b.def);
    beds += d.beds ?? 0;
    if (d.farm) farms++;
    if (d.cooking) cooking++;
    if (d.medical) medical++;
    if (d.crafting && d.crafting >= 1.5) workshop++;
    if (d.solid) walls++;
  }
  const pop = w.characters.filter((c) => c.alive).length;
  return { buildings, beds, farms, cooking, medical, workshop, walls, pop };
}

export function meetsRequirement(w: World, req: ProgressReq): boolean {
  const s = settlementSnapshot(w);
  if (req.buildings !== undefined && s.buildings < req.buildings) return false;
  if (req.beds !== undefined && s.beds < req.beds) return false;
  if (req.pop !== undefined && s.pop < req.pop) return false;
  if (req.farms !== undefined && s.farms < req.farms) return false;
  if (req.cooking !== undefined && s.cooking < req.cooking) return false;
  if (req.medical !== undefined && s.medical < req.medical) return false;
  if (req.workshop !== undefined && s.workshop < req.workshop) return false;
  if (req.walls !== undefined && s.walls < req.walls) return false;
  return true;
}

/** Missing pieces for the next tier, phrased for the UI. */
export function nextTierProgress(w: World) {
  const next = PROGRESSION_TIERS.find((t) => t.level === w.progression.level + 1);
  if (!next || !next.req) return null;
  const s = settlementSnapshot(w);
  const req = next.req as ProgressReq;
  const rows: { label: string; have: number; need: number }[] = [];
  if (req.buildings !== undefined)
    rows.push({ label: 'Buildings', have: s.buildings, need: req.buildings });
  if (req.beds !== undefined) rows.push({ label: 'Beds', have: s.beds, need: req.beds });
  if (req.pop !== undefined) rows.push({ label: 'Survivors', have: s.pop, need: req.pop });
  if (req.farms !== undefined) rows.push({ label: 'Farm plots', have: s.farms, need: req.farms });
  if (req.cooking !== undefined)
    rows.push({ label: 'Cooking stations', have: s.cooking, need: req.cooking });
  if (req.medical !== undefined)
    rows.push({ label: 'Medical buildings', have: s.medical, need: req.medical });
  if (req.workshop !== undefined)
    rows.push({ label: 'Workshops', have: s.workshop, need: req.workshop });
  if (req.walls !== undefined)
    rows.push({ label: 'Wall segments', have: s.walls, need: req.walls });
  return { tier: next, rows };
}

export function checkProgression(w: World) {
  const next = PROGRESSION_TIERS.find((t) => t.level === w.progression.level + 1);
  if (!next || !next.req) return;
  if (!meetsRequirement(w, next.req as ProgressReq)) return;
  w.progression.level = next.level;
  if (next.level >= 3 && !w.progression.wallsUnlocked) {
    w.progression.wallsUnlocked = true;
    log(
      w,
      'story',
      'Defences Unlocked',
      'The camp has grown into something worth defending. Palisade walls and gates can now be built.',
      []
    );
  }
  log(
    w,
    'story',
    `The camp is now a ${next.name}`,
    next.desc,
    []
  );
  for (const c of w.characters) {
    if (c.alive) c.morale += 8;
  }
}

/**
 * Whether the settlement has progressed far enough for a structure at all.
 * Upgrades use this; direct placement also has to pass `canBuildDirectly`.
 */
export function isUnlocked(w: World, defId: string): boolean {
  const d = buildingDef(defId);
  if (d.minLevel && w.progression.level < d.minLevel) return false;
  return true;
}

/**
 * Whether the player can place this from the build menu. The upper tier of
 * every chain is reached by upgrading what is already standing, so the camp
 * improves rather than sprawls.
 */
export function canBuildDirectly(w: World, defId: string): boolean {
  const d = buildingDef(defId);
  if (d.upgradeOnly) return false;
  return isUnlocked(w, defId);
}

/** The structure that upgrades into this one, if any. */
export function upgradeSourceOf(defId: string): string | null {
  for (const def of Object.values(BUILDING_MAP)) {
    if (def.upgradeTo === defId) return def.id;
  }
  return null;
}
