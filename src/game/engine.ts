import {
  RESOURCE_TYPES,
  TILE,
  WORK_TYPES,
  type Assignment,
  type Animal,
  type Building,
  type Character,
  type ExplorationSite,
  type ResourceNode,
  type World,
} from './core/types';
import { PathFinder } from './core/pathfinding';
import { Camera } from './render/camera';
import { Renderer, type RenderOptions } from './render/renderer';
import { Fx } from './sim/fx';
import { SIM_STEP, stepWorld } from './sim/simulation';
import { createWorld } from './sim/worldgen';
import type { Ctx } from './sim/context';
import {
  NODE_SPEC,
  adjacentFreeTile,
  canPlace,
  hasResources,
  idx,
  invalidateStorageCapacity,
  removeNode,
  log,
  placeBuilding,
  removeBuilding,
  tileToWorldX,
  tileToWorldY,
  worldToTileX,
  worldToTileY,
} from './sim/world';
import { RNG } from './core/rng';
import { PROGRESSION_TIERS, buildingDef } from './data/buildings';
import { SIM_SECONDS_PER_HOUR } from './sim/tasks';
import { eventTick } from './sim/events';
import { injure, kill } from './sim/medical';
import { populateWildlife } from './sim/wildlife';
import { createJob, deleteJob, hasJob, JOB_WORK } from './sim/jobs';
import { canExplore, startExpedition } from './sim/exploration';
import { animalAt } from './sim/wildlife';
import { ANIMAL_MAP } from './data/animals';
import { AUTOSAVE_SLOT, loadGame, saveGame } from './sim/save';
import { isUnlocked } from './sim/progression';
import { abandonBed, releaseBed } from './sim/ai';

export type Tool = 'select' | 'build' | 'mark' | 'unmark' | 'demolish';

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
  until: number;
}

const AUTOSAVE_INTERVAL = 120; // sim-seconds (~4 game hours)

export class GameEngine {
  world: World;
  cam = new Camera();
  fx = new Fx();
  pf: PathFinder;
  renderer: Renderer | null = null;
  canvas: HTMLCanvasElement | null = null;

  speed = 1;
  speeds = [0, 1, 2, 4];
  /** Unlocked by triple-tapping the logo; adds fast-forward speeds. */
  debug = false;
  running = false;

  selected: number[] = [];
  selectedBuildingId = -1;
  /** True once the player has used a touch screen; the UI adapts to it. */
  touch = false;
  /** On touch, taps give orders instead of selecting while this is on. */
  orderMode = false;
  hoveredCharId = -1;
  hoverTile: { tx: number; ty: number } | null = null;
  tool: Tool = 'select';
  buildDefId: string | null = null;
  notices: Notice[] = [];
  followId = -1;

  /** Player preferences. Not part of the world, so they survive a new game. */
  settings = {
    autosave: true,
    speechBubbles: true,
    autoGather: true,
    pauseOnDeath: false,
  };

  private listeners = new Set<() => void>();
  private version = 0;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private emitAcc = 0;
  private autosaveAcc = 0;
  private keys = new Set<string>();
  private dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  private dragging: 'none' | 'pan' | 'select' | 'mark' = 'none';
  private dragCurrent: { x: number; y: number; wx: number; wy: number } | null = null;
  /** Live touch points, keyed by pointerId, for pinch-zoom and two-finger pan. */
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; midX: number; midY: number } | null = null;
  private longPress: ReturnType<typeof setTimeout> | null = null;
  private suppressTap = false;
  private nextNoticeId = 1;
  private lastDeathCount = 0;
  private rng = new RNG(12345);

  constructor(world?: World) {
    this.world = world ?? createWorld();
    this.pf = new PathFinder(this.world.width, this.world.height);
    this.cam.setWorldSize(this.world.width, this.world.height);
    this.cam.centerOn(
      tileToWorldX(this.world.campCenter.tx),
      tileToWorldY(this.world.campCenter.ty)
    );
  }

  /* ---------------------------------------------------------------- */
  /* React bridge                                                      */
  /* ---------------------------------------------------------------- */

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = () => this.version;

  emit() {
    this.version++;
    for (const cb of this.listeners) cb();
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.handleResize();
  }

  detach() {
    this.stop();
    this.canvas = null;
    this.renderer = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      const dtReal = Math.min(0.05, (t - this.lastTime) / 1000);
      this.lastTime = t;
      this.frame(dtReal);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  handleResize() {
    if (!this.canvas || !this.renderer) return;
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.resize(w, h, dpr);
    this.cam.setViewport(w, h);
    this.cam.clampToWorld();
  }

  newGame(seed?: number) {
    this.world = createWorld(seed);
    this.pf.resize(this.world.width, this.world.height);
    this.fx.clear();
    this.selected = [];
    this.followId = -1;
    this.tool = 'select';
    this.buildDefId = null;
    this.cam.setWorldSize(this.world.width, this.world.height);
    this.cam.zoom = 1.7;
    this.cam.targetZoom = 1.7;
    this.cam.centerOn(
      tileToWorldX(this.world.campCenter.tx),
      tileToWorldY(this.world.campCenter.ty)
    );
    this.renderer?.invalidateCharacters();
    this.renderer?.invalidateTerrain();
    this.speed = 1;
    this.emit();
  }

  adoptWorld(world: World) {
    this.world = world;
    this.pf.resize(world.width, world.height);
    this.fx.clear();
    this.selected = [];
    this.followId = -1;
    this.tool = 'select';
    this.buildDefId = null;
    this.cam.setWorldSize(world.width, world.height);
    this.cam.centerOn(tileToWorldX(world.campCenter.tx), tileToWorldY(world.campCenter.ty));
    this.renderer?.invalidateCharacters();
    this.renderer?.invalidateTerrain();
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  private frame(dtReal: number) {
    const ctx: Ctx = { pf: this.pf, fx: this.fx, autoGather: this.settings.autoGather };

    this.handleKeyboardPan(dtReal);

    if (this.speed > 0) {
      this.accumulator += dtReal * this.speed;
      let steps = 0;
      while (this.accumulator >= SIM_STEP && steps < 24) {
        stepWorld(this.world, SIM_STEP, ctx);
        this.accumulator -= SIM_STEP;
        steps++;
      }
      if (this.accumulator > SIM_STEP * 24) this.accumulator = 0;

      if (this.settings.autosave) {
        this.autosaveAcc += dtReal * this.speed;
        if (this.autosaveAcc >= AUTOSAVE_INTERVAL) {
          this.autosaveAcc = 0;
          if (saveGame(this.world, AUTOSAVE_SLOT)) this.notice('Autosaved', 'info');
        }
      }
    }

    if (this.settings.pauseOnDeath) {
      const deaths = this.world.stats.deaths;
      if (deaths > this.lastDeathCount) {
        this.lastDeathCount = deaths;
        if (this.speed > 0) {
          this.setSpeed(0);
          this.notice('A survivor has died', 'warn');
        }
      } else if (deaths < this.lastDeathCount) {
        this.lastDeathCount = deaths;
      }
    } else {
      this.lastDeathCount = this.world.stats.deaths;
    }

    this.fx.update(dtReal);
    this.cam.update(dtReal, this.fx.shake);

    if (this.followId >= 0) {
      const c = this.world.characters.find((x) => x.id === this.followId);
      if (c && c.alive) this.cam.centerOn(c.x, c.y);
      else this.followId = -1;
    }

    this.pruneNotices();

    if (this.renderer) {
      const opts: RenderOptions = {
        showSpeech: this.settings.speechBubbles,
        selectedIds: this.selected,
        hoverTile: this.tool === 'select' ? null : this.hoverTile,
        buildPreview: this.buildPreview(),
        markPreview: this.markPreview(),
        showJobOverlay: false,
        hoveredCharId: this.hoveredCharId,
      };
      this.renderer.render(this.world, this.cam, this.fx, opts, dtReal);
    }

    this.emitAcc += dtReal;
    if (this.emitAcc >= 0.12) {
      this.emitAcc = 0;
      this.emit();
    }
  }

  private buildPreview() {
    if (this.tool !== 'build' || !this.buildDefId || !this.hoverTile) return null;
    const def = buildingDef(this.buildDefId);
    const tx = this.hoverTile.tx - Math.floor((def.w - 1) / 2);
    const ty = this.hoverTile.ty - Math.floor((def.h - 1) / 2);
    const placement = canPlace(this.world, this.buildDefId, tx, ty);
    const affordable = hasResources(this.world, def.cost);
    return {
      defId: this.buildDefId,
      tx,
      ty,
      valid: placement.ok && affordable,
      reason: !placement.ok ? placement.reason : affordable ? '' : 'Not enough materials',
    };
  }

  private markPreview() {
    if (this.dragging !== 'mark' || !this.dragStart || !this.dragCurrent) return null;
    return {
      x0: this.dragStart.wx,
      y0: this.dragStart.wy,
      x1: this.dragCurrent.wx,
      y1: this.dragCurrent.wy,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Notices                                                           */
  /* ---------------------------------------------------------------- */

  notice(text: string, tone: Notice['tone'] = 'info') {
    this.notices.push({
      id: this.nextNoticeId++,
      text,
      tone,
      until: performance.now() / 1000 + 3.5,
    });
    if (this.notices.length > 5) this.notices.shift();
    this.emit();
  }

  private pruneNotices() {
    const now = performance.now() / 1000;
    let changed = false;
    for (let i = this.notices.length - 1; i >= 0; i--) {
      if (this.notices[i].until < now) {
        this.notices.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  setSpeed(s: number) {
    this.speed = s;
    this.emit();
  }

  /** The speeds currently offered, including the debug fast-forwards. */
  availableSpeeds(): number[] {
    return this.debug ? [0, 1, 2, 4, 8, 20] : this.speeds;
  }

  setDebug(on: boolean) {
    this.debug = on;
    if (!on && this.speed > 4) this.setSpeed(4);
    this.emit();
  }

  cycleSpeed() {
    const i = this.speeds.indexOf(this.speed);
    this.setSpeed(this.speeds[(i + 1) % this.speeds.length]);
  }

  togglePause() {
    this.setSpeed(this.speed === 0 ? 1 : 0);
  }

  setTool(t: Tool, defId?: string) {
    this.tool = t;
    this.buildDefId = t === 'build' ? (defId ?? this.buildDefId) : null;
    if (t !== 'select') this.orderMode = false;
    this.emit();
  }

  setOrderMode(on: boolean) {
    this.orderMode = on;
    if (on) this.setTool('select');
    this.emit();
  }

  /**
   * Escape is a single back-step, not two: it cancels the active tool, then
   * clears the selection, and only then asks the shell to open the menu.
   * @returns true when nothing was left to cancel.
   */
  escape(): boolean {
    if (this.tool !== 'select') {
      this.setTool('select');
      return false;
    }
    if (this.selected.length || this.selectedBuildingId >= 0) {
      this.selected = [];
      this.selectedBuildingId = -1;
      this.emit();
      return false;
    }
    return true;
  }

  keyDown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (k === '1') this.setSpeed(0);
    else if (k === '2') this.setSpeed(1);
    else if (k === '3') this.setSpeed(2);
    else if (k === '4') this.setSpeed(4);
    else if (k === 'b') this.setTool(this.tool === 'build' ? 'select' : 'build');
    else if (k === 'c') this.setTool(this.tool === 'mark' ? 'select' : 'mark');
    else if (k === 'f') {
      if (this.selected.length === 1) {
        this.followId = this.followId === this.selected[0] ? -1 : this.selected[0];
        this.emit();
      }
    } else if (k === 'tab') {
      e.preventDefault();
      this.selectNextSurvivor();
    }
  }

  keyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
  }

  private handleKeyboardPan(dt: number) {
    let dx = 0;
    let dy = 0;
    const s = 620 * dt;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx += s;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx -= s;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy += s;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy -= s;
    if (dx || dy) {
      this.followId = -1;
      this.cam.panBy(dx, dy);
    }
  }

  pointerDown(e: PointerEvent, rect: DOMRect) {
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (isTouch && !this.touch) {
      this.touch = true;
      this.emit();
    }

    this.pointers.set(e.pointerId, { x: sx, y: sy });
    if (this.pointers.size === 2) {
      this.beginPinch();
      this.cancelLongPress();
      this.dragging = 'none';
      this.dragStart = null;
      return;
    }
    if (this.pointers.size > 2) return;

    const wp = this.cam.screenToWorld(sx, sy);
    this.dragStart = { x: sx, y: sy, wx: wp.x, wy: wp.y };
    this.dragCurrent = { ...this.dragStart };
    this.suppressTap = false;

    if (e.button === 1 || e.button === 2) {
      this.dragging = e.button === 1 ? 'pan' : 'none';
      return;
    }
    if (this.tool === 'mark' || this.tool === 'unmark') {
      this.dragging = 'mark';
      return;
    }
    if (isTouch) {
      // One finger drags the world; a tap selects (or gives an order).
      // Holding still for a moment is the touch equivalent of a right click.
      this.dragging = this.tool === 'select' ? 'pan' : 'none';
      this.hoverTile = {
        tx: Math.max(0, Math.min(this.world.width - 1, worldToTileX(wp.x))),
        ty: Math.max(0, Math.min(this.world.height - 1, worldToTileY(wp.y))),
      };
      if (this.tool === 'select' && !this.orderMode) {
        this.longPress = setTimeout(() => {
          this.longPress = null;
          this.suppressTap = true;
          this.dragging = 'none';
          this.rightClick(wp.x, wp.y);
        }, 420);
      }
      return;
    }
    if (this.tool === 'select') this.dragging = 'select';
    else this.dragging = 'none';
  }

  private beginPinch() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    this.pinch = {
      dist: Math.max(1, Math.hypot(dx, dy)),
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
  }

  private cancelLongPress() {
    if (this.longPress) {
      clearTimeout(this.longPress);
      this.longPress = null;
    }
  }

  pointerCancel(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();
    if (this.pointers.size < 2) this.pinch = null;
    this.dragging = 'none';
    this.dragStart = null;
    this.dragCurrent = null;
  }

  pointerMove(e: PointerEvent, rect: DOMRect) {
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: sx, y: sy });
    if (this.pointers.size >= 2) {
      this.cancelLongPress();
      const pts = [...this.pointers.values()];
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      if (this.pinch) {
        this.followId = -1;
        this.cam.applyZoom(midX, midY, dist / this.pinch.dist);
        this.cam.panBy(midX - this.pinch.midX, midY - this.pinch.midY);
      }
      this.pinch = { dist, midX, midY };
      return;
    }

    const wp = this.cam.screenToWorld(sx, sy);
    this.hoverTile = {
      tx: Math.max(0, Math.min(this.world.width - 1, worldToTileX(wp.x))),
      ty: Math.max(0, Math.min(this.world.height - 1, worldToTileY(wp.y))),
    };
    this.hoveredCharId = this.characterAt(wp.x, wp.y)?.id ?? -1;

    if (this.dragStart) {
      this.dragCurrent = { x: sx, y: sy, wx: wp.x, wy: wp.y };
      if (Math.hypot(sx - this.dragStart.x, sy - this.dragStart.y) > 8) this.cancelLongPress();
    }

    if (this.dragging === 'pan' && this.dragStart) {
      this.followId = -1;
      this.cam.panBy(sx - this.dragStart.x, sy - this.dragStart.y);
      this.dragStart.x = sx;
      this.dragStart.y = sy;
    }
    if (this.dragging === 'select' && this.dragStart) {
      const moved = Math.hypot(sx - this.dragStart.x, sy - this.dragStart.y);
      if (moved < 4) return;
    }
  }

  pointerUp(e: PointerEvent, rect: DOMRect) {
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const wasPinching = this.pointers.size >= 2;
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();
    if (this.pointers.size < 2) this.pinch = null;
    if (wasPinching) {
      this.dragging = 'none';
      this.dragStart = null;
      this.dragCurrent = null;
      return;
    }

    const wp = this.cam.screenToWorld(sx, sy);
    const start = this.dragStart;
    const wasDragging = this.dragging;
    this.dragging = 'none';
    this.dragStart = null;
    this.dragCurrent = null;

    if (this.suppressTap) {
      this.suppressTap = false;
      return;
    }

    if (e.button === 2) {
      this.rightClick(wp.x, wp.y);
      return;
    }
    if (e.button === 1) return;

    if (isTouch) {
      const moved = start ? Math.hypot(sx - start.x, sy - start.y) : 0;
      if (wasDragging === 'mark' && start) {
        this.applyMarkRect(start.wx, start.wy, wp.x, wp.y, this.tool === 'mark');
        return;
      }
      if (moved > 10) return; // it was a pan, not a tap
      if (this.tool === 'build') {
        this.tryPlaceBuilding(wp.x, wp.y, false);
        return;
      }
      if (this.tool === 'demolish') {
        this.demolishAt(wp.x, wp.y);
        return;
      }
      if (this.orderMode) {
        this.rightClick(wp.x, wp.y);
        return;
      }
      this.leftClick(wp.x, wp.y, false);
      return;
    }

    if (wasDragging === 'mark' && start) {
      this.applyMarkRect(start.wx, start.wy, wp.x, wp.y, this.tool === 'mark');
      return;
    }

    const dragDist = start ? Math.hypot(sx - start.x, sy - start.y) : 0;
    if (wasDragging === 'select' && start && dragDist > 6) {
      this.boxSelect(start.wx, start.wy, wp.x, wp.y);
      return;
    }

    if (this.tool === 'build') {
      this.tryPlaceBuilding(wp.x, wp.y, e.shiftKey);
      return;
    }
    if (this.tool === 'demolish') {
      this.demolishAt(wp.x, wp.y);
      return;
    }
    this.leftClick(wp.x, wp.y, e.shiftKey);
  }

  /** Zoom buttons for touch, where there is no wheel. */
  zoomStep(dir: number) {
    this.cam.applyZoom(this.cam.centerX, this.cam.centerY, dir > 0 ? 1.25 : 0.8);
    this.emit();
  }

  /** Tell the camera how much of the canvas the HUD is covering. */
  setHudInsets(left: number, right: number, top: number, bottom: number) {
    const c = this.cam;
    if (
      c.insetLeft === left &&
      c.insetRight === right &&
      c.insetTop === top &&
      c.insetBottom === bottom
    )
      return;
    c.setInsets(left, right, top, bottom);
  }

  wheel(e: WheelEvent, rect: DOMRect) {
    this.cam.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY);
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* Picking                                                           */
  /* ---------------------------------------------------------------- */

  characterAt(x: number, y: number): Character | null {
    let best: Character | null = null;
    let bestD = 18 * 18;
    for (const c of this.world.characters) {
      if (!c.alive) continue;
      const dx = c.x - x;
      const dy = c.y - 10 - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  nodeAtTile(tx: number, ty: number): ResourceNode | null {
    if (tx < 0 || ty < 0 || tx >= this.world.width || ty >= this.world.height) return null;
    const id = this.world.nodeAt[idx(this.world, tx, ty)];
    if (id < 0) return null;
    const n = this.world.nodes.get(id);
    return n && !n.depleted ? n : null;
  }

  buildingAtTile(tx: number, ty: number): Building | null {
    if (tx < 0 || ty < 0 || tx >= this.world.width || ty >= this.world.height) return null;
    const id = this.world.buildingAt[idx(this.world, tx, ty)];
    if (id < 0) return null;
    return this.world.buildings.get(id) ?? null;
  }

  siteAt(x: number, y: number): ExplorationSite | null {
    for (const s of this.world.sites) {
      if (!s.discovered) continue;
      const dx = tileToWorldX(s.tx) - x;
      const dy = tileToWorldY(s.ty) - 8 - y;
      if (dx * dx + dy * dy < 22 * 22) return s;
    }
    return null;
  }

  /* ---------------------------------------------------------------- */
  /* Commands                                                          */
  /* ---------------------------------------------------------------- */

  private leftClick(x: number, y: number, additive: boolean) {
    const c = this.characterAt(x, y);
    if (c) {
      this.selectedBuildingId = -1;
      if (additive) {
        if (this.selected.includes(c.id)) this.selected = this.selected.filter((i) => i !== c.id);
        else this.selected = [...this.selected, c.id];
      } else {
        this.selected = [c.id];
      }
      this.emit();
      return;
    }
    const b = this.buildingAtTile(worldToTileX(x), worldToTileY(y));
    if (b) {
      this.selectedBuildingId = b.id;
      this.selected = [];
      this.emit();
      return;
    }
    if (!additive) {
      this.selected = [];
      this.selectedBuildingId = -1;
      this.emit();
    }
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    const found: number[] = [];
    for (const c of this.world.characters) {
      if (!c.alive) continue;
      if (c.x >= minX && c.x <= maxX && c.y >= minY - 12 && c.y <= maxY) found.push(c.id);
    }
    this.selected = found;
    if (found.length) this.selectedBuildingId = -1;
    this.emit();
  }

  selectCharacter(id: number) {
    this.selected = [id];
    this.selectedBuildingId = -1;
    this.emit();
  }

  selectNextSurvivor() {
    const living = this.world.characters.filter((c) => c.alive);
    if (!living.length) return;
    const cur = this.selected[0] ?? -1;
    const i = living.findIndex((c) => c.id === cur);
    const next = living[(i + 1) % living.length];
    this.selected = [next.id];
    this.centerOnCharacter(next.id);
    this.emit();
  }

  centerOnCharacter(id: number) {
    const c = this.world.characters.find((x) => x.id === id);
    if (c) this.cam.centerOn(c.x, c.y);
  }

  private rightClick(x: number, y: number) {
    if (this.tool !== 'select') {
      this.setTool('select');
      return;
    }
    if (!this.selected.length) return;
    const w = this.world;
    const tx = worldToTileX(x);
    const ty = worldToTileY(y);

    const site = this.siteAt(x, y);
    if (site) {
      this.orderExplore(this.selected, site);
      return;
    }

    const animal = animalAt(this.world, x, y, 20);
    if (animal) {
      this.orderHunt(this.selected, animal);
      return;
    }

    const node = this.nodeAtTile(tx, ty);
    if (node) {
      this.orderWorkNode(this.selected, node);
      return;
    }

    const building = this.buildingAtTile(tx, ty);
    if (building && building.state === 'blueprint') {
      this.orderBuild(this.selected, building);
      return;
    }

    this.orderMove(this.selected, tx, ty);
  }

  orderMove(ids: number[], tx: number, ty: number) {
    const w = this.world;
    let ok = false;
    ids.forEach((id, i) => {
      const c = w.characters.find((x) => x.id === id);
      if (!c || !c.alive) return;
      // Spread a group out so they do not all target one tile.
      let gx = tx;
      let gy = ty;
      if (ids.length > 1) {
        const a = (i / ids.length) * Math.PI * 2;
        const r = Math.min(3, Math.ceil(ids.length / 3));
        gx = Math.round(tx + Math.cos(a) * r);
        gy = Math.round(ty + Math.sin(a) * r);
      }
      const free = adjacentFreeTile(w, gx, gy) ?? { tx, ty };
      const dest =
        gx >= 0 && gy >= 0 && gx < w.width && gy < w.height && w.blocked[idx(w, gx, gy)] === 0
          ? { tx: gx, ty: gy }
          : free;
      if (c.jobId >= 0) {
        const j = w.jobs.get(c.jobId);
        if (j) j.assigned = -1;
        c.jobId = -1;
      }
      if (c.state === 'sleeping') releaseBed(w, c);
      c.order = { kind: 'move', tx: dest.tx, ty: dest.ty };
      c.activity = 'order';
      c.path = [];
      c.stuckT = 0;
      c.repathT = 0;
      c.thinkT = 0;
      ok = true;
    });
    if (ok) {
      this.fx.float(tileToWorldX(tx), tileToWorldY(ty) - 6, 'move', '#cfe8ff');
      this.emit();
    }
  }

  orderWorkNode(ids: number[], node: ResourceNode) {
    const w = this.world;
    node.marked = true;
    const spec = NODE_SPEC[node.kind];
    const type =
      spec.work === 'woodcutting' ? 'chop' : spec.work === 'mining' ? 'mine' : 'forage';
    let job = null;
    for (const j of w.jobs.values()) {
      if (j.type === type && j.targetId === node.id) {
        job = j;
        break;
      }
    }
    if (!job) {
      const at = adjacentFreeTile(w, node.tx, node.ty);
      if (!at) {
        this.notice('Nobody can reach that', 'warn');
        return;
      }
      job = createJob(w, type, {
        targetKind: 'node',
        targetId: node.id,
        tx: at.tx,
        ty: at.ty,
        priority: 80,
      });
    }
    const c = w.characters.find((x) => x.id === ids[0] && x.alive);
    if (c) {
      c.order = { kind: 'work', tx: job.tx, ty: job.ty, targetId: job.id };
      c.activity = 'order';
      c.path = [];
      c.thinkT = 0;
      if (c.state === 'sleeping') releaseBed(w, c);
    }
    this.emit();
  }

  /** Send the selection after a specific animal. */
  orderHunt(ids: number[], animal: Animal) {
    const w = this.world;
    animal.marked = true;
    let job = null;
    for (const j of w.jobs.values()) {
      if (j.type === 'hunt' && j.targetId === animal.id) {
        job = j;
        break;
      }
    }
    if (!job) {
      job = createJob(w, 'hunt', {
        targetKind: 'animal',
        targetId: animal.id,
        tx: Math.floor(animal.x / TILE),
        ty: Math.floor(animal.y / TILE),
        priority: 90,
      });
    }
    const c = w.characters.find((x) => x.id === ids[0] && x.alive);
    if (c) {
      c.order = { kind: 'work', tx: job.tx, ty: job.ty, targetId: job.id };
      c.activity = 'order';
      c.path = [];
      c.thinkT = 0;
      if (c.state === 'sleeping') releaseBed(w, c);
    }
    this.notice(`Hunting the ${ANIMAL_MAP[animal.kind].label.toLowerCase()}`, 'info');
    this.emit();
  }

  orderBuild(ids: number[], b: Building) {
    const w = this.world;
    const c = w.characters.find((x) => x.id === ids[0] && x.alive);
    if (!c) return;
    // Prefer an existing job for this site; otherwise let the job system make one.
    let job = null;
    for (const j of w.jobs.values()) {
      if (j.targetId === b.id && (j.type === 'build' || j.type === 'haulToSite')) {
        job = j;
        break;
      }
    }
    if (!job) {
      this.notice('Materials are on the way', 'info');
      return;
    }
    c.order = { kind: 'work', tx: job.tx, ty: job.ty, targetId: job.id };
    c.activity = 'order';
    c.path = [];
    c.thinkT = 0;
    this.emit();
  }

  orderExplore(ids: number[], site: ExplorationSite) {
    const w = this.world;
    let sent = 0;
    for (const id of ids) {
      const c = w.characters.find((x) => x.id === id);
      if (!c) continue;
      if (!canExplore(c)) {
        this.notice(`${c.name} is in no condition to travel`, 'warn');
        continue;
      }
      if (c.jobId >= 0) {
        const j = w.jobs.get(c.jobId);
        if (j) j.assigned = -1;
        c.jobId = -1;
      }
      if (c.state === 'sleeping') releaseBed(w, c);
      c.order = null;
      c.path = [];
      c.thinkT = 0;
      startExpedition(w, c, site);
      sent++;
    }
    if (sent) this.emit();
  }

  cancelOrders(ids: number[]) {
    const w = this.world;
    for (const id of ids) {
      const c = w.characters.find((x) => x.id === id);
      if (!c) continue;
      c.order = null;
      if (c.jobId >= 0) {
        const j = w.jobs.get(c.jobId);
        if (j) j.assigned = -1;
        c.jobId = -1;
      }
      c.path = [];
      c.activity = 'idle';
      c.thinkT = 0;
    }
    this.emit();
  }

  /* -------- building -------- */

  tryPlaceBuilding(x: number, y: number, keepTool: boolean) {
    if (!this.buildDefId) return;
    const w = this.world;
    const def = buildingDef(this.buildDefId);
    const tx = worldToTileX(x) - Math.floor((def.w - 1) / 2);
    const ty = worldToTileY(y) - Math.floor((def.h - 1) / 2);
    const placement = canPlace(w, this.buildDefId, tx, ty);
    if (!placement.ok) {
      this.notice(placement.reason, 'warn');
      return;
    }
    if (!isUnlocked(w, this.buildDefId)) {
      this.notice('Not unlocked yet', 'warn');
      return;
    }
    if (!hasResources(w, def.cost)) {
      this.notice('Not enough materials in store', 'warn');
      return;
    }
    placeBuilding(w, this.buildDefId, tx, ty, false, this.rng);
    this.fx.dust((tx + def.w / 2) * TILE, (ty + def.h / 2) * TILE, '#cfe8ff');
    if (!keepTool) {
      // Keep the tool active — placing several of the same thing is common.
    }
    this.emit();
  }

  cancelBlueprint(b: Building) {
    const w = this.world;
    if (b.state !== 'blueprint') return;
    // Return whatever was already delivered.
    for (const k of Object.keys(b.delivered) as (keyof typeof b.delivered)[]) {
      const amount = b.delivered[k] ?? 0;
      if (amount > 0) w.stock[k] += amount;
    }
    for (const j of Array.from(w.jobs.values())) {
      if (j.targetId === b.id) deleteJob(w, j.id);
    }
    removeBuilding(w, b);
    this.emit();
  }

  demolishAt(x: number, y: number) {
    const b = this.buildingAtTile(worldToTileX(x), worldToTileY(y));
    if (!b) return;
    if (b.state === 'blueprint') {
      this.cancelBlueprint(b);
      return;
    }
    const def = buildingDef(b.def);
    const w = this.world;
    for (const k of Object.keys(def.cost) as (keyof typeof w.stock)[]) {
      w.stock[k] += Math.floor((def.cost[k] ?? 0) * 0.5);
    }
    for (const c of w.characters) {
      if (c.sleepBuildingId === b.id) abandonBed(w, c);
    }
    for (const j of Array.from(w.jobs.values())) {
      if (j.targetId === b.id) deleteJob(w, j.id);
    }
    removeBuilding(w, b);
    log(w, 'info', 'Dismantled', `The ${def.label} was taken apart for materials.`, []);
    this.emit();
  }

  upgradeBuilding(b: Building) {
    const w = this.world;
    const def = buildingDef(b.def);
    if (!def.upgradeTo || b.state !== 'built') return;
    const next = buildingDef(def.upgradeTo);
    if (!isUnlocked(w, next.id)) {
      this.notice(`${next.label} is not unlocked yet`, 'warn');
      return;
    }
    // The upgrade must fit; footprints can grow.
    const tx = b.tx;
    const ty = b.ty;
    const saved = { ...b };
    removeBuilding(w, b);
    const placement = canPlace(w, next.id, tx, ty);
    if (!placement.ok) {
      // Put the original back exactly as it was.
      const restored = placeBuilding(w, saved.def, tx, ty, true, this.rng);
      restored.hp = saved.hp;
      restored.farm = saved.farm;
      restored.users = saved.users;
      this.notice(`No room for the ${next.label} here`, 'warn');
      this.emit();
      return;
    }
    const nb = placeBuilding(w, next.id, tx, ty, false, this.rng);
    nb.level = saved.level + 1;
    log(w, 'info', 'Upgrade started', `The ${def.label} is being upgraded to a ${next.label}.`, []);
    this.emit();
  }

  /* -------- marking -------- */

  applyMarkRect(x0: number, y0: number, x1: number, y1: number, mark: boolean) {
    const w = this.world;
    const tx0 = worldToTileX(Math.min(x0, x1));
    const ty0 = worldToTileY(Math.min(y0, y1));
    const tx1 = worldToTileX(Math.max(x0, x1));
    const ty1 = worldToTileY(Math.max(y0, y1));
    let count = 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const n = this.nodeAtTile(tx, ty);
        if (!n) continue;
        if (n.marked === mark) continue;
        n.marked = mark;
        count++;
        if (!mark) {
          for (const j of Array.from(w.jobs.values())) {
            if (j.targetId === n.id && j.assigned < 0) deleteJob(w, j.id);
          }
        }
      }
    }
    if (count) {
      this.notice(mark ? `${count} marked for clearing` : `${count} unmarked`, 'info');
    }
    this.emit();
  }

  markSingle(tx: number, ty: number, mark: boolean) {
    const n = this.nodeAtTile(tx, ty);
    if (!n) return;
    n.marked = mark;
    this.emit();
  }

  /* -------- survivor management -------- */

  /** Pin a survivor to one kind of work, let them choose, or stand them down. */
  setAssignment(charId: number, assignment: Assignment) {
    const c = this.world.characters.find((x) => x.id === charId);
    if (!c) return;
    c.assignment = assignment;
    if (c.jobId >= 0) {
      const j = this.world.jobs.get(c.jobId);
      // Drop work that no longer matches the new assignment.
      if (j && (assignment === 'rest' || (assignment !== 'auto' && j.work !== assignment))) {
        j.assigned = -1;
        c.jobId = -1;
        c.activity = 'idle';
      }
    }
    c.thinkT = 0;
    this.emit();
  }

  /** Put every survivor back on automatic work selection. */
  resetAssignments() {
    for (const c of this.world.characters) {
      if (!c.alive) continue;
      c.assignment = 'auto';
      c.workEnabled = true;
      c.thinkT = 0;
    }
    this.notice('Everyone back on automatic work', 'good');
  }

  /** Restore every survivor's work priorities to the defaults. */
  resetPriorities() {
    for (const c of this.world.characters) {
      if (!c.alive) continue;
      for (const wt of WORK_TYPES) c.priorities[wt] = 3;
      c.priorities.medicine = c.skills.medicine.level >= 3 ? 4 : 2;
      c.priorities.cooking = c.skills.cooking.level >= 3 ? 4 : 2;
      c.priorities.crafting = c.skills.crafting.level >= 3 ? 4 : 2;
      c.thinkT = 0;
    }
    this.notice('Work priorities reset', 'good');
  }

  /** Clear every outstanding clearing mark in the world. */
  clearAllMarks() {
    let n = 0;
    for (const node of this.world.nodes.values()) {
      if (!node.marked) continue;
      node.marked = false;
      n++;
    }
    for (const j of Array.from(this.world.jobs.values())) {
      if (j.targetKind === 'node' && j.assigned < 0) deleteJob(this.world, j.id);
    }
    this.notice(n ? `${n} clearing marks removed` : 'Nothing was marked', 'info');
  }

  /** Cancel every blueprint that has not been started. */
  cancelAllBlueprints() {
    let n = 0;
    for (const b of Array.from(this.world.buildings.values())) {
      if (b.state !== 'blueprint') continue;
      this.cancelBlueprint(b);
      n++;
    }
    this.notice(n ? `${n} blueprints cancelled` : 'No blueprints pending', 'info');
  }

  setPriority(charId: number, work: string, value: number) {
    const c = this.world.characters.find((x) => x.id === charId);
    if (!c) return;
    (c.priorities as Record<string, number>)[work] = value;
    c.thinkT = 0;
    this.emit();
  }

  toggleWork(charId: number) {
    const c = this.world.characters.find((x) => x.id === charId);
    if (!c) return;
    c.workEnabled = !c.workEnabled;
    if (!c.workEnabled && c.jobId >= 0) {
      const j = this.world.jobs.get(c.jobId);
      if (j) j.assigned = -1;
      c.jobId = -1;
      c.activity = 'idle';
    }
    c.thinkT = 0;
    this.emit();
  }

  /* ---------------------------------------------------------------- */
  /* Debug tools                                                       */
  /*                                                                   */
  /* Hidden behind a triple-tap on the logo. Everything here reaches    */
  /* straight into the simulation, so it is deliberately out of the     */
  /* way of normal play.                                               */
  /* ---------------------------------------------------------------- */

  debugAddResources(amount = 250) {
    for (const r of RESOURCE_TYPES) this.world.stock[r] += amount;
    this.notice(`+${amount} of every resource`, 'good');
  }

  debugFillNeeds() {
    for (const c of this.world.characters) {
      if (!c.alive) continue;
      c.hunger = 0;
      c.energy = 100;
      c.morale = 100;
      c.stress = 0;
      c.health = c.maxHealth;
      c.sickness = 0;
      c.injuries = [];
    }
    this.notice('Everyone restored', 'good');
  }

  debugSkipHours(hours: number) {
    const ctx: Ctx = { pf: this.pf, fx: this.fx, autoGather: this.settings.autoGather };
    const steps = Math.round((hours * SIM_SECONDS_PER_HOUR) / SIM_STEP);
    for (let i = 0; i < steps; i++) stepWorld(this.world, SIM_STEP, ctx);
    this.notice(`Skipped ${hours} game hours`, 'info');
    this.emit();
  }

  debugSetTime(hour: number) {
    const w = this.world;
    const day = Math.floor(w.time.minutes / 1440);
    w.time.minutes = day * 1440 + hour * 60;
    this.notice(`Time set to ${String(hour).padStart(2, '0')}:00`, 'info');
    this.emit();
  }

  debugTriggerEvent() {
    eventTick(this.world, this.fx);
    this.emit();
  }

  debugSetWeather(kind: World['weather']['kind']) {
    this.world.weather.kind = kind;
    this.world.weather.intensity = 1;
    this.world.weather.t = 300;
    this.notice(`Weather: ${kind}`, 'info');
    this.emit();
  }

  debugSpawnAnimals(n = 6) {
    populateWildlife(this.world, this.world.animals.length + n);
    this.notice(`Wildlife restocked (${this.world.animals.length})`, 'info');
    this.emit();
  }

  debugInjureSelected() {
    const c = this.world.characters.find((x) => x.id === this.selected[0]);
    if (!c) {
      this.notice('Select a survivor first', 'warn');
      return;
    }
    injure(this.world, c, null, 0.6, 'a debug wound', this.fx);
    this.emit();
  }

  debugKillSelected() {
    const c = this.world.characters.find((x) => x.id === this.selected[0]);
    if (!c || !c.alive) {
      this.notice('Select a living survivor first', 'warn');
      return;
    }
    kill(this.world, c, 'a debug command', this.fx);
    this.emit();
  }

  debugUnlockAll() {
    this.world.progression.level = PROGRESSION_TIERS[PROGRESSION_TIERS.length - 1].level;
    this.world.progression.wallsUnlocked = true;
    this.notice('All structures unlocked', 'good');
    this.emit();
  }

  debugRevealMap() {
    for (const s of this.world.sites) s.discovered = true;
    this.notice('All expedition sites revealed', 'info');
    this.emit();
  }

  debugCompleteBlueprints() {
    let n = 0;
    for (const b of this.world.buildings.values()) {
      if (b.state !== 'blueprint') continue;
      const def = buildingDef(b.def);
      for (const k of Object.keys(def.cost) as (keyof typeof this.world.stock)[]) {
        b.delivered[k] = def.cost[k] ?? 0;
      }
      b.progress = 1;
      b.state = 'built';
      b.hp = b.maxHp;
      if (def.farm && b.farm) for (const cell of b.farm) cell.tilled = true;
      n++;
    }
    invalidateStorageCapacity(this.world);
    this.notice(n ? `${n} blueprints completed` : 'No blueprints pending', 'info');
    this.emit();
  }

  debugClearForest(radius = 16) {
    const w = this.world;
    let n = 0;
    for (const node of Array.from(w.nodes.values())) {
      const d = Math.hypot(node.tx - w.campCenter.tx, node.ty - w.campCenter.ty);
      if (d > radius) continue;
      if (node.kind === 'berryBush' || node.kind === 'herbPatch') continue;
      removeNode(w, node);
      n++;
    }
    this.renderer?.invalidateTerrain();
    this.notice(`${n} obstacles removed near camp`, 'info');
    this.emit();
  }

  /* -------- save / load -------- */

  save(slot: string): boolean {
    const ok = saveGame(this.world, slot);
    this.notice(ok ? 'Game saved' : 'Save failed', ok ? 'good' : 'warn');
    return ok;
  }

  load(slot: string): boolean {
    const w = loadGame(slot);
    if (!w) {
      this.notice('No save in that slot', 'warn');
      return false;
    }
    this.adoptWorld(w);
    this.notice('Game loaded', 'good');
    return true;
  }
}
