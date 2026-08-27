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
  const [view, setView] = useState<'main' | 'load' | 'save' | 'help' | 'settings'>('main');
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

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
            {mode === 'pause' && (
              <button className="btn" onClick={() => setView('settings')}>
                Settings
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

        {view === 'settings' && (
          <div className="menu-settings">
            <h3>Settings</h3>

            <h4>Simulation</h4>
            {(
              [
                ['autosave', 'Autosave', 'Save to the autosave slot every few game hours.'],
                [
                  'autoGather',
                  'Automatic gathering',
                  'Survivors top up wood and stone on their own. Turn this off to direct all clearing yourself.',
                ],
                [
                  'speechBubbles',
                  'Speech bubbles',
                  'Show what survivors are saying above their heads.',
                ],
                [
                  'pauseOnDeath',
                  'Pause when a survivor dies',
                  'Stops the clock so you can react.',
                ],
              ] as const
            ).map(([key, label, desc]) => (
              <button
                key={key}
                className={`setting-row ${engine.settings[key] ? 'on' : ''}`}
                onClick={() => {
                  engine.settings[key] = !engine.settings[key];
                  engine.emit();
                  rerender();
                }}
              >
                <span className="setting-check">{engine.settings[key] ? '✓' : ''}</span>
                <span className="setting-text">
                  <strong>{label}</strong>
                  <em>{desc}</em>
                </span>
              </button>
            ))}

            <h4>Survivors</h4>
            <button
              className="btn"
              onClick={() => {
                engine.resetAssignments();
                onClose();
              }}
            >
              Put everyone back on automatic work
            </button>
            <button
              className="btn"
              onClick={() => {
                engine.resetPriorities();
                onClose();
              }}
            >
              Reset all work preferences
            </button>

            <h4>Orders</h4>
            <button
              className="btn"
              onClick={() => {
                engine.clearAllMarks();
                onClose();
              }}
            >
              Clear every clearing mark
            </button>
            <button
              className="btn"
              onClick={() => {
                engine.cancelAllBlueprints();
                onClose();
              }}
            >
              Cancel all pending blueprints
            </button>

            <h4>Saves</h4>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!window.confirm('Delete every saved game? This cannot be undone.')) return;
                for (const slot of [AUTOSAVE_SLOT, ...SLOTS]) deleteSave(slot);
                refresh();
                rerender();
              }}
            >
              Delete all saves
            </button>

            <button className="btn" onClick={() => setView('main')}>
              Back
            </button>
          </div>
        )}

        {view === 'help' && (
          <div className="menu-help">
            <h3>How to Play</h3>
            <h4>Touch</h4>
            <ul>
              <li>
                <b>Tap</b> a survivor or building to inspect it. <b>Drag</b> to move the view,
                <b> pinch</b> to zoom.
              </li>
              <li>
                <b>Order</b> in the bottom bar, then tap the world to send the selected survivors
                somewhere — or onto a tree, rock, bush or expedition site. A <b>long press</b> on
                the world does the same thing without switching mode.
              </li>
              <li>
                Every tool has a <b>Cancel</b> button; nothing needs a keyboard.
              </li>
            </ul>
            <h4>Mouse and keyboard</h4>
            <ul>
              <li>
                <b>Left click</b> selects, drag a box to select several. <b>Right click</b> gives
                orders. Wheel zooms, middle-drag pans, WASD or arrows move the view.
              </li>
              <li>
                <b>Space</b> pauses; <b>1–4</b> set pause / 1× / 2× / 4×. <b>B</b> opens the build
                menu, <b>F</b> follows the selected survivor, <b>Tab</b> cycles survivors.
              </li>
            </ul>
            <h4>Running the camp</h4>
            <ul>
              <li>
                <b>Clear</b> marks trees and rocks for removal. Cleared ground is the only place
                you can build, so pushing the treeline back is how the settlement grows.
              </li>
              <li>
                <b>Build</b> places a blueprint. Survivors haul the materials to it and build it by
                hand — nothing appears instantly.
              </li>
              <li>
                Each survivor is on <b>Auto</b> by default and picks work that nobody else has
                covered. Pin one to a single job, or take them off duty, in their Work tab.
              </li>
              <li>
                <b>Farm plots</b> start untilled. Survivors till each bed, sow it, tend it, and
                harvest when the bed shows a bright marker.
              </li>
              <li>
                Tools, hats and vests are made at a <b>workbench</b> and worn automatically — you
                can see them on the survivor.
              </li>
              <li>
                People get hungry, tired, hurt and unhappy. Feed them, give everyone a bed, treat
                injuries — and remember that death here is permanent.
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
