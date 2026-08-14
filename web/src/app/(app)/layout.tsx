import Link from 'next/link';

import { Wordmark } from '@/components/brand/Mark';
import { EngineStatusStrip } from '@/components/EngineStatusStrip';
import { Providers } from '../providers';

/**
 * Product chrome.
 *
 * Providers (wagmi + RainbowKit + react-query) live here rather than in the root
 * layout, so the marketing routes ship none of the web3 bundle.
 */

const NAV = [
  { href: '/app', label: 'Trade' },
  { href: '/settlement', label: 'Settlement' },
  { href: '/verify', label: 'Verify' },
  { href: '/how', label: 'How it works' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <header style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Link href="/" aria-label="Umbra home">
            <Wordmark />
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="muted hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="muted ml-auto text-xs">Coston2 testnet</div>
        </div>
      </header>
      <EngineStatusStrip />
      <main id="main" className="mx-auto max-w-6xl px-5 py-6">
        {children}
      </main>
      <footer className="muted mx-auto max-w-6xl px-5 py-8 text-xs">
        Testnet only. Sealed orders are readable only inside the enclave.
      </footer>
    </Providers>
  );
}
