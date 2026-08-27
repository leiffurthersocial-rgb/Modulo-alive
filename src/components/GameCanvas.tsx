'use client';

import { useEffect, useRef } from 'react';
import { getEngine } from '@/store/engineStore';

export default function GameCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const engine = getEngine();
    engine.attach(canvas);
    engine.start();

    const onResize = () => engine.handleResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);
    window.addEventListener('resize', onResize);

    const rect = () => canvas.getBoundingClientRect();
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      engine.pointerDown(e, rect());
    };
    const onMove = (e: PointerEvent) => engine.pointerMove(e, rect());
    const onUp = (e: PointerEvent) => {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      engine.pointerUp(e, rect());
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engine.wheel(e, rect());
    };
    const onContext = (e: Event) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      engine.keyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => engine.keyUp(e);
    const onBlur = () => engine.keyUp(new KeyboardEvent('keyup', { key: 'Shift' }));

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      engine.detach();
    };
  }, []);

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas ref={ref} className="game-canvas" />
    </div>
  );
}
