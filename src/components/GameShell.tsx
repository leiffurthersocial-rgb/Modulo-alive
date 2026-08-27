'use client';

import { useEffect, useState } from 'react';
import GameCanvas from './GameCanvas';
import TopBar from './TopBar';
import Toolbar from './Toolbar';
import CharacterList from './CharacterList';
import CharacterPanel from './CharacterPanel';
import BuildingPanel from './BuildingPanel';
import BuildMenu from './BuildMenu';
import EventLog from './EventLog';
import Objectives from './Objectives';
import Minimap from './Minimap';
import Notices from './Notices';
import MainMenu from './MainMenu';
import { useEngine } from '@/store/engineStore';

export default function GameShell() {
  const engine = useEngine();
  const [started, setStarted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'log' | 'goals'>('log');
  const [compact, setCompact] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(true);

  // Small screens (iPad portrait, phones) get the side panels as overlays that
  // are off by default, so the world keeps most of the glass.
  useEffect(() => {
    const apply = () => {
      const narrow = window.innerWidth < 1080;
      setCompact(narrow);
      setRosterOpen(!narrow);
      setLogOpen(!narrow);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  // Keyboard shortcuts are a convenience, never the only way to do anything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') {
        const wasBuild = engine.tool === 'build';
        const idle = engine.escape();
        if (wasBuild || buildOpen) {
          setBuildOpen(false);
          return;
        }
        if (idle) setMenuOpen((m) => !m);
      }
      if (e.key.toLowerCase() === 'b') setBuildOpen((b) => !b);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, buildOpen, engine]);

  // Pause the simulation while a blocking menu is open.
  useEffect(() => {
    if (!started) return;
    if (menuOpen) {
      const prev = engine.speed;
      engine.setSpeed(0);
      return () => {
        engine.setSpeed(prev === 0 ? 1 : prev);
      };
    }
  }, [menuOpen, started, engine]);

  useEffect(() => {
    if (!buildOpen && engine.tool === 'build') engine.setTool('select');
  }, [buildOpen, engine]);

  // Panels sit side by side, so on anything short of a wide desktop there is
  // not room for all of them at once. Opening the build menu makes room by
  // folding the side rails away rather than covering the world.
  useEffect(() => {
    if (!buildOpen) return;
    if (window.innerWidth >= 1500) return;
    setRosterOpen(false);
    setLogOpen(false);
  }, [buildOpen]);

  // Measure how much of the canvas the HUD covers, so the camera can keep the
  // world centred in the gap between the panels rather than behind them.
  useEffect(() => {
    if (!started) return;
    const measure = () => {
      const width = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.width > 0 ? r.width + 8 : 0;
      };
      const height = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.height > 0 ? r.height + 8 : 0;
      };
      engine.setHudInsets(
        width('.rail-roster') + width('.inspector'),
        width('.build-dock') + width('.rail-right'),
        height('.topbar'),
        height('.hud-dock')
      );
    };
    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [started, engine, rosterOpen, logOpen, buildOpen, compact]);

  const w = engine.world;
  const selectedChar =
    engine.selected.length > 0
      ? (w.characters.find((c) => c.id === engine.selected[engine.selected.length - 1]) ?? null)
      : null;
  const selectedBuilding =
    engine.selectedBuildingId >= 0 ? (w.buildings.get(engine.selectedBuildingId) ?? null) : null;

  const toolActive = engine.tool !== 'select';
  const toolText =
    engine.tool === 'build' && engine.buildDefId
      ? 'Tap the ground to place the structure'
      : engine.tool === 'mark'
        ? 'Drag across trees and rocks to mark them for clearing'
        : engine.tool === 'unmark'
          ? 'Drag across marked resources to unmark them'
          : engine.tool === 'demolish'
            ? 'Tap a building to take it down'
            : '';

  return (
    <div className={`game-root ${compact ? 'compact' : ''} ${engine.touch ? 'touch' : ''}`}>
      <div className="viewport">
        <GameCanvas />
        <Notices />
      </div>

      {started && (
        <>
          <TopBar
            onMenu={() => setMenuOpen(true)}
            compact={compact}
            rosterOpen={rosterOpen}
            logOpen={logOpen}
            onToggleRoster={() => setRosterOpen((v) => !v)}
            onToggleLog={() => setLogOpen((v) => !v)}
          />

          {/*
            The HUD is a grid, not a stack of floating boxes: every panel gets
            its own column, so opening two at once squeezes the view rather
            than covering another panel.
          */}
          <div className="hud">
            {rosterOpen && (
              <aside className="hud-cell rail-roster">
                <CharacterList />
              </aside>
            )}

            {(selectedChar || selectedBuilding) && (
              <section className="hud-cell inspector">
                <button
                  className="btn btn-icon inspector-close"
                  onClick={() => {
                    engine.selected = [];
                    engine.selectedBuildingId = -1;
                    engine.emit();
                  }}
                  title="Close"
                >
                  ✕
                </button>
                {selectedChar ? (
                  <CharacterPanel character={selectedChar} />
                ) : (
                  selectedBuilding && <BuildingPanel building={selectedBuilding} />
                )}
              </section>
            )}

            <div className="hud-world" />

            {buildOpen && (
              <section className="hud-cell build-dock">
                <BuildMenu
                  onClose={() => {
                    setBuildOpen(false);
                    engine.setTool('select');
                  }}
                />
              </section>
            )}

            {logOpen && (
              <aside className="hud-cell rail-right">
                <div className="rail-tabs">
                  <button
                    className={`tab ${rightTab === 'log' ? 'active' : ''}`}
                    onClick={() => setRightTab('log')}
                  >
                    Chronicle
                  </button>
                  <button
                    className={`tab ${rightTab === 'goals' ? 'active' : ''}`}
                    onClick={() => setRightTab('goals')}
                  >
                    Settlement
                  </button>
                </div>
                <div className="rail-body">
                  {rightTab === 'log' ? <EventLog /> : <Objectives />}
                </div>
                <Minimap />
              </aside>
            )}

            <div className="hud-dock">
              {(toolActive || engine.orderMode) && (
                <div className="tool-banner">
                  <span>
                    {toolActive
                      ? toolText
                      : 'Order mode — tap the world to command the selected survivors'}
                  </span>
                  <button
                    className="btn btn-cancel"
                    onClick={() => {
                      engine.setOrderMode(false);
                      engine.setTool('select');
                      setBuildOpen(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              <Toolbar buildOpen={buildOpen} onToggleBuild={() => setBuildOpen((b) => !b)} />
            </div>
          </div>
        </>
      )}

      {(!started || menuOpen) && (
        <MainMenu
          mode={started ? 'pause' : 'title'}
          onStart={() => {
            setStarted(true);
            setMenuOpen(false);
            engine.setSpeed(1);
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
