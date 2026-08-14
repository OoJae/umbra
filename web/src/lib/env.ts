/**
 * Public config. Vault and registry live here because wagmi hooks need a stable address on the
 * first render, before /info resolves; both are asserted equal to /info at boot so a redeploy
 * cannot silently desync the UI.
 *
 * Token addresses and decimals are deliberately NOT here — they come from /info, so there is one
 * source of truth.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is unset. Add it to web/.env.local (or Vercel project settings) and restart.`,
    );
  }
  return value;
}

export const env = {
  CHAIN_ID: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 114),
  RPC_URL:
    process.env.NEXT_PUBLIC_RPC_URL ?? 'https://coston2-api.flare.network/ext/C/rpc',
  VAULT_ADDRESS: required(
    'NEXT_PUBLIC_VAULT_ADDRESS',
    process.env.NEXT_PUBLIC_VAULT_ADDRESS,
  ) as `0x${string}`,
  REGISTRY_ADDRESS: required(
    'NEXT_PUBLIC_REGISTRY_ADDRESS',
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
  ) as `0x${string}`,
} as const;
