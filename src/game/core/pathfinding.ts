/**
 * Grid A* with a binary heap, reusing scratch buffers between calls so the
 * simulation can afford to path many characters per second.
 */

class MinHeap {
  private items: number[] = []; // node index
  private keys: number[] = []; // f score
  size = 0;

  clear() {
    this.size = 0;
    this.items.length = 0;
    this.keys.length = 0;
  }

  push(item: number, key: number) {
    let i = this.size++;
    this.items[i] = item;
    this.keys[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0];
    this.size--;
    if (this.size > 0) {
      this.items[0] = this.items[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.size && this.keys[l] < this.keys[m]) m = l;
        if (r < this.size && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    const ti = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = ti;
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
  }
}

export class PathFinder {
  private w: number;
  private h: number;
  private g: Float32Array;
  private came: Int32Array;
  private closed: Uint8Array;
  private open: Uint8Array;
  private heap = new MinHeap();
  private stamp: Int32Array;
  private generation = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.open = new Uint8Array(n);
    this.stamp = new Int32Array(n);
  }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const n = w * h;
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.open = new Uint8Array(n);
    this.stamp = new Int32Array(n);
    this.generation = 0;
  }

  /**
   * @param blocked  1 = impassable
   * @param goalMask optional: when set, any tile where goalMask(idx) is true
   *                 counts as a goal (used for "walk next to X").
   * @returns flattened [tx,ty,...] path excluding the start tile, or null.
   */
  find(
    blocked: Uint8Array,
    sx: number,
    sy: number,
    gx: number,
    gy: number,
    opts?: { maxNodes?: number; allowGoalBlocked?: boolean; adjacent?: boolean }
  ): number[] | null {
    const w = this.w;
    const h = this.h;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return null;

    const adjacent = !!opts?.adjacent;
    const maxNodes = opts?.maxNodes ?? 9000;
    const start = sy * w + sx;
    const goal = gy * w + gx;

    if (start === goal) return [];
    if (!adjacent && blocked[goal] && !opts?.allowGoalBlocked) {
      // Target unreachable; try to path to an adjacent free tile instead.
      return this.find(blocked, sx, sy, gx, gy, { ...opts, adjacent: true });
    }

    this.generation++;
    const gen = this.generation;
    const { g, came, closed, open, stamp } = this;
    this.heap.clear();

    stamp[start] = gen;
    g[start] = 0;
    came[start] = -1;
    closed[start] = 0;
    open[start] = 1;
    this.heap.push(start, this.hDist(sx, sy, gx, gy));

    let expanded = 0;
    let found = -1;

    while (this.heap.size > 0) {
      const cur = this.heap.pop();
      if (stamp[cur] !== gen) continue;
      if (closed[cur]) continue;
      closed[cur] = 1;
      open[cur] = 0;
      expanded++;
      if (expanded > maxNodes) break;

      const cx = cur % w;
      const cy = (cur / w) | 0;

      if (cur === goal || (adjacent && Math.abs(cx - gx) <= 1 && Math.abs(cy - gy) <= 1)) {
        found = cur;
        break;
      }

      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d];
        const ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        const isGoal = ni === goal;
        if (blocked[ni] && !(isGoal && (opts?.allowGoalBlocked ?? false))) continue;
        if (d >= 4) {
          // Prevent cutting diagonally through two blocked orthogonals.
          if (blocked[cy * w + nx] || blocked[ny * w + cx]) continue;
        }
        if (stamp[ni] === gen && closed[ni]) continue;
        const step = d >= 4 ? 1.4142 : 1;
        const ng = g[cur] + step;
        if (stamp[ni] !== gen) {
          stamp[ni] = gen;
          closed[ni] = 0;
          open[ni] = 0;
          g[ni] = Infinity;
        }
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          if (!open[ni]) {
            open[ni] = 1;
            this.heap.push(ni, ng + this.hDist(nx, ny, gx, gy));
          } else {
            this.heap.push(ni, ng + this.hDist(nx, ny, gx, gy));
          }
        }
      }
    }

    if (found < 0) return null;

    const out: number[] = [];
    let n = found;
    while (n !== -1 && n !== start) {
      out.push(n % w, (n / w) | 0);
      n = came[n];
    }
    // Reverse pairs.
    const path: number[] = [];
    for (let i = out.length - 2; i >= 0; i -= 2) path.push(out[i], out[i + 1]);
    return path;
  }

  private hDist(ax: number, ay: number, bx: number, by: number) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    // Octile distance, slightly weighted to break ties toward the goal.
    return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
  }
}

export const DX = [0, -1, 1, 0, -1, 1, -1, 1];
export const DY = [1, 0, 0, -1, -1, -1, 1, 1];
