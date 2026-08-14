# Umbra — Confidential Dark Pool for FXRP

**A confidential settlement layer for XRPfi: sealed FXRP orders are matched inside a TEE at the
FTSOv2 fair price and settled on Flare — so large trades can't be front-run.**

Built for the Flare Summer Signal hackathon. Coston2 testnet only.

**Live app:** https://umbra-beta.vercel.app

## The problem

On a public DEX, a large order is visible to everyone the moment it hits the mempool, so the whale
gets front-run and fills worse than the market would otherwise give.

Dark pools already solve that half in TradFi. **What they have never solved is that you have to
trust the operator** — and between 2011 and 2018 the SEC sanctioned essentially every major US dark
pool operator for lying about how their own venue worked, roughly **$300M in penalties**. ITG ran a
secret prop desk that traded 262M shares against its own subscribers ($20.3M, admitted). Barclays
deleted the most predatory trader from the venue-composition charts it showed clients ($70M,
admitted). Merrill fabricated the execution venue on 15M+ child orders ($42M + $42M, admitted).
Credit Suisse paid $84.3M.

Every one of those took two to six years to surface and required subpoena power. **No customer ever
caught any of it from their own fill data.** The charges were, in substance, *"you did not operate
the way you said you did"* — which means the entire regulatory apparatus for dark pools is
retrospective punishment for claims that were never verifiable in the first place. Europe hit the
same wall and repealed its execution-quality reporting rules (RTS 27/28) in 2024, having found the
reports were "hardly read."

Umbra's bet is that a TEE plus an on-chain oracle turns two of those promises into things a machine
checks *before* the trade:

- *"We cleared you at the fair mid"* — `UmbraVault.settleBatch` re-reads FTSOv2 itself and reverts
  past 50 bps. That conduct doesn't get punished here; it fails to settle.
- *"Only the code we described saw your order"* — the image digest is asserted by the Confidential
  Space launcher, not by us, and anchored on-chain. A hidden prop desk is unrepresentable.

And a sealed-bid auction can't be built with cryptography alone — **somebody has to see the bids in
order to match them**. Umbra makes that somebody a Trusted Execution Environment whose code is
attested, whose key never leaves the enclave, and whose pricing is checked by a contract it does not
control. Confidential compute isn't a bolt-on here; it is the product.

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
| TEE signer (attested) | [`0x1d9C5a793C501B5781bA8c0a58C7F983593d1913`](https://coston2-explorer.flare.network/address/0x1d9C5a793C501B5781bA8c0a58C7F983593d1913) |

**The TEE is real.** The engine runs in a Google Confidential Space VM on **Intel TDX**, and its
settlement key was generated inside the enclave. The attestation is a Google-signed RS256 vTPM
token (`hwmodel: GCP_INTEL_TDX`, `secboot: true`), whose nonce commits to exactly this enclave key
and this vault, and whose image digest is asserted by the launcher rather than by our own code.
Live engine: `http://136.112.118.220:8080` · sample settlement signed inside the enclave by the
**currently registered** signer:
[`0x869647b1…`](https://coston2-explorer.flare.network/tx/0x869647b14305e075da9d38a337aeceaaf4716b5f7cd241be835b92a766dc146e)
(earlier settlements in [docs/addresses.md](docs/addresses.md) were signed by prior enclave keys —
every boot mints a fresh one, and each rotation is a public on-chain event.)

**The attested image is public, so you can check the digest against this source.** The registry
allows anonymous reads — no credentials, no Google account:

```bash
curl -s http://136.112.118.220:8080/attestation | jq -r .image_digest   # what Google says is running
crane export us-central1-docker.pkg.dev/umbra-tee-08132358/umbra/umbra-engine@sha256:6538c994… - \
  | tar -xO app/matching.py | diff - engine/app/matching.py             # and what is inside it
```

Google asserts *which* image runs; the public registry lets you see what is *in* that image. The
honest remaining gap is that the build is not yet bit-for-bit reproducible, so you are comparing
image contents rather than rebuilding the digest yourself.

Every address was verified on-chain rather than copied from documentation; the derivation and the
re-runnable verification command for each are in [docs/addresses.md](docs/addresses.md).

## Architecture

```
  browser                        enclave (Intel TDX)              Flare Coston2
 ---------                      ---------------------            ---------------
  sign EIP-712 order
  crypto_box_seal  ──────────▶  decrypt + verify signature
                                verify nonce, deadline, escrow
                                read FTSOv2 XRP/USD  ◀──────────  FtsoV2
                                clear all crossers at the mid
                                sign Batch with enclave key
                                settleBatch  ─────────────────▶   UmbraVault
                                                                  · recover signer
                                                                  · == TeeRegistry.teeSigner()
                                                                  · re-read FTSOv2 itself
                                                                  · require |price-oracle| <= 50bps
                                                                  · swap balances atomically
```

Only ciphertext ever leaves the browser. The vault never trusts the enclave's price — it reads
FTSOv2 itself and refuses anything outside the band.

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

**The operator cannot settle off-market** — the price band is enforced on-chain by a contract the
operator does not control at settlement time. That guarantee is unconditional: it holds even if the
entire engine is replaced with malicious code.

**Orders are sealed to a key that only exists inside the enclave**, so a passive operator cannot read
them. Being precise about the limit of that, because it is weaker than it sounds: the attestation
nonce commits to the enclave's *signing* key, not to its *order-encryption* key, and the browser
seals to whatever key `/info` returns. An operator willing to serve a substituted public key could
therefore read orders. That is an active, detectable act rather than a passive capability — but
"cannot read orders" would be an overstatement, so we do not make it. Binding the encryption key into
the attestation nonce is the first thing we would fix past the deadline.

Being precise about what else the operator *can* do, since this is where hand-waving usually happens:
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
- **The public Dark Book leaks more than the blobs suggest.** Three things, stated plainly because
  "even we can't read these" is true of the *contents* and not of everything:
  - The buy/sell counts are published, so with a single order resting the count discloses its side —
    and since the counts update as orders arrive, anyone polling can attribute a side to each new
    order rather than just to a lone one.
  - Each blob's exact byte length is published. `crypto_box_seal` adds a fixed 48-byte overhead to
    the plaintext, and the plaintext is JSON carrying the amount as decimal digits, so the length
    discloses the order's order of magnitude. Padding the plaintext to a fixed width before sealing
    closes this and is the obvious next change.
  - The contents stay genuinely opaque: no blob carries a side annotation, and no amount, price or
    signature is recoverable from it.
- **The engine logs which address submitted which order id**, and Confidential Space redirects
  container logs to Cloud Logging, so the operator learns *who* traded and *when* in real time — but
  not *what*. Order contents never enter a log line; the logger enforces a field allowlist and every
  value-bearing field on the order type is `repr=False`, both covered by tests.
- The web app proxies the engine through its own server so the browser never needs CORS and the
  operator token never reaches the client. The demo's "Trigger batch" button is public, which means
  **anyone with the URL can trigger a batch** — the operator token protects the engine from direct
  callers, not from anyone who finds the app. The consequence is sharper than "an empty batch": since
  the clearing price is the oracle mid, whoever chooses *when* a batch runs chooses which oracle tick
  resting orders execute against. There is a 20-second server-side cooldown on the trigger, which is
  a brake on casual abuse rather than a security boundary (serverless instances do not share it).
  Gating it properly means an auth story the build guide scopes out.
- **The order-encryption key is not covered by the attestation.** The nonce commits to the enclave's
  signing key and the vault, not to its X25519 encryption key, and the browser seals to whatever key
  `/info` returns over plain HTTP. An operator willing to substitute that key could read orders —
  an active and detectable act, but a real gap. See Trust model.
- **The browser is inside the trust boundary.** Order plaintext exists client-side before it is
  sealed, so whoever serves the JavaScript can read it, and no attestation or on-chain check can see
  that. The verification that does *not* depend on us is fetching the raw token and keccak-ing it
  yourself against `TeeRegistry.attestationHash()`.
- **The attestation token is always lapsed, by design.** It is captured once at enclave boot and
  never refreshed, because the registry anchors the keccak of that exact string — refreshing would
  break the anchor. It attests a moment in time; the on-chain anchor is what carries it forward.
- **Interactive trading needs a desktop browser with an injected wallet** (MetaMask or similar). The
  wallet config uses only the injected connector, with no WalletConnect QR path, so on mobile you can
  read everything — Verify, the Dark Book, settlements — but cannot deposit, order or withdraw.
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

# Solidity dependencies come from npm (the Flare periphery is published there), and
# contracts/node_modules is gitignored — so install them before the first build.
cd contracts && npm install
forge test                    # 239 tests across 6/6, 18/6 and 6/18 decimal pairings
set -a; . ../.env; set +a
forge script script/Deploy.s.sol:Deploy --rpc-url $COSTON2_RPC_URL --broadcast --slow

cd ../engine && uv sync && uv run uvicorn app.main:app --port 8080   # or point at the live enclave
```

### Prove it end to end

`scripts/e2e_demo.py` runs the entire flow against real Coston2 and asserts every step — deposits,
two sealed orders, a batch, the on-chain balance deltas, replay protection, and an ungated
withdrawal. It defaults to `ENGINE_URL` from `.env`, so it follows wherever the enclave lives.

```bash
uv run --project engine --with requests python scripts/e2e_demo.py
uv run --project engine --with requests python scripts/e2e_demo.py --reverse   # flip direction
```

Each settled batch rotates Alice's and Bob's inventory, so `--reverse` lets it run repeatedly
without returning to the faucet. Every assertion is an equality against on-chain state read
independently of the engine — the engine is never trusted about anything the chain can be asked
directly.

```
1 — PREFLIGHT      enclave mode: REAL TEE (Intel TDX)   attestation: ok
                   hwmodel=GCP_INTEL_TDX  secboot=True  dbgstat=disabled-since-boot
5 — ON-CHAIN       cleared $1.010878 vs oracle $1.010878  (0 bps of 50)
6 — REPLAY         re-submitting a settled batch reverts with BadBatchId
all 41 checks passed
```

## Roadmap

- Migrate from Google Confidential Space to Flare's native Confidential Compute. Extension
  registration is already open on Coston2 — `pre-build.sh` → `start-services.sh --chain coston2` →
  `post-build.sh` registers your own extension *and your own TEE machine*. We did not depend on it
  for this build because the Dev Hub describes FCC as "not yet a fully public production system" and
  indexer credentials are request-gated, and the demo has to run unattended through judging week.
  The migration is a packaging change rather than a redesign: `settleBatch` becomes an
  `InstructionSender` op, the enclave key becomes an FCC-managed key, and the attested-signer check
  becomes a `TeeMachineRegistry` lookup.
- Full on-chain verification of the attestation JWT, which removes the signer-rotation trust
  assumption described above.
- Multi-pair support, a commit–reveal fallback mode for when no TEE is available, and permissioned
  institutional pools.
- FDC proofs of XRPL-side funding.

## Built during the hackathon

Everything in this repository was written from scratch during the event — first commit
**2026-08-13 21:36 UTC**, on an empty repository. Contracts, the TEE engine, the attestation
plumbing, the frontend and the test suites are all new work. 239 Foundry tests, 71 engine unit
tests, and a 41-assertion end-to-end rehearsal against live Coston2.

## More

- [docs/submission.md](docs/submission.md) — the full write-up
- [docs/addresses.md](docs/addresses.md) — every address with the command that verified it
- [docs/video-shot-list.md](docs/video-shot-list.md) — demo walkthrough
- [PROGRESS.md](PROGRESS.md) — the build log, including every decision and why

## License

MIT — see [LICENSE](LICENSE).
