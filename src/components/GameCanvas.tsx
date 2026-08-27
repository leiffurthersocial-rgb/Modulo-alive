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
      // Safari (and synthetic events) can reject capture; it is an
      // optimisation, never a requirement.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture unavailable for this pointer */
      }
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
    const onCancel = (e: PointerEvent) => engine.pointerCancel(e);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engine.wheel(e, rect());
    };
    // iOS fires its own pinch/double-tap gestures over the canvas otherwise.
    const blockGesture = (e: Event) => e.preventDefault();
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
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('gesturestart', blockGesture);
    canvas.addEventListener('gesturechange', blockGesture);
    canvas.addEventListener('gestureend', blockGesture);
    canvas.addEventListener('dblclick', blockGesture);
    canvas.addEventListener('touchstart', blockGesture, { passive: false });
    canvas.addEventListener('touchmove', blockGesture, { passive: false });
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
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('gesturestart', blockGesture);
      canvas.removeEventListener('gesturechange', blockGesture);
      canvas.removeEventListener('gestureend', blockGesture);
      canvas.removeEventListener('dblclick', blockGesture);
      canvas.removeEventListener('touchstart', blockGesture);
      canvas.removeEventListener('touchmove', blockGesture);
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
