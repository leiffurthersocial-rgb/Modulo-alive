import { TILE, Terrain, type Appearance, type Equipment } from '../core/types';
import { GEAR_MAP } from '../data/gear';
import type { AnimalDef } from '../data/animals';
import { RNG } from '../core/rng';

/**
 * Every sprite in Modulo:Alive is generated procedurally at runtime — there
 * are no external image assets to license, and the palette stays consistent
 * because it all comes from one place.
 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas context unavailable');
  g.imageSmoothingEnabled = false;
  return g;
}

const px = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

function shade(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const gg = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

/* ------------------------------------------------------------------ */
/* Terrain                                                             */
/* ------------------------------------------------------------------ */

export const TERRAIN_VARIANTS = 4;

const TERRAIN_PALETTE: Record<number, [string, string, string]> = {
  [Terrain.Grass]: ['#4e8a45', '#5b9a4f', '#437a3c'],
  [Terrain.DarkGrass]: ['#3d7239', '#478040', '#356630'],
  [Terrain.Dirt]: ['#7d6446', '#8a7050', '#6d573c'],
  [Terrain.Soil]: ['#5e4630', '#6b5138', '#523c28'],
  [Terrain.Water]: ['#2f6a8f', '#3a7ba3', '#27587a'],
  [Terrain.Stone]: ['#7b7b84', '#8a8a93', '#6b6b73'],
  [Terrain.Sand]: ['#c2ab7d', '#cfb98c', '#b09a6d'],
  [Terrain.Path]: ['#96866c', '#a4947a', '#867760'],
  [Terrain.Floor]: ['#8a6f4c', '#977c58', '#7a6141'],
};

/**
 * Small deterministic ground details — pebbles, tufts, twigs — keyed off the
 * tile coordinate so they stay put between frames and across saves.
 */
export const SCATTER_VARIANTS = 6;

export function buildScatterAtlas(): HTMLCanvasElement {
  const c = makeCanvas(TILE * SCATTER_VARIANTS, TILE * 2);
  const g = ctx2d(c);
  const rng = new RNG(778899);

  // Row 0: things that sit on grass.
  for (let v = 0; v < SCATTER_VARIANTS; v++) {
    const ox = v * TILE;
    if (v < 3) {
      for (let i = 0; i < 4 + v; i++) {
        const x = ox + rng.int(3, TILE - 4);
        const y = rng.int(4, TILE - 4);
        const h = rng.int(3, 6);
        px(g, x, y - h, 1, h, '#5f9a4f');
        px(g, x + 1, y - h + 1, 1, h - 1, '#4a7d3f');
      }
    } else if (v === 3) {
      for (let i = 0; i < 3; i++) {
        px(g, ox + rng.int(4, TILE - 6), rng.int(6, TILE - 6), 2, 2, '#7d7d86');
      }
    } else if (v === 4) {
      const x = ox + rng.int(5, TILE - 9);
      const y = rng.int(8, TILE - 6);
      px(g, x, y, 6, 1, '#5c4530');
      px(g, x + 4, y - 2, 3, 1, '#5c4530');
    } else {
      for (let i = 0; i < 5; i++) {
        px(g, ox + rng.int(3, TILE - 4), rng.int(3, TILE - 4), 1, 1, '#d8d05c');
      }
      px(g, ox + rng.int(6, TILE - 8), rng.int(6, TILE - 8), 2, 2, '#e8e0a0');
    }
  }

  // Row 1: things that sit on bare dirt and paths.
  for (let v = 0; v < SCATTER_VARIANTS; v++) {
    const ox = v * TILE;
    const oy = TILE;
    if (v < 2) {
      for (let i = 0; i < 5; i++) {
        px(g, ox + rng.int(2, TILE - 4), oy + rng.int(2, TILE - 4), 2, 1, '#6d573c');
      }
    } else if (v < 4) {
      for (let i = 0; i < 3; i++) {
        const x = ox + rng.int(4, TILE - 7);
        const y = oy + rng.int(4, TILE - 7);
        px(g, x, y, 3, 2, '#8a8a93');
        px(g, x, y, 3, 1, '#9d9da6');
      }
    } else if (v === 4) {
      const x = ox + rng.int(5, TILE - 10);
      const y = oy + rng.int(8, TILE - 6);
      px(g, x, y, 7, 2, '#5c4530');
      px(g, x, y, 7, 1, '#6d5236');
    } else {
      for (let i = 0; i < 3; i++) {
        px(g, ox + rng.int(4, TILE - 5), oy + rng.int(4, TILE - 6), 1, 3, '#7d8a52');
      }
    }
  }
  return c;
}

export function buildTerrainAtlas(): HTMLCanvasElement {
  const kinds = Object.keys(TERRAIN_PALETTE).length;
  const c = makeCanvas(TILE * TERRAIN_VARIANTS, TILE * kinds);
  const g = ctx2d(c);
  const rng = new RNG(1337);

  for (let k = 0; k < kinds; k++) {
    const pal = TERRAIN_PALETTE[k];
    for (let v = 0; v < TERRAIN_VARIANTS; v++) {
      const ox = v * TILE;
      const oy = k * TILE;
      px(g, ox, oy, TILE, TILE, pal[0]);
      const speckles = k === Terrain.Water ? 10 : 22;
      for (let i = 0; i < speckles; i++) {
        const x = ox + rng.int(0, TILE);
        const y = oy + rng.int(0, TILE);
        const s = rng.chance(0.75) ? 1 : 2;
        px(g, x, y, s, s, rng.chance(0.5) ? pal[1] : pal[2]);
      }
      if (k === Terrain.Grass || k === Terrain.DarkGrass) {
        for (let i = 0; i < 5; i++) {
          const x = ox + rng.int(2, TILE - 2);
          const y = oy + rng.int(3, TILE - 3);
          px(g, x, y, 1, rng.int(2, 4), shade(pal[0], 0.16));
        }
      }
      if (k === Terrain.Soil) {
        for (let row = 3; row < TILE; row += 6) {
          px(g, ox, oy + row, TILE, 1, shade(pal[0], -0.18));
        }
      }
      if (k === Terrain.Stone) {
        for (let i = 0; i < 3; i++) {
          const x = ox + rng.int(1, TILE - 6);
          const y = oy + rng.int(1, TILE - 5);
          px(g, x, y, rng.int(3, 6), rng.int(2, 4), pal[2]);
        }
      }
    }
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Flora & rocks                                                       */
/* ------------------------------------------------------------------ */

export interface NodeSprite {
  canvas: HTMLCanvasElement;
  /** Where the base of the sprite sits relative to the tile centre. */
  ox: number;
  oy: number;
}

function blob(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

export function buildTreeSprites(kind: 'tree' | 'pine' | 'deadTree', variants = 4): NodeSprite[] {
  const out: NodeSprite[] = [];
  const W = 46;
  const H = 62;
  for (let v = 0; v < variants; v++) {
    const rng = new RNG(9000 + v * 71 + kind.length * 13);
    const c = makeCanvas(W, H);
    const g = ctx2d(c);
    const cx = W / 2;
    const baseY = H - 4;

    // trunk
    const trunkW = kind === 'pine' ? 5 : 6;
    const trunkH = kind === 'pine' ? 16 : 20;
    px(g, cx - trunkW / 2, baseY - trunkH, trunkW, trunkH, '#4a3524');
    px(g, cx - trunkW / 2, baseY - trunkH, 2, trunkH, '#5c4530');
    px(g, cx - trunkW / 2 - 2, baseY - 3, trunkW + 4, 3, '#3b2a1c');

    if (kind === 'deadTree') {
      // bare branches
      g.strokeStyle = '#5c4530';
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const y = baseY - trunkH - i * 5;
        const dir = i % 2 === 0 ? 1 : -1;
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx + dir * rng.range(7, 13), y - rng.range(6, 12));
        g.stroke();
      }
      out.push({ canvas: c, ox: -cx, oy: -(baseY - TILE / 2) });
      continue;
    }

    if (kind === 'pine') {
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const y = baseY - trunkH - 4 - i * 9;
        const halfW = 17 - i * 3.6;
        const dark = i === 0;
        g.fillStyle = dark ? '#264d29' : '#2d5c31';
        g.beginPath();
        g.moveTo(cx, y - 12);
        g.lineTo(cx + halfW, y + 4);
        g.lineTo(cx - halfW, y + 4);
        g.closePath();
        g.fill();
        g.fillStyle = '#3a7440';
        g.beginPath();
        g.moveTo(cx - 1, y - 10);
        g.lineTo(cx + halfW * 0.72, y + 2);
        g.lineTo(cx - halfW * 0.5, y + 2);
        g.closePath();
        g.fill();
      }
    } else {
      const cy = baseY - trunkH - 12;
      blob(g, cx, cy, 17, '#2f5c30');
      blob(g, cx - 10, cy + 5, 12, '#33682f');
      blob(g, cx + 11, cy + 4, 12, '#2f5c30');
      blob(g, cx + 2, cy - 9, 13, '#3b7a3a');
      blob(g, cx - 6, cy - 4, 9, '#438842');
      // highlight speckles
      for (let i = 0; i < 26; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0, 17);
        px(
          g,
          cx + Math.cos(a) * r,
          cy + Math.sin(a) * r * 0.85,
          2,
          2,
          rng.chance(0.5) ? '#4b9247' : '#27502a'
        );
      }
    }
    out.push({ canvas: c, ox: -cx, oy: -(baseY - TILE / 2) });
  }
  return out;
}

export function buildRockSprites(variants = 4): NodeSprite[] {
  const out: NodeSprite[] = [];
  const W = 30;
  const H = 26;
  for (let v = 0; v < variants; v++) {
    const rng = new RNG(4400 + v * 31);
    const c = makeCanvas(W, H);
    const g = ctx2d(c);
    const cx = W / 2;
    const baseY = H - 4;
    blob(g, cx, baseY - 7, 10 + rng.range(-1, 2), '#6f6f78');
    blob(g, cx - 6, baseY - 4, 7, '#63636b');
    blob(g, cx + 6, baseY - 5, 6.5, '#7b7b84');
    blob(g, cx - 1, baseY - 12, 6, '#8b8b94');
    for (let i = 0; i < 10; i++) {
      px(g, cx + rng.range(-9, 8), baseY - rng.range(2, 16), 2, 2, '#55555d');
    }
    px(g, cx - 11, baseY - 1, 22, 3, 'rgba(0,0,0,0.16)');
    out.push({ canvas: c, ox: -cx, oy: -(baseY - TILE / 2) });
  }
  return out;
}

export function buildBushSprites(
  kind: 'berryBush' | 'herbPatch' | 'reeds' | 'stump' | 'log',
  variants = 3
): { full: NodeSprite[]; empty: NodeSprite[] } {
  const full: NodeSprite[] = [];
  const empty: NodeSprite[] = [];
  const W = 30;
  const H = 30;
  for (let v = 0; v < variants; v++) {
    for (const state of ['full', 'empty'] as const) {
      const rng = new RNG(2200 + v * 17 + (state === 'full' ? 3 : 91));
      const c = makeCanvas(W, H);
      const g = ctx2d(c);
      const cx = W / 2;
      const baseY = H - 5;

      if (kind === 'berryBush') {
        blob(g, cx, baseY - 7, 9, '#2f5c33');
        blob(g, cx - 5, baseY - 4, 6.5, '#356b38');
        blob(g, cx + 5, baseY - 5, 6, '#2b5430');
        if (state === 'full') {
          for (let i = 0; i < 7; i++) {
            px(g, cx + rng.range(-8, 7), baseY - rng.range(2, 13), 2, 2, '#c1394f');
          }
        }
      } else if (kind === 'herbPatch') {
        for (let i = 0; i < 9; i++) {
          const x = cx + rng.range(-8, 8);
          const hh = rng.range(5, 11);
          px(g, x, baseY - hh, 2, hh, state === 'full' ? '#6fae86' : '#4f7a60');
          if (state === 'full') px(g, x - 1, baseY - hh - 2, 4, 2, '#c9dfa0');
        }
      } else if (kind === 'reeds') {
        for (let i = 0; i < 10; i++) {
          const x = cx + rng.range(-8, 8);
          const hh = rng.range(8, 17);
          px(g, x, baseY - hh, 2, hh, state === 'full' ? '#9ab35c' : '#6d7c46');
          if (state === 'full') px(g, x - 1, baseY - hh - 3, 3, 4, '#c2b06a');
        }
      } else if (kind === 'stump') {
        px(g, cx - 6, baseY - 8, 12, 8, '#4a3524');
        px(g, cx - 6, baseY - 9, 12, 3, '#6d5236');
      } else {
        px(g, cx - 12, baseY - 6, 24, 7, '#4a3524');
        px(g, cx - 12, baseY - 7, 24, 3, '#5c4530');
        for (let i = 0; i < 5; i++) px(g, cx - 10 + i * 5, baseY - 5, 2, 4, '#3b2a1c');
      }
      const sprite = { canvas: c, ox: -cx, oy: -(baseY - TILE / 2) };
      if (state === 'full') full.push(sprite);
      else empty.push(sprite);
    }
  }
  return { full, empty };
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export const CHAR_W = 20;
export const CHAR_H = 28;
export const CHAR_FRAMES = 6; // 0-3 walk, 4-5 work
export const CHAR_DIRS = 4; // down, left, right, up

/**
 * Draw one character frame into the current transform origin (top-left of a
 * CHAR_W x CHAR_H cell).
 *
 * Silhouette does the heavy lifting: build changes the body outline, hair
 * changes the head outline, and the accessory adds one unmistakable shape, so
 * survivors stay tellable apart at any zoom.
 */
function drawCharFrame(
  g: CanvasRenderingContext2D,
  a: Appearance,
  dir: number,
  frame: number,
  eq?: Equipment
) {
  const cx = CHAR_W / 2;
  const heavy = a.build === 'heavy';
  const slim = a.build === 'slim';
  const tall = a.build === 'tall';

  const bodyW = 8 + (heavy ? 3 : slim ? -1 : 0);
  const headW = 9 + (heavy ? 1 : 0) - (slim ? 1 : 0);
  const headH = 8;
  const yOff = tall ? -2 : heavy ? 1 : 0;

  const walkPhase = frame < 4 ? frame : 0;
  const bob = walkPhase === 1 || walkPhase === 3 ? -1 : 0;
  const working = frame >= 4;

  const headTop = 6 + yOff + bob;
  const torsoTop = headTop + headH;
  const torsoH = 7 + (heavy ? 1 : 0);
  const legTop = torsoTop + torsoH;
  const legH = 6 + (tall ? 1 : 0);

  const accent = a.accent ?? shade(a.shirt, -0.22);
  const skinDark = shade(a.skin, -0.18);
  const skinLight = shade(a.skin, 0.12);
  const shirtDark = shade(a.shirt, -0.24);
  const trouserDark = shade(a.trousers, -0.2);
  const hairDark = shade(a.hair, -0.28);
  const hairLight = shade(a.hair, 0.18);

  /* ---- legs ---- */
  const legW = 3 + (heavy ? 1 : 0);
  let legAOff = 0;
  let legBOff = 0;
  if (walkPhase === 1) {
    legAOff = -1;
    legBOff = 1;
  } else if (walkPhase === 3) {
    legAOff = 1;
    legBOff = -1;
  }
  px(g, cx - bodyW / 2, legTop, legW, legH + legAOff, a.trousers);
  px(g, cx + bodyW / 2 - legW, legTop, legW, legH + legBOff, trouserDark);
  px(g, cx - bodyW / 2, legTop + legH + legAOff - 2, legW, 2, '#3a2f24');
  px(g, cx + bodyW / 2 - legW, legTop + legH + legBOff - 2, legW, 2, '#332920');

  /* ---- torso ---- */
  px(g, cx - bodyW / 2, torsoTop, bodyW, torsoH, a.shirt);
  // sleeves / side panels in the accent colour give the shirt some shape
  px(g, cx - bodyW / 2, torsoTop, 2, torsoH, accent);
  px(g, cx + bodyW / 2 - 2, torsoTop, 2, torsoH, accent);
  px(g, cx - bodyW / 2, torsoTop + torsoH - 1, bodyW, 1, shirtDark);
  // collar
  px(g, cx - 2, torsoTop, 4, 1, shade(a.shirt, 0.16));

  /* ---- body armour, worn over the shirt ---- */
  const bodyGear = eq?.body ? GEAR_MAP[eq.body] : null;
  if (bodyGear) {
    px(g, cx - bodyW / 2, torsoTop + 1, bodyW, torsoH - 1, bodyGear.color);
    px(g, cx - bodyW / 2, torsoTop + 1, bodyW, 1, bodyGear.accent);
    px(g, cx - bodyW / 2, torsoTop + torsoH - 1, bodyW, 1, bodyGear.accent);
    if (dir === 0) px(g, cx - 1, torsoTop + 1, 2, torsoH - 2, bodyGear.accent);
  } else {
    drawAccessory(g, a, cx, bodyW, torsoTop, torsoH, dir);
  }

  /* ---- arms ---- */
  const armY = torsoTop + 1;
  const armH = torsoH - 1;
  const sleeve = 2;
  if (working) {
    const raise = frame === 4 ? -4 : 1;
    if (dir === 1) {
      px(g, cx - bodyW / 2 - 3, armY + raise, 3, armH - sleeve, accent);
      px(g, cx - bodyW / 2 - 3, armY + raise + armH - sleeve, 3, sleeve, a.skin);
    } else if (dir === 2) {
      px(g, cx + bodyW / 2, armY + raise, 3, armH - sleeve, accent);
      px(g, cx + bodyW / 2, armY + raise + armH - sleeve, 3, sleeve, a.skin);
    } else {
      px(g, cx - bodyW / 2 - 2, armY + raise, 2, armH - sleeve, accent);
      px(g, cx - bodyW / 2 - 2, armY + raise + armH - sleeve, 2, sleeve, a.skin);
      px(g, cx + bodyW / 2, armY + raise, 2, armH - sleeve, accent);
      px(g, cx + bodyW / 2, armY + raise + armH - sleeve, 2, sleeve, a.skin);
    }
  } else {
    const swing = walkPhase === 1 ? 1 : walkPhase === 3 ? -1 : 0;
    px(g, cx - bodyW / 2 - 2, armY + swing, 2, armH - sleeve, accent);
    px(g, cx - bodyW / 2 - 2, armY + swing + armH - sleeve, 2, sleeve, a.skin);
    px(g, cx + bodyW / 2, armY - swing, 2, armH - sleeve, accent);
    px(g, cx + bodyW / 2, armY - swing + armH - sleeve, 2, sleeve, a.skin);
  }

  /* ---- head ---- */
  px(g, cx - headW / 2, headTop, headW, headH, a.skin);
  px(g, cx - headW / 2, headTop, 2, headH, skinDark);
  px(g, cx + headW / 2 - 2, headTop + 1, 2, headH - 2, skinLight);
  px(g, cx - 2, torsoTop - 1, 4, 1, skinDark);

  /* ---- face ---- */
  const blink = frame === 2; // a single blink frame in the idle cycle
  if (dir === 0) {
    // Brows carry most of the expression; the eyes themselves stay small so
    // the face does not read as startled at high zoom.
    px(g, cx - 3, headTop + 3, 2, 1, hairDark);
    px(g, cx + 1, headTop + 3, 2, 1, hairDark);
    if (blink) {
      px(g, cx - 3, headTop + 5, 2, 1, skinDark);
      px(g, cx + 1, headTop + 5, 2, 1, skinDark);
    } else {
      px(g, cx - 3, headTop + 4, 2, 2, a.eyes);
      px(g, cx + 1, headTop + 4, 2, 2, a.eyes);
    }
    px(g, cx - 1, headTop + 7, 2, 1, shade(a.skin, -0.3));
    if (a.facialHair === 'goatee') {
      px(g, cx - 2, headTop + 7, 4, 3, a.hair);
    } else if (a.facialHair === 'stubble') {
      px(g, cx - 3, headTop + 6, 6, 2, shade(a.skin, -0.25));
    } else if (a.facialHair === 'beard') {
      px(g, cx - headW / 2 + 1, headTop + 7, headW - 2, 3, a.hair);
      px(g, cx - headW / 2 + 1, headTop + 7, headW - 2, 1, hairDark);
    }
  } else if (dir === 1) {
    px(g, cx - 3, headTop + 3, 2, 1, hairDark);
    if (!blink) px(g, cx - 3, headTop + 4, 2, 2, a.eyes);
    if (a.facialHair === 'goatee') px(g, cx - 4, headTop + 7, 3, 3, a.hair);
    if (a.facialHair === 'beard') px(g, cx - headW / 2, headTop + 6, headW - 3, 4, a.hair);
  } else if (dir === 2) {
    px(g, cx + 1, headTop + 3, 2, 1, hairDark);
    if (!blink) px(g, cx + 1, headTop + 4, 2, 2, a.eyes);
    if (a.facialHair === 'goatee') px(g, cx + 1, headTop + 7, 3, 3, a.hair);
    if (a.facialHair === 'beard') px(g, cx + 3, headTop + 6, headW - 3, 4, a.hair);
  }

  /* ---- hair ---- */
  const hx = cx - headW / 2;
  switch (a.hairStyle) {
    case 'buzz':
      px(g, hx, headTop - 1, headW, 3, a.hair);
      px(g, hx, headTop + 2, headW, 1, hairDark);
      break;
    case 'short':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx, headTop - 2, headW, 1, hairLight);
      px(g, hx, headTop + 2, 2, 2, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 2, a.hair);
      break;
    case 'fringe':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx, headTop - 2, headW, 1, hairLight);
      if (dir !== 3) px(g, hx, headTop + 2, headW - 2, 2, a.hair);
      px(g, hx, headTop + 2, 2, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 3, a.hair);
      break;
    case 'styled':
      px(g, hx, headTop - 3, headW, 5, a.hair);
      px(g, hx + headW - 3, headTop - 5, 3, 4, a.hair);
      px(g, hx, headTop - 3, headW - 3, 1, hairLight);
      px(g, hx, headTop + 2, 2, 2, hairDark);
      break;
    case 'mod':
      px(g, hx - 1, headTop - 2, headW + 2, 4, a.hair);
      px(g, hx - 1, headTop - 2, headW + 2, 1, hairLight);
      px(g, hx - 1, headTop + 2, 3, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 3, 3, a.hair);
      break;
    case 'middlePart':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, cx - 1, headTop - 2, 2, 3, hairDark);
      px(g, hx, headTop + 2, 2, 4, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 4, a.hair);
      break;
    case 'ponytail':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx, headTop - 2, headW, 1, hairLight);
      px(g, hx, headTop + 2, 2, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 3, a.hair);
      // the tail, swinging with the walk
      px(g, cx - 1, headTop + headH - 1, 2, 5 + (walkPhase === 1 ? 1 : 0), a.hair);
      break;
    case 'curly':
      px(g, hx - 1, headTop - 3, headW + 2, 5, a.hair);
      px(g, hx - 1, headTop + 2, 3, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 3, 3, a.hair);
      px(g, hx + 1, headTop - 4, 2, 2, hairLight);
      px(g, hx + headW - 4, headTop - 4, 2, 2, hairLight);
      break;
    case 'long':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx - 1, headTop + 2, 2, 8, a.hair);
      px(g, hx + headW - 1, headTop + 2, 2, 8, a.hair);
      break;
  }
  if (dir === 3) {
    px(g, hx, headTop + 1, headW, headH - 2, a.hair);
    px(g, hx, headTop + headH - 2, headW, 2, hairDark);
  }

  /* ---- headgear over the hair ---- */
  const headGear = eq?.head ? GEAR_MAP[eq.head] : null;
  if (headGear) {
    px(g, hx - 2, headTop - 1, headW + 4, 2, headGear.color);
    px(g, hx - 2, headTop + 1, headW + 4, 1, headGear.accent);
    px(g, hx + 1, headTop - 4, headW - 2, 3, headGear.color);
    px(g, hx + 1, headTop - 4, headW - 2, 1, headGear.accent);
  } else if (a.accessory === 'bandana') {
    px(g, hx, headTop - 1, headW, 2, a.accent ?? '#b5453a');
    px(g, hx + headW - 2, headTop, 3, 3, a.accent ?? '#b5453a');
  }

  /* ---- a tool in the working hand ---- */
  const toolGear = eq?.tool ? GEAR_MAP[eq.tool] : null;
  if (toolGear) drawHandTool(g, cx, bodyW, armY, armH, dir, frame, toolGear);
}

/** The one distinctive worn detail that makes a survivor recognisable. */
function drawAccessory(
  g: CanvasRenderingContext2D,
  a: Appearance,
  cx: number,
  bodyW: number,
  torsoTop: number,
  torsoH: number,
  dir: number
) {
  const accent = a.accent ?? shade(a.shirt, -0.25);
  switch (a.accessory) {
    case 'scarf':
      px(g, cx - bodyW / 2, torsoTop, bodyW, 2, '#b5453a');
      px(g, cx + bodyW / 2 - 3, torsoTop + 2, 2, 4, '#9c3a30');
      break;
    case 'apron':
      px(g, cx - bodyW / 2 + 1, torsoTop + 2, bodyW - 2, torsoH - 2, '#d8cdb4');
      px(g, cx - bodyW / 2 + 1, torsoTop + 2, bodyW - 2, 1, '#b9ad94');
      px(g, cx - 1, torsoTop, 2, 3, '#d8cdb4');
      break;
    case 'satchel':
      px(g, cx - bodyW / 2 - 1, torsoTop + torsoH - 4, bodyW + 2, 3, '#6d5236');
      px(g, cx + bodyW / 2 - 2, torsoTop, 2, torsoH - 3, '#8a6642');
      break;
    case 'suspenders':
      px(g, cx - 3, torsoTop, 2, torsoH, accent);
      px(g, cx + 1, torsoTop, 2, torsoH, accent);
      px(g, cx - bodyW / 2, torsoTop + torsoH - 2, bodyW, 2, '#4a3524');
      break;
    case 'cloak':
      px(g, cx - bodyW / 2 - 2, torsoTop, 2, torsoH + 3, accent);
      px(g, cx + bodyW / 2, torsoTop, 2, torsoH + 3, accent);
      px(g, cx - bodyW / 2 - 1, torsoTop - 1, bodyW + 2, 2, accent);
      break;
    default:
      break;
  }
}

/**
 * The tool a survivor is holding. It swings with the work animation, so you
 * can see at a glance who is properly equipped and who is using their hands.
 */
function drawHandTool(
  g: CanvasRenderingContext2D,
  cx: number,
  bodyW: number,
  armY: number,
  armH: number,
  dir: number,
  frame: number,
  gear: { color: string; accent: string }
) {
  const working = frame >= 4;
  const raised = frame === 4;
  const side = dir === 1 ? -1 : 1;
  const gripX = cx + side * (bodyW / 2 + 1);
  const gripY = armY + (working ? (raised ? -4 : 1) : 0) + armH - 2;

  if (working) {
    const len = 7;
    const dy = raised ? -len : -1;
    px(g, gripX, gripY + (raised ? dy : 0), 1, raised ? len : 4, gear.accent);
    const headY = raised ? gripY + dy - 1 : gripY + 3;
    px(g, gripX - 1, headY, 3, 2, gear.color);
    px(g, gripX - 1, headY, 3, 1, shade(gear.color, 0.2));
  } else {
    px(g, gripX, gripY - 2, 1, 5, gear.accent);
    px(g, gripX - 1, gripY - 4, 3, 2, gear.color);
  }
}

export function buildCharacterSheet(a: Appearance, eq?: Equipment): HTMLCanvasElement {
  const c = makeCanvas(CHAR_W * CHAR_FRAMES, CHAR_H * CHAR_DIRS);
  const g = ctx2d(c);
  // Frames are drawn once into a scratch cell so a dark outline can be
  // stamped underneath — silhouettes are what make characters readable at
  // low zoom against a busy forest.
  const cell = makeCanvas(CHAR_W, CHAR_H);
  const cg = ctx2d(cell);
  const outline = makeCanvas(CHAR_W, CHAR_H);
  const og = ctx2d(outline);

  for (let dir = 0; dir < CHAR_DIRS; dir++) {
    for (let f = 0; f < CHAR_FRAMES; f++) {
      cg.clearRect(0, 0, CHAR_W, CHAR_H);
      drawCharFrame(cg, a, dir, f, eq);

      og.clearRect(0, 0, CHAR_W, CHAR_H);
      og.globalCompositeOperation = 'source-over';
      og.drawImage(cell, 0, 0);
      og.globalCompositeOperation = 'source-in';
      og.fillStyle = 'rgba(14, 18, 12, 0.9)';
      og.fillRect(0, 0, CHAR_W, CHAR_H);
      og.globalCompositeOperation = 'source-over';

      const ox = f * CHAR_W;
      const oy = dir * CHAR_H;
      for (const [dx, dy] of OUTLINE_OFFSETS) g.drawImage(outline, ox + dx, oy + dy);
      g.drawImage(cell, ox, oy);
    }
  }
  return c;
}

const OUTLINE_OFFSETS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/* ------------------------------------------------------------------ */
/* Wildlife                                                            */
/* ------------------------------------------------------------------ */

export const ANIMAL_W = 26;
export const ANIMAL_H = 22;
export const ANIMAL_FRAMES = 3;

/**
 * Animals are drawn side-on for left/right and from behind/front for up/down,
 * which reads clearly at a glance without needing much detail.
 */
export function buildAnimalSheet(def: AnimalDef): HTMLCanvasElement {
  const c = makeCanvas(ANIMAL_W * ANIMAL_FRAMES, ANIMAL_H * 4);
  const g = ctx2d(c);
  const S = def.size;

  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < ANIMAL_FRAMES; f++) {
      g.save();
      g.translate(f * ANIMAL_W, dir * ANIMAL_H);
      const cx = ANIMAL_W / 2;
      const baseY = ANIMAL_H - 3;
      const bodyW = Math.round(13 * S);
      const bodyH = Math.round(8 * S);
      const legLift = f === 1 ? 1 : f === 2 ? -1 : 0;
      const sideOn = dir === 1 || dir === 2;
      const face = dir === 1 ? -1 : 1;

      // shadow
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.ellipse(cx, baseY + 1, bodyW * 0.5, 2.2, 0, 0, Math.PI * 2);
      g.fill();

      // legs
      const legY = baseY - Math.round(4 * S);
      px(g, cx - bodyW / 2 + 1, legY, 2, Math.round(5 * S) + legLift, def.detail);
      px(g, cx + bodyW / 2 - 3, legY, 2, Math.round(5 * S) - legLift, def.detail);

      // body
      const bodyY = baseY - Math.round(4 * S) - bodyH;
      px(g, cx - bodyW / 2, bodyY, bodyW, bodyH, def.body);
      px(g, cx - bodyW / 2, bodyY + bodyH - 2, bodyW, 2, def.belly);

      // head
      const headW = Math.round(6 * S);
      const headH = Math.round(5 * S);
      const headX = sideOn ? cx + face * (bodyW / 2 - 1) : cx - headW / 2;
      const headY = sideOn ? bodyY - 1 : dir === 3 ? bodyY - headH + 2 : bodyY + 1;
      px(g, sideOn ? headX - (face < 0 ? headW : 0) : headX, headY, headW, headH, def.body);

      if (def.kind === 'deer') {
        // antlers
        const ax = sideOn ? headX + (face < 0 ? -headW : 0) + 1 : cx - 3;
        px(g, ax, headY - 4, 1, 4, def.detail);
        px(g, ax + 4, headY - 4, 1, 4, def.detail);
        px(g, ax - 1, headY - 5, 2, 1, def.detail);
        px(g, ax + 4, headY - 5, 2, 1, def.detail);
      } else if (def.kind === 'boar') {
        // tusks
        const tx = sideOn ? headX + (face < 0 ? -headW - 1 : headW - 1) : cx - 2;
        px(g, tx, headY + headH - 2, 2, 1, '#e8e2cf');
      } else {
        // rabbit ears
        const ex = sideOn ? headX + (face < 0 ? -headW + 1 : 1) : cx - 2;
        px(g, ex, headY - 4, 1, 4, def.body);
        px(g, ex + 3, headY - 4, 1, 4, def.body);
      }

      // tail
      if (sideOn) px(g, cx - face * (bodyW / 2), bodyY + 1, 2, 2, def.belly);
      g.restore();
    }
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Small icons used by the world layer                                 */
/* ------------------------------------------------------------------ */

export function buildSiteIcon(): HTMLCanvasElement {
  const c = makeCanvas(24, 28);
  const g = ctx2d(c);
  g.fillStyle = 'rgba(20,16,12,0.55)';
  g.beginPath();
  g.moveTo(12, 26);
  g.lineTo(4, 12);
  g.quadraticCurveTo(4, 2, 12, 2);
  g.quadraticCurveTo(20, 2, 20, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#e8c46a';
  g.beginPath();
  g.moveTo(12, 24);
  g.lineTo(5.5, 12);
  g.quadraticCurveTo(5.5, 3.5, 12, 3.5);
  g.quadraticCurveTo(18.5, 3.5, 18.5, 12);
  g.closePath();
  g.fill();
  g.fillStyle = '#4a3a1c';
  g.font = 'bold 11px sans-serif';
  g.textAlign = 'center';
  g.fillText('?', 12, 15);
  return c;
}

export { shade };
