export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt(dist2(ax, ay, bx, by));

export function formatClock(minutes: number): string {
  const m = Math.floor(minutes) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

export function titleCase(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Run-length encode a typed array into a compact [value, count, ...] list. */
export function rle(arr: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let n = 1;
    while (i + n < arr.length && arr[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

export function unrle(data: number[], out: Uint8Array | Int32Array) {
  let i = 0;
  for (let k = 0; k < data.length; k += 2) {
    const v = data[k];
    const n = data[k + 1];
    for (let j = 0; j < n; j++) out[i++] = v;
  }
  return out;
}
