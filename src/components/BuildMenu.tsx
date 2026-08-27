'use client';

import { useState } from 'react';
import { useEngine } from '@/store/engineStore';
import {
  BUILDINGS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type BuildCategory,
} from '@/game/data/buildings';
import { RESOURCE_LABEL, type ResourceType } from '@/game/core/types';
import { isUnlocked } from '@/game/sim/progression';

export default function BuildMenu({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const w = engine.world;
  const [cat, setCat] = useState<BuildCategory>('shelter');

  const inCat = BUILDINGS.filter((b) => b.category === cat);
  const cats = CATEGORY_ORDER.filter((c) => {
    if (c === 'defense') return w.progression.wallsUnlocked;
    return true;
  });

  return (
    <div className="build-menu">
      <header className="build-head">
        <h2>Build</h2>
        <button className="btn btn-icon" onClick={onClose} title="Close (B)">
          ✕
        </button>
      </header>

      <div className="build-cats">
        {cats.map((c) => (
          <button
            key={c}
            className={`build-cat ${cat === c ? 'active' : ''}`}
            onClick={() => setCat(c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="build-list">
        {inCat.map((def) => {
          const unlocked = isUnlocked(w, def.id);
          const affordable = (Object.keys(def.cost) as ResourceType[]).every(
            (k) => w.stock[k] >= (def.cost[k] ?? 0)
          );
          const active = engine.buildDefId === def.id && engine.tool === 'build';
          return (
            <button
              key={def.id}
              className={`build-item ${active ? 'active' : ''} ${unlocked ? '' : 'locked'}`}
              disabled={!unlocked}
              onClick={() => engine.setTool('build', def.id)}
              title={unlocked ? def.desc : `Unlocks at settlement level ${def.minLevel}`}
            >
              <div className="build-item-head">
                <span className="build-item-name">{def.label}</span>
                <span className="build-item-size">
                  {def.w}×{def.h}
                </span>
              </div>
              <p className="build-item-desc">
                {unlocked ? def.desc : `Requires settlement level ${def.minLevel}`}
              </p>
              <div className="build-cost">
                {(Object.keys(def.cost) as ResourceType[]).map((k) => (
                  <span
                    key={k}
                    className={w.stock[k] >= (def.cost[k] ?? 0) ? '' : 'short'}
                    title={RESOURCE_LABEL[k]}
                  >
                    {RESOURCE_LABEL[k]} {def.cost[k]}
                  </span>
                ))}
                {!affordable && <span className="short">short on materials</span>}
              </div>
            </button>
          );
        })}
      </div>

      <p className="build-hint">
        Click in the world to place. Right click or Escape to stop building. Structures start as
        blueprints — survivors haul the materials and build them.
      </p>
    </div>
  );
}
