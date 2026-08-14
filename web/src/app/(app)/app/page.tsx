'use client';

import { useState } from 'react';
import Link from 'next/link';

import { ConnectBar } from '@/components/ConnectBar';
import { BalancesPanel, DepositCard, WithdrawCard } from '@/components/trade/CustodyCards';
import { DarkBook } from '@/components/trade/DarkBook';
import { ObserverToggle } from '@/components/trade/ObserverToggle';
import { OrderForm } from '@/components/trade/OrderForm';
import type { SubmitResult } from '@/hooks/useSubmitOrder';

export default function TradePage() {
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [secret, setSecret] = useState<string>('');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trade</h1>
          <p className="muted text-sm">
            Escrow, then submit an order nobody but the enclave can read.
          </p>
        </div>
        <ConnectBar />
      </div>

      {/*
        A reviewer arriving with an empty wallet would otherwise connect, see zeros
        everywhere and have no idea where tokens come from — the faucet was not
        linked anywhere in this app. Says plainly what needs no wallet at all, so
        nobody concludes the demo is unusable without one.
      */}
      <div className="panel p-4 text-sm">
        <p className="mb-2">
          <strong>Reviewing this?</strong> Most of what makes Umbra checkable needs no wallet:{' '}
          <Link href="/verify" className="accent">
            the attestation and its on-chain match
          </Link>
          , the Dark Book below, and{' '}
          <Link href="/settlement" className="accent">
            triggering a batch
          </Link>{' '}
          — that button is deliberately public.
        </p>
        <p className="muted">
          To place an order you need Coston2 (chain 114) and testnet tokens:{' '}
          <a
            href="https://faucet.flare.network/coston2"
            target="_blank"
            rel="noreferrer"
            className="accent"
          >
            the Flare faucet
          </a>{' '}
          dispenses C2FLR, FXRP and USDT0 per address per 24 hours. Buying and selling are different
          wallets — the enclave refuses to cross an order with itself.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <OrderForm
            onSubmitted={(r) => {
              setSubmitted(r);
              const m = /"amount_base":"(\d+)"/.exec(r.rawBody) ?? null;
              try {
                const wire = JSON.parse(r.plaintext) as { amountBase?: string };
                setSecret(String(wire.amountBase ?? m?.[1] ?? ''));
              } catch {
                setSecret(m?.[1] ?? '');
              }
            }}
          />
          <ObserverToggle
            plaintext={submitted?.plaintext}
            rawBody={submitted?.rawBody}
            secret={secret || undefined}
          />
        </div>

        <div className="space-y-5">
          <BalancesPanel />
          <DepositCard />
          <WithdrawCard />
        </div>
      </div>

      <DarkBook />
    </div>
  );
}
