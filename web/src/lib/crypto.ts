'use client';

/**
 * libsodium crypto_box_seal to the enclave's X25519 key.
 *
 * THE TRAP: libsodium-wrappers' from_base64/to_base64 default to URLSAFE_NO_PADDING. The engine
 * emits its public key with Python's b64encode (standard alphabet, padded) and decodes ciphertext
 * with b64decode(validate=True), which rejects '-' and '_'. Both directions must therefore pin
 * base64_variants.ORIGINAL. Getting this wrong fails with an opaque 400 and nothing else to go on,
 * which is why cryptoSelfTest() exists and why it runs before the order form is ever used.
 */

import type _sodium from 'libsodium-wrappers';

type Sodium = typeof _sodium;

let ready: Promise<Sodium> | null = null;

export async function getSodium(): Promise<Sodium> {
  if (!ready) {
    ready = import('libsodium-wrappers').then(async (mod) => {
      const sodium = ((mod as unknown as { default?: Sodium }).default ?? mod) as Sodium;
      // Mandatory — the wasm/asm.js module is not usable before this resolves.
      await sodium.ready;
      return sodium;
    });
  }
  return ready;
}

/** crypto_box_SEALBYTES: 32-byte ephemeral public key + 16-byte MAC. */
export const SEAL_OVERHEAD = 48;

export async function sealToEnclave(pubkeyB64: string, plaintext: string): Promise<string> {
  const sodium = await getSodium();
  const V = sodium.base64_variants.ORIGINAL;

  const pk = sodium.from_base64(pubkeyB64, V);
  if (pk.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error(`enclave pubkey is ${pk.length} bytes, expected 32 — is /info stale?`);
  }

  const ciphertext = sodium.crypto_box_seal(sodium.from_string(plaintext), pk);
  // Not crypto_box_seal(msg, pk, 'base64') — that output format uses the DEFAULT variant.
  const b64 = sodium.to_base64(ciphertext, V);

  if (/[-_]/.test(b64)) throw new Error('ciphertext is URL-safe base64; the engine will reject it');
  if (b64.length < 64 || b64.length > 8192) {
    throw new Error(`ciphertext length ${b64.length} is outside the engine's accepted bounds`);
  }
  return b64;
}

export type SelfTestCheck = { name: string; ok: boolean; detail: string };
export type SelfTest = { ok: boolean; checks: SelfTestCheck[] };

/**
 * Proves the entire crypto path without needing the engine, so a failure here is unambiguously
 * ours rather than an EIP-712 or escrow problem.
 */
export async function cryptoSelfTest(): Promise<SelfTest> {
  const checks: SelfTestCheck[] = [];
  const push = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });

  const sodium = await getSodium();
  const V = sodium.base64_variants.ORIGINAL;

  // Stand-in for the enclave key, generated the same way the enclave generates its own.
  const kp = sodium.crypto_box_keypair();
  const pubB64 = sodium.to_base64(kp.publicKey, V);
  const message = JSON.stringify({ probe: 'umbra', secret_amount: 123456789, t: Date.now() });

  push('libsodium ready', true, 'crypto_box_seal available');
  push('pubkey is 32 bytes', kp.publicKey.length === 32, `${pubB64.length} base64 chars`);

  const ctB64 = await sealToEnclave(pubB64, message);
  const ct = sodium.from_base64(ctB64, V);

  push('ciphertext uses the standard alphabet', !/[-_]/.test(ctB64), ctB64.slice(0, 24) + '…');
  push('ciphertext is padded (length % 4 === 0)', ctB64.length % 4 === 0, `${ctB64.length} chars`);
  push(
    'seal overhead is exactly 48 bytes',
    ct.length === sodium.from_string(message).length + SEAL_OVERHEAD,
    `${ct.length} bytes for a ${sodium.from_string(message).length}-byte message`,
  );

  const opened = sodium.crypto_box_seal_open(ct, kp.publicKey, kp.privateKey);
  push('round-trips back to the original', sodium.to_string(opened) === message);

  // The property the whole product rests on.
  push(
    'ciphertext contains none of the plaintext',
    !ctB64.includes('umbra') && !ctB64.includes('123456789'),
    'searched the wire bytes for the amount and the marker',
  );

  return { ok: checks.every((c) => c.ok), checks };
}

/** Used by the "What observers see" panel to prove an amount never appears on the wire. */
export function grepForPlaintext(rawBody: string, needle: string): boolean {
  return needle.length > 0 && rawBody.includes(needle);
}
