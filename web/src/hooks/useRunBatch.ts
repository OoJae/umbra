'use client';

import { useCallback, useRef, useState } from 'react';
import { readContract } from 'wagmi/actions';

import { api, errorCopy, type Batch } from '@/lib/api';
import { vault, wagmiConfig } from '@/lib/contracts';

export type RunPhase = 'idle' | 'firing' | 'watching' | 'settled' | 'empty' | 'failed';

/**
 * Fire the batch, then let the CHAIN decide when it's done.
 *
 * The engine's POST blocks until it has a receipt (10-40s), which is uncomfortably close to the
 * serverless ceiling. So the POST result is treated as one of two racing resolvers: the other is
 * polling `vault.lastBatchId()`. If the function times out but the settlement actually landed —
 * the worst thing that could happen on camera — the chain poller still reports success, and the
 * details are backfilled from GET /batches/{id}, which 404s until the run finishes and therefore
 * doubles as a completion signal.
 */
export function useRunBatch() {
  const [phase, setPhase] = useState<RunPhase>('idle');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setBatch(null);
    cancelled.current = false;

    const expectedId = (await readContract(wagmiConfig, {
      ...vault,
      functionName: 'nextBatchId',
    })) as bigint;

    setPhase('firing');
    setStartedAt(Date.now());

    let postOutcome: Batch | null = null;
    let postFailed: unknown = null;
    const posting = api
      .runBatch()
      .then((b) => {
        postOutcome = b;
      })
      .catch((e) => {
        postFailed = e;
      });

    setPhase('watching');

    const deadline = Date.now() + 95_000;
    while (Date.now() < deadline && !cancelled.current) {
      // Terminal outcomes the engine reported directly.
      if (postOutcome) {
        const b = postOutcome as Batch;
        if (b.status === 'settled') {
          setBatch(b);
          setPhase('settled');
          return b;
        }
        if (b.status === 'no_orders' || b.status === 'no_match') {
          setBatch(b);
          setPhase('empty');
          return b;
        }
        if (b.status === 'failed') {
          setBatch(b);
          setError(b.error_detail ?? b.error_code ?? 'batch failed');
          setPhase('failed');
          return b;
        }
      }

      // The chain is the source of truth: if lastBatchId advanced, it settled regardless of
      // whether the HTTP call survived.
      const last = (await readContract(wagmiConfig, {
        ...vault,
        functionName: 'lastBatchId',
      })) as bigint;

      if (last >= expectedId) {
        try {
          const detail = await api.batch(Number(expectedId));
          setBatch(detail);
        } catch {
          /* details may lag a moment; the chain already told us it settled */
        }
        setPhase('settled');
        return null;
      }

      if (postFailed && !postOutcome) {
        const code = (postFailed as { code?: string }).code;
        // A 409 means someone else's run is in flight — keep watching rather than failing.
        if (code !== 'batch_in_progress' && code !== 'engine_timeout') {
          setError(errorCopy(postFailed));
          setPhase('failed');
          return null;
        }
      }

      await new Promise((r) => setTimeout(r, 2500));
    }

    await posting.catch(() => {});
    setError('no settlement observed on-chain within 95s');
    setPhase('failed');
    return null;
  }, []);

  return { run, phase, batch, error, startedAt, cancel: () => (cancelled.current = true) };
}
