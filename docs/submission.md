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

On a public DEX a large order is visible the moment it hits the mempool, so the whale gets front-run
and fills worse than the market would otherwise give. That is the familiar half of the problem, and
we'd rather state it accurately than dramatically: on-chain sandwich attacks ran roughly 95,000
incidents and ~$60M of losses over the year to Oct 2025, and are *shrinking* year over year. MEV is
a size-dependent tax, not an emergency — it bites hard at $50k–$200k order sizes and barely at all
below.

**The other half is the one nobody builds for, and it is much larger.** Dark pools already solve
pre-trade visibility in TradFi. What they have never solved is that *you have to trust the operator*,
and the historical record on that is damning. Between 2011 and 2018 the SEC sanctioned essentially
every major US dark pool operator for misrepresenting how their own venue worked — roughly **$300M
in penalties**:

| Operator | Penalty | What they actually did |
|---|---|---|
| ITG / POSIT (2015) | $20.3M, **admitted** | Ran a secret prop desk, "Project Omega," that traded 262M shares against its own subscribers |
| Barclays LX (2016) | $70M, **admitted** | Deleted the most predatory trader from the venue-composition charts it showed clients |
| Credit Suisse (2016) | $84.3M | Largest ATS penalty ever levied |
| Merrill Lynch (2018) | $42M SEC + $42M NYAG, **admitted** | Fabricated the execution venue on 15M+ child orders |
| Deutsche Bank (2016) | $37M+ | Its order-ranking model sat silently frozen by a *bug* for two years |
| UBS (2015) · Citi (2018) · Pipeline (2011) | $14.4M · $12.9M · $1.2M | Undisclosed HFT-only order types; routing to an excluded venue; ~80% of flow filled by a secret affiliate |

**The decisive detail: every one of these took two to six years to surface and required SEC subpoena
power. No customer ever detected any of it from their own fill data.** The charges were §17(a)(2)
misrepresentation and Rule 301(b)(2) — "you did not operate the way you said you did." The entire
regulatory apparatus for dark pools is *retrospective punishment for claims that were never
verifiable in the first place.* Europe hit the same wall from the opposite side and **repealed**
RTS 27/28 in 2024, on the finding that the mandated execution-quality reports were "hardly read" and
"do not enable meaningful comparisons."

Umbra's claim is that confidential compute plus an on-chain oracle turns two of those promises into
things a machine checks **before** the trade rather than a regulator litigates years after it:

- *"We cleared you at the fair mid."* `UmbraVault.settleBatch` re-reads FTSOv2 itself and reverts
  past 50 bps. The Credit Suisse and Barclays conduct isn't punished here — it simply fails to
  settle.
- *"Only the code we described ever saw your order."* The image digest is asserted by the
  Confidential Space launcher, not by us, and anchored on-chain. ITG's Project Omega is
  *unrepresentable*: there is no prop desk inside the enclave, and the running image is a public
  hash anyone can diff against the source.

**And a sealed-bid auction cannot be built with cryptography alone — somebody has to see the bids in
order to match them.** That is why confidential compute here is not a feature bolted onto a trading
app; it *is* the product. Umbra makes that somebody a TEE whose code is attested, whose key never
leaves the enclave, and whose pricing is checked by a contract it does not control.

## Demo

- **Live app:** https://umbra-beta.vercel.app — the Verify page, Dark Book and settled batches are
  read-only and work in any browser. **Placing an order needs a desktop browser with MetaMask** on
  Coston2 (chain 114); the wallet config uses the injected connector only, with no WalletConnect QR
  path, so mobile is read-only.
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

**The operator cannot settle off-market**, because the band is enforced on-chain by a contract they
do not control at settlement time. That one is unconditional — it holds even against an operator who
replaces the entire engine.

**Orders are sealed to an X25519 key that only exists inside the enclave**, so a passive operator
cannot read them. Stated precisely, because this is weaker than it first looks: the attestation
nonce commits to the enclave's *signing* key, not to its *encryption* key, so an operator willing to
serve a substituted public key could read orders. See Known limits — we would rather state the
boundary than let a judge find it.

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
  batch auction with pro-rata allocation, and settlement submission. **67 unit tests**, including a
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
- **The order-encryption key is not covered by the attestation, so "the operator cannot read
  orders" holds against a passive operator, not an actively malicious one.** The `eat_nonce` commits
  to the enclave's *Ethereum* signing address and the vault, which is what makes settlement
  trustworthy. It does not commit to the enclave's X25519 *order-encryption* key. The browser seals
  to whatever public key `/info` returns, and that response arrives over plain HTTP from a raw IP —
  so an operator willing to tamper could serve their own X25519 key, decrypt everything, and the
  attestation and the on-chain anchor would both still verify, because neither ever sees that key.
  Closing this properly means adding the X25519 key to the nonce preimage, which changes the enclave
  image and forces a re-anchor; it is the first thing we would fix past the deadline. Until then the
  honest claim is narrower than "cannot": the operator cannot *quietly* read orders, because serving
  a substituted key is an active, detectable act rather than a passive capability.
- **The frontend is inside the trust boundary, whatever the attestation says.** Order plaintext
  exists in the browser before it is sealed, so whoever serves the JavaScript can read it. No
  attestation claim, on-chain anchor, or Verify-page check can see that. The one verification path
  that does not depend on us is the shell command in this document: fetch the raw token and keccak it
  yourself, then compare against `TeeRegistry.attestationHash()` on-chain.
- **Escrow is a free option.** Because withdrawals are deliberately ungated, a trader can deposit,
  submit a sealed order, watch FTSOv2 move, and withdraw before the batch settles — at zero cost.
  The severe version of this is already handled: the engine re-reads live balances at a pinned block
  before signing and rebuilds the batch without the defector, so one person walking away cannot
  destroy everyone else's fill. The costless optionality itself remains. The fix is to lock escrow
  at submission until the batch resolves, which is a vault change we did not want to make while the
  attestation nonce is bound to the current vault address.
- **Pro-rata allocation leaks contra-side depth.** Our clearing price comes from the oracle rather
  than from supply and demand, so a probe order's fill size is an exact readout of how much opposing
  interest is resting. It is cheap and repeatable. The standard venue answer is a minimum acceptable
  quantity (MAQ) per order, which we would add engine-side next.

## Why not native FCC, and the migration plan

Umbra runs on **Google Confidential Space** — the same substrate Flare's own Confidential Compute
extensions run on — on **Intel TDX** rather than the AMD SEV of Flare's published examples.

To be accurate about why, since it would be easy to overstate the constraint: FCC extension
registration **is** open on Coston2 today. The scaffold walks you through `pre-build.sh` →
`start-services.sh --chain coston2` → `post-build.sh`, and that last step registers your own TEE
machine. This was a judgment call, not a capability gap. We chose not to depend on FCC for this
build because the Dev Hub states FCC "is in the final stages of development and is not yet a fully
public production system," indexer credentials are request-gated behind a support request, and the
demo has to survive a week of unattended judging.

The migration is a packaging change rather than a redesign: `settleBatch` becomes an
`InstructionSender` op, the enclave key becomes an FCC-managed key, and the attested-signer check
in `TeeRegistry` becomes a `TeeMachineRegistry` lookup. The enclave already produces an attestation
token and anchors its hash on-chain, so what changes is where the token comes from — not the
architecture around it.

## Roadmap

- **Native FCC extension** — register on Coston2 against the `fce-extension-scaffold`, then Songbird
  → mainnet, per the migration path above.
- **Remove the signer-rotation trust assumption** via FDC `Web2Json`: the enclave publishes
  `{hwmodel, secboot, image_digest, signer}` over HTTPS, FDC attests it, and
  `TeeRegistry.registerFromFdcProof` accepts a signer *only* if the image digest matches a pinned
  value. The signer then stops being owner-asserted and becomes asserted by Flare's own data
  connector. Alternatively, on-chain DCAP verification of the TDX quote itself — Automata Network
  ships this in production for Scroll, Taiko and Flashbots.
- **FDC `XRPPayment` for XRPL-side funding** — send XRP with a destination tag, FDC proves it in
  ~3 confirmations (≈12s), the vault credits the dark-pool balance. This mirrors how FAssets v1.3
  itself does destination-tag routing.
- **Publish Umbra's executed VWAP as an FTSOv2 custom feed** (`IICustomFeed`, feed ID prefix `0x21`)
  so any Flare contract can read dark-pool execution prices. Regulated dark pools are required to
  print post-trade to the consolidated tape; hiding orders pre-trade and publishing prices
  post-trade is exactly the shape of a compliant venue.
- **Escrow locking and minimum-fill quantities** — see Known limits.
- Multi-pair support; a commit–reveal fallback mode for when no TEE is available; permissioned
  institutional pools.

## Traction

Built solo inside the hackathon window, with a live app and a live enclave rather than a prototype.

On market fit rather than usage numbers: dark pools are a proven multi-trillion-dollar TradFi
primitive, and the XRPfi demand this settles into is real and current — ~155M FXRP minted in seven
months with **95.6% of it locked in DeFi**, against Flare's stated goal of moving 5 billion XRP into
DeFi. The novel part is that Flare makes the fair price and the attestation verifiable on-chain,
which is exactly what a dark pool has historically had to be trusted about.

On the architecture choice: Stellar published a comparison of dark pool designs across MPC, FHE and
TEEs and found FHE needed **204 minutes** to match a 10×10 book while TEEs ran at near-native speed,
concluding TEEs are "the pragmatic choice for production systems today." We reached the same
conclusion independently, and the on-chain price band is the additional safeguard that a TEE-based
design is supposed to carry.
