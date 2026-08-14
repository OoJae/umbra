import type { Metadata } from 'next';
import Link from 'next/link';

import { Reveal, RevealLines } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'The record',
  description:
    'Between 2011 and 2018 the SEC sanctioned essentially every major US dark pool operator for ' +
    'misrepresenting how their own venue worked — roughly $300M in penalties.',
};

/**
 * Every figure on this page is from the SEC and NYAG settlements, and every one
 * of them also appears in docs/submission.md. Nothing here is estimated.
 */
const CASES = [
  {
    year: '2011',
    who: 'Pipeline Trading',
    fine: '$1.2M',
    admitted: false,
    what: 'Marketed a venue where subscribers traded with each other. In practice around 80% of order volume was filled by a trading affiliate the firm owned and had not disclosed.',
  },
  {
    year: '2015',
    who: 'ITG / POSIT',
    fine: '$20.3M',
    admitted: true,
    what: 'Ran a secret proprietary desk internally known as Project Omega, which traded 262 million shares against the firm’s own dark pool subscribers while the firm described itself as an agency-only broker.',
  },
  {
    year: '2015',
    who: 'UBS ATS',
    fine: '$14.4M',
    admitted: false,
    what: 'Offered an undisclosed order type that let high-frequency participants price orders in increments other participants could not use, and did not disclose it to the subscribers being traded against.',
  },
  {
    year: '2016',
    who: 'Barclays LX',
    fine: '$70M',
    admitted: true,
    what: 'Sold the pool on a surveillance system it said removed predatory traders. It then removed the single most predatory participant from the venue-composition charts it showed clients, rather than removing it from the pool.',
  },
  {
    year: '2016',
    who: 'Credit Suisse',
    fine: '$84.3M',
    admitted: false,
    what: 'The largest penalty ever levied against an alternative trading system, covering misrepresentations about how orders were routed and who was permitted to trade in the venue.',
  },
  {
    year: '2016',
    who: 'Deutsche Bank',
    fine: '$37M+',
    admitted: false,
    what: 'The model that ranked and routed client orders sat silently frozen by a software defect for around two years. Nobody outside the firm could have known, and for a long time nobody inside it did either.',
  },
  {
    year: '2018',
    who: 'Merrill Lynch',
    fine: '$42M + $42M',
    admitted: true,
    what: 'Fabricated the execution venue reported on more than 15 million child orders, telling clients trades had executed in-house when they had been routed to outside firms. Penalised twice — by the SEC and by the New York Attorney General.',
  },
  {
    year: '2018',
    who: 'Citigroup',
    fine: '$12.9M',
    admitted: false,
    what: 'Routed orders to a venue it had told clients was excluded, while representing that high-frequency traders were kept out of the pool.',
  },
];

export default function RecordPage() {
  return (
    <>
      <section className="px-6 pb-20 pt-40 sm:px-10 sm:pt-52">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="label reveal-fade mb-8">2011 — 2018 · SEC and NYAG enforcement</p>
            <h1 className="display max-w-[13ch]">
              <RevealLines lines={[<>Eight</>, <>venues.</>, <><em>$300</em> million.</>]} />
            </h1>
            <p
              className="lede reveal-fade mt-12 max-w-[62ch]"
              style={{ ['--d' as string]: '400ms' }}
            >
              Every one of these firms told clients how their dark pool worked. Every one of them was
              later found to have described something that was not happening. The cases took two to
              six years to surface and required subpoena power to prove — because from the outside,
              a fill looks the same either way.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-32 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <ol>
            {CASES.map((c, i) => (
              <Reveal as="li" key={c.who} delay={i * 40}>
                <div
                  className="reveal-fade grid gap-x-10 gap-y-4 py-10 md:grid-cols-[7rem_minmax(0,20rem)_1fr]"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <span className="mono muted text-sm">{c.year}</span>

                  <div>
                    <h2
                      className="display-sm"
                      style={{ fontSize: 'clamp(1.6rem,2.6vw,2.4rem)' }}
                    >
                      {c.who}
                    </h2>
                    <p className="mono accent mt-2 text-sm">
                      {c.fine}
                      {c.admitted ? (
                        <span
                          className="mono ml-3"
                          style={{ color: 'var(--halo)', letterSpacing: '0.12em' }}
                        >
                          ADMITTED
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <p className="muted max-w-[68ch]">{c.what}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 pb-40 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-16" />
            <div className="grid gap-14 md:grid-cols-[1fr_1fr]">
              <h2 className="display-sm reveal-fade max-w-[18ch]">
                The charge was always the same sentence.
              </h2>
              <div className="space-y-6">
                <p className="reveal-fade" style={{ ['--d' as string]: '120ms' }}>
                  Section 17(a)(2) misrepresentation, and Rule 301(b)(2) — <em>you did not operate
                  the way you said you did.</em> Which means the entire regulatory apparatus for dark
                  pools is retrospective punishment for claims that were never verifiable in the
                  first place.
                </p>
                <p className="reveal-fade" style={{ ['--d' as string]: '200ms' }}>
                  Europe reached the same dead end from the other direction. It required venues to
                  publish execution-quality reports, then <strong>repealed</strong> the requirement
                  in 2024 on the finding that the reports were “hardly read” and did not enable
                  meaningful comparisons.
                </p>
                <p
                  className="reveal-fade"
                  style={{ ['--d' as string]: '280ms', color: 'var(--halo)' }}
                >
                  Umbra does not ask you to believe a different promise. It moves two of the
                  promises into places a machine can check them — an on-chain price band the
                  operator does not control at settlement time, and an image digest asserted by
                  someone other than us.
                </p>
                <div className="reveal-fade pt-4" style={{ ['--d' as string]: '340ms' }}>
                  <Link href="/mechanism" className="btn-ghost inline-block">
                    How that works →
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
