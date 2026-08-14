import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Umbra — a confidential dark pool where the operator cannot settle off-market';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The share card is the mark at totality plus the one sentence that does the
 * work. Generated rather than shipped as a binary so it can never drift out of
 * sync with the brand tokens.
 */
export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#06070b',
          color: '#f2eee8',
          padding: '72px',
          fontFamily: 'Georgia, serif',
          position: 'relative',
        }}
      >
        {/* corona */}
        <div
          style={{
            position: 'absolute',
            top: 130,
            right: 96,
            width: 380,
            height: 380,
            borderRadius: 999,
            background: 'radial-gradient(circle, rgba(242,238,232,0.16) 38%, rgba(232,68,42,0.10) 46%, rgba(6,7,11,0) 68%)',
            display: 'flex',
          }}
        />
        {/* the occulting body */}
        <div
          style={{
            position: 'absolute',
            top: 175,
            right: 141,
            width: 290,
            height: 290,
            borderRadius: 999,
            background: '#06070b',
            border: '2px solid rgba(232,68,42,0.55)',
            display: 'flex',
          }}
        />

        <div
          style={{
            display: 'flex',
            fontSize: 22,
            letterSpacing: 6,
            fontFamily: 'monospace',
            color: '#7b8290',
          }}
        >
          UMBRA
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
          <div style={{ display: 'flex', fontSize: 78, lineHeight: 1.0, letterSpacing: -2 }}>
            Nobody ever caught them.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 27,
              lineHeight: 1.4,
              color: '#7b8290',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            $300M of dark pool fines, and no customer ever detected it from their own fill data.
            Umbra makes the two claims worth lying about checkable before the trade.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
