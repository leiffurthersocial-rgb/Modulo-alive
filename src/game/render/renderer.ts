import {
  TILE,
  Terrain,
  type Building,
  type Character,
  type ResourceNode,
  type World,
} from '../core/types';
import { buildingDef } from '../data/buildings';
import { daylight, hourOfDay } from '../sim/time';
import { buildingCenterX, buildingCenterY, idx } from '../sim/world';
import type { Fx } from '../sim/fx';
import { Camera } from './camera';
import { drawBuilding } from './buildings';
import {
  CHAR_H,
  CHAR_W,
  buildBushSprites,
  buildCharacterSheet,
  buildRockSprites,
  buildSiteIcon,
  buildTerrainAtlas,
  buildScatterAtlas,
  buildTreeSprites,
  makeCanvas,
  SCATTER_VARIANTS,
  type NodeSprite,
  TERRAIN_VARIANTS,
} from './sprites';
import { SITE_PROFILES } from '../sim/exploration';

const CHUNK = 8; // tiles per cached chunk

function isGrass(w: World, tx: number, ty: number) {
  const t = w.terrain[idx(w, tx, ty)];
  return t === Terrain.Grass || t === Terrain.DarkGrass;
}

/** Cheap stable hash so ground detail never shifts between frames. */
function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) >>> 0;
}

export interface RenderOptions {
  selectedIds: number[];
  hoverTile: { tx: number; ty: number } | null;
  buildPreview: { defId: string; tx: number; ty: number; valid: boolean; reason: string } | null;
  markPreview: { x0: number; y0: number; x1: number; y1: number } | null;
  showJobOverlay: boolean;
  hoveredCharId: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private terrainAtlas!: HTMLCanvasElement;
  private scatterAtlas!: HTMLCanvasElement;
  private treeSprites: Record<string, NodeSprite[]> = {};
  private rockSprites: NodeSprite[] = [];
  private bushSprites: Record<string, { full: NodeSprite[]; empty: NodeSprite[] }> = {};
  private charSheets = new Map<number, HTMLCanvasElement>();
  private siteIcon!: HTMLCanvasElement;
  private chunks = new Map<number, HTMLCanvasElement>();
  private chunkStamp = -1;
  private lightCanvas: HTMLCanvasElement | null = null;
  private dpr = 1;
  time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new Error('2D canvas context unavailable');
    this.g = g;
    this.buildAssets();
  }

  private buildAssets() {
    this.terrainAtlas = buildTerrainAtlas();
    this.scatterAtlas = buildScatterAtlas();
    this.treeSprites.tree = buildTreeSprites('tree');
    this.treeSprites.pine = buildTreeSprites('pine');
    this.treeSprites.deadTree = buildTreeSprites('deadTree');
    this.rockSprites = buildRockSprites();
    for (const k of ['berryBush', 'herbPatch', 'reeds', 'stump', 'log'] as const) {
      this.bushSprites[k] = buildBushSprites(k);
    }
    this.siteIcon = buildSiteIcon();
  }

  /** Character sprite sheets are cached per survivor. */
  sheetFor(c: Character): HTMLCanvasElement {
    let s = this.charSheets.get(c.id);
    if (!s) {
      s = buildCharacterSheet(c.appearance);
      this.charSheets.set(c.id, s);
    }
    return s;
  }

  invalidateCharacters() {
    this.charSheets.clear();
  }

  invalidateTerrain() {
    this.chunks.clear();
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.lightCanvas = makeCanvas(Math.floor(cssW), Math.floor(cssH));
  }

  /* ---------------------------------------------------------------- */

  render(w: World, cam: Camera, fx: Fx, opts: RenderOptions, dtReal: number) {
    this.time += dtReal;
    const g = this.g;
    const cssW = this.canvas.width / this.dpr;
    const cssH = this.canvas.height / this.dpr;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#11170f';
    g.fillRect(0, 0, cssW, cssH);

    const stamp = w.stats.treesFelled * 10007 + w.stats.builtCount * 31 + w.buildings.size;
    if (stamp !== this.chunkStamp) {
      this.chunks.clear();
      this.chunkStamp = stamp;
    }

    g.save();
    g.translate(cssW / 2 + cam.shakeX, cssH / 2 + cam.shakeY);
    g.scale(cam.zoom, cam.zoom);
    g.translate(-cam.x, -cam.y);

    const b = cam.bounds(96);
    this.drawTerrain(g, w, b);
    this.drawGroundOverlays(g, w, b, opts);
    this.drawEntities(g, w, b, opts);
    this.drawSites(g, w, b);
    this.drawParticles(g, fx);
    this.drawBuildPreview(g, w, opts);
    this.drawMarkPreview(g, opts);

    g.restore();

    this.drawLighting(g, w, cam, cssW, cssH);
    this.drawWeather(g, w, cssW, cssH);
    this.drawScreenOverlays(g, w, cam, fx, opts);
  }

  /* ---------------------------------------------------------------- */

  private chunkCanvas(w: World, cx: number, cy: number): HTMLCanvasElement {
    const key = cy * 1000 + cx;
    let c = this.chunks.get(key);
    if (c) return c;
    c = makeCanvas(CHUNK * TILE, CHUNK * TILE);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const wx = cx * CHUNK + tx;
        const wy = cy * CHUNK + ty;
        if (wx >= w.width || wy >= w.height) continue;
        const t = w.terrain[idx(w, wx, wy)];
        const variant = (wx * 7 + wy * 13 + ((wx * wy) % 5)) % TERRAIN_VARIANTS;
        g.drawImage(
          this.terrainAtlas,
          variant * TILE,
          t * TILE,
          TILE,
          TILE,
          tx * TILE,
          ty * TILE,
          TILE,
          TILE
        );
      }
    }
    // Blend hard terrain seams and scatter ground detail. Both are baked into
    // the cached chunk, so they cost nothing per frame.
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const wx = cx * CHUNK + tx;
        const wy = cy * CHUNK + ty;
        if (wx >= w.width || wy >= w.height) continue;
        const here = w.terrain[idx(w, wx, wy)];
        const dx = tx * TILE;
        const dy = ty * TILE;

        if (here === Terrain.Water) {
          const left = wx > 0 && w.terrain[idx(w, wx - 1, wy)] !== Terrain.Water;
          const right = wx < w.width - 1 && w.terrain[idx(w, wx + 1, wy)] !== Terrain.Water;
          g.fillStyle = 'rgba(140,200,220,0.25)';
          if (left) g.fillRect(dx, dy, 2, TILE);
          if (right) g.fillRect(dx + TILE - 2, dy, 2, TILE);
          continue;
        }

        // Grass creeps over the edge of cleared ground in ragged tufts, so the
        // camp is not a hard-edged brown polygon stamped on a green field.
        if (here === Terrain.Dirt || here === Terrain.Path || here === Terrain.Soil) {
          const up = wy > 0 && isGrass(w, wx, wy - 1);
          const down = wy < w.height - 1 && isGrass(w, wx, wy + 1);
          const left = wx > 0 && isGrass(w, wx - 1, wy);
          const right = wx < w.width - 1 && isGrass(w, wx + 1, wy);
          if (up || down || left || right) {
            const seed = hash2(wx * 3 + 11, wy * 7 + 5);
            const fringe = (
              ex: number,
              ey: number,
              horizontal: boolean,
              inward: number
            ) => {
              for (let i = 0; i < 6; i++) {
                const t = ((seed >> (i * 3)) % 7) + 1; // 1..7 px of overhang
                const off = i * 4;
                g.fillStyle = i % 2 === 0 ? '#4e8a45' : '#437a3c';
                if (horizontal) {
                  const h2 = t;
                  g.fillRect(ex + off, inward > 0 ? ey : ey - h2, 4, h2);
                } else {
                  const w2 = t;
                  g.fillRect(inward > 0 ? ex : ex - w2, ey + off, w2, 4);
                }
              }
            };
            if (up) fringe(dx, dy, true, 1);
            if (down) fringe(dx, dy + TILE, true, -1);
            if (left) fringe(dx, dy, false, 1);
            if (right) fringe(dx + TILE, dy, false, -1);
          }
        }

        // Deterministic scatter: same tile always gets the same detail.
        const h = hash2(wx, wy);
        const chance = here === Terrain.Grass || here === Terrain.DarkGrass ? 0.42 : 0.3;
        if ((h % 1000) / 1000 < chance) {
          const row = here === Terrain.Grass || here === Terrain.DarkGrass ? 0 : 1;
          const variant = (h >> 10) % SCATTER_VARIANTS;
          g.drawImage(
            this.scatterAtlas,
            variant * TILE,
            row * TILE,
            TILE,
            TILE,
            dx,
            dy,
            TILE,
            TILE
          );
        }
      }
    }
    this.chunks.set(key, c);
    return c;
  }

  private drawTerrain(
    g: CanvasRenderingContext2D,
    w: World,
    b: { x0: number; y0: number; x1: number; y1: number }
  ) {
    const cx0 = Math.max(0, Math.floor(b.x0 / (CHUNK * TILE)));
    const cy0 = Math.max(0, Math.floor(b.y0 / (CHUNK * TILE)));
    const cx1 = Math.min(Math.ceil(w.width / CHUNK) - 1, Math.floor(b.x1 / (CHUNK * TILE)));
    const cy1 = Math.min(Math.ceil(w.height / CHUNK) - 1, Math.floor(b.y1 / (CHUNK * TILE)));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunkCanvas(w, cx, cy);
        g.drawImage(c, cx * CHUNK * TILE, cy * CHUNK * TILE);
      }
    }
  }

  private drawGroundOverlays(
    g: CanvasRenderingContext2D,
    w: World,
    b: { x0: number; y0: number; x1: number; y1: number },
    opts: RenderOptions
  ) {
    // Water shimmer.
    const t = this.time;
    g.save();
    g.globalAlpha = 0.14;
    g.fillStyle = '#bfe8ff';
    const tx0 = Math.max(0, Math.floor(b.x0 / TILE));
    const ty0 = Math.max(0, Math.floor(b.y0 / TILE));
    const tx1 = Math.min(w.width - 1, Math.ceil(b.x1 / TILE));
    const ty1 = Math.min(w.height - 1, Math.ceil(b.y1 / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (w.terrain[idx(w, tx, ty)] !== Terrain.Water) continue;
        const ph = Math.sin(t * 1.6 + tx * 0.7 + ty * 0.4);
        if (ph > 0.55) g.fillRect(tx * TILE + 4, ty * TILE + 8 + ph * 3, TILE - 8, 2);
      }
    }
    g.restore();

    if (opts.hoverTile) {
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1.5;
      g.strokeRect(opts.hoverTile.tx * TILE + 1, opts.hoverTile.ty * TILE + 1, TILE - 2, TILE - 2);
    }
  }

  private drawEntities(
    g: CanvasRenderingContext2D,
    w: World,
    b: { x0: number; y0: number; x1: number; y1: number },
    opts: RenderOptions
  ) {
    type Draw = { y: number; fn: () => void };
    const list: Draw[] = [];

    // Ground-level buildings first (paths, farms, bedrolls) — they never sort.
    for (const bl of w.buildings.values()) {
      const bx = bl.tx * TILE;
      const by = bl.ty * TILE;
      if (bx > b.x1 || by > b.y1 || bx + bl.w * TILE < b.x0 || by + bl.h * TILE < b.y0) continue;
      const def = buildingDef(bl.def);
      const flat = def.id === 'path' || def.farm || def.id === 'bedroll';
      if (flat) {
        drawBuilding(g, bl, def, this.time);
      } else {
        list.push({
          y: by + bl.h * TILE,
          fn: () => drawBuilding(g, bl, def, this.time),
        });
      }
      if (bl.state === 'blueprint' && !flat) continue;
    }

    // Resource nodes.
    for (const n of w.nodes.values()) {
      const nx = n.tx * TILE + TILE / 2;
      const ny = n.ty * TILE + TILE / 2;
      if (nx < b.x0 || nx > b.x1 || ny < b.y0 || ny > b.y1) continue;
      list.push({ y: ny + 2, fn: () => this.drawNode(g, n, opts) });
    }

    // Characters (and bodies).
    for (const c of w.characters) {
      if (c.x < b.x0 || c.x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
      if (!c.alive && this.time * 0 + (w.time.t - c.deathAt) > 600) continue;
      list.push({ y: c.y, fn: () => this.drawCharacter(g, w, c, opts) });
    }

    list.sort((a, z) => a.y - z.y);
    for (const d of list) d.fn();
  }

  private drawNode(g: CanvasRenderingContext2D, n: ResourceNode, opts: RenderOptions) {
    const cx = n.tx * TILE + TILE / 2;
    const cy = n.ty * TILE + TILE / 2;
    let sprite: NodeSprite | null = null;
    if (n.kind === 'tree' || n.kind === 'pine' || n.kind === 'deadTree') {
      sprite = this.treeSprites[n.kind][n.variant % this.treeSprites[n.kind].length];
    } else if (n.kind === 'rock') {
      sprite = this.rockSprites[n.variant % this.rockSprites.length];
    } else {
      const set = this.bushSprites[n.kind];
      if (set) {
        const arr = n.depleted ? set.empty : set.full;
        sprite = arr[n.variant % arr.length];
      }
    }
    if (!sprite) return;

    const falling = n.fallT > 0 && (n.kind === 'tree' || n.kind === 'pine' || n.kind === 'deadTree');
    g.save();
    g.translate(cx, cy);
    if (falling) {
      const p = 1 - n.fallT / 1.1;
      const angle = Math.min(1, p * p * 1.5) * (Math.PI / 2) * (n.fallDir >= 0 ? 1 : -1);
      g.translate(0, 0);
      g.rotate(angle);
      g.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.75) * 4);
    } else if (n.shake > 0) {
      g.rotate(Math.sin(this.time * 40) * 0.035 * n.shake);
    }
    // ground shadow
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.ellipse(0, 4, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(sprite.canvas, sprite.ox, sprite.oy - TILE / 2 + 2);
    g.restore();

    if (n.marked && !n.depleted) {
      g.strokeStyle = '#ffcf5c';
      g.lineWidth = 1.6;
      g.setLineDash([3, 3]);
      g.strokeRect(n.tx * TILE + 2, n.ty * TILE + 2, TILE - 4, TILE - 4);
      g.setLineDash([]);
      g.fillStyle = '#ffcf5c';
      g.beginPath();
      g.moveTo(cx - 4, cy - 14);
      g.lineTo(cx + 4, cy - 14);
      g.lineTo(cx, cy - 8);
      g.closePath();
      g.fill();
    }
    // Damage bar while it is being worked.
    if (!n.depleted && n.hp < n.maxHp) {
      const p = n.hp / n.maxHp;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(cx - 10, cy + 8, 20, 3);
      g.fillStyle = '#e8a54a';
      g.fillRect(cx - 10, cy + 8, 20 * p, 3);
    }
  }

  private drawCharacter(
    g: CanvasRenderingContext2D,
    w: World,
    c: Character,
    opts: RenderOptions
  ) {
    const sheet = this.sheetFor(c);
    const selected = opts.selectedIds.includes(c.id);
    const hovered = opts.hoveredCharId === c.id;

    if (!c.alive) {
      g.save();
      g.globalAlpha = 0.75;
      g.translate(c.x, c.y);
      g.rotate(Math.PI / 2);
      g.drawImage(sheet, 0, 0, CHAR_W, CHAR_H, -CHAR_W / 2, -CHAR_H + 6, CHAR_W, CHAR_H);
      g.restore();
      return;
    }

    // shadow
    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.beginPath();
    g.ellipse(c.x, c.y + 2, 6.5, 2.6, 0, 0, Math.PI * 2);
    g.fill();

    if (selected) {
      g.strokeStyle = '#ffe9a8';
      g.lineWidth = 1.6;
      g.beginPath();
      g.ellipse(c.x, c.y + 2, 9 + Math.sin(this.time * 4) * 0.8, 4.4, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (hovered) {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(c.x, c.y + 2, 8.5, 4, 0, 0, Math.PI * 2);
      g.stroke();
    }

    let frame = 0;
    if (c.state === 'working') {
      frame = 4 + (Math.floor(this.time * 7) % 2);
    } else if (c.moving) {
      frame = Math.floor(c.animT) % 4;
    } else {
      frame = 0;
    }

    const sleeping = c.state === 'sleeping';
    g.save();
    g.translate(c.x, c.y);
    if (sleeping) {
      g.rotate(Math.PI / 2);
      g.translate(0, 2);
    }
    const bobY = c.moving ? 0 : Math.sin(c.bob) * 0.5;
    g.drawImage(
      sheet,
      frame * CHAR_W,
      c.dir * CHAR_H,
      CHAR_W,
      CHAR_H,
      -CHAR_W / 2,
      -CHAR_H + 5 + bobY,
      CHAR_W,
      CHAR_H
    );
    g.restore();

    // Carried resource shown above the head.
    if (c.carrying) {
      const color = CARRY_COLORS[c.carrying.res] ?? '#d8cdb4';
      g.fillStyle = color;
      g.fillRect(c.x - 4, c.y - CHAR_H - 1, 8, 6);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(c.x - 4, c.y - CHAR_H - 1, 8, 2);
    }

    if (sleeping) {
      const p = (this.time * 0.7) % 1;
      g.fillStyle = `rgba(200,220,255,${0.8 - p * 0.8})`;
      g.font = 'bold 8px monospace';
      g.fillText('z', c.x + 8 + p * 4, c.y - 12 - p * 10);
    }

    if (c.state === 'downed') {
      g.fillStyle = '#e05555';
      g.beginPath();
      g.arc(c.x, c.y - CHAR_H - 4, 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawSites(
    g: CanvasRenderingContext2D,
    w: World,
    b: { x0: number; y0: number; x1: number; y1: number }
  ) {
    for (const s of w.sites) {
      if (!s.discovered) continue;
      const x = s.tx * TILE + TILE / 2;
      const y = s.ty * TILE + TILE / 2;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      const bob = Math.sin(this.time * 2 + s.id) * 1.6;
      g.globalAlpha = s.depleted ? 0.45 : 1;
      g.drawImage(this.siteIcon, x - 12, y - 30 + bob);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(x, y + 3, 8, 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawParticles(g: CanvasRenderingContext2D, fx: Fx) {
    for (const p of fx.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      if (p.kind === 'heart') {
        g.beginPath();
        g.arc(p.x - p.size * 0.4, p.y, p.size * 0.6, 0, Math.PI * 2);
        g.arc(p.x + p.size * 0.4, p.y, p.size * 0.6, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(p.x - p.size, p.y + p.size * 0.2);
        g.lineTo(p.x + p.size, p.y + p.size * 0.2);
        g.lineTo(p.x, p.y + p.size * 1.4);
        g.closePath();
        g.fill();
      } else if (p.kind === 'plus') {
        g.fillRect(p.x - p.size / 2, p.y - p.size * 1.5, p.size, p.size * 3);
        g.fillRect(p.x - p.size * 1.5, p.y - p.size / 2, p.size * 3, p.size);
      } else {
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    g.globalAlpha = 1;
  }

  private drawBuildPreview(g: CanvasRenderingContext2D, w: World, opts: RenderOptions) {
    const p = opts.buildPreview;
    if (!p) return;
    const def = buildingDef(p.defId);
    const x = p.tx * TILE;
    const y = p.ty * TILE;
    const ww = def.w * TILE;
    const hh = def.h * TILE;
    g.save();
    g.globalAlpha = 0.55;
    const fake: Building = {
      id: -1,
      def: p.defId,
      tx: p.tx,
      ty: p.ty,
      w: def.w,
      h: def.h,
      state: 'built',
      progress: 1,
      delivered: {},
      level: 1,
      hp: def.hp,
      maxHp: def.hp,
      users: [],
      variant: 0,
      activeT: 0,
      farm: def.farm
        ? Array.from({ length: def.w * def.h }, () => ({
            crop: null,
            growth: 0,
            tilled: true,
            tended: 0,
            dead: false,
          }))
        : undefined,
    };
    drawBuilding(g, fake, def, this.time);
    g.restore();
    g.strokeStyle = p.valid ? 'rgba(140,235,155,0.95)' : 'rgba(235,110,90,0.95)';
    g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, ww - 2, hh - 2);
    g.fillStyle = p.valid ? 'rgba(140,235,155,0.14)' : 'rgba(235,110,90,0.18)';
    g.fillRect(x, y, ww, hh);
  }

  private drawMarkPreview(g: CanvasRenderingContext2D, opts: RenderOptions) {
    const m = opts.markPreview;
    if (!m) return;
    const x = Math.min(m.x0, m.x1);
    const y = Math.min(m.y0, m.y1);
    const w = Math.abs(m.x1 - m.x0);
    const h = Math.abs(m.y1 - m.y0);
    g.fillStyle = 'rgba(255,207,92,0.16)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#ffcf5c';
    g.lineWidth = 1.5;
    g.setLineDash([4, 3]);
    g.strokeRect(x, y, w, h);
    g.setLineDash([]);
  }

  /* ---------------------------------------------------------------- */

  private drawLighting(
    g: CanvasRenderingContext2D,
    w: World,
    cam: Camera,
    cssW: number,
    cssH: number
  ) {
    const light = daylight(w.time.minutes);
    const darkness = Math.pow(1 - light, 1.15);
    const weatherDim =
      w.weather.kind === 'overcast' ? 0.12 : w.weather.kind === 'rain' ? 0.2 : 0;
    const total = Math.min(0.88, darkness * 0.82 + weatherDim);
    if (total < 0.02) return;
    const lc = this.lightCanvas;
    if (!lc) return;
    if (lc.width !== Math.floor(cssW) || lc.height !== Math.floor(cssH)) {
      lc.width = Math.floor(cssW);
      lc.height = Math.floor(cssH);
    }
    const lg = lc.getContext('2d')!;
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(0, 0, lc.width, lc.height);

    // Night tint: deep blue at midnight, warmer at dusk.
    const hour = hourOfDay(w.time.minutes);
    const dusk = hour > 16 && hour < 21;
    const dawn = hour > 4 && hour < 8;
    const tint = dusk ? '20,16,40' : dawn ? '38,28,44' : '10,14,34';
    lg.fillStyle = `rgba(${tint},${total})`;
    lg.fillRect(0, 0, lc.width, lc.height);

    lg.globalCompositeOperation = 'destination-out';
    const b = cam.bounds(200);
    for (const bl of w.buildings.values()) {
      if (bl.state !== 'built') continue;
      const def = buildingDef(bl.def);
      if (!def.light) continue;
      const wx = buildingCenterX(bl);
      const wy = buildingCenterY(bl);
      if (wx < b.x0 || wx > b.x1 || wy < b.y0 || wy > b.y1) continue;
      const s = cam.worldToScreen(wx, wy);
      const flicker = 0.92 + Math.sin(this.time * 8 + bl.id) * 0.06;
      const r = def.light * TILE * cam.zoom * flicker;
      const grd = lg.createRadialGradient(s.x, s.y, r * 0.1, s.x, s.y, r);
      grd.addColorStop(0, 'rgba(0,0,0,0.95)');
      grd.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      lg.fillStyle = grd;
      lg.beginPath();
      lg.arc(s.x, s.y, r, 0, Math.PI * 2);
      lg.fill();
    }
    lg.globalCompositeOperation = 'source-over';

    g.drawImage(lc, 0, 0, cssW, cssH);

    // Warm glow pass over the light sources.
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const bl of w.buildings.values()) {
      if (bl.state !== 'built') continue;
      const def = buildingDef(bl.def);
      if (!def.light) continue;
      const wx = buildingCenterX(bl);
      const wy = buildingCenterY(bl);
      if (wx < b.x0 || wx > b.x1 || wy < b.y0 || wy > b.y1) continue;
      const s = cam.worldToScreen(wx, wy);
      const r = def.light * TILE * cam.zoom * 0.7;
      const grd = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      grd.addColorStop(0, `rgba(255,190,110,${0.22 * total})`);
      grd.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(s.x, s.y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawWeather(g: CanvasRenderingContext2D, w: World, cssW: number, cssH: number) {
    if (w.weather.kind === 'rain') {
      g.save();
      g.strokeStyle = `rgba(180,205,235,${0.28 * w.weather.intensity})`;
      g.lineWidth = 1;
      const t = this.time;
      for (let i = 0; i < 140; i++) {
        const seed = i * 97.13;
        const x = ((seed * 7.3 + t * 260) % (cssW + 60)) - 30;
        const y = ((seed * 13.7 + t * 700) % (cssH + 60)) - 30;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 3, y + 12);
        g.stroke();
      }
      g.restore();
    } else if (w.weather.kind === 'fog') {
      g.fillStyle = `rgba(200,208,215,${0.18 * w.weather.intensity})`;
      g.fillRect(0, 0, cssW, cssH);
    }
  }

  private drawScreenOverlays(
    g: CanvasRenderingContext2D,
    w: World,
    cam: Camera,
    fx: Fx,
    opts: RenderOptions
  ) {
    // Floating texts.
    g.textAlign = 'center';
    for (const t of fx.texts) {
      const s = cam.worldToScreen(t.x, t.y);
      if (s.x < -80 || s.x > cam.viewW + 80 || s.y < -40 || s.y > cam.viewH + 40) continue;
      const a = Math.min(1, t.life / t.maxLife);
      g.globalAlpha = a;
      g.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(t.text, s.x + 1, s.y + 1);
      g.fillStyle = t.color;
      g.fillText(t.text, s.x, s.y);
    }
    g.globalAlpha = 1;

    // Speech bubbles and name tags.
    for (const c of w.characters) {
      if (!c.alive) continue;
      const s = cam.worldToScreen(c.x, c.y);
      if (s.x < -120 || s.x > cam.viewW + 120 || s.y < -80 || s.y > cam.viewH + 80) continue;
      const selected = opts.selectedIds.includes(c.id);

      if (c.speech && c.speech.until > w.time.t) {
        drawBubble(g, s.x, s.y - 34 * cam.zoom, c.speech.text, c.speech.mood);
      } else if (selected || opts.hoveredCharId === c.id) {
        drawNameTag(g, s.x, s.y - 30 * cam.zoom, c.name);
      }

      if (selected) {
        drawStatusPips(g, s.x, s.y + 8 * cam.zoom, c);
      }
    }
    g.textAlign = 'left';
  }
}

const CARRY_COLORS: Record<string, string> = {
  wood: '#a9793f',
  stone: '#8e8e97',
  food: '#e2b455',
  rawFood: '#c25f5f',
  water: '#5aa9d6',
  fiber: '#c3c07a',
  medicine: '#7fd6a4',
  herbs: '#83b57a',
  seeds: '#d6c98a',
  tools: '#b9b9c2',
};

const MOOD_COLORS: Record<string, string> = {
  neutral: '#f2efe6',
  happy: '#d6f3c4',
  sad: '#cfd8ea',
  alarm: '#ffd0c2',
};

function drawBubble(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  mood: string
) {
  g.font = '11px "Segoe UI", system-ui, sans-serif';
  const w = Math.min(190, g.measureText(text).width + 14);
  const h = 20;
  g.fillStyle = 'rgba(20,22,18,0.82)';
  roundRect(g, x - w / 2, y - h, w, h, 6);
  g.fill();
  g.beginPath();
  g.moveTo(x - 4, y);
  g.lineTo(x + 4, y);
  g.lineTo(x, y + 5);
  g.closePath();
  g.fill();
  g.fillStyle = MOOD_COLORS[mood] ?? '#f2efe6';
  g.textAlign = 'center';
  g.fillText(text, x, y - 6);
}

function drawNameTag(g: CanvasRenderingContext2D, x: number, y: number, name: string) {
  g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  const w = g.measureText(name).width + 10;
  g.fillStyle = 'rgba(15,18,14,0.7)';
  roundRect(g, x - w / 2, y - 15, w, 16, 5);
  g.fill();
  g.fillStyle = '#f2efe6';
  g.textAlign = 'center';
  g.fillText(name, x, y - 3);
}

function drawStatusPips(g: CanvasRenderingContext2D, x: number, y: number, c: Character) {
  const bars: [number, string][] = [
    [c.health / c.maxHealth, '#e05f5f'],
    [1 - c.hunger / 100, '#e2b455'],
    [c.energy / 100, '#63b6e8'],
  ];
  const w = 34;
  const h = 3;
  bars.forEach(([v, color], i) => {
    const by = y + i * (h + 1.5);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x - w / 2, by, w, h);
    g.fillStyle = color;
    g.fillRect(x - w / 2, by, w * Math.max(0, Math.min(1, v)), h);
  });
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Small strategic minimap, drawn into its own canvas. */
export function renderMinimap(
  canvas: HTMLCanvasElement,
  w: World,
  cam: Camera,
  selectedIds: number[]
) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const sw = canvas.width;
  const sh = canvas.height;
  const sx = sw / w.width;
  const sy = sh / w.height;
  g.clearRect(0, 0, sw, sh);
  g.fillStyle = '#2a4a2c';
  g.fillRect(0, 0, sw, sh);

  const img = g.createImageData(sw, sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const tx = Math.floor(x / sx);
      const ty = Math.floor(y / sy);
      const t = w.terrain[idx(w, Math.min(tx, w.width - 1), Math.min(ty, w.height - 1))];
      let r = 62;
      let gg = 110;
      let bb = 60;
      if (t === Terrain.Water) {
        r = 45;
        gg = 95;
        bb = 130;
      } else if (t === Terrain.Dirt || t === Terrain.Path) {
        r = 120;
        gg = 100;
        bb = 70;
      } else if (t === Terrain.Stone) {
        r = 115;
        gg = 115;
        bb = 122;
      } else if (t === Terrain.Sand) {
        r = 180;
        gg = 160;
        bb = 115;
      } else if (t === Terrain.Soil) {
        r = 92;
        gg = 70;
        bb = 48;
      } else if (t === Terrain.DarkGrass) {
        r = 48;
        gg = 92;
        bb = 48;
      }
      const i = (y * sw + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = bb;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Trees darken the map so the cleared camp reads clearly.
  g.fillStyle = 'rgba(20,45,20,0.55)';
  for (const n of w.nodes.values()) {
    if (n.depleted) continue;
    if (n.kind !== 'tree' && n.kind !== 'pine') continue;
    g.fillRect(n.tx * sx, n.ty * sy, Math.max(1, sx), Math.max(1, sy));
  }

  g.fillStyle = '#e8c46a';
  for (const b of w.buildings.values()) {
    g.fillRect(b.tx * sx, b.ty * sy, Math.max(1.5, b.w * sx), Math.max(1.5, b.h * sy));
  }

  for (const s of w.sites) {
    if (!s.discovered) continue;
    g.fillStyle = s.depleted ? 'rgba(255,255,255,0.3)' : '#ffffff';
    g.fillRect(s.tx * sx - 1, s.ty * sy - 1, 3, 3);
  }

  for (const c of w.characters) {
    if (!c.alive) continue;
    g.fillStyle = selectedIds.includes(c.id) ? '#ffffff' : '#8ef0b2';
    g.fillRect((c.x / TILE) * sx - 1, (c.y / TILE) * sy - 1, 2.5, 2.5);
  }

  // Viewport rectangle.
  const b = cam.bounds(0);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 1;
  g.strokeRect(
    (b.x0 / TILE) * sx,
    (b.y0 / TILE) * sy,
    ((b.x1 - b.x0) / TILE) * sx,
    ((b.y1 - b.y0) / TILE) * sy
  );
}
