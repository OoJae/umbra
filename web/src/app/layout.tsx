import type { Metadata } from 'next';
import Link from 'next/link';

import { EngineStatusStrip } from '@/components/EngineStatusStrip';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Umbra — Confidential Dark Pool for FXRP',
  description:
    'Sealed FXRP orders matched inside a TEE at the FTSOv2 fair price and settled on Flare.',
};

const NAV = [
  { href: '/', label: 'Trade' },
  { href: '/settlement', label: 'Settlement' },
  { href: '/verify', label: 'Verify' },
  { href: '/how', label: 'How it works' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
              <Link href="/" className="text-lg font-semibold tracking-tight">
                UMBRA
              </Link>
              <nav className="flex gap-4 text-sm">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href} className="muted hover:text-white">
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto text-xs muted">Coston2 testnet</div>
            </div>
          </header>
          <EngineStatusStrip />
          <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-5 py-8 text-xs muted">
            Testnet only. Sealed orders are readable only inside the enclave.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
