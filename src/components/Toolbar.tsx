'use client';

import { useEngine } from '@/store/engineStore';

export default function Toolbar({
  buildOpen,
  onToggleBuild,
}: {
  buildOpen: boolean;
  onToggleBuild: () => void;
}) {
  const engine = useEngine();
  const tool = engine.tool;

  return (
    <div className="toolbar">
      <button
        className={`tool ${tool === 'select' ? 'active' : ''}`}
        onClick={() => engine.setTool('select')}
        title="Select and command survivors — left click to select, right click to order"
      >
        <span className="tool-icon">🖱</span>
        <span className="tool-label">Select</span>
      </button>
      <button
        className={`tool ${buildOpen ? 'active' : ''}`}
        onClick={onToggleBuild}
        title="Build menu (B)"
      >
        <span className="tool-icon">🔨</span>
        <span className="tool-label">Build</span>
      </button>
      <button
        className={`tool ${tool === 'mark' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'mark' ? 'select' : 'mark')}
        title="Mark trees, rocks and bushes for clearing (C) — drag to mark an area"
      >
        <span className="tool-icon">🪓</span>
        <span className="tool-label">Clear</span>
      </button>
      <button
        className={`tool ${tool === 'unmark' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'unmark' ? 'select' : 'unmark')}
        title="Remove clearing marks"
      >
        <span className="tool-icon">↩</span>
        <span className="tool-label">Unmark</span>
      </button>
      <button
        className={`tool ${tool === 'demolish' ? 'active' : ''}`}
        onClick={() => engine.setTool(tool === 'demolish' ? 'select' : 'demolish')}
        title="Dismantle a building or cancel a blueprint"
      >
        <span className="tool-icon">⛏</span>
        <span className="tool-label">Dismantle</span>
      </button>
    </div>
  );
}
