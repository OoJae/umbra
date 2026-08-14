export const UNIT = 1_000_000n; // both tokens are 6-decimal, confirmed on-chain

export function fmt6(value: bigint | number | null | undefined, dp = 6): string {
  if (value === null || value === undefined) return '—';
  const v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(6, '0').slice(0, dp);
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${dp > 0 ? '.' + frac : ''}`;
}

export function price6(value: bigint | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const v = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  return `$${fmt6(v)}`;
}

export function parse6(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return 0n;
  const [whole = '0', frac = ''] = trimmed.split('.');
  return BigInt(whole || '0') * UNIT + BigInt((frac + '000000').slice(0, 6));
}

export function shortHex(value: string | null | undefined, lead = 6, tail = 4): string {
  if (!value) return '—';
  return value.length <= lead + tail + 2 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function ago(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return '—';
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

/** Deviation of a clearing price from the oracle, in basis points — computed client-side. */
export function deviationBps(clearing: bigint, oracle: bigint): bigint {
  if (oracle === 0n) return 0n;
  const diff = clearing >= oracle ? clearing - oracle : oracle - clearing;
  return (diff * 10_000n) / oracle;
}
