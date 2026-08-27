import { TILE, Terrain, type Appearance } from '../core/types';
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
 */
function drawCharFrame(
  g: CanvasRenderingContext2D,
  a: Appearance,
  dir: number,
  frame: number
) {
  const cx = CHAR_W / 2;
  const heavy = a.build === 'heavy';
  const slim = a.build === 'slim';
  const tall = a.build === 'tall';

  const bodyW = 8 + (heavy ? 3 : slim ? -1 : 0);
  const headW = 9 + (heavy ? 1 : 0);
  const headH = 8;
  const yOff = tall ? -2 : 0;

  const walkPhase = frame < 4 ? frame : 0;
  const bob = walkPhase === 1 || walkPhase === 3 ? -1 : 0;
  const working = frame >= 4;

  const headTop = 6 + yOff + bob;
  const torsoTop = headTop + headH;
  const torsoH = 7 + (heavy ? 1 : 0);
  const legTop = torsoTop + torsoH;
  const legH = 6;

  const skinDark = shade(a.skin, -0.18);
  const shirtDark = shade(a.shirt, -0.22);
  const trouserDark = shade(a.trousers, -0.2);
  const hairDark = shade(a.hair, -0.28);

  /* legs */
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
  px(g, cx - bodyW / 2 + 0, legTop, legW, legH + legAOff, a.trousers);
  px(g, cx + bodyW / 2 - legW, legTop, legW, legH + legBOff, trouserDark);
  // boots
  px(g, cx - bodyW / 2, legTop + legH + legAOff - 2, legW, 2, '#3a2f24');
  px(g, cx + bodyW / 2 - legW, legTop + legH + legBOff - 2, legW, 2, '#332920');

  /* torso */
  px(g, cx - bodyW / 2, torsoTop, bodyW, torsoH, a.shirt);
  px(g, cx - bodyW / 2, torsoTop, 2, torsoH, shirtDark);
  px(g, cx - bodyW / 2, torsoTop + torsoH - 1, bodyW, 1, shirtDark);

  /* arms */
  const armY = torsoTop + 1;
  const armH = torsoH - 1;
  if (working) {
    const raise = frame === 4 ? -4 : 1;
    if (dir === 1) {
      px(g, cx - bodyW / 2 - 3, armY + raise, 3, armH, a.skin);
    } else if (dir === 2) {
      px(g, cx + bodyW / 2, armY + raise, 3, armH, a.skin);
    } else {
      px(g, cx - bodyW / 2 - 2, armY + raise, 2, armH, a.skin);
      px(g, cx + bodyW / 2, armY + raise, 2, armH, a.skin);
    }
  } else {
    const swing = walkPhase === 1 ? 1 : walkPhase === 3 ? -1 : 0;
    px(g, cx - bodyW / 2 - 2, armY + swing, 2, armH, a.skin);
    px(g, cx + bodyW / 2, armY - swing, 2, armH, a.skin);
  }

  /* head */
  px(g, cx - headW / 2, headTop, headW, headH, a.skin);
  px(g, cx - headW / 2, headTop, 2, headH, skinDark);
  // neck shadow
  px(g, cx - 2, torsoTop - 1, 4, 1, skinDark);

  /* face */
  if (dir === 0) {
    px(g, cx - 3, headTop + 4, 2, 2, a.eyes);
    px(g, cx + 1, headTop + 4, 2, 2, a.eyes);
    px(g, cx - 1, headTop + 7, 2, 1, shade(a.skin, -0.3));
    if (a.facialHair === 'goatee') {
      px(g, cx - 2, headTop + 7, 4, 3, a.hair);
    } else if (a.facialHair === 'stubble') {
      px(g, cx - 3, headTop + 6, 6, 2, shade(a.skin, -0.25));
    }
  } else if (dir === 1) {
    px(g, cx - 3, headTop + 4, 2, 2, a.eyes);
    if (a.facialHair === 'goatee') px(g, cx - 4, headTop + 7, 3, 3, a.hair);
  } else if (dir === 2) {
    px(g, cx + 1, headTop + 4, 2, 2, a.eyes);
    if (a.facialHair === 'goatee') px(g, cx + 1, headTop + 7, 3, 3, a.hair);
  }

  /* hair */
  const hx = cx - headW / 2;
  switch (a.hairStyle) {
    case 'buzz':
      px(g, hx, headTop - 1, headW, 3, a.hair);
      px(g, hx, headTop + 2, headW, 1, hairDark);
      break;
    case 'short':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx, headTop + 2, 2, 2, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 2, a.hair);
      break;
    case 'fringe':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      if (dir !== 3) px(g, hx, headTop + 2, headW - 2, 2, a.hair);
      px(g, hx, headTop + 2, 2, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 3, a.hair);
      break;
    case 'styled':
      px(g, hx, headTop - 3, headW, 5, a.hair);
      px(g, hx + headW - 3, headTop - 4, 3, 3, a.hair);
      px(g, hx, headTop + 2, 2, 2, hairDark);
      break;
    case 'mod':
      px(g, hx - 1, headTop - 2, headW + 2, 4, a.hair);
      px(g, hx - 1, headTop + 2, 3, 3, a.hair);
      px(g, hx + headW - 2, headTop + 2, 3, 3, a.hair);
      break;
    case 'middlePart':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, cx - 1, headTop - 2, 2, 3, hairDark);
      px(g, hx, headTop + 2, 2, 4, a.hair);
      px(g, hx + headW - 2, headTop + 2, 2, 4, a.hair);
      break;
    case 'long':
      px(g, hx, headTop - 2, headW, 4, a.hair);
      px(g, hx - 1, headTop + 2, 2, 7, a.hair);
      px(g, hx + headW - 1, headTop + 2, 2, 7, a.hair);
      break;
  }
  if (dir === 3) {
    // back of the head: hair covers the face entirely
    px(g, hx, headTop + 1, headW, headH - 2, a.hair);
    px(g, hx, headTop + headH - 2, headW, 2, hairDark);
  }
}

export function buildCharacterSheet(a: Appearance): HTMLCanvasElement {
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
      drawCharFrame(cg, a, dir, f);

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
