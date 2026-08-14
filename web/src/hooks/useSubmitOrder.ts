'use client';

import { useState } from 'react';
import { getAddress } from 'viem';
import { useAccount, useSignTypedData } from 'wagmi';

import { api, errorCopy } from '@/lib/api';
import { sealToEnclave } from '@/lib/crypto';
import { ORDER_TYPES } from '@/lib/eip712';

export type SubmitPhase = 'idle' | 'signing' | 'sealing' | 'posting' | 'done' | 'error';

export type SubmitResult = {
  orderId: string;
  /** The struct the wallet signed — shown in the observer panel, never sent in the clear. */
  plaintext: string;
  /** The literal bytes POSTed. This exact string is what the observer panel renders. */
  rawBody: string;
  sealMs: number;
};

export function useSubmitOrder() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  async function submit(params: {
    side: 0 | 1;
    amountBase: bigint;
    limitPrice1e6: bigint;
    /** The signer currently registered on-chain, so we can refuse to sign into a void. */
    onChainTeeSigner?: string;
  }) {
    setError(null);
    setResult(null);
    try {
      if (!address) throw new Error('connect a wallet first');

      // Fetched fresh on EVERY submit: the enclave mints a new X25519 key on every boot, so a
      // cached pubkey is a guaranteed bad_ciphertext.
      setPhase('signing');
      const info = await api.info();
      if (!info.eip712_domain) throw new Error('engine did not return an EIP-712 domain');

      // If the live enclave is not the registered signer, this order could never settle.
      if (
        params.onChainTeeSigner &&
        getAddress(info.tee_eth_address) !== getAddress(params.onChainTeeSigner)
      ) {
        throw new Error(
          'the enclave restarted and its key is not the registered signer — orders cannot settle until it is re-anchored',
        );
      }

      const domain = {
        name: info.eip712_domain.name,
        version: info.eip712_domain.version,
        chainId: info.eip712_domain.chainId,
        verifyingContract: getAddress(info.eip712_domain.verifyingContract),
      } as const;

      const message = {
        trader: getAddress(address),
        side: params.side,
        amountBase: params.amountBase,
        limitPrice1e6: params.limitPrice1e6,
        nonce: BigInt(Date.now()),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };

      const signature = await signTypedDataAsync({
        domain,
        types: ORDER_TYPES as unknown as Record<string, { name: string; type: string }[]>,
        primaryType: 'Order',
        message,
      });

      // snake_case wire, exactly 7 keys — the engine's model forbids extras. uint256s as strings
      // because JSON.stringify throws on bigint and Number loses precision above 2^53.
      const wire = {
        trader: message.trader,
        side: message.side,
        amount_base: message.amountBase.toString(),
        limit_price_1e6: message.limitPrice1e6.toString(),
        nonce: message.nonce.toString(),
        deadline: message.deadline.toString(),
        signature,
      };
      if (Object.keys(wire).length !== 7) throw new Error('wire payload key count drifted');

      setPhase('sealing');
      const startedAt = performance.now();
      const ciphertext_b64 = await sealToEnclave(
        info.order_encryption_pubkey_b64,
        JSON.stringify(wire),
      );
      const sealMs = Math.round(performance.now() - startedAt);
      const rawBody = JSON.stringify({ ciphertext_b64 });

      setPhase('posting');
      const { order_id } = await api.submitOrder(rawBody);

      setPhase('done');
      const submitted: SubmitResult = {
        orderId: order_id,
        plaintext: JSON.stringify(
          { ...message, side: message.side, nonce: message.nonce.toString() },
          (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
          2,
        ),
        rawBody,
        sealMs,
      };
      setResult(submitted);
      return submitted;
    } catch (err) {
      setPhase('error');
      setError(errorCopy(err));
      throw err;
    }
  }

  return { submit, phase, error, result, reset: () => { setPhase('idle'); setError(null); setResult(null); } };
}
