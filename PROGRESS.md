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

### NEXT
- Operator: fund wallets (+ optionally start GCP auth).
- Then Phase 1 (H2–H8): `TeeRegistry.sol` + `UmbraVault.sol`, full forge test matrix,
  `Deploy.s.sol`, deploy to Coston2, record addresses, manual `cast` deposit.
