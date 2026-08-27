'use client';

import { useEffect, useState } from 'react';
import { getEngine } from '@/store/engineStore';
import { AUTOSAVE_SLOT, SLOTS, deleteSave, listSaves, type SaveMeta } from '@/game/sim/save';

function slotLabel(slot: string) {
  if (slot === AUTOSAVE_SLOT) return 'Autosave';
  return `Slot ${slot.replace('slot', '')}`;
}

function formatWhen(ts: number) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}

export default function MainMenu({
  mode,
  onStart,
  onClose,
}: {
  mode: 'title' | 'pause';
  onStart: () => void;
  onClose: () => void;
}) {
  const engine = getEngine();
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [view, setView] = useState<'main' | 'load' | 'save' | 'help'>('main');

  const refresh = () => setSaves(listSaves());
  useEffect(refresh, [view]);

  const autosave = saves.find((s) => s.slot === AUTOSAVE_SLOT);

  return (
    <div className={`menu-overlay ${mode === 'title' ? 'title-mode' : ''}`}>
      <div className="menu-card">
        <div className="menu-brand">
          <h1>
            Modulo<span>:Alive</span>
          </h1>
          <p className="tagline">Eight people. One forest. Make it a home.</p>
        </div>

        {view === 'main' && (
          <div className="menu-actions">
            {mode === 'pause' && (
              <button className="btn btn-primary" onClick={onClose}>
                Resume
              </button>
            )}
            {mode === 'title' && autosave && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (engine.load(AUTOSAVE_SLOT)) onStart();
                }}
              >
                Continue — Day {autosave.day}, {autosave.population} survivors
              </button>
            )}
            <button
              className={`btn ${mode === 'title' && !autosave ? 'btn-primary' : ''}`}
              onClick={() => {
                if (
                  mode === 'pause' &&
                  !window.confirm('Start a new game? Unsaved progress will be lost.')
                )
                  return;
                engine.newGame();
                onStart();
              }}
            >
              New Game
            </button>
            <button className="btn" onClick={() => setView('load')}>
              Load Game
            </button>
            {mode === 'pause' && (
              <button className="btn" onClick={() => setView('save')}>
                Save Game
              </button>
            )}
            <button className="btn" onClick={() => setView('help')}>
              How to Play
            </button>
          </div>
        )}

        {(view === 'load' || view === 'save') && (
          <div className="menu-slots">
            <h3>{view === 'load' ? 'Load Game' : 'Save Game'}</h3>
            {[AUTOSAVE_SLOT, ...SLOTS].map((slot) => {
              const meta = saves.find((s) => s.slot === slot);
              const canSave = view === 'save' && slot !== AUTOSAVE_SLOT;
              return (
                <div key={slot} className="slot-row">
                  <div className="slot-info">
                    <strong>{slotLabel(slot)}</strong>
                    {meta ? (
                      <span>
                        Day {meta.day} · {meta.population} survivors · level {meta.level}
                        <em>{formatWhen(meta.savedAt)}</em>
                      </span>
                    ) : (
                      <span className="empty">empty</span>
                    )}
                  </div>
                  <div className="slot-actions">
                    {view === 'load' ? (
                      <button
                        className="btn"
                        disabled={!meta}
                        onClick={() => {
                          if (engine.load(slot)) {
                            onStart();
                            setView('main');
                          }
                        }}
                      >
                        Load
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={!canSave}
                        onClick={() => {
                          engine.save(slot);
                          refresh();
                        }}
                      >
                        Save
                      </button>
                    )}
                    {meta && (
                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          deleteSave(slot);
                          refresh();
                        }}
                        title="Delete this save"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <button className="btn" onClick={() => setView('main')}>
              Back
            </button>
          </div>
        )}

        {view === 'help' && (
          <div className="menu-help">
            <h3>How to Play</h3>
            <ul>
              <li>
                <b>Left click</b> a survivor to select them. Drag a box to select several.
              </li>
              <li>
                <b>Right click</b> to give the selection an order: walk somewhere, chop a tree,
                mine a rock, forage a bush, or explore a marked site in the forest.
              </li>
              <li>
                <b>Clear tool</b> (C) marks trees and rocks for removal — drag over an area.
                Cleared ground is where you build.
              </li>
              <li>
                <b>Build</b> (B) places blueprints. Survivors haul the materials and build them by
                hand; nothing appears instantly.
              </li>
              <li>
                <b>Work priorities</b> in a survivor's panel decide what they choose to do on their
                own. Zero stars means they never take that job.
              </li>
              <li>
                <b>Speed</b>: Space pauses, keys 1–4 set pause / 1× / 2× / 4×.
              </li>
              <li>
                <b>Camera</b>: WASD or arrows to pan, mouse wheel to zoom, middle-drag to drag the
                view, F to follow the selected survivor, Tab to cycle survivors.
              </li>
              <li>
                Survivors get hungry, tired, hurt and unhappy. Feed them, give them beds, treat
                their injuries — and remember that death here is permanent.
              </li>
            </ul>
            <button className="btn" onClick={() => setView('main')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
