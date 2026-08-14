'use client';

import { useState } from 'react';

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
