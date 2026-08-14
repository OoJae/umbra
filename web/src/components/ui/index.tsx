'use client';

import { useState } from 'react';

export function Card({ title, subtitle, children, right }: {
  title?: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <section className="panel p-4">
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-medium">{title}</h2>}
            {subtitle && <p className="muted mt-0.5 text-xs">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: {
  label: string; value: React.ReactNode; hint?: string; tone?: 'ok' | 'bad' | 'warn';
}) {
  return (
    <div>
      <div className="muted text-xs">{label}</div>
      <div className={`mono text-lg ${tone ?? ''}`}>{value}</div>
      {hint && <div className="muted text-xs">{hint}</div>}
    </div>
  );
}

export function Copy({ text, label = 'copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost text-xs"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? 'copied' : label}
    </button>
  );
}

export function Chip({ tone, children }: { tone?: 'ok' | 'bad' | 'warn'; children: React.ReactNode }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--warn)' : 'var(--muted)';
  return (
    <span className="chip" style={{ color }}>
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

export function Row({ k, v, mono = true }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 text-sm last:border-0"
         style={{ borderColor: 'var(--line)' }}>
      <span className="muted shrink-0">{k}</span>
      <span className={`${mono ? 'mono' : ''} break-all text-right`}>{v}</span>
    </div>
  );
}
