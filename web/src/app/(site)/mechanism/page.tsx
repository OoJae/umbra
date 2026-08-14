import type { Metadata } from 'next';
import Link from 'next/link';

import { Mark } from '@/components/brand/Mark';
import { Reveal, RevealLines } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Mechanism',
  description:
    'Escrow, seal, match, settle, verify. What runs inside the enclave, what is checked on-chain, ' +
    'and what neither of them can see.',
};

const STEPS = [
  {
    n: '01',
    phase: 'Umbra',
    title: 'Escrow',
    where: 'on-chain',
    body: 'Sellers deposit FXRP into UmbraVault, buyers deposit USDT0. Nothing about an order exists yet — this is only balance. Withdrawals from here are never gated by anything: not the enclave, not the operator, not a pause switch, because there is no pause switch.',
    phaseValue: 0.1,
  },
  {
    n: '02',
    phase: 'Umbra',
    title: 'Seal',
    where: 'in your browser',
    body: 'Your browser builds an EIP-712 Order, you sign it in your wallet, and the browser encrypts it with libsodium crypto_box_seal to an X25519 public key that exists only inside the enclave. Only ciphertext leaves the machine. The operator, the mempool and every other trader see an opaque blob.',
    phaseValue: 1,
  },
  {
    n: '03',
    phase: 'Penumbra',
    title: 'Rest',
    where: 'in the Dark Book',
    body: 'The order waits for the next batch. The public book publishes that it exists — a count, a byte length, an arrival time — and nothing else. That is a real, small leak and we publish its shape rather than claiming there is none.',
    phaseValue: 0.55,
  },
  {
    n: '04',
    phase: 'Antumbra',
    title: 'Match',
    where: 'inside the enclave',
    body: 'At batch time the TEE decrypts every order, verifies each signature itself — the enclave, not the API, is the authentication boundary — reads the FTSOv2 XRP/USD mid, and clears every crossing order at that one uniform price, pro-rata on the heavy side.',
    phaseValue: 0.3,
  },
  {
    n: '05',
    phase: 'Antumbra',
    title: 'Settle, and be checked',
    where: 'on-chain',
    body: 'The enclave signs the batch with a key generated at boot and submits one transaction. The vault then refuses it unless the signer is the currently attested key and the clearing price sits within 50 bps of a fresh oracle reading it takes itself. A malicious or buggy engine cannot settle off-market.',
    phaseValue: 0.05,
  },
];

export default function MechanismPage() {
  return (
    <>
      <section className="px-6 pb-20 pt-40 sm:px-10 sm:pt-52">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="label reveal-fade mb-8">Mechanism</p>
            <h1 className="display max-w-[14ch]">
              <RevealLines lines={[<>Somebody</>, <>has to <em>see</em></>, <>the bids.</>]} />
            </h1>
            <p
              className="lede reveal-fade mt-12 max-w-[60ch]"
              style={{ ['--d' as string]: '400ms' }}
            >
              A sealed-bid auction cannot be built with cryptography alone — to match orders,
              something has to read them. Umbra makes that something a Trusted Execution Environment
              whose code is attested, whose key never leaves the enclave, and whose pricing is
              checked by a contract it does not control. Confidential compute is not bolted onto
              this product; it is the product.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-24 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <ol>
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 50}>
                <div
                  className="reveal-fade grid gap-x-10 gap-y-5 py-12 md:grid-cols-[auto_minmax(0,18rem)_1fr]"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <div className="flex items-start gap-5">
                    <span className="numeral">{s.n}</span>
                    <span className="pt-3">
                      <Mark size={20} phase={s.phaseValue} />
                    </span>
                  </div>

                  <div>
                    <h2
                      className="display-sm"
                      style={{ fontSize: 'clamp(1.6rem,2.6vw,2.4rem)' }}
                    >
                      {s.title}
                    </h2>
                    <p className="label mt-2">
                      {s.phase} · {s.where}
                    </p>
                  </div>

                  <p className="muted max-w-[70ch]">{s.body}</p>
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
              <div>
                <h2 className="display-sm reveal-fade max-w-[16ch]">
                  The vault never takes the enclave’s word for the price.
                </h2>
              </div>
              <div className="space-y-6">
                <p className="reveal-fade" style={{ ['--d' as string]: '120ms' }}>
                  This is the part that makes the rest safe to reason about. At settlement the
                  contract reads FTSOv2 itself, through the Flare contract registry, and normalises
                  the feed’s own decimals rather than assuming them — XRP/USD reports 6, FLR/USD
                  reports 8, and a feed can change.
                </p>
                <p className="reveal-fade" style={{ ['--d' as string]: '190ms' }}>
                  If the clearing price the enclave submits differs from that reading by more than
                  50 basis points, the transaction reverts. The operator cannot widen the band past
                  a hard-coded 10% ceiling, and every change to it emits a public event.
                </p>
                <p
                  className="reveal-fade"
                  style={{ ['--d' as string]: '260ms', color: 'var(--halo)' }}
                >
                  So the strongest claim on this site is also the narrowest one: the operator cannot
                  settle you off-market. That holds even if the entire engine is replaced with
                  malicious code.
                </p>
                <div className="reveal-fade pt-4" style={{ ['--d' as string]: '320ms' }}>
                  <Link href="/proof" className="btn-ghost inline-block">
                    Check it yourself →
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
