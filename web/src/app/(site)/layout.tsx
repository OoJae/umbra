import Link from 'next/link';

import { Wordmark } from '@/components/brand/Mark';
import { SmoothScroll } from '@/components/motion/SmoothScroll';

/**
 * Marketing chrome. Full-bleed, and deliberately without Providers — no wallet
 * code ships to a page that has no wallet in it.
 */

const NAV = [
  { href: '/record', label: 'The record' },
  { href: '/mechanism', label: 'Mechanism' },
  { href: '/proof', label: 'Proof' },
];

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SmoothScroll>
      {/* A scrim rather than a glass bar: backdrop-blur smeared the display type
          scrolling underneath into an unreadable band. Content fades into the
          void instead, which is also more on-subject. */}
      <header
        className="fixed inset-x-0 top-0 z-50"
        style={{
          background:
            'linear-gradient(to bottom, var(--void) 0%, var(--void) 62%, rgba(6,7,11,0) 100%)',
        }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-8 px-6 pb-10 pt-5 sm:px-10">
          <Link href="/" aria-label="Umbra home" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="ml-auto hidden items-center gap-7 sm:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="label link-u">
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/app"
            className="btn shrink-0"
            style={{ fontSize: '0.8125rem', padding: '0.45rem 0.9rem' }}
          >
            Open the app
          </Link>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer style={{ borderTop: '1px solid var(--line)' }}>
        <div className="mx-auto max-w-[1400px] px-6 py-14 sm:px-10">
          <div className="flex flex-wrap items-start justify-between gap-10">
            <div className="max-w-sm">
              <Wordmark />
              <p className="muted mt-4 text-sm">
                An umbra is the darkest part of a shadow — the region where the light source is
                completely blocked. It is what a sealed order looks like from outside.
              </p>
            </div>

            <div className="flex gap-14">
              <div>
                <p className="label mb-3">Site</p>
                <ul className="space-y-2 text-sm">
                  {NAV.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="link-u">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link href="/app" className="link-u">
                      Open the app
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="label mb-3">Source</p>
                <ul className="space-y-2 text-sm">
                  <li>
                    <a
                      href="https://github.com/OoJae/umbra"
                      className="link-u"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://coston2-explorer.flare.network/address/0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10"
                      className="link-u"
                      target="_blank"
                      rel="noreferrer"
                    >
                      UmbraVault
                    </a>
                  </li>
                  <li>
                    <Link href="/how" className="link-u">
                      Trust model
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <p className="muted mono mt-14 text-xs">
            Coston2 testnet only · chain 114 · no real funds · MIT licensed
          </p>
        </div>
      </footer>
    </SmoothScroll>
  );
}
