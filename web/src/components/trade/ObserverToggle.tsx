'use client';

import { useState } from 'react';

import { useDarkBook } from '@/hooks/useEngine';
import { Card, Copy } from '@/components/ui';
import { grepForPlaintext } from '@/lib/crypto';

type Tab = 'yours' | 'wire' | 'operator';

export function ObserverToggle({ plaintext, rawBody, secret }: {
  plaintext?: string; rawBody?: string; secret?: string;
}) {
  const [tab, setTab] = useState<Tab>('wire');
  const [grepped, setGrepped] = useState<boolean | null>(null);
  const book = useDarkBook();

  const body =
    tab === 'yours' ? plaintext ?? '— submit an order to see the struct you signed —'
    : tab === 'wire' ? rawBody ?? '— submit an order to see the exact POST body —'
    : JSON.stringify(book.data ?? {}, null, 2);

  const tabs: [Tab, string][] = [
    ['yours', 'Your plaintext order'],
    ['wire', 'The raw POST body'],
    ['operator', 'What the operator sees'],
  ];

  return (
    <Card
      title="What observers see"
      subtitle="Same bytes, three vantage points. Only the first one ever existed in your browser."
      right={rawBody ? <Copy text={rawBody} label="copy body" /> : undefined}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'btn text-xs' : 'btn-ghost text-xs'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap break-all rounded p-3 text-[11px] leading-relaxed"
           style={{ background: 'var(--panel-2)' }}>
        {body}
      </pre>

      {rawBody && secret && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="btn-ghost text-xs"
            onClick={() => setGrepped(grepForPlaintext(rawBody, secret))}
          >
            grep the wire for my amount ({secret})
          </button>
          {grepped !== null &&
            (grepped ? (
              <span className="bad text-sm">found — something is wrong</span>
            ) : (
              <span className="ok text-sm">not found ✓ — your amount never left in the clear</span>
            ))}
        </div>
      )}
    </Card>
  );
}
