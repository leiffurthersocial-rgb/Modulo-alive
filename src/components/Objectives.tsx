'use client';

import { useEngine } from '@/store/engineStore';
import { nextTierProgress } from '@/game/sim/progression';
import { PROGRESSION_TIERS } from '@/game/data/buildings';

export default function Objectives() {
  const engine = useEngine();
  const w = engine.world;
  const tier = PROGRESSION_TIERS.find((t) => t.level === w.progression.level);
  const next = nextTierProgress(w);

  return (
    <div className="objectives">
      <div className="obj-current">
        <span className="obj-level">Level {w.progression.level}</span>
        <strong>{tier?.name}</strong>
        <p>{tier?.desc}</p>
      </div>
      {next ? (
        <>
          <h4>Next: {next.tier.name}</h4>
          <ul className="obj-list">
            {next.rows.map((r) => (
              <li key={r.label} className={r.have >= r.need ? 'done' : ''}>
                <span>{r.label}</span>
                <span>
                  {r.have}/{r.need}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint">The settlement has reached its highest tier. Keep it alive.</p>
      )}
      <div className="obj-stats">
        <div>
          <span>Days survived</span>
          <span>{w.stats.daysSurvived}</span>
        </div>
        <div>
          <span>Trees felled</span>
          <span>{w.stats.treesFelled}</span>
        </div>
        <div>
          <span>Structures built</span>
          <span>{w.stats.builtCount}</span>
        </div>
        <div>
          <span>Meals cooked</span>
          <span>{w.stats.mealsCooked}</span>
        </div>
        <div>
          <span>Expeditions</span>
          <span>{w.stats.explorations}</span>
        </div>
        <div>
          <span>Crop units harvested</span>
          <span>{w.stats.harvested}</span>
        </div>
        <div>
          <span>Survivors lost</span>
          <span>{w.stats.deaths}</span>
        </div>
      </div>
    </div>
  );
}
