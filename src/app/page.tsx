'use client';

import dynamic from 'next/dynamic';

/**
 * The whole game is client-side: the simulation, the canvas renderer and the
 * save system all need the browser. Disabling SSR keeps the server from
 * generating a world it would only throw away.
 */
const GameShell = dynamic(() => import('@/components/GameShell'), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <h1>
        Modulo<span>:Alive</span>
      </h1>
      <p>Waking the camp…</p>
    </div>
  ),
});

export default function Page() {
  return <GameShell />;
}
