/**
 * Typed client for the TEE engine. Every call goes through the Next route handler, so nothing in
 * this file knows the engine's URL and nothing here can hold the operator token.
 */

const BASE = '/api/engine';

export type Health = {
  status: string;
  mode: string;
  version: string;
  ready: boolean;
  tee_registered: boolean;
  attestation_status: string | null;
};

export type EngineInfo = {
  tee_eth_address: `0x${string}`;
  order_encryption_pubkey_b64: string;
  mode: string;
  image_digest: string;
  vault: `0x${string}`;
  chain_id: number;
  registry: `0x${string}` | null;
  base_token: `0x${string}` | null;
  quote_token: `0x${string}` | null;
  base_decimals: number | null;
  quote_decimals: number | null;
  eip712_domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  } | null;
};

export type Attestation = {
  mode: string;
  status: 'ok' | 'fallback';
  raw: string;
  decoded: {
    header: { alg: string; kid?: string; typ?: string };
    payload: Record<string, unknown>;
    signature_b64url: string;
    signature_verified: boolean;
    expired: boolean;
  };
  keccak256: `0x${string}`;
  audience: string;
  nonce: {
    hex: `0x${string}`;
    derivation: string;
    tee_eth_address: `0x${string}`;
    vault_address: `0x${string}`;
  };
  image_digest: string;
  fetched_at: number;
  error_code: string | null;
  onchain?: {
    registry?: string;
    anchored_hash?: `0x${string}`;
    hash_matches?: boolean;
    anchored_signer?: `0x${string}`;
    signer_matches?: boolean;
    error?: string;
  };
};

export type CiphertextPreview = {
  order_id: string;
  preview_b64: string;
  length: number;
  sha256: string;
};

export type PublicBook = {
  count_buys: number;
  count_sells: number;
  ciphertext_previews: CiphertextPreview[];
};

export type Fill = {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  amount_base: number;
  amount_quote: number;
};

export type BatchStatus =
  | 'pending'
  | 'settled'
  | 'no_match'
  | 'no_orders'
  | 'matched_dry_run'
  | 'failed';

export type Batch = {
  batch_id: number | null;
  status: BatchStatus;
  order_count: number;
  fill_count: number;
  unmatched_count: number;
  clearing_price_1e6: number | null;
  oracle_price_1e6: number | null;
  oracle_ts: number | null;
  tx_hash: string | null;
  explorer_url: string | null;
  block_number: number | null;
  gas_used: number | null;
  batch_digest: string | null;
  tee_signer: `0x${string}` | null;
  error_code: string | null;
  error_detail: string | null;
  created_at: number | null;
  settled_at: number | null;
  /** Non-null only once status === 'settled' — before then the fills have not reached the chain. */
  fills: Fill[] | null;
};

export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: unknown,
  ) {
    super(`${status} ${code}`);
    this.name = 'EngineError';
  }
}

async function call<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 20_000, ...rest } = init ?? {};
  const res = await fetch(`${BASE}/${path}`, {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const d = body as { detail?: { code?: string }; code?: string } | null;
    throw new EngineError(res.status, d?.detail?.code ?? d?.code ?? `http_${res.status}`, body);
  }
  return body as T;
}

export const api = {
  health: () => call<Health>('healthz', { timeoutMs: 10_000 }),
  info: () => call<EngineInfo>('info', { timeoutMs: 10_000 }),
  attestation: () => call<Attestation>('attestation', { timeoutMs: 20_000 }),
  book: () => call<PublicBook>('orderbook/public', { timeoutMs: 10_000 }),
  batch: (id: number) => call<Batch>(`batches/${id}`, { timeoutMs: 10_000 }),

  /**
   * `body` is the exact JSON string rendered by the "What observers see" panel — pass the string,
   * not an object, so what the user is shown and what goes on the wire cannot diverge.
   */
  submitOrder: (body: string) =>
    call<{ accepted: true; order_id: string }>('orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: 30_000,
    }),

  runBatch: () =>
    call<Batch>('batch/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
      timeoutMs: 58_000,
    }),
};

export const ERROR_COPY: Record<string, string> = {
  bad_ciphertext:
    'The enclave could not open your sealed order. Its key rotates on every boot — reload and resubmit.',
  bad_envelope: 'The order payload was rejected (extra or missing field).',
  bad_signature:
    'Your wallet signed a different struct than the enclave expects — confirm you are on Coston2.',
  deadline_expired: 'Deadline must be more than 30 seconds in the future.',
  nonce_used: 'That nonce was already used — resubmit.',
  book_full: 'The dark book is full.',
  insufficient_escrow: 'Not enough escrow in the vault for this order — deposit first.',
  batch_in_progress: 'A batch is already running — watching it now.',
  engine_timeout: 'The engine is taking longer than usual — still watching the chain.',
  engine_unreachable: 'The engine is unreachable.',
  route_not_allowed: 'That engine route is not proxied.',
};

export function errorCopy(err: unknown): string {
  if (err instanceof EngineError) return ERROR_COPY[err.code] ?? `${err.code} (${err.status})`;
  return err instanceof Error ? err.message : String(err);
}
