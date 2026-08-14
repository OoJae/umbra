'use client';

import { useEffect, useState } from 'react';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain } from 'wagmi';

import { coston2 } from '@/lib/contracts';

export function ConnectBar() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== coston2.id;

  /**
   * The wallet config uses the injected connector only — no WalletConnect QR path — so on mobile or
   * in a browser without an extension the Connect button opens a dead end. Say so instead, and point
   * at what still works: every verification surface here is read-only.
   *
   * Checked after mount rather than during render, because window.ethereum does not exist during
   * SSR and reading it in the render path would hydrate inconsistently.
   */
  const [noWallet, setNoWallet] = useState(false);
  useEffect(() => {
    setNoWallet(typeof window !== 'undefined' && !(window as { ethereum?: unknown }).ethereum);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConnectButton showBalance={false} chainStatus="icon" />
      {wrongChain && (
        <button className="btn text-sm" onClick={() => switchChain({ chainId: coston2.id })}>
          Switch to Coston2
        </button>
      )}
      {noWallet && !isConnected && (
        <p className="muted text-xs">
          No injected wallet detected — trading needs a desktop browser with MetaMask on Coston2. The
          Verify page, Dark Book and settled batches are read-only and work as-is.
        </p>
      )}
    </div>
  );
}
