import type { Metadata } from 'next';
import Link from 'next/link';

import { Reveal, RevealLines } from '@/components/motion/Reveal';

export const metadata: Metadata = {
  title: 'Proof',
  description:
    'Every address verified on-chain, the attestation anchored on Flare, and the commands to check ' +
    'all of it without taking our word for anything.',
};

const EXPLORER = 'https://coston2-explorer.flare.network';

const ADDRESSES = [
  { label: 'UmbraVault', value: '0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10', note: 'source-verified' },
  { label: 'TeeRegistry', value: '0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4', note: 'source-verified' },
  { label: 'FXRP (base)', value: '0x0b6A3645c240605887a5532109323A3E12273dc7', note: 'the real Coston2 FAsset' },
  { label: 'USDT0 (quote)', value: '0xC1A5B41512496B80903D1f32d6dEa3a73212E71F', note: '' },
  { label: 'TEE signer', value: '0x1d9C5a793C501B5781bA8c0a58C7F983593d1913', note: 'attested, generated inside the enclave' },
];

const CLAIMS: [string, string][] = [
  ['alg', 'RS256'],
  ['iss', 'https://confidentialcomputing.googleapis.com'],
  ['hwmodel', 'GCP_INTEL_TDX'],
  ['swname', 'CONFIDENTIAL_SPACE'],
  ['secboot', 'true'],
  ['dbgstat', 'disabled-since-boot'],
];

export default function ProofPage() {
  return (
    <>
      <section className="px-6 pb-20 pt-40 sm:px-10 sm:pt-52">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <p className="label reveal-fade mb-8">Proof · Coston2, chain 114</p>
            <h1 className="display max-w-[12ch]">
              <RevealLines lines={[<>Don’t</>, <>trust it.</>, <><em>Check</em> it.</>]} />
            </h1>
            <p
              className="lede reveal-fade mt-12 max-w-[60ch]"
              style={{ ['--d' as string]: '400ms' }}
            >
              Every address below was verified against the live chain rather than copied from
              documentation, and every command runs against public infrastructure. None of it
              requires trusting anything we say.
            </p>
          </Reveal>
        </div>
      </section>

      {/* deployed */}
      <section className="px-6 pb-24 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-12" />
            <p className="label reveal-fade mb-8">Deployed</p>
            <div className="reveal-fade" style={{ ['--d' as string]: '80ms' }}>
              {ADDRESSES.map((a) => (
                <div
                  key={a.label}
                  className="grid gap-x-8 gap-y-1 py-4 md:grid-cols-[12rem_1fr_auto]"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <span className="text-sm">{a.label}</span>
                  <a
                    href={`${EXPLORER}/address/${a.value}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono link-u break-all text-sm"
                  >
                    {a.value}
                  </a>
                  <span className="muted text-sm">{a.note}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* attestation */}
      <section className="px-6 pb-24 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-12" />
            <div className="grid gap-14 md:grid-cols-[1fr_1fr]">
              <div>
                <p className="label reveal-fade mb-6">The attestation</p>
                <h2 className="display-sm reveal-fade max-w-[16ch]">
                  A document we did not write.
                </h2>
                <p
                  className="muted reveal-fade mt-6 max-w-[46ch] text-sm"
                  style={{ ['--d' as string]: '120ms' }}
                >
                  The engine runs in a Google Confidential Space VM on Intel TDX. Its token is
                  Google-signed, and the image digest inside it is asserted by the launcher rather
                  than by our own code — so it says which code is actually running, not which code
                  we claim is running.
                </p>
              </div>

              <div
                className="reveal-fade panel p-6"
                style={{ ['--d' as string]: '160ms' }}
              >
                {CLAIMS.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-6 py-2 text-sm"
                    style={{ borderBottom: '1px solid var(--line)' }}
                  >
                    <span className="mono muted">{k}</span>
                    <span className="mono break-all text-right">{v}</span>
                  </div>
                ))}
                <p className="muted mt-5 text-sm">
                  The nonce equals <span className="mono">keccak256(teeAddress ‖ vaultAddress)</span>,
                  so the token commits to <em>this</em> enclave key settling to <em>this</em> vault.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* commands */}
      <section className="px-6 pb-24 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-12" />
            <p className="label reveal-fade mb-8">Verify it yourself</p>

            <div className="grid gap-8 lg:grid-cols-2">
              <Check
                delay={80}
                title="The anchor matches the enclave"
                body="Hash the raw attestation the engine serves and compare it to what the registry holds on-chain. Both should print the same value."
                code={`curl -s http://136.112.118.220:8080/attestation \\
  | jq -r .raw | tr -d '\\n' | cast keccak

cast call 0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4 \\
  "attestationHash()(bytes32)" \\
  --rpc-url https://coston2-api.flare.network/ext/C/rpc`}
              />

              <Check
                delay={140}
                title="The running image is the published source"
                body="The container registry allows anonymous reads. Pull the exact digest Google says is running and diff it against the repository."
                code={`curl -s http://136.112.118.220:8080/attestation \\
  | jq -r .image_digest

crane export \\
  us-central1-docker.pkg.dev/umbra-tee-08132358/umbra/umbra-engine@sha256:6538c99447f578c28a5b583476c50609b3d4086df7dffb8b38a2dd74cef25f92 - \\
  | tar -xO app/app/matching.py | diff - engine/app/matching.py`}
              />
            </div>

            <p
              className="muted reveal-fade mt-8 max-w-[70ch] text-sm"
              style={{ ['--d' as string]: '220ms' }}
            >
              The honest remaining gap: the build is not yet bit-for-bit reproducible, so the second
              check compares image contents rather than rebuilding the digest from source yourself.
            </p>
          </Reveal>
        </div>
      </section>

      {/* what is tested */}
      <section className="px-6 pb-40 sm:px-10">
        <div className="mx-auto max-w-[1400px]">
          <Reveal>
            <div className="rule mb-12" />
            <div className="grid gap-14 md:grid-cols-[1fr_1fr]">
              <h2 className="display-sm reveal-fade max-w-[18ch]">
                The engine is never trusted about anything the chain can be asked directly.
              </h2>
              <div className="space-y-6">
                <div className="reveal-fade flex flex-wrap gap-x-12 gap-y-6" style={{ ['--d' as string]: '100ms' }}>
                  <Figure n="239" what="contract tests, across three decimal pairings" />
                  <Figure n="71" what="engine tests, including cross-language EIP-712 parity" />
                  <Figure n="0 bps" what="deviation on the last settlement, of a 50 bps band" />
                </div>
                <p className="reveal-fade" style={{ ['--d' as string]: '180ms' }}>
                  The end-to-end rehearsal asserts deposits, two sealed orders, a batch, exact
                  balance deltas, replay protection and an ungated withdrawal — every assertion an
                  equality against on-chain state read independently of the engine.
                </p>
                <div className="reveal-fade pt-2" style={{ ['--d' as string]: '240ms' }}>
                  <Link href="/app" className="btn inline-block">
                    Open the app
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

function Check({
  title,
  body,
  code,
  delay,
}: {
  title: string;
  body: string;
  code: string;
  delay: number;
}) {
  return (
    <div className="reveal-fade" style={{ ['--d' as string]: `${delay}ms` }}>
      <h3 className="mb-2">{title}</h3>
      <p className="muted mb-4 text-sm">{body}</p>
      <pre
        className="mono overflow-x-auto p-4 text-[11px] leading-relaxed"
        style={{
          background: 'var(--ash-2)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          color: 'var(--dim)',
        }}
      >
        {code}
      </pre>
    </div>
  );
}

function Figure({ n, what }: { n: string; what: string }) {
  return (
    <div>
      <p className="numeral" style={{ color: 'var(--halo)' }}>
        {n}
      </p>
      <p className="muted mt-1 max-w-[22ch] text-sm">{what}</p>
    </div>
  );
}
