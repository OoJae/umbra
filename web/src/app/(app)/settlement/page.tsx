'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { ExecutionReceipt } from '@/components/ExecutionReceipt';
import { Card, Chip, Copy, Row, Stat } from '@/components/ui';
import { useDarkBook } from '@/hooks/useEngine';
import { useRunBatch } from '@/hooks/useRunBatch';
import { useBatchIds, usePrice } from '@/hooks/useVault';
import { addressUrl, txUrl, vault } from '@/lib/contracts';
import { deviationBps, fmt6, price6, shortHex } from '@/lib/format';

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return <span className="mono">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span>;
}

export default function SettlementPage() {
  const { run, phase, batch, error, startedAt } = useRunBatch();
  const { lastBatchId, maxDeviationBps } = useBatchIds();
  const { price1e6, oracleTs } = usePrice(3000);
  const book = useDarkBook();

  const running = phase === 'firing' || phase === 'watching';
  const clearing = batch?.clearing_price_1e6 ? BigInt(batch.clearing_price_1e6) : undefined;
  const oracle = batch?.oracle_price_1e6 ? BigInt(batch.oracle_price_1e6) : undefined;
  const bps = clearing && oracle ? deviationBps(clearing, oracle) : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settlement</h1>
        <p className="muted text-sm">
          The enclave matches every crossing order at one uniform FTSOv2 price and submits a single
          signed transaction. The vault re-reads the oracle itself before it moves a balance.
        </p>
      </div>

      <Card
        title="Run a batch"
        subtitle="Decrypts inside the enclave, clears at the mid, settles on Coston2."
        right={
          <div className="flex gap-2">
            <Chip>{book.data?.count_buys ?? 0} buys</Chip>
            <Chip>{book.data?.count_sells ?? 0} sells</Chip>
            <Chip>last batch #{lastBatchId?.toString() ?? '—'}</Chip>
          </div>
        }
      >
        <button className="btn" disabled={running} onClick={() => void run()}>
          {running ? 'batch running…' : 'Trigger batch'}
        </button>

        {running && startedAt && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <span className="accent pulse">●</span>
              <span>enclave matching and settling</span>
              <Elapsed from={startedAt} />
            </div>
            <div className="muted text-xs">
              live FTSOv2 <span className="mono accent">{price6(price1e6)}</span>
              {oracleTs ? ` · ${Math.max(0, Math.floor(Date.now() / 1000) - Number(oracleTs))}s old` : ''}
            </div>
            <div className="mono muted overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
              sealed bytes in flight · {book.data?.ciphertext_previews[0]?.preview_b64 ?? '…'}
            </div>
          </div>
        )}

        {error && <p className="bad mt-3 text-sm">{error}</p>}
        {/*
          A reviewer arriving after someone else has already drained the book would
          otherwise hit a dead end here — a settled batch discards every order it
          drained, so the book empties for everyone behind the first person to press
          this. Point them at the settlements that actually happened instead; those
          are on-chain and permanent.
        */}
        {phase === 'empty' && (
          <div className="mt-3 space-y-2 text-sm">
            <p className="warn">
              Nothing crossed —{' '}
              {batch?.status === 'no_orders' ? 'the book is empty' : 'no orders crossed at the mid'}.
            </p>
            <p className="muted">
              Orders are discarded once a batch settles, so the book empties behind whoever triggers
              it first. The settlements themselves are permanent —{' '}
              <a
                className="accent"
                href={addressUrl(vault.address)}
                target="_blank"
                rel="noreferrer"
              >
                every batch this vault has ever settled is on the explorer
              </a>
              {lastBatchId !== undefined ? ` (${lastBatchId.toString()} so far)` : ''}, and{' '}
              <Link className="accent" href="/verify">
                the attestation behind them is still live
              </Link>
              . To watch one happen, submit an order on the{' '}
              <Link className="accent" href="/app">
                Trade
              </Link>{' '}
              page and press this again.
            </p>
          </div>
        )}
        {/* Belt and braces: the chain is the source of truth for whether a batch
            settled, so never render an empty screen just because the engine's own
            record of it was slow to arrive. */}
        {phase === 'settled' && !batch && (
          <p className="ok mt-3 text-sm">
            Settled on-chain — the vault accepted the batch. Fetching the enclave&apos;s record of
            it…
          </p>
        )}
      </Card>

      {batch && batch.status === 'settled' && (
        <>
          <Card
            title={`Batch #${batch.batch_id} settled`}
            right={
              batch.tx_hash ? (
                <a className="btn text-xs" href={batch.explorer_url ?? txUrl(batch.tx_hash)} target="_blank" rel="noreferrer">
                  view on explorer →
                </a>
              ) : undefined
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Cleared at" value={price6(clearing)} tone="ok" />
              <Stat label="Oracle read on-chain" value={price6(oracle)} />
              <Stat
                label="Deviation"
                value={bps !== undefined ? `${bps} bps` : '—'}
                hint={maxDeviationBps ? `band is ${maxDeviationBps} bps` : undefined}
                tone="ok"
              />
              <Stat label="Fills" value={batch.fill_count} />
            </div>
            <Row k="tx" v={batch.tx_hash ? shortHex(batch.tx_hash, 12, 8) : '—'} />
            <Row k="block" v={batch.block_number ?? '—'} />
            <Row k="gas used" v={batch.gas_used?.toLocaleString() ?? '—'} />
            <Row k="TEE signer" v={shortHex(batch.tee_signer, 10, 6)} />
            <Row
              k="batch digest"
              v={<span className="flex items-center gap-2 justify-end">{shortHex(batch.batch_digest, 12, 8)}{batch.batch_digest && <Copy text={batch.batch_digest} />}</span>}
            />
          </Card>

          <ExecutionReceipt fills={batch.fills} oraclePrice1e6={oracle} batchId={batch.batch_id} />

          <Card title="Fills" subtitle="Public on-chain the moment the transaction confirmed.">
            <table className="w-full text-sm">
              <thead className="muted text-left text-xs">
                <tr>
                  <th className="pb-2">Buyer</th><th className="pb-2">Seller</th>
                  <th className="pb-2 text-right">FXRP</th><th className="pb-2 text-right">USDT0</th>
                </tr>
              </thead>
              <tbody className="mono">
                {batch.fills?.map((f, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: 'var(--line)' }}>
                    <td className="py-2">{shortHex(f.buyer)}</td>
                    <td className="py-2">{shortHex(f.seller)}</td>
                    <td className="py-2 text-right ok">{fmt6(f.amount_base)}</td>
                    <td className="py-2 text-right">{fmt6(f.amount_quote)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
