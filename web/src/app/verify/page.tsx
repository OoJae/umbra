'use client';

import { keccak256, toBytes } from 'viem';

import { Card, Chip, Copy, Row } from '@/components/ui';
import { useAttestation, useInfo } from '@/hooks/useEngine';
import { useOnChainAttestation } from '@/hooks/useVault';
import { addressUrl } from '@/lib/contracts';
import { shortHex } from '@/lib/format';

type Badge = { label: string; tone: 'ok' | 'warn' | 'bad'; detail: string };

/**
 * Deliberately never falls through to "real". The engine models a genuine third state — a real
 * TDX VM whose token fetch failed emits a simulated token with fallback_from set — and showing
 * that as REAL would be a lie, while showing it as SIMULATED would hide that the hardware is real.
 */
function classify(alg?: string, payload?: Record<string, unknown>, status?: string): Badge {
  const hwmodel = payload?.hwmodel as string | undefined;
  const secboot = payload?.secboot as boolean | undefined;
  const simulated = payload?.simulated as boolean | undefined;

  if (alg === 'RS256' && hwmodel === 'GCP_INTEL_TDX' && secboot === true) {
    return { label: 'REAL TEE · Intel TDX', tone: 'ok', detail: 'Google-signed vTPM token, secure boot verified' };
  }
  if (alg === 'none' && simulated === true) {
    return { label: 'SIMULATED', tone: 'warn', detail: 'locally minted token — clearly labelled, not attested hardware' };
  }
  return { label: 'DEGRADED', tone: 'bad', detail: `unrecognised attestation shape (status: ${status ?? 'unknown'})` };
}

export default function VerifyPage() {
  const att = useAttestation();
  const info = useInfo();
  const chain = useOnChainAttestation();

  const decoded = att.data?.decoded;
  const payload = decoded?.payload;
  const badge = classify(decoded?.header?.alg, payload, att.data?.status);

  // Recomputed in the browser rather than trusting the engine's own hash_matches.
  const computed = att.data?.raw ? keccak256(toBytes(att.data.raw)) : undefined;
  const hashMatches =
    computed && chain.hash ? computed.toLowerCase() === chain.hash.toLowerCase() : undefined;
  const signerMatches =
    chain.signer && info.data?.tee_eth_address
      ? chain.signer.toLowerCase() === info.data.tee_eth_address.toLowerCase()
      : undefined;

  const eatNonce = payload?.eat_nonce;
  const nonceValue = Array.isArray(eatNonce) ? eatNonce[0] : eatNonce;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify</h1>
        <p className="muted text-sm">
          What the enclave claims, and whether Flare agrees. Everything below is recomputed in your
          browser from the token the engine just served.
        </p>
      </div>

      <Card title="Attestation" right={<Chip tone={badge.tone}>{badge.label}</Chip>}>
        <p className="muted mb-3 text-sm">{badge.detail}</p>
        <Row k="mode" v={att.data?.mode ?? '—'} />
        <Row k="status" v={att.data?.status ?? '—'} />
        <Row k="issuer" v={String(payload?.iss ?? '—')} />
        <Row k="hardware" v={String(payload?.hwmodel ?? '—')} />
        <Row k="software" v={String(payload?.swname ?? '—')} />
        <Row k="secure boot" v={String(payload?.secboot ?? '—')} />
        <Row k="debug status" v={String(payload?.dbgstat ?? '—')} />
        <Row k="audience" v={att.data?.audience ?? '—'} />
        <Row
          k="image digest"
          v={
            <span className="flex items-center justify-end gap-2">
              {shortHex(att.data?.image_digest?.replace('sha256:', ''), 16, 8)}
              {att.data?.image_digest && <Copy text={att.data.image_digest} />}
            </span>
          }
        />
        <Row k="expired" v={decoded?.expired ? 'yes' : 'no'} />
      </Card>

      <Card
        title="On-chain anchor"
        subtitle="Computed here, compared against TeeRegistry — we did not ask the engine whether it matched."
        right={
          hashMatches === undefined ? undefined : (
            <Chip tone={hashMatches ? 'ok' : 'bad'}>{hashMatches ? '✓ MATCH' : '✗ MISMATCH'}</Chip>
          )
        }
      >
        <Row k="keccak256(token), computed in your browser" v={shortHex(computed, 14, 10)} />
        <Row k="anchored in TeeRegistry" v={shortHex(chain.hash, 14, 10)} />
        <Row
          k="registered signer"
          v={
            chain.signer ? (
              <a className="accent underline" href={addressUrl(chain.signer)} target="_blank" rel="noreferrer">
                {shortHex(chain.signer, 10, 6)}
              </a>
            ) : '—'
          }
        />
        <Row
          k="live enclave address"
          v={
            <span className={signerMatches ? 'ok' : 'bad'}>
              {shortHex(info.data?.tee_eth_address, 10, 6)} {signerMatches ? '✓' : signerMatches === false ? '✗' : ''}
            </span>
          }
        />
        <Row k="registrations so far" v={chain.registrationCount?.toString() ?? '—'} />
        <div className="muted mt-3 text-xs">
          engine&apos;s own claim (not trusted):{' '}
          <span className="mono">{String(att.data?.onchain?.hash_matches ?? '—')}</span>
        </div>
      </Card>

      <Card
        title="Nonce binding"
        subtitle="The token commits to this enclave key and this vault — not just to some enclave."
      >
        <Row k="derivation" v={att.data?.nonce.derivation ?? '—'} mono={false} />
        <Row k="expected" v={shortHex(att.data?.nonce.hex, 14, 10)} />
        <Row
          k="eat_nonce in the token"
          v={
            <span className={nonceValue === att.data?.nonce.hex ? 'ok' : 'warn'}>
              {shortHex(String(nonceValue ?? ''), 14, 10)}{' '}
              {nonceValue === att.data?.nonce.hex ? '✓' : ''}
            </span>
          }
        />
      </Card>

      <Card
        title="Raw token"
        subtitle="Paste into jwt.io to decode it yourself."
        right={att.data?.raw ? <Copy text={att.data.raw} label="copy JWT" /> : undefined}
      >
        <pre className="mono max-h-40 overflow-auto whitespace-pre-wrap break-all rounded p-3 text-[11px]"
             style={{ background: 'var(--panel-2)' }}>
          {att.data?.raw ?? '—'}
        </pre>
        <p className="muted mt-3 text-xs">
          The RS256 signature is <strong>not</strong> verified in your browser — verifying it against
          Google&apos;s JWKS is on the roadmap, not in this build. What we do verify is the on-chain
          anchor above. We would rather show you an honest gap than a green check that means nothing.
        </p>
      </Card>
    </div>
  );
}
