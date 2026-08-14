'use client';

/**
 * Persistent header strip. It exists so the enclave mode and the running image digest are on
 * screen in every frame of the demo — the video's match shot calls for a visible image digest and
 * the engine exposes no log endpoint to cut away to.
 */

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { shortHex } from '@/lib/format';

export function EngineStatusStrip() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10_000,
  });
  const info = useQuery({ queryKey: ['info'], queryFn: api.info, refetchInterval: 30_000 });

  const mode = health.data?.mode;
  const isReal = mode === 'confidential_space' && health.data?.attestation_status === 'ok';
  const digest = info.data?.image_digest ?? '';

  return (
    <div className="border-b text-xs" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2">
        {health.isError ? (
          <span className="bad">engine unreachable</span>
        ) : !health.data ? (
          <span className="muted">connecting to enclave…</span>
        ) : (
          <>
            <span className="chip">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: isReal ? 'var(--ok)' : 'var(--warn)' }}
              />
              {isReal ? 'REAL TEE · Intel TDX' : mode === 'simulated' ? 'SIMULATED' : 'DEGRADED'}
            </span>
            <span className="muted">
              enclave <span className="mono accent">{shortHex(info.data?.tee_eth_address)}</span>
            </span>
            <span className="muted">
              image <span className="mono">{shortHex(digest.replace('sha256:', ''), 10, 4)}</span>
            </span>
            <span className="muted">
              key anchored{' '}
              <span className={health.data.tee_registered ? 'ok' : 'bad'}>
                {health.data.tee_registered ? '✓' : '✗'}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
