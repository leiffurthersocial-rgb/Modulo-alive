'use client';

import { useEngine } from '@/store/engineStore';
import { buildingDef } from '@/game/data/buildings';
import { CROP_MAP } from '@/game/data/crops';
import { RESOURCE_LABEL, type Building, type ResourceType } from '@/game/core/types';
import { Bar } from './Bits';

export default function BuildingPanel({ building }: { building: Building }) {
  const engine = useEngine();
  const w = engine.world;
  const def = buildingDef(building.def);
  const next = def.upgradeTo ? buildingDef(def.upgradeTo) : null;

  const occupants = building.users
    .map((id) => w.characters.find((c) => c.id === id))
    .filter(Boolean);

  return (
    <div className="building-panel">
      <div className="char-name-row">
        <h2>{def.label}</h2>
        {building.state === 'blueprint' && <span className="tag">Under construction</span>}
      </div>
      <p className="char-blurb">{def.desc}</p>

      {building.state === 'blueprint' ? (
        <>
          <Bar value={building.progress * 100} color="#8ecfe0" label="Built" compact />
          <h3 className="sub">Materials</h3>
          <div className="materials">
            {(Object.keys(def.cost) as ResourceType[]).map((k) => {
              const need = def.cost[k] ?? 0;
              const have = building.delivered[k] ?? 0;
              return (
                <div key={k} className={`material ${have >= need ? 'done' : ''}`}>
                  <span>{RESOURCE_LABEL[k]}</span>
                  <span>
                    {Math.floor(have)}/{need}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <Bar value={building.hp} max={building.maxHp} color="#8ee08a" label="Condition" compact />
          <div className="building-stats">
            {def.storage && <div>Storage +{def.storage}</div>}
            {def.beds && (
              <div>
                Beds {building.users.length}/{def.beds} · comfort{' '}
                {Math.round((def.comfort ?? 0) * 100)}%
              </div>
            )}
            {def.cooking && <div>Cooking quality ×{def.cooking}</div>}
            {def.crafting && <div>Crafting speed ×{def.crafting}</div>}
            {def.medical && <div>Treatment quality ×{def.medical}</div>}
            {def.light && <div>Light radius {def.light} tiles</div>}
            {def.social && <div>Social comfort ×{def.social}</div>}
            {def.speed && <div>Movement ×{def.speed}</div>}
          </div>
          {occupants.length > 0 && (
            <div className="building-users">
              Used by {occupants.map((c) => c!.name).join(', ')}
            </div>
          )}
          {building.farm && (
            <>
              <h3 className="sub">Crop beds</h3>
              <div className="farm-grid" style={{ gridTemplateColumns: `repeat(${building.w}, 1fr)` }}>
                {building.farm.map((cell, i) => {
                  const crop = cell.crop ? CROP_MAP[cell.crop] : null;
                  return (
                    <div
                      key={i}
                      className="farm-cell"
                      title={
                        crop
                          ? `${crop.label} — ${Math.round(cell.growth * 100)}% grown`
                          : cell.tilled
                            ? 'Tilled, awaiting seed'
                            : 'Untilled'
                      }
                      style={{
                        background: crop
                          ? cell.growth >= 1
                            ? crop.colorRipe
                            : crop.colorYoung
                          : cell.tilled
                            ? '#5b452e'
                            : '#6a5741',
                        opacity: crop ? 0.35 + cell.growth * 0.65 : 1,
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <div className="char-actions">
        {building.state === 'built' && next && (
          <button className="btn" onClick={() => engine.upgradeBuilding(building)}>
            Upgrade to {next.label}
          </button>
        )}
        <button
          className="btn btn-danger"
          onClick={() => {
            if (building.state === 'blueprint') engine.cancelBlueprint(building);
            else {
              const w2 = engine.world;
              const b2 = w2.buildings.get(building.id);
              if (b2) {
                engine.demolishAt(
                  (b2.tx + 0.5) * 24,
                  (b2.ty + 0.5) * 24
                );
              }
            }
            engine.selectedBuildingId = -1;
            engine.emit();
          }}
        >
          {building.state === 'blueprint' ? 'Cancel' : 'Dismantle'}
        </button>
      </div>
      {next && building.state === 'built' && (
        <div className="upgrade-cost">
          Upgrade cost:{' '}
          {(Object.keys(next.cost) as ResourceType[])
            .map((k) => `${RESOURCE_LABEL[k]} ${next.cost[k]}`)
            .join(', ')}
        </div>
      )}
    </div>
  );
}
