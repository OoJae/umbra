'use client';

import { Card, Row } from '@/components/ui';
import { useInfo } from '@/hooks/useEngine';
import { addressUrl } from '@/lib/contracts';

const DIAGRAM = `  browser                        enclave (Intel TDX)              Flare Coston2
 ---------                      ---------------------            ---------------
  sign EIP-712 order
  crypto_box_seal  ──────────▶  decrypt + verify signature
                                verify nonce, deadline, escrow
                                read FTSOv2 XRP/USD  ◀──────────  FtsoV2
                                clear all crossers at the mid
                                sign Batch with enclave key
                                settleBatch  ─────────────────▶   UmbraVault
                                                                  · recover signer
                                                                  · == TeeRegistry.teeSigner()
                                                                  · re-read FTSOv2 itself
                                                                  · require |price-oracle| <= 50bps
                                                                  · swap balances atomically`;

export default function HowPage() {
  const info = useInfo();
  const rows: [string, string | null | undefined][] = [
    ['UmbraVault', info.data?.vault],
    ['TeeRegistry', info.data?.registry],
    ['FXRP (base)', info.data?.base_token],
    ['USDT0 (quote)', info.data?.quote_token],
    ['TEE signer', info.data?.tee_eth_address],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="muted text-sm">
          A sealed-bid auction cannot be built with cryptography alone — somebody has to see the
          bids in order to match them. Umbra makes that somebody a TEE whose code is attested and
          whose key never leaves the enclave.
        </p>
      </div>

      <Card title="Architecture">
        <pre className="mono overflow-x-auto text-[11px] leading-relaxed">{DIAGRAM}</pre>
      </Card>

      <Card title="Trust model">
        <div className="space-y-3 text-sm">
          <p>
            You trust Intel TDX and Google Confidential Space to run only the attested image,
            FTSOv2 for fair pricing, and the vault contract for custody.
          </p>
          <p>
            <strong>The operator cannot settle off-market</strong>, because the price band is
            enforced on-chain by a contract they do not control at settlement time. That guarantee
            is unconditional — it holds even if the entire engine is replaced with malicious code.
          </p>
          <p>
            <strong>Your order is sealed to a key that only exists inside the enclave</strong>, so a
            passive operator cannot read it. Being precise about the limit of that, because it is
            weaker than it sounds: the attestation nonce commits to the enclave&apos;s{' '}
            <em>signing</em> key, not to its <em>order-encryption</em> key, and the browser seals to
            whatever key <span className="mono">/info</span> returns. An operator willing to serve a
            substituted public key could therefore read orders. That is an active, detectable act
            rather than a passive capability — but &ldquo;cannot read orders&rdquo; would be an
            overstatement, so we do not make it.
          </p>
          <p className="muted">
            Being precise about what the operator <em>can</em> do: the registry owner can rotate
            the TEE signer, because enclaves are ephemeral and every boot mints a fresh key. What
            bounds that is that every rotation emits a public event, so a swap is permanently
            visible on-chain, and the band still applies to whatever key is registered. Full
            on-chain verification of the attestation JWT would remove the power entirely; it is on
            the roadmap, not in this build.
          </p>
          <p className="ok">
            Withdrawals are never gated — not by the TEE, not by the operator, not by a pause
            switch, because there isn&apos;t one. A liveness failure can never become a fund-loss
            failure.
          </p>
        </div>
      </Card>

      <Card title="Known limits" subtitle="Stated rather than hidden.">
        <ul className="muted list-disc space-y-1 pl-5 text-sm">
          <li>Single pair, single batch auction, in-memory book — a restart loses pending orders, never funds.</li>
          <li>Clearing is XRP/USD while settlement is in USDT0, so the design assumes USDT0 ≈ $1.</li>
          <li>The operator can censor by not running a batch. That is liveness, not safety.</li>
          <li>The Dark Book publishes order counts, so with a single order in the book the count reveals its side.</li>
          <li>Rounding is floor, so a fill can differ by at most one quote unit — between counterparties, never into or out of the vault.</li>
        </ul>
      </Card>

      <Card title="Deployed on Coston2">
        {rows.map(([k, v]) => (
          <Row
            key={k}
            k={k}
            v={v ? <a className="accent underline" href={addressUrl(v)} target="_blank" rel="noreferrer">{v}</a> : '—'}
          />
        ))}
      </Card>
    </div>
  );
}
