'use client';

import { useEffect, useRef } from 'react';
import type { Character } from '@/game/core/types';
import { CHAR_H, CHAR_W, buildCharacterSheet } from '@/game/render/sprites';

const cache = new Map<string, HTMLCanvasElement>();

function sheetFor(c: Character) {
  const key = `${JSON.stringify(c.appearance)}|${c.equipment.tool ?? ''}|${c.equipment.head ?? ''}|${c.equipment.body ?? ''}`;
  let s = cache.get(key);
  if (!s) {
    s = buildCharacterSheet(c.appearance, c.equipment);
    cache.set(key, s);
  }
  return s;
}

/** Draws the survivor's actual in-world sprite, scaled up. */
export default function Portrait({
  character,
  scale = 3,
  dim = false,
}: {
  character: Character;
  scale?: number;
  dim?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    canvas.width = CHAR_W * scale;
    canvas.height = CHAR_H * scale;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const sheet = sheetFor(character);
    g.drawImage(sheet, 0, 0, CHAR_W, CHAR_H, 0, 0, CHAR_W * scale, CHAR_H * scale);
    if (dim) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(20,24,30,0.6)';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalCompositeOperation = 'source-over';
    }
  }, [character, character.appearance, character.equipment, scale, dim]);

  return <canvas ref={ref} className="portrait" />;
}
