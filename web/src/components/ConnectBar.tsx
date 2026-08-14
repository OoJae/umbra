'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useSwitchChain } from 'wagmi';

import { coston2 } from '@/lib/contracts';

export function ConnectBar() {
  const { isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== coston2.id;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConnectButton showBalance={false} chainStatus="icon" />
      {wrongChain && (
        <button className="btn text-sm" onClick={() => switchChain({ chainId: coston2.id })}>
          Switch to Coston2
        </button>
      )}
    </div>
  );
}
