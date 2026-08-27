'use client';

import { useEngine } from '@/store/engineStore';
import { nextTierProgress, settlementSnapshot } from '@/game/sim/progression';
import { PROGRESSION_TIERS } from '@/game/data/buildings';
import { WORK_LABEL, WORK_TYPES } from '@/game/core/types';
import { workCoverage } from '@/game/sim/jobs';
import { storageCapacity, storedTotal } from '@/game/sim/world';

export default function Objectives() {
  const engine = useEngine();
  const w = engine.world;
  const tier = PROGRESSION_TIERS.find((t) => t.level === w.progression.level);
  const next = nextTierProgress(w);
  const snap = settlementSnapshot(w);
  const coverage = workCoverage(w);
  const living = w.characters.filter((c) => c.alive);

  // At-a-glance problems, in the order they will hurt.
  const alerts: { text: string; tone: 'bad' | 'warn' }[] = [];
  const food = w.stock.food + w.stock.rawFood;
  if (food < living.length * 3) alerts.push({ text: 'Food is nearly gone', tone: 'bad' });
  else if (food < living.length * 8) alerts.push({ text: 'Food is running low', tone: 'warn' });
  if (snap.beds < living.length)
    alerts.push({
      text: `${living.length - snap.beds} survivor(s) have no bed`,
      tone: 'warn',
    });
  if (storedTotal(w) >= storageCapacity(w) * 0.92)
    alerts.push({ text: 'Storage is full — supplies are being wasted', tone: 'warn' });
  const untreated = living.filter((c) => c.injuries.some((i) => !i.treated) || c.sickness > 0.2);
  if (untreated.length)
    alerts.push({ text: `${untreated.length} need medical attention`, tone: 'bad' });
  if (w.stock.medicine < 1 && untreated.length)
    alerts.push({ text: 'No medicine in store', tone: 'bad' });
  const idle = living.filter((c) => c.jobId < 0 && c.state === 'idle');
  if (idle.length >= 3)
    alerts.push({ text: `${idle.length} survivors have nothing to do`, tone: 'warn' });

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
      {alerts.length > 0 && (
        <>
          <h4>Needs attention</h4>
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.text} className={`alert-${a.tone}`}>
                {a.text}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Who is doing what</h4>
      <ul className="obj-list work-list">
        {WORK_TYPES.filter((wt) => coverage[wt] > 0).map((wt) => (
          <li key={wt}>
            <span>{WORK_LABEL[wt]}</span>
            <span>{coverage[wt]}</span>
          </li>
        ))}
        {idle.length > 0 && (
          <li className="idle-row">
            <span>Idle</span>
            <span>{idle.length}</span>
          </li>
        )}
        {WORK_TYPES.every((wt) => coverage[wt] === 0) && idle.length === 0 && (
          <li>
            <span>Nobody is working right now</span>
            <span />
          </li>
        )}
      </ul>

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
