import { TILE, type Building } from '../core/types';
import type { BuildingDef } from '../data/buildings';
import { CROP_MAP } from '../data/crops';
import { shade } from './sprites';

/**
 * Buildings are drawn procedurally in world space. Each definition gets its
 * own silhouette so the camp is readable at a glance from any zoom level.
 */
export function drawBuilding(
  g: CanvasRenderingContext2D,
  b: Building,
  def: BuildingDef,
  time: number
) {
  const x = b.tx * TILE;
  const y = b.ty * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;

  if (b.state === 'blueprint') {
    drawBlueprint(g, b, def, x, y, w, h);
    return;
  }

  const damaged = b.hp < b.maxHp * 0.6;

  switch (def.id) {
    case 'campfire':
      drawCampfire(g, x, y, w, h, time, b.variant);
      break;
    case 'cookingStation':
      drawCookingStation(g, x, y, w, h, time);
      break;
    case 'kitchen':
      drawHouse(g, x, y, w, h, '#8a6a44', '#a8541f', { chimney: true, smoke: true, time });
      drawPot(g, x + w / 2, y + h - 10, time);
      break;
    case 'bedroll':
      drawBedroll(g, x, y, w, h);
      break;
    case 'woodBed':
      drawBed(g, x, y, w, h);
      break;
    case 'cabinBed':
      drawHouse(g, x, y, w, h, '#7d5c3a', '#5a4630', { window: true });
      break;
    case 'stockpile':
      drawStockpile(g, x, y, w, h, b.variant);
      break;
    case 'storageShed':
      drawHouse(g, x, y, w, h, '#8b6c46', '#6b5237', { door: true });
      break;
    case 'warehouse':
      drawHouse(g, x, y, w, h, '#8b6c46', '#5f4a32', { door: true, window: true });
      break;
    case 'workbench':
      drawWorkbench(g, x, y, w, h);
      break;
    case 'workshop':
      drawHouse(g, x, y, w, h, '#7f6647', '#4f4436', { door: true, awning: true });
      drawWorkbench(g, x + 3, y + h - 16, w - 6, 14);
      break;
    case 'well':
      drawWell(g, x, y, w, h);
      break;
    case 'medicalTent':
      drawTent(g, x, y, w, h, '#d9d3c4', '#b74a4a');
      break;
    case 'clinic':
      drawHouse(g, x, y, w, h, '#cfc7b4', '#9c9184', { door: true, cross: true });
      break;
    case 'diningArea':
      drawDining(g, x, y, w, h);
      break;
    case 'commonHall':
      drawHouse(g, x, y, w, h, '#8d6f4b', '#6d4f31', { door: true, window: true, banner: true });
      break;
    case 'path':
      drawPath(g, x, y, w, h, b.variant);
      break;
    case 'torchPost':
      drawTorch(g, x, y, w, h, time);
      break;
    case 'wall':
      drawWall(g, x, y, w, h, b.variant);
      break;
    case 'gate':
      drawGate(g, x, y, w, h);
      break;
    case 'watchtower':
      drawWatchtower(g, x, y, w, h, time);
      break;
    case 'farmPlot':
      drawFarm(g, b, x, y);
      break;
    default:
      drawHouse(g, x, y, w, h, '#8b6c46', '#6b5237', {});
  }

  if (damaged) {
    g.fillStyle = 'rgba(60,20,10,0.22)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#c4562f';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x + w * 0.2, y + h * 0.25);
    g.lineTo(x + w * 0.45, y + h * 0.7);
    g.lineTo(x + w * 0.32, y + h * 0.55);
    g.stroke();
  }
}

/* ------------------------------------------------------------------ */

function drawBlueprint(
  g: CanvasRenderingContext2D,
  b: Building,
  def: BuildingDef,
  x: number,
  y: number,
  w: number,
  h: number
) {
  g.save();
  g.fillStyle = 'rgba(110,170,220,0.16)';
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(150,205,255,0.85)';
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.setLineDash([]);

  // Progress fill rises from the bottom as the structure goes up.
  if (b.progress > 0) {
    const ph = h * b.progress;
    g.fillStyle = 'rgba(190,225,255,0.28)';
    g.fillRect(x, y + h - ph, w, ph);
  }
  // Material delivery pips
  const keys = Object.keys(def.cost);
  const pipW = Math.min(10, (w - 6) / Math.max(1, keys.length));
  keys.forEach((k, i) => {
    const need = (def.cost as Record<string, number>)[k] ?? 0;
    const have = (b.delivered as Record<string, number>)[k] ?? 0;
    const full = need > 0 && have >= need;
    g.fillStyle = full ? '#8ce49b' : 'rgba(255,255,255,0.35)';
    g.fillRect(x + 3 + i * (pipW + 2), y + h - 5, pipW, 3);
  });
  g.restore();
}

function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x + 2, y + h - 3, w, 5);
}

interface HouseOpts {
  door?: boolean;
  window?: boolean;
  chimney?: boolean;
  smoke?: boolean;
  cross?: boolean;
  awning?: boolean;
  banner?: boolean;
  time?: number;
}

function drawHouse(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  wall: string,
  roof: string,
  opts: HouseOpts
) {
  drawShadow(g, x, y, w, h);
  const wallTop = y + h * 0.36;
  // walls
  g.fillStyle = wall;
  g.fillRect(x + 2, wallTop, w - 4, y + h - wallTop - 2);
  g.fillStyle = shade(wall, -0.16);
  g.fillRect(x + 2, y + h - 6, w - 4, 4);
  // plank lines
  g.fillStyle = shade(wall, -0.1);
  for (let py = wallTop + 5; py < y + h - 4; py += 6) g.fillRect(x + 2, py, w - 4, 1);

  // roof
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - 2, wallTop + 3);
  g.lineTo(x + w / 2, y + 1);
  g.lineTo(x + w + 2, wallTop + 3);
  g.closePath();
  g.fill();
  g.fillStyle = shade(roof, -0.18);
  g.beginPath();
  g.moveTo(x + w / 2, y + 1);
  g.lineTo(x + w + 2, wallTop + 3);
  g.lineTo(x + w / 2, wallTop + 3);
  g.closePath();
  g.fill();

  if (opts.door) {
    g.fillStyle = shade(wall, -0.38);
    g.fillRect(x + w / 2 - 4, y + h - 12, 8, 10);
    g.fillStyle = '#e8c46a';
    g.fillRect(x + w / 2 + 1, y + h - 7, 1.5, 1.5);
  }
  if (opts.window) {
    g.fillStyle = '#2c3a4a';
    g.fillRect(x + 5, wallTop + 6, 7, 6);
    g.fillStyle = 'rgba(255,220,150,0.5)';
    g.fillRect(x + 5, wallTop + 6, 7, 3);
  }
  if (opts.chimney) {
    g.fillStyle = '#6d6a66';
    g.fillRect(x + w - 10, y + 1, 6, 12);
  }
  if (opts.cross) {
    g.fillStyle = '#c0392b';
    g.fillRect(x + w / 2 - 1.5, wallTop + 5, 3, 10);
    g.fillRect(x + w / 2 - 5, wallTop + 8.5, 10, 3);
  }
  if (opts.awning) {
    g.fillStyle = 'rgba(90,70,45,0.85)';
    g.fillRect(x + 1, wallTop + 2, w - 2, 3);
  }
  if (opts.banner) {
    g.fillStyle = '#a8552f';
    g.fillRect(x + w / 2 - 2, wallTop + 4, 4, 12);
    g.fillStyle = '#d6b45c';
    g.fillRect(x + w / 2 - 2, wallTop + 10, 4, 3);
  }
  if (opts.smoke && opts.time !== undefined) {
    const t = opts.time;
    for (let i = 0; i < 3; i++) {
      const p = ((t * 0.35 + i * 0.33) % 1);
      g.fillStyle = `rgba(200,200,200,${0.3 * (1 - p)})`;
      g.beginPath();
      g.arc(x + w - 7 + Math.sin(p * 6 + i) * 3, y - p * 20, 2 + p * 4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawCampfire(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
  variant: number
) {
  const cx = x + w / 2;
  const cy = y + h / 2 + 2;
  // ash bed and stone ring
  g.fillStyle = 'rgba(60,52,44,0.45)';
  g.beginPath();
  g.ellipse(cx, cy, 15, 10, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + variant;
    const sx = cx + Math.cos(a) * 13;
    const sy = cy + Math.sin(a) * 9;
    g.fillStyle = '#8b8378';
    g.beginPath();
    g.arc(sx, sy, 3.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a49a8c';
    g.beginPath();
    g.arc(sx - 0.8, sy - 1, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // logs
  g.strokeStyle = '#4a3524';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx - 8, cy + 3);
  g.lineTo(cx + 8, cy - 3);
  g.moveTo(cx - 7, cy - 3);
  g.lineTo(cx + 8, cy + 4);
  g.stroke();
  // flame
  const f = 0.7 + Math.sin(time * 9) * 0.14 + Math.sin(time * 21) * 0.06;
  const grd = g.createRadialGradient(cx, cy - 4, 1, cx, cy - 4, 15 * f);
  grd.addColorStop(0, 'rgba(255,240,190,0.95)');
  grd.addColorStop(0.4, 'rgba(255,170,60,0.85)');
  grd.addColorStop(1, 'rgba(220,90,30,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(cx, cy - 5, 9 * f, 13 * f, 0, 0, Math.PI * 2);
  g.fill();
}

function drawCookingStation(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number
) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = '#6f6a63';
  g.fillRect(x + 3, y + h / 2 - 2, w - 6, h / 2);
  g.fillStyle = '#83786c';
  g.fillRect(x + 3, y + h / 2 - 2, w - 6, 4);
  g.fillStyle = '#3a2a1e';
  g.fillRect(x + w / 2 - 6, y + h - 12, 12, 9);
  const f = 0.7 + Math.sin(time * 10) * 0.2;
  const grd = g.createRadialGradient(x + w / 2, y + h - 8, 1, x + w / 2, y + h - 8, 11 * f);
  grd.addColorStop(0, 'rgba(255,230,170,0.9)');
  grd.addColorStop(1, 'rgba(220,110,40,0)');
  g.fillStyle = grd;
  g.fillRect(x + w / 2 - 12, y + h - 20, 24, 20);
  drawPot(g, x + w / 2, y + h / 2 + 2, time);
}

function drawPot(g: CanvasRenderingContext2D, cx: number, cy: number, time: number) {
  g.fillStyle = '#3c3c42';
  g.beginPath();
  g.ellipse(cx, cy, 6, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#55555e';
  g.beginPath();
  g.ellipse(cx, cy - 1.5, 6, 3, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 2; i++) {
    const p = ((time * 0.4 + i * 0.5) % 1);
    g.fillStyle = `rgba(230,230,230,${0.35 * (1 - p)})`;
    g.beginPath();
    g.arc(cx + Math.sin(p * 7 + i) * 2.5, cy - 4 - p * 12, 1.5 + p * 2.5, 0, Math.PI * 2);
    g.fill();
  }
}

function drawBedroll(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const px0 = x + 3;
  const py0 = y + 4;
  const pw = w - 6;
  const ph = h - 8;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(px0 + 1, py0 + ph - 1, pw, 4);
  // mat
  g.fillStyle = '#6e5c40';
  g.fillRect(px0, py0, pw, ph);
  g.fillStyle = '#8a7452';
  g.fillRect(px0, py0, pw, 2);
  // blanket over the lower two-thirds
  g.fillStyle = '#5d7f9c';
  g.fillRect(px0, py0 + ph * 0.35, pw, ph * 0.65);
  g.fillStyle = '#4d6b85';
  for (let i = py0 + ph * 0.45; i < py0 + ph; i += 5) g.fillRect(px0, i, pw, 1);
  // pillow
  g.fillStyle = '#d8cdb4';
  g.fillRect(px0 + 1, py0 + 2, pw - 2, ph * 0.28);
  g.fillStyle = '#bdb094';
  g.fillRect(px0 + 1, py0 + 2 + ph * 0.28 - 1, pw - 2, 1);
  // outline
  g.strokeStyle = 'rgba(24,20,14,0.55)';
  g.lineWidth = 1;
  g.strokeRect(px0 + 0.5, py0 + 0.5, pw - 1, ph - 1);
}

function drawBed(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = '#6b4c30';
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = '#8a6642';
  g.fillRect(x + 2, y + 2, w - 4, 3);
  g.fillStyle = '#cfc3a6';
  g.fillRect(x + 4, y + 4, w - 8, 8);
  g.fillStyle = '#5d7f9c';
  g.fillRect(x + 4, y + 12, w - 8, h - 16);
}

function drawStockpile(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: number
) {
  drawShadow(g, x, y, w, h);
  // A tarp pegged over the back of the pile.
  g.fillStyle = '#6e7f5c';
  g.beginPath();
  g.moveTo(x + 2, y + h * 0.34);
  g.lineTo(x + w * 0.5, y + 3);
  g.lineTo(x + w - 2, y + h * 0.3);
  g.lineTo(x + w - 4, y + h * 0.5);
  g.lineTo(x + 4, y + h * 0.52);
  g.closePath();
  g.fill();
  g.fillStyle = '#5d6d4d';
  g.beginPath();
  g.moveTo(x + w * 0.5, y + 3);
  g.lineTo(x + w - 2, y + h * 0.3);
  g.lineTo(x + w - 4, y + h * 0.5);
  g.lineTo(x + w * 0.5, y + h * 0.5);
  g.closePath();
  g.fill();

  const crate = (bx: number, by: number, bw: number, bh: number, tone: string) => {
    g.fillStyle = tone;
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = shade(tone, 0.14);
    g.fillRect(bx, by, bw, 2);
    g.fillStyle = shade(tone, -0.3);
    g.fillRect(bx, by + bh * 0.5 - 1, bw, 2);
    g.strokeStyle = 'rgba(30,22,14,0.7)';
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  };

  const s = w / 48;
  crate(x + 4 * s, y + h - 17 * s, 15 * s, 14 * s, '#9a7a4c');
  crate(x + 20 * s, y + h - 21 * s, 17 * s, 18 * s, '#8a6a42');
  crate(x + 11 * s, y + h - 9 * s, 13 * s, 8 * s, '#a58a5a');
  // A couple of sacks leaning against the crates.
  g.fillStyle = '#b5a882';
  g.beginPath();
  g.ellipse(x + w - 8 * s, y + h - 7 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#9c9070';
  g.fillRect(x + w - 10 * s, y + h - 3 * s, 4 * s, 2 * s);
}

function drawWorkbench(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = '#7d5c3a';
  g.fillRect(x + 2, y + h * 0.35, w - 4, h * 0.28);
  g.fillStyle = '#5f4429';
  g.fillRect(x + 4, y + h * 0.6, 4, h * 0.35);
  g.fillRect(x + w - 8, y + h * 0.6, 4, h * 0.35);
  // tools on the bench
  g.fillStyle = '#b9b9c2';
  g.fillRect(x + 6, y + h * 0.28, 8, 3);
  g.fillStyle = '#4a3524';
  g.fillRect(x + 13, y + h * 0.28, 6, 2);
  g.fillStyle = '#c8a24a';
  g.fillRect(x + w - 14, y + h * 0.26, 5, 5);
}

function drawWell(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  drawShadow(g, x, y, w, h);
  const cx = x + w / 2;
  const cy = y + h / 2 + 3;
  g.fillStyle = '#6f6f78';
  g.beginPath();
  g.ellipse(cx, cy, w * 0.32, h * 0.24, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2c4a5c';
  g.beginPath();
  g.ellipse(cx, cy, w * 0.22, h * 0.15, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5f4429';
  g.fillRect(cx - w * 0.3, y + 4, 4, h * 0.45);
  g.fillRect(cx + w * 0.3 - 4, y + 4, 4, h * 0.45);
  g.fillStyle = '#8a5a34';
  g.beginPath();
  g.moveTo(cx - w * 0.38, y + 8);
  g.lineTo(cx, y);
  g.lineTo(cx + w * 0.38, y + 8);
  g.closePath();
  g.fill();
}

function drawTent(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cloth: string,
  accent: string
) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = cloth;
  g.beginPath();
  g.moveTo(x + 1, y + h - 2);
  g.lineTo(x + w / 2, y + 2);
  g.lineTo(x + w - 1, y + h - 2);
  g.closePath();
  g.fill();
  g.fillStyle = shade(cloth, -0.16);
  g.beginPath();
  g.moveTo(x + w / 2, y + 2);
  g.lineTo(x + w - 1, y + h - 2);
  g.lineTo(x + w / 2, y + h - 2);
  g.closePath();
  g.fill();
  g.fillStyle = accent;
  g.fillRect(x + w / 2 - 1.5, y + h * 0.45, 3, 9);
  g.fillRect(x + w / 2 - 5, y + h * 0.45 + 3, 10, 3);
}

function drawDining(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = '#8a6642';
  g.fillRect(x + 4, y + h * 0.35, w - 8, h * 0.3);
  g.fillStyle = '#6b4c30';
  g.fillRect(x + 2, y + h * 0.2, w - 4, 4);
  g.fillRect(x + 2, y + h * 0.72, w - 4, 4);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#d8cdb4';
    g.beginPath();
    g.arc(x + 8 + i * ((w - 16) / 2), y + h * 0.47, 2.6, 0, Math.PI * 2);
    g.fill();
  }
}

function drawPath(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: number
) {
  g.fillStyle = '#98886d';
  g.fillRect(x, y, w, h);
  g.fillStyle = '#8a7a60';
  for (let i = 0; i < 6; i++) {
    const px0 = x + ((i * 7 + variant * 3) % (w - 3));
    const py0 = y + ((i * 11 + variant * 5) % (h - 3));
    g.fillRect(px0, py0, 3, 2);
  }
}

function drawTorch(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number
) {
  const cx = x + w / 2;
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(cx - 4, y + h - 3, 8, 3);
  g.fillStyle = '#5f4429';
  g.fillRect(cx - 2, y + 2, 4, h - 4);
  const f = 0.75 + Math.sin(time * 11) * 0.2;
  const grd = g.createRadialGradient(cx, y + 1, 0.5, cx, y + 1, 9 * f);
  grd.addColorStop(0, 'rgba(255,240,190,0.95)');
  grd.addColorStop(1, 'rgba(230,120,40,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(cx, y + 1, 6 * f, 8 * f, 0, 0, Math.PI * 2);
  g.fill();
}

function drawWall(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  variant: number
) {
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x, y + h - 4, w, 5);
  const logs = 4;
  for (let i = 0; i < logs; i++) {
    const lw = w / logs;
    const lx = x + i * lw;
    const top = y - 6 + ((i + variant) % 2) * 2;
    g.fillStyle = i % 2 === 0 ? '#6b4c30' : '#5d4229';
    g.fillRect(lx, top, lw - 0.5, h - (top - y));
    g.fillStyle = '#8a6642';
    g.beginPath();
    g.moveTo(lx, top + 3);
    g.lineTo(lx + lw / 2, top - 3);
    g.lineTo(lx + lw - 0.5, top + 3);
    g.closePath();
    g.fill();
  }
}

function drawGate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x, y + h - 4, w, 5);
  g.fillStyle = '#4a3524';
  g.fillRect(x, y - 6, 3, h + 6);
  g.fillRect(x + w - 3, y - 6, 3, h + 6);
  g.fillStyle = '#7d5c3a';
  g.fillRect(x + 3, y - 2, w - 6, h + 2);
  g.fillStyle = '#5f4429';
  g.fillRect(x + 3, y + h / 2 - 1, w - 6, 2);
  g.fillStyle = '#b9b9c2';
  g.fillRect(x + w / 2 - 1, y + h / 2 - 3, 2, 6);
}

function drawWatchtower(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number
) {
  drawShadow(g, x, y, w, h);
  g.fillStyle = '#5d4229';
  g.fillRect(x + 4, y + h * 0.35, 4, h * 0.6);
  g.fillRect(x + w - 8, y + h * 0.35, 4, h * 0.6);
  g.fillStyle = '#6b4c30';
  g.fillRect(x + 1, y + h * 0.2, w - 2, h * 0.2);
  g.fillStyle = '#8a6642';
  g.beginPath();
  g.moveTo(x - 2, y + h * 0.2);
  g.lineTo(x + w / 2, y - h * 0.12);
  g.lineTo(x + w + 2, y + h * 0.2);
  g.closePath();
  g.fill();
  const f = 0.7 + Math.sin(time * 6) * 0.2;
  const grd = g.createRadialGradient(x + w / 2, y + h * 0.28, 1, x + w / 2, y + h * 0.28, 10 * f);
  grd.addColorStop(0, 'rgba(255,235,180,0.8)');
  grd.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = grd;
  g.fillRect(x + w / 2 - 12, y + h * 0.28 - 12, 24, 24);
}

function drawFarm(g: CanvasRenderingContext2D, b: Building, x: number, y: number) {
  if (!b.farm) return;
  for (let i = 0; i < b.farm.length; i++) {
    const cell = b.farm[i];
    const cx = x + (i % b.w) * TILE;
    const cy = y + Math.floor(i / b.w) * TILE;
    // soil bed
    g.fillStyle = cell.tilled ? '#5b452e' : '#6a5741';
    g.fillRect(cx + 1, cy + 1, TILE - 2, TILE - 2);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let r = 4; r < TILE - 2; r += 6) g.fillRect(cx + 2, cy + r, TILE - 4, 1);
    if (!cell.crop) continue;
    const crop = CROP_MAP[cell.crop];
    if (!crop) continue;
    const t = cell.growth;
    const color = t >= 1 ? crop.colorRipe : crop.colorYoung;
    const hgt = 3 + t * 11;
    for (let s = 0; s < 3; s++) {
      const sx = cx + 6 + s * 5;
      g.fillStyle = color;
      g.fillRect(sx, cy + TILE - 4 - hgt, 2, hgt);
      if (t > 0.5) {
        g.fillRect(sx - 2, cy + TILE - 4 - hgt, 6, 2);
      }
      if (t >= 1) {
        g.fillStyle = crop.colorRipe;
        g.beginPath();
        g.arc(sx + 1, cy + TILE - 5 - hgt, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}
