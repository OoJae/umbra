# Umbra — Confidential Dark Pool for FXRP

**A confidential settlement layer for XRPfi: sealed FXRP orders are matched inside a TEE at the
FTSOv2 fair price and settled on Flare — so large trades can't be front-run.**

Built for the Flare Summer Signal hackathon. Coston2 testnet only.

## The problem

On a public DEX, a large order is visible to everyone the moment it hits the mempool. The whale
gets front-run, sandwiched, and fills at a worse price than the market would otherwise give. Every
existing "private trading" workaround either trusts an operator not to peek, or leaks the order
through the settlement path anyway.

A sealed-bid auction can't be built with cryptography alone — **somebody has to see the bids in
order to match them**. Umbra makes that somebody a Trusted Execution Environment whose code is
attested and whose key never leaves the enclave. Confidential compute isn't a bolt-on here; it is
the product.

## How it works

1. **Escrow.** Traders `deposit` FXRP (sellers) or USDT0 (buyers) into `UmbraVault`.
2. **Seal.** The browser builds an EIP-712 `Order`, the trader signs it, and the browser encrypts it
   with libsodium `crypto_box_seal` to an X25519 public key that exists only inside the enclave.
   Only ciphertext ever leaves the browser — the operator, the mempool, and other traders see
   nothing but opaque blobs.
3. **Match.** At batch time the TEE decrypts the orders, verifies each trader's signature (the TEE,
   not the API, is the authentication boundary), reads the FTSOv2 XRP/USD feed, and clears every
   crossing order at that single uniform mid — pro-rata on the heavy side.
4. **Settle.** The TEE signs the resulting `Batch` with a key generated at boot and submits one
   `settleBatch` transaction.
5. **Verify.** The vault independently re-reads FTSOv2 on-chain and refuses the batch unless the
   signer is the currently attested TEE key **and** the clearing price sits within ±0.50% of a fresh
   oracle reading. A malicious or buggy engine cannot settle off-market.

## Deployed on Coston2 (chain 114)

| Contract | Address |
|---|---|
| UmbraVault | [`0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10`](https://coston2-explorer.flare.network/address/0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10) |
| TeeRegistry | [`0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4`](https://coston2-explorer.flare.network/address/0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4) |
| FXRP (base) | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| USDT0 (quote) | [`0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`](https://coston2-explorer.flare.network/address/0xC1A5B41512496B80903D1f32d6dEa3a73212E71F) |
| TEE signer (attested) | [`0x442CE96a506e8492aA63C728950A51d92e38303e`](https://coston2-explorer.flare.network/address/0x442CE96a506e8492aA63C728950A51d92e38303e) |

**The TEE is real.** The engine runs in a Google Confidential Space VM on **Intel TDX**, and its
settlement key was generated inside the enclave. The attestation is a Google-signed RS256 vTPM
token (`hwmodel: GCP_INTEL_TDX`, `secboot: true`), whose nonce commits to exactly this enclave key
and this vault, and whose image digest is asserted by the launcher rather than by our own code.
Live engine: `http://136.112.118.220:8080` · sample settlement signed inside the enclave:
[`0x9bde5c5a…`](https://coston2-explorer.flare.network/tx/0x9bde5c5a801c17d4d0268aa7deb967cbd8daff228cf1044d396cf5f1ee140aca)

Every address was verified on-chain rather than copied from documentation; the derivation and the
re-runnable verification command for each are in [docs/addresses.md](docs/addresses.md).

## How Umbra uses Flare

- **FTSOv2** is the pricing authority *and* the on-chain guardrail. The enclave clears at the
  block-latency XRP/USD mid, and `UmbraVault.settleBatch` independently re-reads the same feed
  through `ContractRegistry.getFtsoV2()` and enforces a band against it. The contract normalizes the
  feed's `int8 decimals` generically rather than assuming 6, because feed decimals genuinely differ
  (XRP/USD reports 6, FLR/USD reports 8) and can change.
- **FAssets / FXRP** is the settled asset — the real Coston2 FAsset, obtained from the official
  faucet, not a mock.
- **Flare as the attestation anchor.** `TeeRegistry` records the enclave's signer address, the
  attestation hash, and where the raw attestation can be fetched, so the binding between the running
  code and the settling key is publicly auditable on Flare itself.

## Trust model

Users trust Intel TDX / Google Confidential Space to run only the attested image, FTSOv2 for fair
pricing, and the vault contract for custody.

**The operator is not trusted to read orders** — they are sealed to a key that only exists inside the
enclave — **and cannot settle off-market**, because the price band is enforced on-chain by a contract
the operator does not control at settlement time.

Being precise about what the operator *can* do, since this is where hand-waving usually happens:
the registry owner can rotate the TEE signer, because enclaves are ephemeral and every boot mints a
fresh key. That power is real. What bounds it is that **every rotation emits a public event**, so a
swap is permanently visible on-chain, and the price band still applies to whatever key is registered.
The owner can also adjust the band, but never past a hard-coded 10% ceiling, and every change emits
an event. Full on-chain verification of the attestation JWT would remove the rotation power
entirely; it is on the roadmap, not in this build.

**Custody is never gated.** Withdrawals depend on nothing but your own balance — not the TEE, not the
operator, not a pause switch (there isn't one). A liveness failure can never become a fund-loss
failure. This is proven three ways in the test suite (withdraw works with no signer registered, with
a bogus signer registered, and while the oracle reverts) and once on real chain
([withdraw tx](https://coston2-explorer.flare.network/tx/0x6bf57ae79c58655e9ad242c6a4bab908840d286d479f3338b7d63892376fcdb5)).

## Known limits

- Single trading pair (FXRP/USDT0), single batch auction, in-memory order book — an engine restart
  loses pending orders. Escrowed funds are unaffected and remain withdrawable.
- The clearing price is XRP/**USD** from FTSOv2 while settlement is in USDT0, so the design assumes
  USDT0 ≈ $1. At hackathon fidelity that's fine, but it is an assumption, not a measurement.
- The operator can censor by simply not running a batch. That is a liveness limitation, not a safety
  one, precisely because withdrawals are ungated.
- No MEV protection between the vault and external DEXes — Umbra protects the matching process, not
  what you do with the proceeds afterwards.
- The public Dark Book returns order *counts* alongside the ciphertexts, so with a single order
  in the book the count discloses that order's side. The individual blobs stay opaque and carry no
  side annotation, but the aggregate is a real (small) leak rather than a perfect one.
- The Confidential Space VM currently runs the `confidential-space-debug` image family, so its
  attestation reports `dbgstat: enabled`.
- Rounding is floor, so a fill can differ by at most one quote unit (~$0.000001) from an exact
  computation. This shifts value between counterparties, never into or out of the vault: the same
  integer is debited from the buyer and credited to the seller.

## Repo layout

```
contracts/   Foundry — UmbraVault.sol, TeeRegistry.sol, tests, deploy script
engine/      Python 3.12 / FastAPI TEE matching engine
web/         Next.js 14 frontend
docs/        build guide, verified addresses, frozen EIP-712 spec
scripts/     end-to-end demo runner
```

## Running it

```bash
cp .env.example .env          # fill in three throwaway testnet keys
# fund them at https://faucet.flare.network/coston2 (C2FLR + FXRP + USDT0)

cd contracts && forge test    # 228 tests across 6/6, 18/6 and 6/18 decimal pairings
set -a; . ../.env; set +a
forge script script/Deploy.s.sol:Deploy --rpc-url $COSTON2_RPC_URL --broadcast --slow

cd ../engine && uv run uvicorn app.main:app --port 8080
```

## Roadmap

- Migrate from Google Confidential Space to Flare's native Confidential Compute on Songbird once
  extension registration opens to outside developers.
- Full on-chain verification of the attestation JWT, which removes the signer-rotation trust
  assumption described above.
- Multi-pair support, a commit–reveal fallback mode for when no TEE is available, and permissioned
  institutional pools.
- FDC proofs of XRPL-side funding.

## License

MIT
