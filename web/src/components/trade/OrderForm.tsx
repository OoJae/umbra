'use client';

import { useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

import { Card, Chip, Stat } from '@/components/ui';
import { useSubmitOrder, type SubmitResult } from '@/hooks/useSubmitOrder';
import {
  useOnChainAttestation,
  usePreviewBand,
  usePrice,
  useQuoteFor,
  useVaultBalances,
} from '@/hooks/useVault';
import { fmt6, parse6, price6 } from '@/lib/format';

const PHASE_LABEL: Record<string, string> = {
  signing: 'signing in your wallet',
  sealing: 'sealing to the enclave key',
  posting: 'posting ciphertext',
};

export function OrderForm({ onSubmitted }: { onSubmitted: (r: SubmitResult) => void }) {
  const { address, isConnected } = useAccount();
  const { price1e6, oracleTs } = usePrice();
  const { signer: onChainSigner } = useOnChainAttestation();
  const { baseBal, quoteBal } = useVaultBalances(address);

  const [side, setSide] = useState<0 | 1>(0);
  const [amountText, setAmountText] = useState('3');
  const [limitText, setLimitText] = useState('');

  const amountBase = parse6(amountText);
  // Default the limit to a 2% straddle around the mid, mirroring the seeded demo, so the order
  // always crosses even if the oracle drifts between now and the batch.
  const suggested = price1e6
    ? (price1e6 * (side === 0 ? 10200n : 9800n)) / 10000n
    : undefined;
  const limitPrice1e6 = limitText ? parse6(limitText) : (suggested ?? 0n);

  const { data: quoteNeeded } = useQuoteFor(amountBase, limitPrice1e6);
  const band = usePreviewBand(limitPrice1e6);
  const { submit, phase, error, result } = useSubmitOrder();

  // Escrow is reserved at the buyer's LIMIT price, so that is what determines sufficiency.
  const required = side === 0 ? (quoteNeeded as bigint | undefined) : amountBase;
  const available = side === 0 ? quoteBal : baseBal;
  const short = useMemo(
    () => (required !== undefined && available !== undefined ? required - available : 0n),
    [required, available],
  );
  const insufficient = short > 0n;

  const busy = phase === 'signing' || phase === 'sealing' || phase === 'posting';

  return (
    <Card
      title="Submit a sealed order"
      subtitle="Signed in your wallet, sealed in your browser. The operator only ever sees ciphertext."
      right={
        price1e6 ? (
          <Chip tone="ok">
            FTSOv2 {price6(price1e6)} · {oracleTs ? `${Math.max(0, Math.floor(Date.now() / 1000) - Number(oracleTs))}s old` : ''}
          </Chip>
        ) : undefined
      }
    >
      <div className="mb-3 flex gap-2">
        <button className={side === 0 ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setSide(0)}>
          BUY FXRP
        </button>
        <button className={side === 1 ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setSide(1)}>
          SELL FXRP
        </button>
      </div>

      <label className="muted mb-1 block text-xs">Amount (FXRP)</label>
      <input className="input mono mb-3" value={amountText} onChange={(e) => setAmountText(e.target.value)} />

      <label className="muted mb-1 block text-xs">
        Limit price (XRP/USD){' '}
        {suggested && (
          <button className="accent underline" onClick={() => setLimitText(fmt6(suggested))}>
            use mid {side === 0 ? '+2%' : '−2%'}
          </button>
        )}
      </label>
      <input
        className="input mono mb-3"
        placeholder={suggested ? fmt6(suggested) : '—'}
        value={limitText}
        onChange={(e) => setLimitText(e.target.value)}
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat
          label={side === 0 ? 'You will escrow up to' : 'You will sell'}
          value={side === 0 ? `${fmt6(required)} USDT0` : `${fmt6(amountBase)} FXRP`}
          hint={side === 0 ? 'reserved at your limit price' : 'held until the batch clears'}
        />
        <Stat
          label="Inside the FTSOv2 band"
          value={band.ok === undefined ? '—' : band.ok ? 'yes' : 'no'}
          hint={band.deviationBps !== undefined ? `${band.deviationBps} bps from the mid` : undefined}
          tone={band.ok ? 'ok' : 'warn'}
        />
      </div>

      {insufficient && (
        <p className="warn mb-3 text-xs">
          Short {fmt6(short)} {side === 0 ? 'USDT0' : 'FXRP'} — deposit more before submitting, or
          the batch would revert.
        </p>
      )}

      <button
        className="btn w-full"
        disabled={!isConnected || busy || amountBase <= 0n || limitPrice1e6 <= 0n || insufficient}
        onClick={async () => {
          const r = await submit({
            side,
            amountBase,
            limitPrice1e6,
            onChainTeeSigner: onChainSigner,
          });
          onSubmitted(r);
        }}
      >
        {!isConnected ? 'connect a wallet' : busy ? PHASE_LABEL[phase] : 'Sign, seal and submit'}
      </button>

      <ol className="muted mt-3 space-y-1 text-xs">
        {(['signing', 'sealing', 'posting'] as const).map((p, i) => {
          const order = ['signing', 'sealing', 'posting'];
          const done = phase === 'done' || order.indexOf(phase) > i;
          const active = phase === p;
          return (
            <li key={p} className={active ? 'accent' : done ? 'ok' : ''}>
              {done ? '✓' : active ? '●' : '○'} {['sign EIP-712', 'crypto_box_seal', 'POST ciphertext'][i]}
              {p === 'sealing' && result ? ` (${result.sealMs}ms)` : ''}
            </li>
          );
        })}
      </ol>

      {result && (
        <p className="ok mt-2 text-xs">
          accepted · order_id <span className="mono">{result.orderId}</span>
        </p>
      )}
      {error && <p className="bad mt-2 text-xs">{error}</p>}
    </Card>
  );
}
