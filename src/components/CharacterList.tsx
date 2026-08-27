'use client';

import { useEngine } from '@/store/engineStore';
import Portrait from './Portrait';
import { currentActivityLabel } from '@/game/sim/ai';
import { WORK_LABEL } from '@/game/core/types';

export default function CharacterList() {
  const engine = useEngine();
  const w = engine.world;
  const living = w.characters.filter((c) => c.alive);
  const dead = w.characters.filter((c) => !c.alive);

  return (
    <div className="char-list">
      {living.map((c) => {
        const selected = engine.selected.includes(c.id);
        const alert =
          c.state === 'downed'
            ? 'downed'
            : c.hunger > 82
              ? 'hungry'
              : c.energy < 18
                ? 'tired'
                : c.injuries.some((i) => !i.treated)
                  ? 'hurt'
                  : c.morale < 25
                    ? 'unhappy'
                    : '';
        return (
          <button
            key={c.id}
            className={`char-chip ${selected ? 'selected' : ''} ${alert ? 'alert' : ''}`}
            onClick={() => {
              engine.selectCharacter(c.id);
              engine.centerOnCharacter(c.id);
            }}
            title={`${c.name} — best at ${WORK_LABEL[c.favouriteWork].toLowerCase()}${
              alert ? ` · ${alert}` : ''
            }`}
          >
            <Portrait character={c} scale={1.6} />
            <div className="char-chip-info">
              <span className="char-chip-name">{c.name}</span>
              <span className="char-chip-task">{currentActivityLabel(w, c)}</span>
              <div className="char-chip-bars">
                <i style={{ width: `${(c.health / c.maxHealth) * 100}%`, background: '#e05f5f' }} />
                <i style={{ width: `${100 - c.hunger}%`, background: '#e2b455' }} />
                <i style={{ width: `${c.energy}%`, background: '#63b6e8' }} />
              </div>
            </div>
            {alert && <span className="chip-alert" />}
          </button>
        );
      })}
      {dead.length > 0 && (
        <div className="memorial">
          <h4>In memory</h4>
          {dead.map((c) => (
            <button
              key={c.id}
              className="char-chip dead"
              onClick={() => engine.selectCharacter(c.id)}
            >
              <Portrait character={c} scale={1.4} dim />
              <div className="char-chip-info">
                <span className="char-chip-name">{c.name}</span>
                <span className="char-chip-task">
                  Day {c.deathDay} — {c.deathCause}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
