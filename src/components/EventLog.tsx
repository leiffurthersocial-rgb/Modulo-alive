'use client';

import { useEffect, useRef } from 'react';
import { useEngine } from '@/store/engineStore';

const KIND_ICON: Record<string, string> = {
  info: '·',
  good: '✔',
  bad: '!',
  story: '❧',
  death: '✝',
  discovery: '★',
  build: '⌂',
  alert: '⚠',
};

export default function EventLog() {
  const engine = useEngine();
  const w = engine.world;
  const ref = useRef<HTMLDivElement>(null);
  const entries = w.log.slice(-60);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [w.log.length]);

  return (
    <div className="event-log" ref={ref}>
      {entries.map((e) => (
        <div key={e.id} className={`log-entry log-${e.kind}`}>
          <div className="log-head">
            <span className="log-icon">{KIND_ICON[e.kind] ?? '·'}</span>
            <span className="log-title">{e.title}</span>
            <span className="log-time">
              D{e.day} {e.time}
            </span>
          </div>
          <p className="log-body">{e.body}</p>
          {e.chars.length > 0 && (
            <div className="log-chars">
              {e.chars.map((id) => {
                const c = w.characters.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <button
                    key={id}
                    className="log-char"
                    onClick={() => {
                      engine.selectCharacter(id);
                      engine.centerOnCharacter(id);
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
      {entries.length === 0 && <p className="hint">Nothing has happened yet.</p>}
    </div>
  );
}
