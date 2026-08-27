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
    if (this.worldW < halfW * 2) this.x = this.worldW / 2;
    else this.x = clamp(this.x, halfW, this.worldW - halfW);
    if (this.worldH < halfH * 2) this.y = this.worldH / 2;
    else this.y = clamp(this.y, halfH, this.worldH - halfH);
  }

  screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  /** Visible world-space rectangle, padded for sprites that overhang. */
  bounds(pad = 64) {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    return {
      x0: this.x - halfW - pad,
      y0: this.y - halfH - pad,
      x1: this.x + halfW + pad,
      y1: this.y + halfH + pad,
    };
  }
}
