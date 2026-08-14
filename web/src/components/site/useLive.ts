'use client';

import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { flareTestnet } from 'viem/chains';

/**
 * Live chain + enclave readings for the marketing pages.
 *
 * Deliberately does NOT import `@/lib/contracts` — that module builds a wagmi
 * config, which would pull the entire web3 connector bundle into a landing page
 * that has no wallet in it. viem alone is enough to read two view functions.
 *
 * Everything here is a real reading. If a call fails the value stays null and
 * the UI renders a dash; nothing is faked, because the whole argument of this
 * product is that you should not have to take our word for a number.
 */

const VAULT = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined;

const ABI = [
  {
    type: 'function',
    name: 'peekPrice1e6',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint256', name: 'price1e6' },
      { type: 'uint64', name: 'timestamp' },
    ],
  },
  {
    type: 'function',
    name: 'lastBatchId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export type Live = {
  price1e6: bigint | null;
  lastBatchId: bigint | null;
  enclave: 'real' | 'simulated' | 'down' | null;
  buys: number | null;
  sells: number | null;
};

export function useLive(pollMs = 6000): Live {
  const [live, setLive] = useState<Live>({
    price1e6: null,
    lastBatchId: null,
    enclave: null,
    buys: null,
    sells: null,
  });

  useEffect(() => {
    let alive = true;

    const client = VAULT
      ? createPublicClient({ chain: flareTestnet, transport: http() })
      : null;

    const tick = async () => {
      if (client && VAULT) {
        try {
          const [price, batch] = await Promise.all([
            client.readContract({ address: VAULT, abi: ABI, functionName: 'peekPrice1e6' }),
            client.readContract({ address: VAULT, abi: ABI, functionName: 'lastBatchId' }),
          ]);
          if (alive) {
            setLive((s) => ({ ...s, price1e6: price[0], lastBatchId: batch }));
          }
        } catch {
          /* leave the previous reading in place rather than flashing a dash */
        }
      }

      try {
        const [h, book] = await Promise.all([
          fetch('/api/engine/healthz').then((r) => r.json()),
          fetch('/api/engine/orderbook/public').then((r) => r.json()),
        ]);
        if (!alive) return;
        setLive((s) => ({
          ...s,
          enclave:
            h?.status === 'ok'
              ? h?.mode === 'confidential_space'
                ? 'real'
                : 'simulated'
              : 'down',
          buys: typeof book?.count_buys === 'number' ? book.count_buys : s.buys,
          sells: typeof book?.count_sells === 'number' ? book.count_sells : s.sells,
        }));
      } catch {
        if (alive) setLive((s) => ({ ...s, enclave: 'down' }));
      }
    };

    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return live;
}

export function fmtPrice(v: bigint | null): string {
  if (v === null) return '—';
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, '0');
  return `$${whole}.${frac}`;
}
