'use client';

import Link from 'next/link';

import { Mark } from '@/components/brand/Mark';
import { Reveal, RevealLines } from '@/components/motion/Reveal';
import { fmtPrice, useLive } from '@/components/site/useLive';

/* The three states are the order lifecycle, which is why they are numbered.
   They are also, exactly, the three regions of a shadow. */
const STATES = [
  {
    n: '01',
    name: 'Umbra',
    gloss: 'total shadow — no light reaches the observer',
    title: 'Sealed',
    body:
      'Your browser signs an EIP-712 order, then encrypts it to an X25519 key that only exists ' +
      'inside the enclave. Only ciphertext leaves the machine. The operator, the mempool and every ' +
      'other trader see an opaque blob.',
    phase: 1,
  },
  {
    n: '02',
    name: 'Penumbra',
    gloss: 'partial shadow — the source is only partly blocked',
    title: 'Resting',
    body:
      'While an order waits, the Dark Book shows that it exists — a count, a byte length, an ' +
      'arrival time. Never a side, an amount or a price. We publish the shape of the leak rather ' +
      'than claiming there is not one.',
    phase: 0.55,
  },
  {
    n: '03',
    name: 'Antumbra',
    gloss: 'beyond the shadow — the light returns as a ring',
    title: 'Settled',
    body:
      'At batch time the enclave decrypts, verifies every signature, reads the FTSOv2 mid and ' +
      'clears all crossing orders at that one uniform price. Then it settles on-chain, in public, ' +
      'in a single transaction.',
    phase: 0.12,
  },
];

const RECORD = [
  { who: 'Credit Suisse', year: '2016', fine: '$84.3M', what: 'largest ATS penalty ever levied' },
  { who: 'Barclays LX', year: '2016', fine: '$70M', what: 'deleted its most predatory trader from the charts it showed clients' },
  { who: 'Merrill Lynch', year: '2018', fine: '$42M + $42M', what: 'fabricated the execution venue on 15M+ child orders' },
  { who: 'ITG / POSIT', year: '2015', fine: '$20.3M', what: 'ran a secret prop desk against its own subscribers' },
];

export default function Landing() {
  const live = useLive();

  return (
    <>
      {/* ───────────────────────── hero ───────────────────────── */}
      <section className="relative flex min-h-svh items-end px-6 pb-16 pt-32 sm:px-10">
        <div className="mx-auto w-full max-w-[1400px]">
          <Reveal>
            <p className="label reveal-fade mb-8">
              Confidential dark pool for FXRP · Flare Coston2
            </p>

            <h1 className="display max-w-[15ch]">
              <RevealLines
                lines={[
                  <>Nobody</>,
                  <>
                    <em>ever</em> caught
                  </>,
                  <>them.</>,
                ]}
              />
            </h1>

            <div className="mt-12 grid gap-10 md:grid-cols-[1.1fr_1fr] md:items-end">
              <p className="lede reveal-fade max-w-[52ch]" style={{ ['--d' as string]: '380ms' }}>
                Between 2011 and 2018 the SEC fined essentially every major US dark pool operator —
                about <strong style={{ color: 'var(--chroma)' }}>$300 million</strong> — for
                misrepresenting how their own venue worked. Every case took two to six years and
                subpoena power to surface. <strong>No customer ever detected any of it from their
                own fill data.</strong>
              </p>

              <div
                className="reveal-fade justify-self-start md:justify-self-end"
                style={{ ['--d' as string]: '520ms' }}
              >
                <Link href="/record" className="btn-ghost inline-block">
                  Read the record →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────── live instrument strip ───────────────────── */}
      <Reveal>
        {/* Deliberately not sticky: it collided with the fixed header, and a
            permanent readout competes with the one thing on this page that is
            allowed to be loud. It is a reading taken once, where you meet it. */}
        <div
          className="reveal-fade"
          style={{
            borderTop: '1px solid var(--line)',
            borderBottom: '1px solid var(--line)',
            background: 'rgba(6,7,11,0.55)',
          }}
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2 px-6 py-3 sm:px-10">
            <Reading label="FTSOv2 XRP/USD" value={fmtPrice(live.price1e6)} live />
            <Reading label="Band" value="±50 bps" />
            <Reading label="Last batch" value={live.lastBatchId?.toString() ?? '—'} />
            <Reading
              label="Resting"
              value={
                live.buys === null ? '—' : `${live.buys} buy · ${live.sells} sell`
              }
            />
            <Reading
              label="Enclave"
              value={
                live.enclave === 'real'
                  ? 'Intel TDX'
                  : live.enclave === 'simulated'
                    ? 'simulated'
                    : live.enclave === 'down'
                      ? 'unreachable'
                      : '—'
              }
              tone={live.enclave === 'real' ? 'ok' : live.enclave === 'down' ? 'bad' : undefined}
            />
          </div>
        </div>
      </Reveal>

      {/* ───────────────────────── the turn ───────────────────────── */}
      <section className="px-6 py-28 sm:px-10 sm:py-40">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-14" />
            <div className="grid gap-14 md:grid-cols-[0.9fr_1.1fr]">
              <h2 className="display-sm reveal-fade max-w-[16ch]">
                A dark pool is a promise. <em>Umbra</em> is a check.
              </h2>

              <div className="space-y-10">
                <p className="reveal-fade" style={{ ['--d' as string]: '120ms' }}>
                  The charges were, in substance, <em>“you did not operate the way you said you
                  did.”</em> The entire regulatory apparatus for dark pools is retrospective
                  punishment for claims that were never verifiable in the first place. Europe hit
                  the same wall and repealed its execution-quality reporting rules in 2024, having
                  found the reports were “hardly read.”
                </p>

                <div className="space-y-6">
                  <Claim
                    delay={200}
                    quote="We cleared you at the fair mid."
                    answer={
                      <>
                        <code className="mono accent">UmbraVault.settleBatch</code> re-reads FTSOv2
                        itself and reverts past 50 bps. That conduct doesn’t get punished here — it
                        fails to settle. The guarantee holds even if the entire engine is replaced
                        with malicious code.
                      </>
                    }
                  />
                  <Claim
                    delay={280}
                    quote="Only the code we described saw your order."
                    answer={
                      <>
                        The image digest is asserted by the Confidential Space launcher, not by us,
                        and it sits inside a Google-signed token whose hash is anchored on-chain. A
                        hidden prop desk would need a different image, and the image is named in a
                        document we do not author.
                      </>
                    }
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── the record, in brief ───────────────── */}
      <section className="px-6 pb-28 sm:px-10 sm:pb-40">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-14" />
            <p className="label reveal-fade mb-10">Four of the eight</p>
            <ul>
              {RECORD.map((r, i) => (
                <li
                  key={r.who}
                  className="reveal-fade grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-6 sm:grid-cols-[minmax(0,14rem)_1fr_auto]"
                  style={{
                    borderTop: '1px solid var(--line)',
                    ['--d' as string]: `${i * 70}ms`,
                  }}
                >
                  <span className="display-sm" style={{ fontSize: 'clamp(1.5rem,2.4vw,2.25rem)' }}>
                    {r.who}
                  </span>
                  <span className="muted col-span-2 text-sm sm:col-span-1 sm:text-base">
                    {r.what}
                  </span>
                  <span className="mono accent whitespace-nowrap text-sm">
                    {r.fine}{' '}
                    <span className="muted">{r.year}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="reveal-fade mt-10" style={{ ['--d' as string]: '300ms' }}>
              <Link href="/record" className="link-u">
                All eight, with what each one actually did →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── the three states ───────────────── */}
      <section className="px-6 py-28 sm:px-10 sm:py-40">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-14" />
            <h2 className="display-sm reveal-fade mb-4 max-w-[20ch]">
              An <em>umbra</em> is the part of a shadow the light never reaches.
            </h2>
            <p
              className="muted reveal-fade mb-20 max-w-[58ch]"
              style={{ ['--d' as string]: '120ms' }}
            >
              A shadow has three regions, and so does an order here. The name is not decoration —
              it is the information model.
            </p>
          </Reveal>

          <div className="grid gap-x-10 gap-y-16 md:grid-cols-3">
            {STATES.map((s, i) => (
              <Reveal as="article" key={s.n} delay={i * 110}>
                <div className="reveal-fade">
                  <div className="mb-8 flex items-baseline gap-4">
                    <span className="numeral">{s.n}</span>
                    <Mark size={22} phase={s.phase} />
                  </div>
                  <h3 className="display-sm mb-1" style={{ fontSize: 'clamp(1.75rem,2.6vw,2.5rem)' }}>
                    {s.name}
                  </h3>
                  <p className="label mb-6">{s.gloss}</p>
                  <p className="mb-3 text-sm" style={{ color: 'var(--halo)' }}>
                    <strong>{s.title}.</strong>
                  </p>
                  <p className="muted text-sm">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────── honest limits ───────────────── */}
      <section className="px-6 py-28 sm:px-10 sm:py-40">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-14" />
            <div className="grid gap-14 md:grid-cols-[0.9fr_1.1fr]">
              <div>
                <h2 className="display-sm reveal-fade max-w-[14ch]">
                  What it <em>can’t</em> do.
                </h2>
                <p
                  className="label reveal-fade mt-6"
                  style={{ ['--d' as string]: '100ms' }}
                >
                  Stated rather than hidden
                </p>
              </div>

              <div className="space-y-8">
                <Limit
                  delay={140}
                  head="The order-encryption key is not covered by the attestation."
                  body="The nonce commits to the enclave’s signing key and the vault — not to its X25519 encryption key. An operator willing to serve a substituted key could read orders. That is an active, detectable act rather than a passive capability, but “cannot read orders” would be an overstatement, so we don’t make it."
                />
                <Limit
                  delay={200}
                  head="The browser is inside the trust boundary."
                  body="Order plaintext exists client-side before it is sealed, so whoever serves the JavaScript can read it. No attestation or on-chain check can see that. The verification that doesn’t depend on us is fetching the raw token and hashing it yourself."
                />
                <Limit
                  delay={260}
                  head="Escrow is a free option."
                  body="Because withdrawals are deliberately never gated, a trader can deposit, submit, watch the oracle move and withdraw before the batch settles. The engine rebuilds the batch without them so nobody else’s fill dies — but the optionality is real."
                />
                <p
                  className="reveal-fade pt-2 text-sm"
                  style={{ ['--d' as string]: '320ms', color: 'var(--dim)' }}
                >
                  We would rather state the boundary than let you find it.{' '}
                  <Link href="/how" className="link-u" style={{ color: 'var(--halo)' }}>
                    The full trust model →
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────── close ───────────────── */}
      <section className="px-6 pb-40 pt-10 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-16" />
            <h2 className="display reveal-fade max-w-[13ch]">
              Don’t trust it. <em>Check</em> it.
            </h2>
            <div
              className="reveal-fade mt-12 flex flex-wrap items-center gap-4"
              style={{ ['--d' as string]: '160ms' }}
            >
              <Link href="/app" className="btn">
                Open the app
              </Link>
              <Link href="/proof" className="btn-ghost">
                Verify it yourself
              </Link>
            </div>
            <p
              className="muted reveal-fade mt-10 max-w-[54ch] text-sm"
              style={{ ['--d' as string]: '240ms' }}
            >
              Coston2 testnet only. 239 contract tests, 71 engine tests, and an end-to-end rehearsal
              that asserts every claim against on-chain state read independently of the engine — the
              engine is never trusted about anything the chain can be asked directly.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ─────────────────────────── pieces ─────────────────────────── */

function Reading({
  label,
  value,
  live,
  tone,
}: {
  label: string;
  value: string;
  live?: boolean;
  tone?: 'ok' | 'bad';
}) {
  return (
    <span className="flex items-baseline gap-2.5">
      <span className="label">{label}</span>
      <span
        className="mono text-sm"
        style={{ color: tone === 'ok' ? 'var(--ok)' : tone === 'bad' ? 'var(--bad)' : 'var(--halo)' }}
      >
        {value}
      </span>
      {live ? (
        <span
          className="pulse"
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: 'var(--chroma)',
            display: 'inline-block',
          }}
        />
      ) : null}
    </span>
  );
}

function Claim({
  quote,
  answer,
  delay,
}: {
  quote: string;
  answer: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      className="reveal-fade pl-6"
      style={{ borderLeft: '1px solid var(--line)', ['--d' as string]: `${delay}ms` }}
    >
      <p className="display-sm mb-3" style={{ fontSize: 'clamp(1.25rem,1.9vw,1.75rem)' }}>
        “{quote}”
      </p>
      <p className="muted text-sm">{answer}</p>
    </div>
  );
}

function Limit({ head, body, delay }: { head: string; body: string; delay: number }) {
  return (
    <div className="reveal-fade" style={{ ['--d' as string]: `${delay}ms` }}>
      <p className="mb-2" style={{ color: 'var(--halo)' }}>
        {head}
      </p>
      <p className="muted text-sm">{body}</p>
    </div>
  );
}
