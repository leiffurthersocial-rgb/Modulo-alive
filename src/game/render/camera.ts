import { TILE } from '../core/types';
import { clamp } from '../core/util';

export class Camera {
  /** World-space centre of the view. */
  x = 0;
  y = 0;
  zoom = 1.6;
  targetZoom = 1.6;
  minZoom = 0.55;
  maxZoom = 3.2;
  viewW = 800;
  viewH = 600;
  /**
   * How much of each edge the HUD covers. The canvas spans the whole window,
   * so without this the camera would centre the world behind a side panel.
   */
  insetLeft = 0;
  insetRight = 0;
  insetTop = 0;
  insetBottom = 0;
  worldW = 0;
  worldH = 0;
  shakeX = 0;
  shakeY = 0;

  setWorldSize(tilesW: number, tilesH: number) {
    this.worldW = tilesW * TILE;
    this.worldH = tilesH * TILE;
  }

  setViewport(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
  }

  setInsets(left: number, right: number, top: number, bottom: number) {
    this.insetLeft = left;
    this.insetRight = right;
    this.insetTop = top;
    this.insetBottom = bottom;
    this.clampToWorld();
  }

  /** Screen-space centre of the part of the canvas the player can actually see. */
  get centerX() {
    return this.insetLeft + (this.viewW - this.insetLeft - this.insetRight) / 2;
  }

  get centerY() {
    return this.insetTop + (this.viewH - this.insetTop - this.insetBottom) / 2;
  }

  centerOn(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.clampToWorld();
  }

  panBy(dxScreen: number, dyScreen: number) {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clampToWorld();
  }

  zoomAt(screenX: number, screenY: number, delta: number) {
    const before = this.screenToWorld(screenX, screenY);
    this.targetZoom = clamp(this.targetZoom * Math.pow(1.0016, -delta), this.minZoom, this.maxZoom);
    this.zoom = this.targetZoom;
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampToWorld();
  }

  /** Pinch zoom: scale by `factor` while keeping the given screen point fixed. */
  applyZoom(screenX: number, screenY: number, factor: number) {
    const before = this.screenToWorld(screenX, screenY);
    this.targetZoom = clamp(this.targetZoom * factor, this.minZoom, this.maxZoom);
    this.zoom = this.targetZoom;
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampToWorld();
  }

  update(dt: number, shake: number) {
    if (shake > 0) {
      this.shakeX = (Math.random() - 0.5) * shake * 10;
      this.shakeY = (Math.random() - 0.5) * shake * 10;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  clampToWorld() {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    if (this.worldW <= 0) return;
    if (this.worldW <= 0) return;
    if (this.worldW < halfW * 2) this.x = this.worldW / 2;
    else this.x = clamp(this.x, halfW, this.worldW - halfW);
    if (this.worldH < halfH * 2) this.y = this.worldH / 2;
    else this.y = clamp(this.y, halfH, this.worldH - halfH);
  }

  screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.centerX) / this.zoom + this.x,
      y: (sy - this.centerY) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.x) * this.zoom + this.centerX,
      y: (wy - this.y) * this.zoom + this.centerY,
    };
  }

  /** Visible world-space rectangle, padded for sprites that overhang. */
  bounds(pad = 64) {
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.viewW, this.viewH);
    return {
      x0: tl.x - pad,
      y0: tl.y - pad,
      x1: br.x + pad,
      y1: br.y + pad,
    };
  }

  /** The visible world rectangle, excluding whatever the HUD covers. */
  visibleBounds() {
    const tl = this.screenToWorld(this.insetLeft, this.insetTop);
    const br = this.screenToWorld(this.viewW - this.insetRight, this.viewH - this.insetBottom);
    return { x0: tl.x, y0: tl.y, x1: br.x, y1: br.y };
  }
}
