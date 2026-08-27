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
import { listSaves } from '@/game/sim/save';

export default function GameShell() {
  const engine = useEngine();
  const [started, setStarted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'log' | 'goals'>('log');
  const [hasSaves, setHasSaves] = useState(false);

  useEffect(() => {
    setHasSaves(listSaves().length > 0);
  }, []);

  // Escape opens the menu when no tool is active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && started) {
        if (engine.tool !== 'select') return;
        if (buildOpen) {
          setBuildOpen(false);
          return;
        }
        setMenuOpen((m) => !m);
      }
      if (e.key.toLowerCase() === 'b' && started) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        setBuildOpen((b) => !b);
      }
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
    if (buildOpen && engine.tool !== 'build') return;
    if (!buildOpen && engine.tool === 'build') engine.setTool('select');
  }, [buildOpen, engine]);

  const w = engine.world;
  const selectedChar =
    engine.selected.length > 0
      ? w.characters.find((c) => c.id === engine.selected[engine.selected.length - 1]) ?? null
      : null;
  const selectedBuilding =
    engine.selectedBuildingId >= 0 ? w.buildings.get(engine.selectedBuildingId) ?? null : null;

  return (
    <div className="game-root">
      <div className="viewport">
        <GameCanvas />
        <Notices />
        {engine.tool !== 'select' && (
          <div className="tool-banner">
            {engine.tool === 'build' && engine.buildDefId
              ? 'Placing structure — right click or Escape to stop'
              : engine.tool === 'mark'
                ? 'Drag over trees and rocks to mark them for clearing'
                : engine.tool === 'unmark'
                  ? 'Drag over marked resources to unmark them'
                  : 'Click a building to dismantle it'}
          </div>
        )}
      </div>

      {started && (
        <>
          <TopBar onMenu={() => setMenuOpen(true)} />

          <aside className="left-rail">
            <CharacterList />
          </aside>

          <aside className="right-rail">
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

          <div className="bottom-dock">
            <Toolbar buildOpen={buildOpen} onToggleBuild={() => setBuildOpen((b) => !b)} />
          </div>

          {buildOpen && (
            <div className="build-dock">
              <BuildMenu
                onClose={() => {
                  setBuildOpen(false);
                  engine.setTool('select');
                }}
              />
            </div>
          )}

          {selectedChar && (
            <div className="inspector">
              <CharacterPanel character={selectedChar} />
            </div>
          )}
          {!selectedChar && selectedBuilding && (
            <div className="inspector">
              <BuildingPanel building={selectedBuilding} />
            </div>
          )}
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
