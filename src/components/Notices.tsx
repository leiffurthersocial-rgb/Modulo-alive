'use client';

import { useEngine } from '@/store/engineStore';

export default function Notices() {
  const engine = useEngine();
  return (
    <div className="notices">
      {engine.notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.tone}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}
