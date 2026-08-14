'use client';

import { useState } from 'react';
import { erc20Abi } from 'viem';
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { Card, Stat } from '@/components/ui';
import { useInfo } from '@/hooks/useEngine';
import { useVaultBalances, useVaultTokens, useWalletTokens } from '@/hooks/useVault';
import { vault } from '@/lib/contracts';
import { fmt6, parse6 } from '@/lib/format';

export function BalancesPanel() {
  const { address } = useAccount();
  const { baseBal: vBase, quoteBal: vQuote } = useVaultBalances(address);
  const { baseBal: wBase, quoteBal: wQuote } = useWalletTokens();

  return (
    <Card title="Balances" subtitle="Wallet holdings versus what is escrowed in the vault.">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Wallet FXRP" value={fmt6(wBase)} />
        <Stat label="Wallet USDT0" value={fmt6(wQuote)} />
        <Stat label="Vault FXRP" value={fmt6(vBase)} tone="ok" />
        <Stat label="Vault USDT0" value={fmt6(vQuote)} tone="ok" />
      </div>
    </Card>
  );
}

export function DepositCard({ prefill }: { prefill?: { token: 'base' | 'quote'; amount: bigint } }) {
  const info = useInfo();
  const { address } = useAccount();
  const tokens = useWalletTokens();
  const [which, setWhich] = useState<'base' | 'quote'>(prefill?.token ?? 'quote');
  const [amount, setAmount] = useState(prefill ? fmt6(prefill.amount) : '');
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [err, setErr] = useState<string | null>(null);

  const tokenAddress = which === 'base' ? info.data?.base_token : info.data?.quote_token;
  const allowance = which === 'base' ? tokens.baseAllowance : tokens.quoteAllowance;
  const value = parse6(amount);
  const needsApproval = allowance !== undefined && value > allowance;

  async function run() {
    setErr(null);
    if (!tokenAddress || !address || value <= 0n) return;
    try {
      if (needsApproval) {
        const h = await writeContractAsync({
          address: tokenAddress, abi: erc20Abi, functionName: 'approve',
          args: [vault.address, value],
        });
        setHash(h);
        return; // approve first; the user clicks again to deposit
      }
      const h = await writeContractAsync({
        ...vault, functionName: 'deposit', args: [tokenAddress, value],
      });
      setHash(h);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0] : String(e));
    }
  }

  return (
    <Card title="Deposit" subtitle="Escrow into the vault before submitting an order.">
      <div className="mb-3 flex gap-2">
        <button className={which === 'quote' ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setWhich('quote')}>USDT0 (buy side)</button>
        <button className={which === 'base' ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setWhich('base')}>FXRP (sell side)</button>
      </div>
      <input className="input mono mb-3" placeholder="0.000000" value={amount}
             onChange={(e) => setAmount(e.target.value)} />
      <button className="btn w-full" disabled={isPending || value <= 0n} onClick={run}>
        {isPending ? 'confirm in wallet…' : needsApproval ? `Approve ${which === 'base' ? 'FXRP' : 'USDT0'}` : 'Deposit'}
      </button>
      {receipt.isSuccess && <p className="ok mt-2 text-xs">confirmed</p>}
      {err && <p className="bad mt-2 break-all text-xs">{err}</p>}
    </Card>
  );
}

export function WithdrawCard() {
  // Deliberately does not call useInfo(): nothing on this card may depend on the engine.
  const { address } = useAccount();
  const { baseBal, quoteBal } = useVaultBalances(address);
  const [which, setWhich] = useState<'base' | 'quote'>('base');
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  // From the vault, never from the engine: a dead enclave must not be able to disable this button.
  const tokens = useVaultTokens();
  const tokenAddress = which === 'base' ? tokens.base : tokens.quote;
  const balance = which === 'base' ? baseBal : quoteBal;

  return (
    <Card
      title="Withdraw"
      subtitle="Never gated by the TEE, the operator, or a pause. Your balance is always yours."
    >
      <div className="mb-3 flex gap-2">
        <button className={which === 'base' ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setWhich('base')}>FXRP</button>
        <button className={which === 'quote' ? 'btn text-xs' : 'btn-ghost text-xs'} onClick={() => setWhich('quote')}>USDT0</button>
      </div>
      <p className="muted mb-3 text-xs">available <span className="mono">{fmt6(balance)}</span></p>
      <button
        className="btn w-full"
        disabled={isPending || !tokenAddress || !balance || balance === 0n}
        onClick={async () => {
          if (!tokenAddress) return;
          const h = await writeContractAsync({ ...vault, functionName: 'withdrawAll', args: [tokenAddress] });
          setHash(h);
        }}
      >
        {isPending ? 'confirm in wallet…' : 'Withdraw all'}
      </button>
      {receipt.isSuccess && <p className="ok mt-2 text-xs">withdrawn</p>}
    </Card>
  );
}
