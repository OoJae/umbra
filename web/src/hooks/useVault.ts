'use client';

import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { erc20Abi, type Address } from 'viem';

import { registry, vault } from '@/lib/contracts';

/** Live FTSOv2 XRP/USD, read through the vault's own normalization path. */
export function usePrice(pollMs = 5000) {
  const q = useReadContract({
    ...vault,
    functionName: 'peekPrice1e6',
    query: { refetchInterval: pollMs },
  });
  const [price1e6, oracleTs] = (q.data as readonly [bigint, bigint] | undefined) ?? [];
  return { ...q, price1e6, oracleTs };
}

/**
 * The exact settlement amount, evaluated by deployed bytecode rather than reimplemented here.
 * The engine reserves escrow at the buyer's LIMIT price, so quoting at the limit is what tells a
 * buyer how much they actually need deposited.
 */
export function useQuoteFor(amountBase: bigint, price1e6: bigint | undefined) {
  return useReadContract({
    ...vault,
    functionName: 'quoteFor',
    args: [amountBase, price1e6 ?? 0n],
    query: { enabled: amountBase > 0n && !!price1e6 },
  });
}

export function usePreviewBand(price1e6: bigint | undefined) {
  const q = useReadContract({
    ...vault,
    functionName: 'previewBand',
    args: [price1e6 ?? 0n],
    query: { enabled: !!price1e6, refetchInterval: 8000 },
  });
  const [ok, oracle1e6, deviationBps] =
    (q.data as readonly [boolean, bigint, bigint] | undefined) ?? [];
  return { ...q, ok, oracle1e6, deviationBps };
}

export function useVaultBalances(who?: Address) {
  const q = useReadContract({
    ...vault,
    functionName: 'balancesOf',
    args: [who ?? '0x0000000000000000000000000000000000000000'],
    query: { enabled: !!who, refetchInterval: 6000 },
  });
  const [baseBal, quoteBal] = (q.data as readonly [bigint, bigint] | undefined) ?? [];
  return { ...q, baseBal, quoteBal };
}

/**
 * The pair, read from the vault itself rather than from the engine's /info.
 *
 * This matters for more than tidiness. Custody is the one thing this project promises is never
 * gated on the enclave, and the withdraw path needs a token address to call withdrawAll. Sourcing
 * that address from /info meant a dead engine disabled the Withdraw button — gating custody on
 * exactly the component the trust model says it does not depend on. The vault is the authority on
 * its own pair, so ask it.
 */
export function useVaultTokens() {
  const q = useReadContracts({
    contracts: [
      { ...vault, functionName: 'baseToken' },
      { ...vault, functionName: 'quoteToken' },
    ],
    query: { staleTime: Infinity },
  });
  const [base, quote] = (q.data ?? []).map((r) =>
    r?.status === 'success' ? (r.result as Address) : undefined,
  );
  return { ...q, base, quote };
}

/** Wallet (not vault) token balances plus allowances, for the deposit card. */
export function useWalletTokens() {
  const { address } = useAccount();
  const tokens = useVaultTokens();
  const base = tokens.base;
  const quote = tokens.quote;

  const q = useReadContracts({
    contracts: [
      { address: base, abi: erc20Abi, functionName: 'balanceOf', args: [address!] },
      { address: quote, abi: erc20Abi, functionName: 'balanceOf', args: [address!] },
      { address: base, abi: erc20Abi, functionName: 'allowance', args: [address!, vault.address] },
      { address: quote, abi: erc20Abi, functionName: 'allowance', args: [address!, vault.address] },
    ],
    query: { enabled: !!address && !!base && !!quote, refetchInterval: 6000 },
  });

  const [baseBal, quoteBal, baseAllowance, quoteAllowance] = (q.data ?? []).map((r) =>
    r?.status === 'success' ? (r.result as bigint) : undefined,
  );
  return { ...q, base, quote, baseBal, quoteBal, baseAllowance, quoteAllowance };
}

export function useBatchIds(pollMs = 5000) {
  const q = useReadContracts({
    contracts: [
      { ...vault, functionName: 'lastBatchId' },
      { ...vault, functionName: 'nextBatchId' },
      { ...vault, functionName: 'maxDeviationBps' },
    ],
    query: { refetchInterval: pollMs },
  });
  const [last, next, maxBps] = (q.data ?? []).map((r) =>
    r?.status === 'success' ? (r.result as bigint) : undefined,
  );
  return { ...q, lastBatchId: last, nextBatchId: next, maxDeviationBps: maxBps };
}

/** The on-chain attestation anchor, read directly rather than trusting the engine's self-report. */
export function useOnChainAttestation() {
  const q = useReadContract({ ...registry, functionName: 'attestation', query: { staleTime: 30_000 } });
  const [signer, hash, uri, at, count] =
    (q.data as readonly [Address, `0x${string}`, string, bigint, bigint] | undefined) ?? [];
  return { ...q, signer, hash, uri, registeredAt: at, registrationCount: count };
}
