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
import { GEAR_MAP, GEAR_SLOTS, SLOT_LABEL } from '@/game/data/gear';

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
            {c.alive && c.assignment !== 'auto' && (
              <span className="tag tag-pin">
                {c.assignment === 'rest' ? 'Off duty' : WORK_LABEL[c.assignment]}
              </span>
            )}
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

          <h3 className="sub">Equipment</h3>
          <div className="gear-list">
            {GEAR_SLOTS.map((slot) => {
              const id = c.equipment[slot];
              const def = id ? GEAR_MAP[id] : null;
              return (
                <div key={slot} className={`gear-row ${def ? 'worn' : ''}`}>
                  <span className="gear-slot">{SLOT_LABEL[slot]}</span>
                  <span className="gear-name">{def ? def.label : '—'}</span>
                  <span className="gear-desc">{def ? def.desc : 'Nothing worn'}</span>
                </div>
              );
            })}
          </div>
          <p className="hint">
            Gear is made at a workbench and picked up automatically when a survivor starts work.
          </p>
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
          <h3 className="sub">Assignment</h3>
          <p className="hint">
            <b>Auto</b> lets them pick sensible work on their own, avoiding jobs other survivors
            already have covered. Pinning them to one kind of work means they do only that.
          </p>
          <div className="assign-grid">
            <button
              className={`assign ${c.assignment === 'auto' ? 'on' : ''}`}
              onClick={() => engine.setAssignment(c.id, 'auto')}
            >
              Auto
            </button>
            {WORK_TYPES.map((wt) => (
              <button
                key={wt}
                className={`assign ${c.assignment === wt ? 'on' : ''}`}
                onClick={() => engine.setAssignment(c.id, wt)}
                title={`Only ${WORK_LABEL[wt].toLowerCase()}`}
              >
                {WORK_LABEL[wt]}
              </button>
            ))}
            <button
              className={`assign rest ${c.assignment === 'rest' ? 'on' : ''}`}
              onClick={() => engine.setAssignment(c.id, 'rest')}
              title="Take them off work entirely"
            >
              Off duty
            </button>
          </div>

          <h3 className="sub">Priorities</h3>
          <p className="hint">
            Used when this survivor is on <b>Auto</b>. Higher means they pick that work first;
            zero stars means never.
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
