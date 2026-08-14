**Umbra is a confidential dark pool for FXRP on Flare.** Orders are sealed in your browser to a key
that exists only inside an Intel TDX enclave, matched at the FTSOv2 mid, and settled on-chain in a
single transaction — and the vault re-reads the oracle itself before it will accept the price.

**Live now on Coston2:** [umbra-beta.vercel.app](https://umbra-beta.vercel.app) ·
[the app](https://umbra-beta.vercel.app/app) ·
[verify the enclave](https://umbra-beta.vercel.app/verify) ·
[github.com/OoJae/umbra](https://github.com/OoJae/umbra)

---

## The problem is not privacy. It is trust.

Dark pools already solve pre-trade visibility. What they have never solved is that **you have to
trust the operator**, and the record on that is damning. Between 2011 and 2018 the SEC sanctioned
essentially every major US dark pool operator for misrepresenting how their own venue worked —
roughly **$300M in penalties**:

| Operator | Penalty | What they actually did |
|---|---|---|
| ITG / POSIT (2015) | $20.3M, **admitted** | Ran a secret prop desk that traded 262M shares against its own subscribers |
| Barclays LX (2016) | $70M, **admitted** | Deleted its most predatory trader from the venue-composition charts it showed clients |
| Credit Suisse (2016) | $84.3M | Largest ATS penalty ever levied |
| Merrill Lynch (2018) | $42M + $42M, **admitted** | Fabricated the execution venue on 15M+ child orders |
| Deutsche Bank (2016) | $37M+ | Its order-ranking model sat silently frozen by a *bug* for two years |

**Every one took two to six years to surface and required subpoena power. No customer ever detected
any of it from their own fill data.** The charge was always the same sentence: *you did not operate
the way you said you did.* The entire regulatory apparatus for dark pools is retrospective
punishment for claims that were never verifiable in the first place. Europe hit the same wall from
the other side and **repealed** RTS 27/28 in 2024, having found the reports were "hardly read".

Umbra moves the two claims worth lying about somewhere a machine checks them **before** the trade.

---

## What runs privately inside the TEE

Order matching itself. The enclave decrypts every sealed order, verifies each trader's EIP-712
signature (the enclave, not the API, is the authentication boundary), reads the FTSOv2 XRP/USD feed,
and clears every crossing order at that single uniform mid, pro-rata on the heavy side. Plaintext
orders exist nowhere else — only ciphertext leaves the browser, and the public Dark Book holds
nothing but opaque blobs.

## What is verified or consumed on-chain

Three things, all on Flare:

1. **The price.** `UmbraVault.settleBatch` independently re-reads FTSOv2 through
   `ContractRegistry.getFtsoV2()` and **reverts if the clearing price is more than 50 bps from its
   own reading**. It normalises the feed's `int8 decimals` generically rather than assuming 6,
   because feed decimals genuinely differ (XRP/USD reports 6, FLR/USD reports 8).
2. **The signer.** The batch signature must recover to the address currently registered in
   `TeeRegistry` — the key the attestation commits to.
3. **The attestation.** The keccak of the Google-signed vTPM token is anchored on-chain, so the
   binding between the running code and the settling key is publicly auditable on Flare itself.

Settlement moves **real FXRP** — the actual Coston2 FAsset, not a mock.

## What trust assumptions exist

Stated precisely, because this is where write-ups usually hand-wave:

- **Unconditional:** the operator **cannot settle you off-market**. The band is enforced by a
  contract they do not control at settlement time. It holds even if the entire engine is replaced
  with malicious code.
- **Unconditional:** **withdrawals are never gated** — not by the enclave, not by the operator, not
  by a pause switch, because there isn't one. A liveness failure can never become a fund-loss
  failure. Proven three ways in the test suite and again on real chain.
- **Bounded, not absolute:** orders are sealed to a key inside the enclave, so a *passive* operator
  cannot read them. But the attestation nonce commits to the enclave's **signing** key, not its
  X25519 **encryption** key — an operator willing to serve a substituted key could read orders. That
  is an active, detectable act rather than a passive capability, but "cannot read orders" would be
  an overstatement, so we do not make it. Binding the encryption key into the nonce is the first
  thing we would fix.
- The registry owner can rotate the TEE signer (enclaves are ephemeral; every boot mints a fresh
  key). Every rotation emits a public on-chain event, and the price band applies to whatever key is
  registered.

## Why confidential compute, not a normal contract

**A sealed-bid auction cannot be built with cryptography alone — somebody has to see the bids in
order to match them.** A smart contract cannot: its inputs are public by construction. This is not
confidential compute bolted onto a trading app; it is the only thing that makes the auction
possible. Umbra makes that somebody a TEE whose code is attested, whose key never leaves the
enclave, and whose pricing is checked by a contract it does not control.

---

## Review it without a wallet

Most of what makes Umbra checkable needs no wallet, no tokens and no setup:

| Page | What you can verify cold |
|---|---|
| [/verify](https://umbra-beta.vercel.app/verify) | The live attestation — `GCP_INTEL_TDX`, `secboot: true`, `dbgstat: disabled-since-boot` — and the on-chain anchor showing **✓ MATCH**, hashed in *your* browser rather than asked of the engine |
| [/app](https://umbra-beta.vercel.app/app) | The Dark Book: real sealed ciphertext, byte length and sha256. The only bytes the operator holds |
| [/settlement](https://umbra-beta.vercel.app/settlement) | Trigger a batch yourself — the button is deliberately public |
| [/proof](https://umbra-beta.vercel.app/proof) | Two commands that check us without trusting us |

The container registry is **public**, so you can pull the exact image the attestation names and diff
it against this source:

```bash
curl -s http://136.112.118.220:8080/attestation | jq -r .image_digest

crane export us-central1-docker.pkg.dev/umbra-tee-08132358/umbra/umbra-engine@sha256:6538c99447f578c28a5b583476c50609b3d4086df7dffb8b38a2dd74cef25f92 - \
  | tar -xO app/app/matching.py | diff - engine/app/matching.py
```

To place an order you need a desktop browser with MetaMask on Coston2 (chain 114) and testnet tokens
from [the Flare faucet](https://faucet.flare.network/coston2).

---

## Deployed on Coston2 (chain 114)

| | |
|---|---|
| UmbraVault | [`0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10`](https://coston2-explorer.flare.network/address/0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10) — source-verified |
| TeeRegistry | [`0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4`](https://coston2-explorer.flare.network/address/0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4) — source-verified |
| FXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) — the real FAsset |
| TEE signer | [`0x1d9C5a793C501B5781bA8c0a58C7F983593d1913`](https://coston2-explorer.flare.network/address/0x1d9C5a793C501B5781bA8c0a58C7F983593d1913) — generated inside the enclave |
| Sample settlement | [`0x869647b1…`](https://coston2-explorer.flare.network/tx/0x869647b14305e075da9d38a337aeceaaf4716b5f7cd241be835b92a766dc146e) — cleared $1.004315 against an on-chain oracle read of $1.004315, **0 bps of the 50 bps band** |

## What was built during the program

**Everything.** First commit 2026-08-13 20:36 UTC on an empty repository; every later commit is
inside the hackathon window.

`UmbraVault.sol` + `TeeRegistry.sol` (escrow, EIP-712 batch settlement, the FTSOv2 band check,
replay protection, ungated withdrawals) — **239 Foundry tests** across three decimal pairings. The
TEE matching engine (sealed-box decryption, in-enclave signature verification, uniform-price batch
auction, settlement submission) — **71 tests**, including a cross-language EIP-712 fixture that
locks Solidity and Python to a byte-identical signature. Confidential Space deployment and on-chain
attestation anchoring. The frontend, including a Verify page that recomputes the attestation hash in
the browser rather than trusting the engine's own claim.

Both suites run with no keys and no network: `cd contracts && npm install && forge test` ·
`cd engine && uv sync && uv run pytest -q`.

## Known limits, stated rather than hidden

Single pair, single batch auction, in-memory order book (an engine restart loses pending orders;
escrowed funds are unaffected and remain withdrawable). Clearing is XRP/**USD** while settlement is
USDT0, so the design assumes USDT0 ≈ $1. Escrow is a free option — withdrawals are deliberately
ungated, so a trader can deposit, submit, watch the oracle move and withdraw before settlement.
Pro-rata allocation leaks contra-side depth, because the price is oracle-pegged rather than
demand-driven. The Dark Book publishes each blob's byte length, which discloses an order's order of
magnitude. The browser holds plaintext before sealing, so whoever serves the JavaScript is inside
the trust boundary regardless of the attestation.

## Next

Bind the X25519 encryption key into the attestation nonce (removes the one bounded trust assumption
above). Move to a native Flare Confidential Compute extension — registration is already open on
Coston2; we kept our own registry for this build because FCC is documented as "not yet a fully
public production system" and the demo has to run unattended through judging. Remove the
signer-rotation assumption entirely via FDC `Web2Json`, or on-chain DCAP verification of the TDX
quote (Automata ship this in production for Scroll, Taiko and Flashbots). FDC `XRPPayment` for
XRPL-side funding. Publish Umbra's executed VWAP as an FTSOv2 custom feed — regulated dark pools are
required to print post-trade to a public tape, and hiding orders pre-trade while publishing prices
post-trade is exactly the shape of a compliant venue.
