# PROGRESS — Umbra

Running log. Updated after every work block. Deadline: **Aug 14 2026, 20:59**.

---

## Phase 0 (De-risk) — H2 gate: **PASSED except faucet funding** (operator action required)

### DONE

**Repo** — `git init -b main`; the three companion docs moved into `docs/`
(`claude-code-master-prompt (2).md` → `docs/claude-code-master-prompt.md`); root `CLAUDE.md`
written from master-prompt Section A; `.gitignore` covering `.env`, foundry `out/`/`cache/`/
`broadcast/`, `node_modules`, `__pycache__`, `.venv`, `web/.next`. Three clean conventional
commits, `.env` never entered git history.

**Wallets** — DEPLOYER / ALICE / BOB generated locally with `cast wallet new` straight into the
gitignored `.env`. Private keys were never printed to the terminal or written anywhere else.
`OPERATOR_TOKEN` seeded now (`openssl rand -hex 16`) so the engine's gated `/batch/run` needs no
later env change.

| Wallet | Address |
|---|---|
| DEPLOYER | `0x70a3D24068C064195a17D921712FdC747F2465f9` |
| ALICE (buyer) | `0x170E2Fd50CC9c4B5eEF7F2beAc2Dd3d06aC4bc09` |
| BOB (seller) | `0x016fb6f97db4e99611F789Ae172d9DCA9593BE0b` |

**Verification sweep** — full results with source links and re-runnable commands in
`docs/addresses.md`. Headlines:
- **Faucet dispenses all three tokens** (100 C2FLR + 10 USDT0 + 10 FXRP per address / 24h), so
  **pivot §9-A does not fire** — we trade the real FAssets FXRP, no mock substitution.
- **FXRP = `0x0b6A3645c240605887a5532109323A3E12273dc7`** (`FTestXRP`, 6 decimals), derived
  through the canonical registry → AssetManagerController → AssetManager → `fAsset()` chain
  rather than copied from a doc.
- **USDT0 = `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`** (`USD₮0`, 6 decimals). The explorer
  lists ~30 impostor "USDT0" tokens and the faucet holds its addresses server-side, so this was
  established behaviourally: the faucet's FXRP distributor's recipients each also received
  exactly 10.000000 of this contract — the advertised "10 FXRP + 10 USDT0" pair. Method written
  up in `docs/addresses.md`; it re-confirms itself the moment our wallets are funded.
- **All three FTSOv2 feeds read live.** XRP/USD = $1.010002 (decimals 6, ~2s fresh).
  USDT/USD = $0.999069 is an independent sanity check that the `(value, decimals)` decoding is
  right. Feed decimals differ per feed (XRP/USD 6, FLR/USD 8), so the vault must normalize
  generically.

**Scaffolds** — `contracts/` (Foundry + periphery probe, builds clean), `engine/` (uv/Python
3.12 FastAPI + Dockerfile, `/healthz` green in a container), `web/` (Next.js 14.2.35,
`pnpm build` clean).

### BLOCKERS — two operator actions

1. **Fund the three wallets** at <https://faucet.flare.network/coston2> — reCAPTCHA-gated, so it
   cannot be automated. Each address needs all three buttons pressed: *Request C2FLR*,
   *Request USDT0*, *Request FXRP*. All balances currently read 0; the H2 gate closes the moment
   they don't.
2. **GCP auth** — `gcloud` 580.0.0 is installed and on PATH, but has no credentials
   (`gcloud auth login` needs a browser) and no billing account attached. The 45-minute
   Confidential Space timebox has **not started** and will not start until the operator is
   available to click through auth + billing.

### DECISIONS

- **TEE mode** — operator chose to attempt the real GCP Confidential Space path with setup in
  Phase 0, under CLAUDE.md's hard 45-minute timebox, run as a concurrent track off the critical
  path. Simulated-first remains the build order regardless (build-guide §5.4). Current state:
  SDK installed, awaiting operator auth. On timebox expiry: fall back to "simulated primary,
  real TEE stretch" and record where it blocked.
- **Wallets** — generated locally rather than supplied by the operator; keys never displayed.
- **EIP-712 shape** — the build guide contradicts itself: §2 puts `vault`/`chainId` inside the
  Order struct, §6 puts them in the domain. Resolved to the **§6/domain** form and frozen in
  `docs/eip712.json`. Rationale: that is precisely what the domain separator is for (same replay
  protection), it is the native shape for viem `signTypedData` and `eth_account.sign_typed_data`
  so all three languages get parity for free, and duplicating the fields creates a second place
  for the digest to diverge.
- **solc `^0.8.20` → `0.8.25`** — deviation from CLAUDE.md and build-guide §3, forced by
  `@flarenetwork/flare-periphery-contracts@0.1.52`, whose `FtsoV2Interface.sol` declares
  `pragma solidity ^0.8.25`. CLAUDE.md's own precedence rule (live source wins, then record it)
  authorizes this; recorded in `docs/addresses.md`.
- **`evm_version = london`** in foundry.toml — Flare chains have historically rejected PUSH0
  (Shanghai) bytecode. Cheap insurance against a Phase-1 deploy revert; revisit only if a
  dependency needs a cancun-only opcode.
- **The vault's oracle read cannot be `view`.** The production `FtsoV2Interface.getFeedById` is
  `external payable`/non-view; only `TestFtsoV2Interface`'s is `view`. So the internal virtual
  oracle helper that `settleBatch` calls must be non-view (fine — `settleBatch` is
  state-changing), while any `view` price getter for the frontend must use the Test interface.
  Both flavours are proven to compile in `contracts/src/ProbeFtsoV2.sol`.
- **pnpm 11 build-script approval** — `web/pnpm-workspace.yaml` sets `allowBuilds: unrs-resolver`,
  without which every `pnpm install`/`pnpm build` aborts with `ERR_PNPM_IGNORED_BUILDS`.
  Node 26 × Next 14 was flagged as a risk and is now **retired**: `pnpm build` passes clean.

### Risks logged now, to be handled in the phase that owns them

- **Phase 1/2 — the uniform-price invariant is a rounding landmine.** The contract's
  `require(amountQuote == amountBase × price)` combined with floor-rounded pro-rata in Python
  means a single wei of disagreement reverts the whole batch live on stage. The engine must use
  the exact integer formula from the shared spec comment, locked by a cross-language
  fixture-equality test.
- **Phase 2 — escrow is checked but never reserved.** `POST /orders` verifies escrow at accept
  time, but nothing stops one trader submitting several orders against the same escrow, and a
  short balance reverts the entire batch. Needs per-trader committed-amount accounting.
- **Phase 1 — deploy order matters** and the guide never says so: registry → vault → boot TEE
  (the attestation nonce and the EIP-712 domain both bind the vault address) → `registerTeeSigner`.
- **Phase 4 — trust-model wording.** `registerTeeSigner` is owner-re-registrable and on-chain JWT
  verification is only a stretch goal, so the README must not claim the operator *cannot* forge
  settlements. Correct framing: signer rotation is publicly detectable via the on-chain anchor.
- **README — the USDT0 ≈ $1 peg is implicit** (we clear at XRP/USD but settle in USDT0). Say it
  out loud or it reads as an unnoticed bug.

---

## Phase 1 (Contracts) — H8 gate: **PASSED**, including the optional explorer verification

### DONE

**Deployed and source-verified on Coston2:**

| Contract | Address |
|---|---|
| UmbraVault | `0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10` |
| TeeRegistry | `0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4` |

**239 tests green** — the whole vault matrix is written once against an abstract base and
instantiated three times (6/6, 18/6, 6/18), so the decimal cases cost nothing extra to cover.
Includes the three withdrawal-guardrail proofs (withdraw works with no signer registered, with a
bogus signer, and while the oracle reverts), whole-batch atomicity with byte-identical state after a
revert, band edges inclusive at ±50 bps and one unit outside in both directions, and 11
fixture-driven EIP-712 parity tests.

**Live on-chain proofs** (all in `docs/addresses.md` with tx links): `quoteFor(10 FXRP, $1.010002)`
returns `10100020` from deployed bytecode · `peekPrice1e6()` reads live FTSOv2 through the vault's
own normalization path · approve → deposit → withdraw round trip returns the wallet to its starting
balance.

### DECISIONS

- **`evm_version` london → cancun.** The Phase-0 setting was based on the widely-repeated claim that
  Flare rejects PUSH0. I probed Coston2 directly with `cast call --create` (with an `0xFE` control
  that correctly rejected, so the method is sound): **PUSH0, MCOPY and TSTORE all execute**. The
  chain is full Cancun and the folklore is stale. This was also forced — OpenZeppelin 5.6.1's
  `utils/Bytes.sol` uses `mcopy` and cannot compile for london.
- **The settlement formula is frozen** as
  `floor(amountBase * clearingPrice1e6 * 10^quoteDec / (10^baseDec * 1e6))`, collapsed to one signed
  exponent fixed in the constructor (`quoteScaleNum`/`quoteScaleDen`, exactly one of which is always
  1). `settleBatch` **computes** the quote, asserts the signed value equals it, then applies its own
  number — so drift reverts loudly with `QuoteMismatch(fillIndex, provided, expected)` instead of
  settling something other than what was signed. `quoteFor()` is public so the engine can pre-flight
  every fill and refuse to sign a batch that would revert.
- **`settleBatch` is permissionless.** The TEE signature is the authorization, so the operator
  cannot censor a batch once the enclave has signed it, and settlement does not depend on the TEE
  address holding gas.
- **`lastBatchId` is written in step 1, not step 5.** State-equivalent within a transaction, but it
  makes reentrancy through the oracle read structurally impossible independent of `nonReentrant`.
- **`BatchSettled` trimmed** from 12 args to 8 to clear a stack-too-deep. Dropped only what is
  already derivable: `relayer` and `settledAt` (on the receipt/block) and `totalBase`/`totalQuote`
  (sum the `FillSettled` logs). `settleBatch` itself is split into `_validateShape` /
  `_verifySigner` / `_checkOracleAndBand` / `_applyFills` for the same reason — `via_ir` would have
  tripled compile times for the rest of the hackathon.
- **Oracle staleness enforced**, 900s default against a feed measured at ~2s old, with an owner
  kill-switch (`maxOracleAge = 0`). The TEE's claimed `oracleTs` is checked for recency but
  deliberately **not** required to equal the chain's — block-latency feeds tick every block, so
  equality would revert on stage.
- **Band capped at 1000 bps** by a hard constant, so the owner setter cannot become a licence to
  settle arbitrarily off-market; every change emits an event.
- **`renounceOwnership` disabled on TeeRegistry** (it would freeze signer rotation and brick
  settlement on the next enclave restart) but **left enabled on UmbraVault**, whose owner governs
  only the band — renouncing there is strictly good.
- **`base`/`quote` renamed to `baseToken`/`quoteToken`.** `base` is an exported chain object in
  `viem/chains` and would collide in `web/src/lib/contracts.ts`.

### NEXT
- Phase 2 (H8–H14): engine modules `crypto.py`, `attestation.py`, `models.py`, `matching.py`,
  `chain.py` + FastAPI endpoints. `matching.py` must mirror `_quoteForBase` exactly — integers only,
  never float or Decimal — and `engine/tests/` must assert against `docs/eip712-fixture.json`, which
  already carries the layer-by-layer hashes and a byte-identical signature.
- Deploy order for the enclave: the vault is live, so the TEE can boot with `VAULT_ADDRESS` set,
  then `registerTeeSigner` anchors its key.

### BLOCKERS
- _(resolved in Phase 2 — the operator opened billing account `01BC14-084FF7-FE7753`)_

---

## Phase 2 (TEE engine) — H14 gate: **PASSED TWICE**, locally and on real Intel TDX

### DONE

**The engine settles for real.** Two seeded orders in → a signed `settleBatch` landing on Coston2
→ balances moved. 51/51 assertions in `scripts/seed_demo.py`, every one of them read back from
chain independently of what the engine reported about itself.

| Run | Enclave | Settlement tx |
|---|---|---|
| local | simulated | `0x195de036…` |
| **Confidential Space** | **real Intel TDX** | `0x9bde5c5a…` |

**The real TEE is live**, not a roadmap item: `http://136.112.118.220:8080`, Intel TDX
`c3-standard-4` in GCP project `umbra-tee-08132358`. The attestation is a Google-signed RS256
vTPM token with `hwmodel: GCP_INTEL_TDX` and `secboot: true` — the simulated path emits
`alg: none` and `hwmodel: SIMULATED`, so the two are impossible to confuse. Its `eat_nonce` equals
`keccak256(bytes20(teeAddr) ‖ bytes20(vaultAddr))` and its `image_digest` is launcher-asserted, so
the token binds this key, this vault and this code. `TeeRegistry` anchors its keccak; `/attestation`
reports `hash_matches: true, signer_matches: true`. Full details in `docs/addresses.md`.

**54 unit tests green**, plus the two gate runs.

### DECISIONS

- **EIP-712 parity was proven before any engine code was written.** Python reproduces the frozen
  fixture's domain separator, per-fill hashes, array hash, struct hash and digest, and produces a
  **byte-identical 65-byte signature**. That retired the §9-C pivot trigger up front. Two things
  make it work and are now locked by tests: a **filtered types dict** (the spec has two
  unreferenced root types, so the full dict makes eth_account's primary-type inference ambiguous
  and raise), and the `0x19` prefix in the digest — omitting it yields a plausible-looking but
  wrong hash.
- **Buyers reserve quote at their LIMIT price, not the mid.** The mid is unknown at accept time
  but bounded: an eligible BUY has `mid ≤ limit`, and `amountQuote` is monotonic in price, so the
  limit is a tight upper bound on everything that order can ever owe. This closes the multi-order
  escrow double-spend the build guide never mentions — and which would revert the *entire* batch.
  Because withdrawals are deliberately ungated, reservations alone are insufficient, so the batch
  also re-reads live balances before signing and, on a shortfall, drops the trader and re-matches
  **from scratch** (dropping a trader changes the pro-rata denominators).
- **The operator token is stored as a SHA-256 hash.** Under Confidential Space a `tee-env` value
  lands in VM metadata *and* in the attestation token's `env_override` claim — the same JWT we
  publish at `/attestation` and hash on-chain. Publishing a hash of the token leaks nothing.
- **The engine reads the mid through the vault's own `peekPrice1e6()`/`previewBand()`** rather than
  a raw FtsoV2 call, so it never reimplements the contract's decimals normalization. Feed decimals
  genuinely differ (XRP/USD 6, FLR/USD 8), so that is a real divergence risk avoided.
- **No new dependencies.** `python-dotenv` was already transitively present; the Confidential Space
  socket client is stdlib `http.client` over `AF_UNIX`; JWT decoding is a base64url split. Adding a
  dependency would regenerate `uv.lock`, change the image digest, and stale the on-chain anchor.
- **The no-plaintext rule is structural, not a convention.** Every value-bearing field on the order
  model is `repr=False`, so an accidental `log.info(order)` physically cannot print an amount, and
  `log_event()` rejects any field not on an allowlist. Both are covered by tests.
- **A Confidential Space socket failure degrades honestly rather than crashing.** A real TDX VM
  whose token fetch failed would still match and settle, reporting `status: "fallback"` through
  `/attestation`. That path did not trigger — the socket worked first try.

### KNOWN STATE / CAVEATS

- The VM runs the **`confidential-space-debug`** image family, so the token carries
  `dbgstat: enabled`. The production family would report `disabled-since-boot`, but relaunching
  mints a new enclave key and needs a re-anchor. Worth doing before recording if time allows.
- The enclave mints a fresh key on **every boot**, so `scripts/register_tee.sh` must be re-run
  after any restart. `tee-restart-policy=Never` prevents a silent container restart from rotating
  the key mid-demo.
- `/orderbook/public` counts are plaintext-derived: with a single order in the book, `count_buys=1`
  discloses that order's side. The build guide mandates this shape; it is stated in the README
  rather than hidden.

### NEXT
- Phase 3 (H14–H19): Next.js pages — Trade (deposit/withdraw, EIP-712 sign, libsodium sealed-box,
  Dark Book), Settlement, Verify (decode the real TDX attestation + on-chain anchor match, with a
  REAL-TEE badge that is now genuinely earned), How-it-works.
- `web/src/lib/crypto.ts` must decode the engine's X25519 key with
  `sodium.base64_variants.ORIGINAL` — libsodium-wrappers defaults to URLSAFE_NO_PADDING and would
  silently mis-decode the `+` and `/` characters.
