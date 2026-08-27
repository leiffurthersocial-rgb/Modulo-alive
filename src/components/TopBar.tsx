'use client';

import { useEngine } from '@/store/engineStore';
import { RESOURCE_LABEL, type ResourceType } from '@/game/core/types';
import { storageCapacity, storedTotal } from '@/game/sim/world';
import { worldClock } from '@/game/sim/time';
import { PROGRESSION_TIERS } from '@/game/data/buildings';

const SHOWN: ResourceType[] = [
  'wood',
  'stone',
  'food',
  'rawFood',
  'fiber',
  'herbs',
  'medicine',
  'water',
  'seeds',
  'tools',
];

const ICONS: Record<string, string> = {
  wood: '🪵',
  stone: '🪨',
  food: '🍲',
  rawFood: '🥔',
  fiber: '🧵',
  herbs: '🌿',
  medicine: '💊',
  water: '💧',
  seeds: '🌱',
  tools: '🔨',
};

export default function TopBar({
  onMenu,
  compact,
  rosterOpen,
  logOpen,
  onToggleRoster,
  onToggleLog,
}: {
  onMenu: () => void;
  compact: boolean;
  rosterOpen: boolean;
  logOpen: boolean;
  onToggleRoster: () => void;
  onToggleLog: () => void;
}) {
  const engine = useEngine();
  const w = engine.world;
  const clock = worldClock(w);
  const cap = storageCapacity(w);
  const used = storedTotal(w);
  const pop = w.characters.filter((c) => c.alive).length;
  const tier = PROGRESSION_TIERS.find((t) => t.level === w.progression.level);
  const foodTotal = w.stock.food + w.stock.rawFood;
  const lowFood = foodTotal < pop * 4;
  const full = used >= cap * 0.98;

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="btn btn-icon" onClick={onMenu} title="Menu">
          ☰
        </button>
        <button
          className={`btn btn-icon panel-toggle ${rosterOpen ? 'on' : ''}`}
          onClick={onToggleRoster}
          title="Show or hide the survivor roster"
        >
          👥
        </button>
        <button
          className={`btn btn-icon panel-toggle ${logOpen ? 'on' : ''}`}
          onClick={onToggleLog}
          title="Show or hide the chronicle and map"
        >
          📜
        </button>
        <div className="clock">
          <div className="clock-day">Day {clock.day}</div>
          <div className="clock-time">{clock.time}</div>
        </div>
        <div className="phase" title={`${clock.season}, day ${clock.dayOfSeason}`}>
          <span className="phase-icon">{clock.night ? '🌙' : '☀️'}</span>
          <span className="phase-text">
            {tier?.name ?? 'Camp'} · {w.weather.kind}
          </span>
        </div>
      </div>

      <div className="resources">
        {SHOWN.map((r) => {
          const v = Math.floor(w.stock[r]);
          const warn = (r === 'food' && lowFood) || (r === 'medicine' && v === 0);
          return (
            <div key={r} className={`res ${warn ? 'res-warn' : ''}`} title={RESOURCE_LABEL[r]}>
              <span className="res-icon">{ICONS[r]}</span>
              <span className="res-val">{v}</span>
            </div>
          );
        })}
        <div className={`res storage ${full ? 'res-warn' : ''}`} title="Storage used / capacity">
          <span className="res-icon">📦</span>
          <span className="res-val">
            {Math.floor(used)}/{cap}
          </span>
        </div>
      </div>

      <div className="topbar-right">
        {!compact && (
          <div className="pop" title="Living survivors">
            👥 {pop}
          </div>
        )}
        <div className="speeds">
          {engine.speeds.map((s) => (
            <button
              key={s}
              className={`btn speed ${engine.speed === s ? 'active' : ''}`}
              onClick={() => engine.setSpeed(s)}
              title={s === 0 ? 'Pause' : `${s}x speed`}
            >
              {s === 0 ? '❚❚' : `${s}×`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
