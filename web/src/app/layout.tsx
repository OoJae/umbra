import type { Metadata, Viewport } from 'next';
import { Bodoni_Moda, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';

import './globals.css';

/**
 * Three faces, each with one job.
 *
 * Bodoni is a Didone — extreme thick/thin contrast, light and shadow inside a
 * single glyph. That is the brand idea at the scale of a letter, which is the
 * reason it is here and the reason it never appears below display size.
 */
const display = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--f-display',
  display: 'swap',
});

const sans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--f-sans',
  display: 'swap',
});

/** Every hash, address and price in this product is monospaced. */
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--f-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://umbra-beta.vercel.app'),
  title: {
    default: 'Umbra — Confidential Dark Pool for FXRP',
    template: '%s — Umbra',
  },
  description:
    'Sealed FXRP orders matched inside a TEE at the FTSOv2 fair price and settled on Flare. ' +
    'The operator cannot settle off-market, and the contract proves it before it moves a balance.',
  openGraph: {
    title: 'Umbra — Confidential Dark Pool for FXRP',
    description:
      'Between 2011 and 2018 the SEC fined every major dark pool operator ~$300M for lying about ' +
      'how their venue worked. No customer ever caught it from their own fill data. Umbra makes ' +
      'the two claims worth lying about machine-checkable before the trade.',
    type: 'website',
    siteName: 'Umbra',
  },
  twitter: { card: 'summary_large_image' },
  icons: {
    icon: [{ url: '/mark.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#06070b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="grain">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
