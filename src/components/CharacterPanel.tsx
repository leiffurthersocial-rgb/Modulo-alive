'use client';

import { useState } from 'react';
import { useEngine } from '@/store/engineStore';
import {
  SKILL_IDS,
  SKILL_LABEL,
  STAT_IDS,
  STAT_LABEL,
  STAT_SHORT,
  WORK_LABEL,
  WORK_TYPES,
  RESOURCE_LABEL,
  type Character,
} from '@/game/core/types';
import { TRAIT_MAP } from '@/game/data/traits';
import { Bar, Stars } from './Bits';
import Portrait from './Portrait';
import { currentActivityLabel } from '@/game/sim/ai';
import { relationshipLabel } from '@/game/sim/relationships';
import { injurySummary } from '@/game/sim/medical';
import { xpForLevel } from '@/game/sim/modifiers';
import { STARTING_SURVIVORS } from '@/game/data/survivors';

type Tab = 'overview' | 'skills' | 'work' | 'social';

export default function CharacterPanel({ character }: { character: Character }) {
  const engine = useEngine();
  const w = engine.world;
  const [tab, setTab] = useState<Tab>('overview');
  const c = character;

  const job = c.jobId >= 0 ? w.jobs.get(c.jobId) : null;
  const activity = currentActivityLabel(w, c);
  const blurb = STARTING_SURVIVORS.find((s) => s.name === c.name)?.blurb;

  return (
    <div className="char-panel">
      <div className="char-head">
        <Portrait character={c} scale={3} dim={!c.alive} />
        <div className="char-head-info">
          <div className="char-name-row">
            <h2>{c.name}</h2>
            {!c.alive && <span className="tag tag-dead">Dead — day {c.deathDay}</span>}
            {c.state === 'downed' && <span className="tag tag-bad">Incapacitated</span>}
          </div>
          <div className="char-activity">{activity}</div>
          {job && (
            <div className="char-progress">
              <div className="char-progress-fill" style={{ width: `${job.progress * 100}%` }} />
              <span>{Math.round(job.progress * 100)}%</span>
            </div>
          )}
          {blurb && <p className="char-blurb">{blurb}</p>}
        </div>
      </div>

      {c.alive && (
        <div className="char-actions">
          <button
            className="btn"
            onClick={() => {
              engine.followId = engine.followId === c.id ? -1 : c.id;
              engine.centerOnCharacter(c.id);
              engine.emit();
            }}
          >
            {engine.followId === c.id ? 'Unfollow' : 'Follow'}
          </button>
          <button className="btn" onClick={() => engine.cancelOrders([c.id])}>
            Cancel task
          </button>
          <button
            className={`btn ${c.workEnabled ? '' : 'btn-off'}`}
            onClick={() => engine.toggleWork(c.id)}
          >
            {c.workEnabled ? 'Working' : 'Off duty'}
          </button>
        </div>
      )}

      <div className="needs-grid">
        <Bar value={c.health} max={c.maxHealth} color="#e05f5f" label="Health" compact />
        <Bar value={c.hunger} color="#e2b455" label="Hunger" invert compact />
        <Bar value={c.energy} color="#63b6e8" label="Energy" compact />
        <Bar value={c.morale} color="#8ee08a" label="Morale" compact />
        <Bar value={c.stress} color="#c98ae0" label="Stress" invert compact />
      </div>

      <div className="tabs">
        {(['overview', 'skills', 'work', 'social'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Traits' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="tab-body">
          <div className="stat-grid">
            {STAT_IDS.map((s) => (
              <div className="stat" key={s} title={STAT_LABEL[s]}>
                <span className="stat-name">{STAT_SHORT[s]}</span>
                <span className={`stat-val ${c.stats[s] >= 8 ? 'high' : c.stats[s] <= 3 ? 'low' : ''}`}>
                  {c.stats[s]}
                </span>
              </div>
            ))}
          </div>

          <h3 className="sub">Traits</h3>
          <div className="traits">
            {c.traits.map((id) => {
              const t = TRAIT_MAP[id];
              if (!t) return null;
              return (
                <div key={id} className={`trait trait-${t.tone}`} title={t.desc}>
                  <strong>{t.label}</strong>
                  <span>{t.desc}</span>
                </div>
              );
            })}
          </div>

          <h3 className="sub">Condition</h3>
          <div className="condition">
            <div>{injurySummary(c)}</div>
            {c.injuries.map((i) => (
              <div key={i.id} className="injury">
                {i.label} — {i.bodyPart}
                {i.treated ? ' (treated)' : ''}
                {i.bleeding > 0.05 ? ' · bleeding' : ''}
              </div>
            ))}
            {c.sickness > 0.05 && <div className="injury">Illness ({Math.round(c.sickness * 100)}%)</div>}
          </div>

          <h3 className="sub">Carrying</h3>
          <div className="carry">
            {c.carrying
              ? `${Math.round(c.carrying.amount)} × ${RESOURCE_LABEL[c.carrying.res]}`
              : 'Nothing'}
          </div>
          <div className="carry">
            Equipment: {c.equipment.tool ? 'Tool set (+20% work speed)' : 'Bare hands'}
          </div>
        </div>
      )}

      {tab === 'skills' && (
        <div className="tab-body">
          {SKILL_IDS.map((s) => {
            const sk = c.skills[s];
            const pct = sk.xp / xpForLevel(sk.level);
            return (
              <div key={s} className="skill-row">
                <span className="skill-name">{SKILL_LABEL[s]}</span>
                <span className="skill-level">{sk.level}</span>
                <div className="skill-track">
                  <div className="skill-fill" style={{ width: `${Math.min(100, pct * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'work' && (
        <div className="tab-body">
          <p className="hint">
            Higher priority means this survivor picks that kind of work first. Zero stars means
            they never do it.
          </p>
          {WORK_TYPES.map((wt) => (
            <div key={wt} className="prio-row">
              <span className="prio-name">{WORK_LABEL[wt]}</span>
              <Stars
                value={c.priorities[wt] ?? 0}
                onChange={(v) => engine.setPriority(c.id, wt, v)}
              />
            </div>
          ))}
        </div>
      )}

      {tab === 'social' && (
        <div className="tab-body">
          {w.characters
            .filter((o) => o.id !== c.id)
            .sort((a, b) => (c.relationships[b.id] ?? 0) - (c.relationships[a.id] ?? 0))
            .map((o) => {
              const v = Math.round(c.relationships[o.id] ?? 35);
              return (
                <div key={o.id} className={`rel-row ${o.alive ? '' : 'dead'}`}>
                  <span className="rel-name">{o.name}</span>
                  <div className="rel-track">
                    <div
                      className="rel-fill"
                      style={{
                        width: `${v}%`,
                        background: v > 60 ? '#8ee08a' : v > 35 ? '#e2b455' : '#e05f5f',
                      }}
                    />
                  </div>
                  <span className="rel-label">{relationshipLabel(v)}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
