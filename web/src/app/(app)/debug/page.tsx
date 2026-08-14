'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { cryptoSelfTest, type SelfTest } from '@/lib/crypto';

export default function DebugPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });
  const info = useQuery({ queryKey: ['info'], queryFn: api.info });
  const [selfTest, setSelfTest] = useState<SelfTest | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    cryptoSelfTest().then(setSelfTest).catch((e) => setErr(String(e)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Debug</h1>
        <p className="muted text-sm">
          Proves the proxy reaches the enclave and that the sealed-box path works, before any
          order is ever signed.
        </p>
      </div>

      <section className="panel p-4">
        <h2 className="mb-3 font-medium">Crypto self-test</h2>
        {err && <p className="bad text-sm mono">{err}</p>}
        {!selfTest && !err && <p className="muted text-sm">running…</p>}
        {selfTest && (
          <ul className="space-y-1 text-sm">
            {selfTest.checks.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'}</span>
                <span>{c.name}</span>
                {c.detail && <span className="muted mono text-xs">{c.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 font-medium">GET /healthz</h2>
        <pre className="mono overflow-x-auto text-xs">
          {health.isError ? String(health.error) : JSON.stringify(health.data, null, 2)}
        </pre>
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 font-medium">GET /info</h2>
        <pre className="mono overflow-x-auto text-xs">
          {info.isError ? String(info.error) : JSON.stringify(info.data, null, 2)}
        </pre>
      </section>
    </div>
  );
}
