# Umbra — DoraHacks submission

Paste-ready answers for each field. Every address, hash and link below is live on Coston2.

---

## Project name

**Umbra — Confidential Dark Pool for FXRP**

## Bounty

**Bounty 2 — Confidential Compute (primary)** · Bounty 1 — Interoperable Assets (secondary, since
settlement is in FXRP)

## Short description

A confidential settlement layer for XRPfi: sealed FXRP orders are matched inside a TEE at the
FTSOv2 fair price and settled on Flare — so large trades can't be front-run.

## Target user

XRP whales, OTC desks and XRPfi funds — anyone whose order is large enough that showing it to the
market costs them money.

## The problem, and why privacy is load-bearing

On a public DEX a large order is visible the moment it hits the mempool. The whale gets front-run,
sandwiched, and fills worse than the market would otherwise give.

**A sealed-bid auction cannot be built with cryptography alone — somebody has to see the bids in
order to match them.** That is why confidential compute here is not a feature bolted onto a
trading app; it *is* the product. Umbra makes that somebody a TEE whose code is attested and whose
key never leaves the enclave.

## Demo

- **Live app:** https://umbra-5a7rt8i83-oojaes-projects.vercel.app
- **Video:** _(link to be added)_
- **Run it yourself:**
  ```bash
  git clone <repo> && cd umbra
  cp .env.example .env            # add three throwaway Coston2 keys
  # fund them at https://faucet.flare.network/coston2 (C2FLR + FXRP + USDT0)
  uv run --project engine --with requests python scripts/e2e_demo.py
  ```
  The script asserts the whole flow against live Coston2 — deposits, two sealed orders, a batch,
  exact balance deltas, replay protection, and an ungated withdrawal. It prints the settlement tx.

## Repo

Public GitHub, MIT licensed, clean commit history starting from an empty repository.

## How it uses Flare

Three native components, with privacy load-bearing rather than cosmetic:

- **Confidential Space TEE + on-chain attestation anchoring.** The enclave's signer address and the
  keccak of its attestation token are anchored in `TeeRegistry` on Flare, so the binding between
  the running code and the settling key is publicly auditable on-chain.
- **FTSOv2 as both the clearing price and the on-chain guardrail.** The enclave clears every batch
  at the block-latency XRP/USD mid, and `UmbraVault.settleBatch` **independently re-reads the same
  feed** and reverts if the clearing price sits more than 50 bps away. A malicious or buggy engine
  cannot settle off-market. The contract normalizes the feed's `int8 decimals` generically rather
  than assuming 6, because feed decimals genuinely differ (XRP/USD reports 6, FLR/USD reports 8).
- **FXRP as the settlement asset** — the real Coston2 FAsset from the official faucet, not a mock.

## Trust model

Users trust Intel TDX and Google Confidential Space to run only the attested image, FTSOv2 for
fair pricing, and the vault for custody.

**The operator cannot read orders** — they are sealed to an X25519 key that only exists inside the
enclave — **and cannot settle off-market**, because the band is enforced on-chain by a contract
they do not control at settlement time.

Being precise about what the operator *can* do, since this is where write-ups usually hand-wave:
the registry owner can rotate the TEE signer, because enclaves are ephemeral and every boot mints a
fresh key. That power is real. What bounds it is that **every rotation emits a public event**, so a
swap is permanently visible on-chain, and the price band still applies to whatever key is
registered. Full on-chain verification of the attestation JWT would remove the power entirely; it
is on the roadmap, not in this build.

**Custody is never gated.** Withdrawals depend on nothing but your own balance — not the TEE, not
the operator, not a pause switch, because there isn't one. A liveness failure can never become a
fund-loss failure. This is proven three ways in the test suite (withdraw works with no signer
registered, with a bogus signer registered, and while the oracle reverts) and again on real chain
in every end-to-end run.

## What is genuinely new

Everything. First commit **2026-08-13 21:36 UTC** on an empty repository; every later commit is
inside the hackathon window.

- `UmbraVault.sol` + `TeeRegistry.sol` — escrow, EIP-712 batch settlement, the FTSOv2 band check,
  batch-id replay protection, ungated withdrawals. **239 Foundry tests** across three decimal
  pairings.
- The TEE matching engine — sealed-box decryption, in-enclave EIP-712 verification, a uniform-price
  batch auction with pro-rata allocation, and settlement submission. **54 unit tests**, including a
  cross-language EIP-712 fixture that locks Solidity and Python to a byte-identical signature.
- Confidential Space deployment, attestation fetching, and on-chain anchoring.
- The Next.js frontend, including a Verify page that recomputes the attestation hash in the browser
  rather than trusting the engine's own claim.
- **41-assertion end-to-end rehearsal** run twice clean against live Coston2.

## Deployment details — Coston2 (chain 114)

| Thing | Address / value |
|---|---|
| UmbraVault | [`0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10`](https://coston2-explorer.flare.network/address/0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10) (source-verified) |
| TeeRegistry | [`0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4`](https://coston2-explorer.flare.network/address/0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4) (source-verified) |
| FXRP (base) | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| USDT0 (quote) | [`0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`](https://coston2-explorer.flare.network/address/0xC1A5B41512496B80903D1f32d6dEa3a73212E71F) |
| TEE signer (attested) | [`0xcee433588CDB86Ff462095569A9E8D2625beA4DA`](https://coston2-explorer.flare.network/address/0xcee433588CDB86Ff462095569A9E8D2625beA4DA) |
| Anchored attestation hash | `0xa8c32fdd5fd02334d3803fcb3f5e2fbf68747072e6be24c1c1f55d3985eb2864` |
| Live engine | `http://136.112.118.220:8080` (Intel TDX Confidential Space VM) |
| **Sample settlement tx** | [`0xd2e98820…`](https://coston2-explorer.flare.network/tx/0xd2e988201a9ad172750be4d88fd3cb04b2bcb9bb38399d53851ac3e3ae3a12a5) |

That settlement cleared at **$1.010878** against an on-chain FTSOv2 read of **$1.010878** — 0 bps
of the 50 bps band, verified by the vault itself before it moved a single balance.

### The attestation is real, and checkable

The engine runs in a Confidential Space VM on **Intel TDX**. Its token is Google-signed:

| Claim | Value |
|---|---|
| `alg` | `RS256` |
| `iss` | `https://confidentialcomputing.googleapis.com` |
| `hwmodel` | **`GCP_INTEL_TDX`** |
| `swname` | `CONFIDENTIAL_SPACE` |
| `secboot` | `true` |
| `dbgstat` | `disabled-since-boot` |

Two bindings make it meaningful rather than decorative. The `eat_nonce` equals
`keccak256(bytes20(teeAddress) ‖ bytes20(vaultAddress))`, so the token commits to *this* enclave key
settling to *this* vault. And `image_digest` is asserted by the launcher, not by our own code, so it
says which code is actually running.

Verify the anchor yourself, independently of anything we claim:

```bash
curl -s http://136.112.118.220:8080/attestation | jq -r .raw | tr -d '\n' | cast keccak
cast call 0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4 "attestationHash()(bytes32)" \
  --rpc-url https://coston2-api.flare.network/ext/C/rpc
# both -> 0xa8c32fdd5fd02334d3803fcb3f5e2fbf68747072e6be24c1c1f55d3985eb2864
```

## How this differs from adjacent work

There is an existing "private conditional orders" project in this space where a single trigger is
encrypted to a TEE. Umbra is a different primitive: **batch sealed-bid matching with a uniform
clearing price, on-chain FXRP settlement, and a verifiable attestation anchored on Flare** — not
single encrypted triggers. The privacy is what makes the auction possible at all, and the
settlement is real on-chain FAsset movement, not a signal.

## Known limits, stated rather than hidden

- Single pair (FXRP/USDT0), single batch auction, in-memory order book — an engine restart loses
  pending orders. Escrowed funds are unaffected and remain withdrawable.
- Clearing is XRP/**USD** while settlement is in USDT0, so the design assumes USDT0 ≈ $1.
- The operator can censor by not running a batch. That is a liveness limitation, not a safety one,
  precisely because withdrawals are ungated.
- The public Dark Book returns order *counts* alongside the ciphertexts, so with a single order in
  the book the count discloses that order's side. The blobs themselves stay opaque.
- The attestation's RS256 signature is not verified in-browser; the on-chain anchor match is what we
  verify. JWKS verification is roadmap.
- No MEV protection between the vault and external DEXes — Umbra protects the matching process, not
  what you do with the proceeds.

## The honest gap, and the migration plan

Native Flare Confidential Compute extensions are **not outsider-deployable today** — TEE nodes are
Foundation-operated and extensions need code-hash whitelisting. So Umbra runs on **Google
Confidential Space**, the same TEE substrate FCC builds on, with the attestation anchored on Flare.

That is an interim, and the migration is concrete: the enclave already produces an attestation
token and anchors its hash on-chain, so moving to a native FCC extension on Songbird changes where
the token comes from, not the architecture around it.

## Roadmap

- Native FCC extension on Songbird once registration opens to outside developers → mainnet.
- Full on-chain verification of the attestation JWT, which removes the signer-rotation trust
  assumption described above.
- Multi-pair support; a commit–reveal fallback mode for when no TEE is available.
- Permissioned institutional pools.
- FDC proofs of XRPL-side funding.

## Traction

Built solo inside the hackathon window. Dark pools are a proven multi-trillion-dollar TradFi
primitive; the novel part here is that Flare makes the fair price and the attestation verifiable
on-chain, which is what a dark pool has historically had to be trusted about.
