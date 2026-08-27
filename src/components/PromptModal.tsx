'use client';

import { useEngine } from '@/store/engineStore';
import Portrait from './Portrait';

/**
 * The big events — a trader, a stranger at the treeline — stop the game and
 * ask. They are the moments the player is meant to actually decide something.
 */
export default function PromptModal() {
  const engine = useEngine();
  const prompt = engine.world.prompts[0];
  if (!prompt) return null;

  const chars = prompt.chars
    .map((id) => engine.world.characters.find((c) => c.id === id))
    .filter(Boolean);

  return (
    <div className="prompt-overlay">
      <div className={`prompt-card prompt-${prompt.tone}`}>
        <header>
          <h2>{prompt.title}</h2>
        </header>
        <div className="prompt-body">
          {chars.length > 0 && (
            <div className="prompt-portraits">
              {chars.map((c) => (
                <div key={c!.id} className="prompt-portrait">
                  <Portrait character={c!} scale={3} />
                  <span>{c!.name}</span>
                </div>
              ))}
            </div>
          )}
          <p>{prompt.body}</p>
        </div>
        <div className="prompt-options">
          {prompt.options.map((o) => (
            <button
              key={o.id}
              className={`prompt-option ${o.id === 'accept' ? 'primary' : ''}`}
              disabled={o.disabled}
              onClick={() => engine.answerPrompt(prompt.id, o.id)}
            >
              <strong>{o.label}</strong>
              <span>{o.disabled ? 'You do not have enough for this.' : o.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
