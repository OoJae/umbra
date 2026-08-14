import type { NextRequest } from 'next/server';

/**
 * The only server-side code in this app.
 *
 * The TEE engine serves plain HTTP on a raw IP and sends no CORS headers, so the browser cannot
 * call it directly from an https:// origin. Every engine call is forwarded from here instead,
 * which also keeps OPERATOR_TOKEN off the client entirely.
 *
 * runtime = 'nodejs' deliberately: the Edge runtime caps around 25s (inside our 10-40s batch
 * window) and its egress to a raw HTTP IP on a non-standard port is not a documented guarantee —
 * exactly the class of bug that passes `next dev` and fails only in production.
 */
export const runtime = 'nodejs';
/**
 * Correctness, not hygiene. Without it Next statically evaluates the GET handlers at build time
 * and would serve a frozen /info forever — including a stale enclave X25519 pubkey. The enclave
 * mints a new key on every boot, so a cached pubkey means every order fails with bad_ciphertext.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/** Vercel Hobby ceiling. A value above 60 is rejected at deploy time. */
export const maxDuration = 60;

const ENGINE_URL = (process.env.ENGINE_URL ?? '').replace(/\/+$/, '');
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN ?? '';

const GET_ALLOW = [/^healthz$/, /^info$/, /^attestation$/, /^orderbook\/public$/, /^batches\/\d+$/, /^orders\/[0-9a-f]{32}$/];
const POST_ALLOW = [/^orders$/, /^batch\/run$/];

/**
 * batch/run is the one operator-authenticated engine route this proxy deliberately exposes, because
 * the demo needs a public "Trigger batch" button. That means the operator token protects the engine
 * from direct callers but not from anyone who finds this URL — so the throttle below is the only
 * thing standing between a stranger and unbounded batch triggering during a week of unattended
 * judging. It is best-effort by nature: serverless instances do not share this counter, so treat it
 * as a brake on casual abuse rather than a security boundary.
 */
const BATCH_COOLDOWN_MS = 20_000;
let lastBatchRun = 0;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function forward(req: NextRequest, segments: string[], method: 'GET' | 'POST') {
  const path = segments.join('/');
  const allow = method === 'GET' ? GET_ALLOW : POST_ALLOW;
  if (!allow.some((rx) => rx.test(path))) return json({ code: 'route_not_allowed', path }, 404);
  if (!ENGINE_URL) return json({ code: 'engine_url_unset' }, 500);

  // Headers are constructed, never forwarded, so a caller cannot inject an operator token.
  const headers: Record<string, string> = { accept: 'application/json' };
  let body: string | undefined;

  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    body = await req.text();
    if (path === 'batch/run') {
      if (!OPERATOR_TOKEN) return json({ code: 'operator_token_unset' }, 500);
      const since = Date.now() - lastBatchRun;
      if (since < BATCH_COOLDOWN_MS) {
        return json(
          { code: 'batch_cooldown', detail: { retry_after_s: Math.ceil((BATCH_COOLDOWN_MS - since) / 1000) } },
          429,
        );
      }
      lastBatchRun = Date.now();
      headers['X-Umbra-Operator-Token'] = OPERATOR_TOKEN;
    }
  }

  // Kept below maxDuration so we return our own structured 504 rather than Vercel's opaque
  // FUNCTION_INVOCATION_TIMEOUT page.
  const timeoutMs = path === 'batch/run' ? 55_000 : 15_000;

  try {
    const upstream = await fetch(`${ENGINE_URL}/${path}`, {
      method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Verbatim passthrough. The client depends on the engine's own {"detail":{"code":...}} bodies
    // and on the 404 that /batches/{id} returns while a run is still in flight.
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return json(
      { code: timedOut ? 'engine_timeout' : 'engine_unreachable', detail: String(err) },
      504,
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path, 'GET');
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, ctx.params.path, 'POST');
}
