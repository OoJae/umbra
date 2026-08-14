'use client';

import { useAccount } from 'wagmi';

import { Card, Row, Stat } from '@/components/ui';
import { deviationBps, fmt6, price6, UNIT } from '@/lib/format';

type Fill = { buyer: string; seller: string; amount_base: number | string; amount_quote: number | string };

/**
 * What the connected wallet actually got out of a batch.
 *
 * Every number here is either the trader's own on-chain fill or a public value from the same
 * settlement — nothing is modelled and nothing is estimated. We deliberately do not show a
 * "you would have paid X on an AMM" comparison: there is no real pool to measure against, and
 * a favourable benchmark we invented ourselves is the exact conduct dark pool operators have been
 * fined for. The honest claim is narrower and checkable: this is the price, and here is how far it
 * sat from the oracle the vault itself read.
 */
export function ExecutionReceipt({
  fills,
  oraclePrice1e6,
  batchId,
}: {
  fills: Fill[] | null | undefined;
  oraclePrice1e6: bigint | undefined;
  batchId: number | null | undefined;
}) {
  const { address } = useAccount();
  if (!address || !fills?.length) return null;

  const me = address.toLowerCase();
  const mine = fills.filter((f) => f.buyer.toLowerCase() === me || f.seller.toLowerCase() === me);
  if (!mine.length) return null;

  const bought = mine.some((f) => f.buyer.toLowerCase() === me);
  const base = mine.reduce((acc, f) => acc + BigInt(f.amount_base), 0n);
  const quote = mine.reduce((acc, f) => acc + BigInt(f.amount_quote), 0n);
  if (base === 0n) return null;

  // Both tokens are 6-decimal, so the effective price is quote/base scaled back into 1e6.
  const effective = (quote * UNIT) / base;
  const bps = oraclePrice1e6 ? deviationBps(effective, oraclePrice1e6) : undefined;
  const counterparties = new Set(mine.map((f) => (bought ? f.seller : f.buyer))).size;

  return (
    <Card
      title="Your execution"
      subtitle={`You ${bought ? 'bought' : 'sold'} FXRP in batch #${batchId ?? '—'}${
        counterparties > 1 ? ` against ${counterparties} counterparties` : ''
      }.`}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={bought ? 'FXRP received' : 'FXRP sold'} value={fmt6(base)} />
        <Stat label={bought ? 'USDT0 paid' : 'USDT0 received'} value={fmt6(quote)} />
        <Stat label="Your effective price" value={price6(effective)} />
      </div>
      <div className="mt-3">
        <Row k="oracle price the vault read" v={price6(oraclePrice1e6)} />
        <Row
          k="your price vs that oracle"
          v={bps !== undefined ? `${bps} bps` : '—'}
        />
        <Row k="fills you were part of" v={mine.length} />
      </div>
      <p className="muted mt-3 text-xs">
        Everyone in this batch cleared at the same uniform price — there is no better tier you were
        not shown. The vault verified that price against FTSOv2 itself before it moved a single
        balance, so this receipt is not us telling you that you got a fair fill; it is the condition
        the settlement had to satisfy in order to exist at all.
      </p>
    </Card>
  );
}
