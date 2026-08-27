'use client';

import { useEngine } from '@/store/engineStore';

/**
 * Standing alarms: things that will get someone killed if the player ignores
 * them. Each one offers the action that fixes it.
 */
export default function Alarms() {
  const engine = useEngine();
  const alarms = engine.alarms();
  if (!alarms.length) return null;

  return (
    <div className="alarms">
      {alarms.slice(0, 3).map((a) => (
        <div key={a.key} className={`alarm alarm-${a.tone}`}>
          <button
            className="alarm-main"
            onClick={() => {
              if (a.charId >= 0) {
                engine.selectCharacter(a.charId);
                engine.centerOnCharacter(a.charId);
              }
            }}
            title="Jump to them"
          >
            <span className="alarm-icon">{a.tone === 'critical' ? '⚠' : '!'}</span>
            <span className="alarm-text">
              <strong>{a.title}</strong>
              <em>{a.body}</em>
            </span>
          </button>
          {a.action && (
            <button
              className="btn alarm-action"
              onClick={() => engine.runAlarmAction(a.action!)}
            >
              {a.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
