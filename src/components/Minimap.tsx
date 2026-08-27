'use client';

import { useEffect, useRef } from 'react';
import { useEngine } from '@/store/engineStore';
import { renderMinimap } from '@/game/render/renderer';
import { TILE } from '@/game/core/types';

const W = 190;
const H = 146;

export default function Minimap() {
  const engine = useEngine();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = W;
    c.height = H;
    renderMinimap(c, engine.world, engine.cam, engine.selected);
  });

  return (
    <canvas
      ref={ref}
      className="minimap"
      style={{ width: W, height: H }}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        const fy = (e.clientY - r.top) / r.height;
        engine.followId = -1;
        engine.cam.centerOn(fx * engine.world.width * TILE, fy * engine.world.height * TILE);
        engine.emit();
      }}
      title="Click to jump the camera"
    />
  );
}
