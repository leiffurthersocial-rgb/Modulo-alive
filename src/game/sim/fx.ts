import type { FloatingText, Particle } from '../core/types';

/**
 * Purely cosmetic effect buffer. Lives outside the World so it is never saved
 * and never affects the simulation result.
 */
export class Fx {
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  /** Screen shake impulse. */
  shake = 0;

  burst(
    x: number,
    y: number,
    count: number,
    color: string,
    kind: Particle['kind'],
    speed = 40,
    life = 0.6,
    size = 2
  ) {
    if (this.particles.length > 700) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.4,
        life: life * (0.7 + Math.random() * 0.6),
        maxLife: life,
        color,
        size: size * (0.7 + Math.random() * 0.7),
        kind,
      });
    }
  }

  chips(x: number, y: number, color = '#c99a5b') {
    this.burst(x, y, 4, color, 'chip', 46, 0.5, 2);
  }

  leaves(x: number, y: number) {
    this.burst(x, y - 18, 10, '#4f7a3a', 'leaf', 26, 1.4, 3);
  }

  dust(x: number, y: number, color = '#b6a68c') {
    this.burst(x, y, 5, color, 'dust', 20, 0.8, 3);
  }

  sparkle(x: number, y: number, color = '#ffe28a') {
    this.burst(x, y, 7, color, 'spark', 34, 0.7, 2);
  }

  hearts(x: number, y: number) {
    this.burst(x, y - 16, 3, '#ff9ec4', 'heart', 16, 1.1, 3);
  }

  float(x: number, y: number, text: string, color: string) {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x, y, text, color, life: 1.5, maxLife: 1.5 });
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'leaf') {
        p.vy += 22 * dt;
        p.vx += Math.sin(p.life * 6) * 12 * dt;
      } else if (p.kind === 'heart' || p.kind === 'plus') {
        p.vy -= 8 * dt;
      } else {
        p.vy += 120 * dt;
      }
      p.vx *= 1 - 1.6 * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y -= 16 * dt;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
  }

  clear() {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
  }
}
