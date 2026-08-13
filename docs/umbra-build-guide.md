# UMBRA — Complete Build Guide

**Confidential sealed-bid dark pool for FXRP on Flare** · Flare Summer Signal, Bounty 2 (Confidential Compute) + Bounty 1 (Interoperable Assets)
**Deadline: Aug 14, 2026, 20:59 · Solo · From scratch · ~24 hours**

> Companion files: `flare-summer-signal-win-strategy.md` (why this project) and `claude-code-master-prompt.md` (the prompts that drive the build). Put all three in the repo under `/docs`.

---

## 0. The product in one page

**Problem.** Large FXRP orders on public DEXes leak intent: the mempool sees them, bots sandwich them, and other traders trade against the flow. Whales, OTC desks, and XRPfi funds have no private venue on Flare.

**Solution.** Umbra is a sealed-bid batch auction. Traders deposit FXRP (sellers) or USDT0 (buyers) into an on-chain vault, then submit orders that are **encrypted in the browser to a key that exists only inside a Trusted Execution Environment**. Nobody — not the operator, not the mempool, not other traders — can read them. At batch time, the TEE decrypts orders privately, fetches the manipulation-resistant **FTSOv2 XRP/USD price**, clears all crossing orders at that single fair mid-price, signs the settlement batch, and submits one transaction to the vault. The vault verifies (a) the signature comes from the **attested TEE key** and (b) the clearing price is within a tight band of the live FTSOv2 oracle read on-chain. Remote attestation (Confidential Space vTPM token) proves the exact matching code that ran, and its hash is anchored on Flare.

**Why privacy is load-bearing (say this everywhere):** a sealed-bid auction without a TEE is impossible — someone must see the bids to match them. Umbra's confidential compute isn't a feature bolted on; it *is* the product. That is exactly the "meaningful vs superficial integration" axis judges grade.

**Flare protocols used:** Confidential Space TEE + on-chain attestation anchoring (Bounty 2 core) · FTSOv2 XRP/USD read on-chain in the vault (price-band enforcement) and in the TEE (clearing price) · FXRP as the settlement asset (Bounty 1 relevance) · optional stretch: FDC `Web2Json`/XRPL proofs, secure random for batch tie-breaks.

**Trading pair:** FXRP/USDT0 (both dispensed by the Coston2 faucet). Assume USDT0 ≈ $1; clearing price comes from FTSOv2 XRP/USD.

---

## 1. Success criteria (definition of done)

Mapped to the judging criteria. The build is DONE when all of these are true:

| # | Criterion | Concrete proof |
|---|---|---|
| 1 | Working E2E demo | Two different wallets deposit → submit encrypted orders → TEE matches → **one real settlement tx on Coston2** → balances change → withdraw works. Explorer links live. |
| 2 | Meaningful Flare integration | Vault reads FTSOv2 on-chain and reverts if clearing price deviates > band; settlement asset is FXRP; attestation hash anchored on-chain. |
| 3 | Confidential compute is real | Orders are ciphertext everywhere outside the enclave (show the raw API payload + on-chain calldata). Attestation token (real Confidential Space vTPM JWT, or clearly-labeled simulated-mode equivalent) is fetchable and displayed. |
| 4 | Evidence of new work | Clean commit history starting from empty repo, timestamped within the hackathon window. |
| 5 | Clarity & future potential | README with architecture diagram, trust model, and FCC-on-Songbird migration roadmap; 2–3 min demo video. |
| 6 | Submission complete | Every DoraHacks required field filled (checklist in §11). |

**Golden rule:** one flawless end-to-end flow beats five half-features. Cut scope, never cut the E2E flow.

---

## 2. Architecture

```
┌─────────────────────────────┐
│  Frontend (Next.js, wagmi)  │
│  - deposit / withdraw       │
│  - order form               │
│  - sealed-box ENCRYPT ──────┼──── ciphertext only ────┐
│  - dark order book (blobs)  │                         │
│  - attestation viewer       │                         ▼
└──────────────┬──────────────┘          ┌──────────────────────────────┐
               │ on-chain txs            │  TEE Matching Engine         │
               ▼                         │  (FastAPI in Docker →        │
┌─────────────────────────────┐          │   GCP Confidential Space)    │
│  Coston2 (chain id 114)     │          │  - X25519 order-decrypt key  │
│  ┌───────────────────────┐  │          │  - secp256k1 settlement key  │
│  │ UmbraVault.sol        │◄─┼── settleBatch(batch, teeSig) ──────────┤
│  │ - FXRP/USDT0 escrow   │  │          │  - verifies trader order sigs│
│  │ - FTSOv2 price band   │  │          │  - uniform-price batch match │
│  │ - TEE-sig gate        │  │  reads   │    at FTSOv2 XRP/USD mid     │
│  ├───────────────────────┤  │◄─────────┤  - vTPM attestation endpoint │
│  │ TeeRegistry.sol       │  │          └──────────────────────────────┘
│  │ - attested TEE signer │  │
│  │ - attestation anchor  │  │
│  └───────────────────────┘  │
│  FTSOv2 (via Registry)      │
└─────────────────────────────┘
```

**End-to-end data flow (the demo storyline):**

1. TEE boots → generates X25519 encryption keypair + secp256k1 Ethereum account **inside the enclave** → obtains vTPM attestation token whose nonce binds `(teeEthAddress, vaultAddress, codeImageDigest)`.
2. Operator (you) calls `TeeRegistry.registerTeeSigner(teeEthAddr, keccak256(attestationJWT), attestationURI)` — anchoring the attestation on Flare. (Stretch: verify the JWT fully on-chain via the flare-vtpm-attestation pattern.)
3. Alice deposits USDT0, Bob deposits FXRP into `UmbraVault` (normal ERC-20 `approve` + `deposit`).
4. Each signs an order struct with their wallet (EIP-712) — `{trader, side, amountBase, limitPrice1e6, nonce, deadline, vault, chainId}` — then the browser **seals it** (libsodium `crypto_box_seal`) to the TEE's X25519 pubkey and POSTs the ciphertext. **The order signature is critical:** it's how the TEE knows the order really came from the depositor; without it anyone could submit orders draining others' escrow.
5. Batch trigger fires (button for the demo / timer in prod). Inside the enclave: decrypt all orders → verify each EIP-712 trader signature + nonce + deadline + sufficient escrow → fetch FTSOv2 XRP/USD via `eth_call` → eligible = buys with limit ≥ mid and sells with limit ≤ mid → fill at uniform price = mid, pro-rata on the heavy side → build `Batch{batchId, clearingPrice1e6, oracleTimestamp, fills[]}` → sign it EIP-712 with the TEE key → submit `settleBatch`.
6. `UmbraVault.settleBatch` on-chain: recover signer == `TeeRegistry.teeSigner()` → read FTSOv2 XRP/USD **on-chain** → `require(|clearingPrice − oracle| ≤ maxDeviationBps)` → check batchId monotonic (replay protection) → atomically swap internal balances for every fill → `emit BatchSettled`.
7. Frontend shows: settled fills, the Coston2 explorer tx, and the decoded attestation (image digest, audience, TEE address) side-by-side with the on-chain anchor hash.

**Trust model (put verbatim in README):** Users trust (a) Intel TDX / Google Confidential Space to run only the attested image, (b) the FTSOv2 oracle for fair pricing, (c) the vault contract for custody. The operator is *not* trusted: they cannot read orders, cannot forge settlements (TEE key never leaves the enclave), and cannot settle off-oracle prices (on-chain band check). Residual risks stated honestly: enclave side-channels, oracle latency, and liveness (operator can censor by not running batches — funds always withdrawable, so it's a liveness not safety risk).

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Contracts | Solidity 0.8.2x + **Foundry** | fastest test loop; `@flarenetwork/flare-periphery-contracts` for FTSOv2 |
| TEE engine | **Python 3.12 + FastAPI** + `web3`, `eth-account`, `PyNaCl` | quickest to write; flare-ai-kit is Python too |
| Enclave | Docker → **GCP Confidential Space** (Intel TDX) | the accessible TEE with vTPM attestation; same substrate as Flare FCC |
| Frontend | **Next.js 14 + wagmi v2 + viem + RainbowKit**, `libsodium-wrappers` | standard, fast |
| Chain | **Coston2** (chain 114) | free FXRP + USDT0 + C2FLR from faucet; FTSOv2 live |

---

## 4. Repo structure

```
umbra/
├── CLAUDE.md                  # from claude-code-master-prompt.md
├── README.md                  # judge-facing: pitch, architecture, addresses, run instructions
├── PROGRESS.md                # running log: done / next / blockers (update every milestone)
├── docs/
│   ├── umbra-build-guide.md
│   ├── flare-summer-signal-win-strategy.md
│   └── submission.md          # DoraHacks write-up draft (§11)
├── contracts/                 # Foundry project
│   ├── src/{UmbraVault.sol, TeeRegistry.sol}
│   ├── test/{UmbraVault.t.sol, TeeRegistry.t.sol}
│   └── script/Deploy.s.sol
├── engine/                    # TEE matching engine
│   ├── app/{main.py, matching.py, crypto.py, chain.py, attestation.py, models.py}
│   ├── tests/
│   ├── Dockerfile
│   └── deploy-tee.sh
├── web/                       # Next.js app
│   └── src/{app/, components/, lib/{crypto.ts, contracts.ts, api.ts}}
├── scripts/e2e_demo.py        # scripted two-wallet E2E run (rehearsal + video)
└── .env.example
```

---

## 5. Prerequisites & environment setup (do this before coding)

### 5.1 Tooling
- Node.js 20+, pnpm · Foundry (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) · Python 3.12 + `uv` (or pip/venv) · Docker · Git + GitHub repo (public) · `gcloud` CLI (for the real-TEE path)
- Claude Code for the build — install/setup per https://docs.claude.com/en/docs/claude-code/overview

### 5.2 Wallets & keys (testnet-only hygiene)
Create **three fresh throwaway accounts** (never reuse real keys):
1. `DEPLOYER` — deploys contracts, owns `TeeRegistry`
2. `ALICE` — demo buyer (browser wallet #1)
3. `BOB` — demo seller (browser wallet #2)

The TEE's settlement account is generated **inside the enclave** at boot — you never hold that key; you only fund its address with C2FLR for gas after it boots. All local keys live in `.env` (gitignored). `.env.example` documents every variable.

### 5.3 Coston2 network
| Item | Value |
|---|---|
| Chain ID | `114` |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` |
| Explorer | `https://coston2-explorer.flare.network` |
| Faucet | `https://faucet.flare.network` → select Coston2 → claim **C2FLR, FXRP, USDT0** for DEPLOYER, ALICE, BOB (and later the TEE address: C2FLR only) |
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` (same on all Flare networks) |
| FTSOv2 feed IDs (bytes21) | XRP/USD `0x015852502f55534400000000000000000000000000` · FLR/USD `0x01464c522f55534400000000000000000000000000` · USDT/USD `0x01555344542f555344000000000000000000000000` |

> ⚠️ **Verify-at-build-time rule:** the registry address and feed-ID scheme are stable, but confirm the FXRP + USDT0 **token addresses on Coston2** (from the faucet page / explorer / FAssets docs), current periphery-package import paths, and feed IDs against https://dev.flare.network before hardcoding. Read `decimals()` from both tokens at deploy time — FXRP is expected 6 decimals (XRP drops) and USDT0 6, but **never assume**; the vault math must use on-chain-read decimals.

### 5.4 GCP (real-TEE path — timebox to 45 min, then fall back)
1. Create project + enable billing → enable APIs: Compute Engine, Confidential Computing, Artifact Registry.
2. Create an Artifact Registry Docker repo; create a service account for the Confidential VM with `artifactregistry.reader` + logging.
3. You'll launch a Confidential Space VM (`confidential-space` image family, Intel TDX) whose metadata `tee-image-reference` points at your pushed engine image; the launcher exposes an attestation-token socket inside the container. `flare-ai-kit`'s `deploy-tee.sh` is the reference automation — crib from it rather than hand-rolling.
4. Open the engine port via a firewall rule tagged to the VM (HTTPS via a quick Caddy sidecar or plain HTTP + IP for the demo is acceptable at hackathon fidelity).

**Fallback = SIMULATED mode (build it FIRST, always keep it working):** `TEE_MODE=simulated` runs the identical container locally; `attestation.py` returns a clearly-labeled mock token with the same claim shape (`{"simulated": true, image_digest, eth_address, nonce}`). Every other byte of the system is identical. The demo and write-up honestly label which mode is live; migration story covers the rest.

---

## 6. Build phases (with acceptance criteria)

Total ≈ 22h of work + 2h buffer. **Checkpoints at H2 / H8 / H14 are pivot gates** (§9).

### Phase 0 — De-risk everything external (H0–H2)
- [ ] Repo initialized, structure from §4, `.env.example`, first commit.
- [ ] All three wallets funded: C2FLR + FXRP + USDT0 visible on explorer. **Record FXRP/USDT0 token addresses + decimals in `docs/addresses.md`.**
- [ ] `cast call` FTSOv2 through the registry succeeds → prints live XRP/USD. (Sanity: value ≠ 0, timestamp recent.)
- [ ] Foundry project compiles with `@flarenetwork/flare-periphery-contracts` imported.
- [ ] Engine skeleton runs in Docker locally (`GET /healthz`).
- [ ] GCP project ready OR (45-min timebox hit) decision logged in PROGRESS.md: "simulated mode primary, real TEE stretch."
- ✅ **Gate H2:** faucet tokens + FTSO read + compile all green. If FXRP faucet is broken → pivot rule §9-A.

### Phase 1 — Contracts (H2–H8)

**`TeeRegistry.sol`** (small): `owner`; `teeSigner` (address); `attestationHash` (bytes32); `attestationURI` (string); `registerTeeSigner(addr, hash, uri) onlyOwner` (re-registrable — enclaves are ephemeral); event `TeeRegistered`. Stretch (H20+ only if ahead): on-chain JWT signature verification per the `flare-vtpm-attestation` repo pattern.

**`UmbraVault.sol`** — the centerpiece:

```solidity
// State
IERC20 immutable base;      // FXRP
IERC20 immutable quote;     // USDT0
uint8   baseDec; uint8 quoteDec;          // read in constructor
TeeRegistry immutable registry;
uint256 public maxDeviationBps = 50;      // ±0.50% of FTSOv2 mid
uint256 public lastBatchId;               // strictly increasing → replay protection
mapping(address => mapping(address => uint256)) public balanceOf; // user → token → amt

// Types (EIP-712 signed by TEE)
struct Fill  { address buyer; address seller; uint256 amountBase; uint256 amountQuote; }
struct Batch { uint256 batchId; uint256 clearingPrice1e6; uint64 oracleTs; Fill[] fills; }

// API
deposit(token, amount)            // transferFrom; only base|quote
withdraw(token, amount)           // only own balance; ALWAYS available (self-custody story)
settleBatch(Batch calldata b, bytes calldata teeSig)
```

`settleBatch` logic, in order: (1) `require(b.batchId == lastBatchId + 1)`; (2) EIP-712 digest of `b` → `ECDSA.recover` → `require(signer == registry.teeSigner())`; (3) read FTSOv2 XRP/USD via `ContractRegistry.getFtsoV2().getFeedById(XRP_USD_ID)` → normalize its `int8 decimals` to 1e6 → `require(within band of b.clearingPrice1e6)`; (4) loop fills: `require(amountQuote == amountBase * clearingPrice adjusted for baseDec/quoteDec)` (uniform-price invariant), debit `buyer` quote / credit base, debit `seller` base / credit quote — revert whole batch if any balance short; (5) `lastBatchId = b.batchId; emit BatchSettled(...)`. Add `nonReentrant` on deposit/withdraw and OZ `Ownable` only where needed. No pausing complexity — withdrawals-always-open is the safety story.

FTSOv2 read pattern (verify exact import path on dev.flare.network → FTSOv2 → Solidity reference):

```solidity
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {FtsoV2Interface}  from "@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol";
bytes21 constant XRP_USD = 0x015852502f55534400000000000000000000000000;
(uint256 v, int8 d, uint64 ts) = ContractRegistry.getFtsoV2().getFeedById(XRP_USD); // block-latency: free
```

**Tests (forge) — minimum set:** deposit/withdraw happy + insufficient; settle happy path (mock FTSO if easier: wrap the oracle read in an internal virtual fn and override in a test harness); reverts: wrong signer, price outside band, stale batchId, quote≠base×price, fill exceeding escrow; decimals correctness with 6/6 and a nasty 18/6 pairing.

- ✅ **Gate H8:** `forge test` green · deployed to Coston2 via `Deploy.s.sol` · addresses in `docs/addresses.md` + README · a manual `cast` deposit works · contracts verified on the explorer if quick. If contracts are stuck → §9-B.

### Phase 2 — TEE matching engine (H8–H14)

`crypto.py`: on boot generate X25519 keypair (PyNaCl `SealedBox`) + `eth_account.Account.create()`; expose pubkeys via `GET /info` → `{tee_eth_address, order_encryption_pubkey_b64, mode, image_digest, vault, chain_id}`.

`attestation.py`: if `TEE_MODE=confidential_space`, request the vTPM token from the Confidential Space launcher's local socket with a custom audience + nonce = `keccak(teeEthAddr ‖ vaultAddr)`; else emit the labeled simulated token. `GET /attestation` returns it raw + decoded.

`models.py`: `Order{trader, side, amount_base, limit_price_1e6, nonce, deadline, signature}` — EIP-712 domain `{name:"Umbra", version:"1", chainId:114, verifyingContract:vault}`. Frontend and engine must byte-match this domain/struct (single source of truth: commit the typed-data JSON in `/docs/eip712.json` and import it on both sides).

`main.py` endpoints: `POST /orders` (body: `{ciphertext_b64}`; decrypt→verify sig, nonce unused, deadline, escrow ≥ amount via on-chain `balanceOf` read→ store in-memory; return only `{accepted: true, order_id}` — never echo plaintext); `POST /batch/run` (demo trigger, operator-token gated); `GET /batches/{id}`; `GET /orderbook/public` → **only** `{count_buys, count_sells, ciphertext_previews[]}` (feeds the "dark book" UI).

`matching.py` (pure function + unit tests): eligible = buys `limit ≥ mid` and sells `limit ≤ mid`; total fillable = `min(ΣbuyQty, ΣsellQty)`; pro-rata on the heavy side (floor-round; dust stays unfilled); pair greedily into `Fill`s; `amountQuote = amountBase × mid` with exact decimal handling **mirroring the contract's formula to the wei** (write one shared spec comment; test equality against a fixture).

`chain.py`: read FTSOv2 mid via `eth_call` through the registry; build EIP-712 batch digest **identical to Solidity** (test: recover locally and compare address); sign with TEE key; send `settleBatch`; wait receipt; persist result.

- ✅ **Gate H14:** scripted local run — two seeded orders in, `settleBatch` **lands on Coston2**, balances move, `pytest` green on matching + digest-parity. If EIP-712 parity or the tx path is fighting you → §9-C.

### Phase 3 — Frontend (H14–H19)

Pages: **Trade** (deposit/withdraw cards · order form → sign EIP-712 → `crypto_box_seal` with `libsodium-wrappers` → POST · **Dark Book** panel showing literal ciphertext blobs + counts with copy "even we can't read these" · "What observers see" toggle showing the raw POST body) · **Settlement** (batch results, fills, clearing price vs live FTSOv2 chart-lite, explorer link) · **Verify** (attestation JWT decoded: image digest, TEE address, mode badge REAL-TEE/SIMULATED; on-chain anchor from `TeeRegistry` with match/mismatch indicator) · **How it works** (the §2 diagram + trust model).

Implementation notes: wagmi v2 + viem, RainbowKit connect; contract ABIs generated from Foundry `out/`; `lib/crypto.ts` (sealed box), `lib/api.ts` (engine), `.env` for addresses + engine URL. Keep styling minimal-dark, one accent color; polish only after E2E works. **Demo-friendliness beats beauty.**

- ✅ **Gate H19:** full flow clickable from two browser profiles (Alice/Bob) with zero console errors on the happy path.

### Phase 4 — E2E rehearsal + hardening (H19–H22)
- [ ] `scripts/e2e_demo.py`: faucet-checks → deposits → two sealed orders → batch → assert on-chain balance deltas. Run it twice clean.
- [ ] If GCP path chosen and healthy: push image → launch Confidential Space VM → point frontend at it → re-register TEE signer with the **real** attestation → rerun E2E once. If flaky, flip back to simulated **without shame** and log it.
- [ ] Screen-record one pristine run (raw footage for the video).
- [ ] README final: pitch, diagram, addresses table, trust model, run-locally instructions, roadmap.

### Phase 5 — Demo video + submission (H22–H24)
Record + edit the 2–3 min video (§10), fill DoraHacks (§11), final commit + tag `v0.1-hackathon`, submit **at least 1 hour before 20:59** — DoraHacks upload hiccups are a known killer.

---

## 7. Security & correctness notes (also feed the write-up)

- **Order authenticity:** EIP-712 trader signature verified in-enclave — the TEE, not the API, is the auth boundary.
- **Replay:** batchId monotonicity on-chain; order nonces + deadlines in-enclave.
- **Price integrity:** double-checked — TEE clears at FTSOv2 mid, vault independently re-reads FTSOv2 on-chain and enforces the band. A malicious/buggy engine cannot settle off-market.
- **Custody:** withdrawals never gated by the TEE or operator → liveness failure ≠ fund loss.
- **Key hygiene:** TEE keys ephemeral, generated in-enclave, address-only exported; your keys testnet-only in `.env`.
- **Known limits (state them proudly, don't hide):** single pair, in-memory book (restart loses pending orders — funds unaffected), operator can censor batches (liveness only), simulated-mode caveat if applicable, no MEV between vault and DEXes (out of scope).

## 8. What NOT to build (scope guard)
No partial fills across batches, no cancel-order UX (deadline expiry is enough), no order history DB, no multi-pair, no fees, no governance, no mainnet/Songbird deploy of the vault, no mobile CSS, no auth beyond the operator token. Every one of these is a README "Next steps" bullet instead.

## 9. Pivot decision tree (pre-committed, from the strategy doc)
- **A (H2):** FXRP faucet/token broken → substitute WC2FLR or mock-ERC20 "tFXRP" for escrow, keep FTSOv2 XRP/USD for pricing, state substitution openly. Do NOT burn >30 min fighting faucets.
- **B (H8):** contracts badly stuck → simplify to single-fill `settleMatch` (one buyer, one seller) — the demo story survives intact.
- **C (H14):** engine↔chain integration failing → pivot to **VaultSeer** shape only if fundamentally blocked; otherwise cut to single-match flow. (Full-TEE-blocked → **TrueSettle**, Bounty 1, per strategy doc — last resort.)
- **D (H19):** frontend dragging → demo via the `e2e_demo.py` script + explorer + a minimal status page. A scripted terminal demo of real on-chain settlement still beats a pretty mock.

## 10. Demo video script (2–3 min)
1. **0:00–0:20 Hook:** split screen — public DEX swap with mempool inspector showing the naked order → "everyone saw the whale coming." 
2. **0:20–0:50 Sealed order:** Alice signs + submits; cut to the raw API payload and Dark Book: pure ciphertext. "Not the operator, not the chain, not us."
3. **0:50–1:30 The match:** Bob's sell arrives sealed; trigger batch; TEE log (image digest visible) clears at live FTSOv2 XRP/USD.
4. **1:30–2:10 Proof:** the single `settleBatch` tx on Coston2 explorer — FXRP/USDT0 balances swap; Verify page: attestation digest ↔ on-chain anchor match.
5. **2:10–2:40 Why Flare + roadmap:** FTSOv2 band enforced *in the contract*, FXRP settlement, attestation on Flare; migration to native FCC on Songbird when extension registration opens; the institutional dark-pool path. End card: repo + addresses.

Record 1080p, mic on, no music over narration, captions for contract addresses.

## 11. Submission checklist (DoraHacks fields → your answers)
- **Project name:** Umbra — Confidential Dark Pool for FXRP
- **Bounty:** Bounty 2 (primary) + Bounty 1
- **Short description:** "A confidential settlement layer for XRPfi: sealed FXRP orders are matched inside a TEE at the FTSOv2 fair price and settled on Flare — so large trades can't be front-run."
- **Target user:** XRP whales, OTC desks, XRPfi funds
- **Demo:** video link + live app URL + `e2e_demo.py` instructions
- **Repo:** public GitHub (clean commits, README, MIT license)
- **How it uses Flare:** the three-protocol paragraph from §0 + trust model from §7
- **Newly built:** "everything — first commit <timestamp>" + component list
- **Deployment details:** Coston2 addresses table (vault, registry, FXRP, USDT0, TEE signer, sample settlement tx hash)
- **Roadmap:** native FCC extension on Songbird → mainnet; multi-pair; commit-reveal fallback mode; permissioned institutional pools; FDC XRPL-funding proofs
- **Traction (optional but answer it):** built solo in 24h; invite testers from the Flare Telegram before judging ends — even 3 external testnet users is a signal.

## 12. Reference table
| Thing | Value / link |
|---|---|
| Coston2 RPC / chain / explorer | `https://coston2-api.flare.network/ext/C/rpc` · 114 · `https://coston2-explorer.flare.network` |
| Faucet (C2FLR, FXRP, USDT0) | `https://faucet.flare.network` |
| FlareContractRegistry (all nets) | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| Feed IDs | XRP/USD `0x015852502f55534400000000000000000000000000` · FLR/USD `0x01464c522f55534400000000000000000000000000` · USDT/USD `0x01555344542f555344000000000000000000000000` |
| RandomNumberV2 (Coston2) | `0x5CdF9eAF3EB8b44fB696984a1420B56A7575D250` (stretch only) |
| Dev docs | `https://dev.flare.network` → FTSOv2 guides + Solidity reference, FAssets/FXRP, FDC |
| Repos to crib | `flare-foundation/flare-ai-kit` (TEE deploy + attestation) · `flare-foundation/flare-vtpm-attestation` (on-chain verify pattern) · `flare-foundation/flare-hardhat-starter` / foundry starter (FTSO examples) · `fce-extension-scaffold` (cite in roadmap) |
| Hackathon | DoraHacks page · Flare Hackathon Telegram `https://t.me/+5Vn6ZKhr6KI3NjIx` (ask FXRP-faucet questions EARLY) |

> Every address/feed above came from research as of Aug 13, 2026 — **re-verify each one against dev.flare.network / the explorer during Phase 0** and record confirmations in `docs/addresses.md`. If any conflict: the live docs win.
