'use client';

import type { ReactNode } from 'react';

export function Bar({
  value,
  max = 100,
  color,
  label,
  invert = false,
  compact = false,
}: {
  value: number;
  max?: number;
  color: string;
  label?: string;
  invert?: boolean;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const shown = invert ? 1 - pct : pct;
  return (
    <div className={`bar ${compact ? 'bar-compact' : ''}`}>
      {label && <span className="bar-label">{label}</span>}
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${shown * 100}%`, background: color }} />
      </div>
      <span className="bar-value">{Math.round(value)}</span>
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="panel-head">
          <h2>{title}</h2>
          {right}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Stars({
  value,
  max = 4,
  onChange,
}: {
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stars">
      {Array.from({ length: max }, (_, i) => i + 1).map((i) => (
        <button
          key={i}
          type="button"
          className={`star ${i <= value ? 'on' : ''}`}
          onClick={() => onChange(i === value ? i - 1 : i)}
          aria-label={`Priority ${i}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
