'use client';

import { useDarkBook } from '@/hooks/useEngine';
import { Card, Chip } from '@/components/ui';
import { shortHex } from '@/lib/format';

export function DarkBook() {
  const { data, isError } = useDarkBook();

  return (
    <Card
      title="Dark Book — even we can't read these"
      subtitle="The only bytes the operator holds. Decryption happens inside the enclave."
      right={
        <div className="flex gap-2">
          <Chip>{data?.count_buys ?? 0} buys</Chip>
          <Chip>{data?.count_sells ?? 0} sells</Chip>
        </div>
      }
    >
      {isError && <p className="bad text-sm">engine unreachable</p>}
      {data && data.ciphertext_previews.length === 0 && (
        <p className="muted text-sm">No sealed orders in the book.</p>
      )}
      <ul className="space-y-2">
        {data?.ciphertext_previews.map((p) => (
          <li key={p.order_id} className="rounded p-2" style={{ background: 'var(--panel-2)' }}>
            <div className="mono accent break-all text-xs leading-relaxed">{p.preview_b64}…</div>
            <div className="muted mt-1 flex gap-3 text-[11px]">
              <span>{p.length} bytes</span>
              <span className="mono">sha256 {shortHex(p.sha256, 10, 6)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
