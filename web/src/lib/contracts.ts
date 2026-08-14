import { erc20Abi, type Address } from 'viem';
import { flareTestnet } from 'viem/chains';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';

import { umbraVaultAbi } from './abi/umbraVault';
import { teeRegistryAbi } from './abi/teeRegistry';
import { env } from './env';

export const EXPLORER = 'https://coston2-explorer.flare.network';

/**
 * viem ships Coston2 as `flareTestnet` at chain id 114 with the correct explorer, so there is no
 * need to hand-roll a defineChain. We only override the transport so the RPC comes from env.
 */
export const coston2 = flareTestnet;

/**
 * createConfig rather than RainbowKit's getDefaultConfig, which requires a WalletConnect
 * projectId. Two MetaMask profiles is exactly what the demo needs, and this also means RainbowKit
 * can be removed later without touching the config.
 */
export const wagmiConfig = createConfig({
  chains: [coston2],
  connectors: [injected()],
  transports: { [coston2.id]: http(env.RPC_URL) },
  ssr: true,
});

export const vault = { address: env.VAULT_ADDRESS, abi: umbraVaultAbi } as const;
export const registry = { address: env.REGISTRY_ADDRESS, abi: teeRegistryAbi } as const;
export const token = (address: Address) => ({ address, abi: erc20Abi }) as const;

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;
