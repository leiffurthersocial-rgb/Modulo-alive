'use client';

import { useEngine } from '@/store/engineStore';

/**
 * The bottom dock. Every tool here can be reached and cancelled by touch
 * alone — nothing in the game requires a keyboard.
 */
export default function Toolbar({
  buildOpen,
  onToggleBuild,
  invOpen,
  onToggleInventory,
}: {
  buildOpen: boolean;
  onToggleBuild: () => void;
  invOpen: boolean;
  onToggleInventory: () => void;
}) {
  const engine = useEngine();
  const tool = engine.tool;
  const hasSelection = engine.selected.length > 0;

  return (
    <div className="toolbar">
      <button
        className={`tool ${tool === 'select' && !engine.orderMode ? 'active' : ''}`}
        onClick={() => {
          engine.setOrderMode(false);
          engine.setTool('select');
        }}
        title="Select survivors and buildings — tap one to inspect it"
      >
        <span className="tool-icon">👆</span>
        <span className="tool-label">Select</span>
      </button>
      <button
        className={`tool ${engine.orderMode ? 'active' : ''} ${hasSelection ? '' : 'dim'}`}
        onClick={() => engine.setOrderMode(!engine.orderMode)}
        title="Order mode — tap the world to send the selected survivors there, or onto a tree, rock, bush or expedition site"
      >
        <span className="tool-icon">🎯</span>
        <span className="tool-label">Order</span>
      </button>
      <button
        className={`tool ${buildOpen ? 'active' : ''}`}
        onClick={onToggleBuild}
        title="Build menu"
      >
        <span className="tool-icon">🔨</span>
        <span className="tool-label">Build</span>
      </button>
      <button
        className={`tool ${tool === 'mark' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'mark' ? 'select' : 'mark')}
        title="Mark trees, rocks and bushes for clearing — drag across an area"
      >
        <span className="tool-icon">🪓</span>
        <span className="tool-label">Clear</span>
      </button>
      <button
        className={`tool ${tool === 'unmark' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'unmark' ? 'select' : 'unmark')}
        title="Remove clearing marks"
      >
        <span className="tool-icon">↩️</span>
        <span className="tool-label">Unmark</span>
      </button>
      <button
        className={`tool ${tool === 'demolish' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'demolish' ? 'select' : 'demolish')}
        title="Dismantle a building or cancel a blueprint"
      >
        <span className="tool-icon">⛏️</span>
        <span className="tool-label">Take down</span>
      </button>

      <button
        className={`tool ${invOpen ? 'active' : ''}`}
        onClick={onToggleInventory}
        title="Everything the settlement has in store"
      >
        <span className="tool-icon">🎒</span>
        <span className="tool-label">Stores</span>
      </button>

      <div className="tool-sep" />

      <button className="tool tool-sm" onClick={() => engine.zoomStep(1)} title="Zoom in">
        <span className="tool-icon">➕</span>
      </button>
      <button className="tool tool-sm" onClick={() => engine.zoomStep(-1)} title="Zoom out">
        <span className="tool-icon">➖</span>
      </button>
      <button
        className="tool tool-sm"
        onClick={() => {
          const c = engine.world.characters.find((x) => x.alive);
          engine.followId = -1;
          engine.cam.centerOn(
            engine.world.campCenter.tx * 24,
            engine.world.campCenter.ty * 24
          );
          if (!c) return;
          engine.emit();
        }}
        title="Centre the view on the camp"
      >
        <span className="tool-icon">🏕️</span>
      </button>
    </div>
  );
}
