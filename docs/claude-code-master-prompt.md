# UMBRA — Claude Code Master Prompt Pack

How to use this file:

1. Create the repo folder and drop the two companion docs in: `mkdir -p umbra/docs && cd umbra` → copy in `docs/umbra-build-guide.md` and `docs/flare-summer-signal-win-strategy.md`.
2. Create `CLAUDE.md` in the repo root with the contents of **Section A** (Claude Code automatically reads it every session — it's your standing orders).
3. Start Claude Code in the repo and paste **Section B** (the Master Kickoff Prompt) as your first message.
4. After each phase completes, paste the matching short prompt from **Section C**.
5. When something breaks, use the templates in **Section D**.

Claude Code setup/docs if needed: https://docs.claude.com/en/docs/claude-code/overview

---

## SECTION A — `CLAUDE.md` (copy everything in this block into the repo root)

```markdown
# CLAUDE.md — Umbra project standing orders

## What this project is
Umbra: a confidential sealed-bid dark pool for FXRP on Flare's Coston2 testnet.
Hackathon: Flare Summer Signal (DoraHacks). HARD DEADLINE: Aug 14, 2026, 20:59 — treat every hour as scarce.
The full specification is docs/umbra-build-guide.md — it is the single source of truth for
architecture, phases, acceptance criteria, scope, and pivot rules. Strategy context:
docs/flare-summer-signal-win-strategy.md. If code and the build guide conflict, the guide wins;
if the guide and live Flare docs conflict, live docs (https://dev.flare.network) win — then
update docs/addresses.md with what you verified.

## Non-negotiable guardrails
- TESTNET ONLY (Coston2, chain 114). Never touch mainnet, never handle real funds.
- NEVER print, log, commit, or hardcode private keys or mnemonics. Secrets live in .env
  (gitignored). Keep .env.example current instead.
- NEVER invent contract addresses, feed IDs, ABIs, or package APIs. Verify against
  https://dev.flare.network, the Coston2 explorer, or the installed package source. Record every
  verified value in docs/addresses.md with the source URL. If verification fails, STOP and say so.
- The TEE engine must NEVER return or log decrypted order plaintext through any endpoint.
- Withdrawals in UmbraVault must never be gated by the TEE, the operator, or pausing.
- Scope guard: anything listed in build-guide §8 ("What NOT to build") is out — put it in the
  README "Next steps" instead of building it.

## Engineering conventions
- Contracts: Solidity ^0.8.20, Foundry. Run `forge build` and `forge test` after every contract
  change; a failing test blocks progress on that phase.
- Engine: Python 3.12, FastAPI, uv (or venv+pip). `pytest` for matching + EIP-712 parity tests.
- Frontend: Next.js 14 (App Router), TypeScript, wagmi v2 + viem + RainbowKit,
  libsodium-wrappers. pnpm.
- EIP-712 definitions live once in docs/eip712.json; contracts, engine, and web all conform to
  it. Add a cross-language parity test (engine signs → Solidity/viem recovers same address).
- Decimal math: read token decimals() on-chain; one shared formula for amountQuote documented in
  a spec comment and tested identically in Solidity and Python.
- Commit at every milestone with conventional messages (feat:/fix:/test:/docs:). Never commit
  broken main; WIP goes on a branch.
- Keep PROGRESS.md updated after every work block: DONE / NEXT / BLOCKERS / mode decisions
  (e.g., simulated vs confidential-space TEE).

## Working style
- Plan before building: for each phase, restate the acceptance criteria from the build guide,
  list the tasks, then execute. Use your todo list.
- Verify-then-code: fetch the relevant dev.flare.network page (FTSOv2 Solidity reference, FAssets
  addresses, faucet docs) BEFORE writing integration code against it.
- Prefer the simplest thing that satisfies the acceptance gate. Cut scope, never cut the E2E flow.
- Timebox external fights: faucet issues 30 min, GCP setup 45 min — then take the documented
  fallback (build guide §5.4, §9) and log the decision. Do not silently stall.
- Ask me only when genuinely blocked on a decision the docs don't cover; otherwise proceed.

## Environment quick facts (verify in Phase 0, then trust docs/addresses.md)
- Coston2 RPC https://coston2-api.flare.network/ext/C/rpc · chain 114 ·
  explorer https://coston2-explorer.flare.network · faucet https://faucet.flare.network
- FlareContractRegistry (all networks): 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019
- Feed IDs (bytes21): XRP/USD 0x015852502f55534400000000000000000000000000 ·
  FLR/USD 0x01464c522f55534400000000000000000000000000 ·
  USDT/USD 0x01555344542f555344000000000000000000000000
- Env vars (see .env.example): COSTON2_RPC_URL, DEPLOYER_PRIVATE_KEY, ALICE_PRIVATE_KEY,
  BOB_PRIVATE_KEY, VAULT_ADDRESS, REGISTRY_ADDRESS, FXRP_ADDRESS, USDT0_ADDRESS, ENGINE_URL,
  TEE_MODE (simulated|confidential_space), OPERATOR_TOKEN.
```

---

## SECTION B — Master Kickoff Prompt (paste as your first Claude Code message)

```text
You are the sole engineer building UMBRA, a confidential sealed-bid dark pool for FXRP on
Flare's Coston2 testnet, for the Flare Summer Signal hackathon. I am the operator/reviewer.
Hard deadline: Aug 14, 2026, 20:59 — we have roughly 24 hours. We win by shipping ONE flawless
end-to-end flow on real testnet infrastructure, not by feature breadth.

STEP 1 — LOAD CONTEXT (do this before anything else):
Read, in full: CLAUDE.md, docs/umbra-build-guide.md, docs/flare-summer-signal-win-strategy.md.
Then give me back, in under 300 words: (a) the product in two sentences, (b) the five phase
gates H2/H8/H14/H19/H24 with their acceptance criteria compressed to one line each, (c) the
three pre-committed pivot rules you'll apply if we slip, (d) anything in the docs you think is
ambiguous or risky, flagged now rather than mid-build. Wait for my "go" after that summary.

STEP 2 — AFTER MY GO, EXECUTE PHASE 0 (De-risk, target ≤2h). In order:
1. Scaffold the repo exactly per build-guide §4: Foundry project in contracts/, FastAPI skeleton
   in engine/ (with Dockerfile, /healthz), Next.js app in web/, scripts/, docs/addresses.md,
   PROGRESS.md, .env.example, .gitignore (must cover .env, out/, node_modules, __pycache__,
   broadcast/). Initial commit.
2. Verification sweep — this is the most important task of the phase. Using web fetches of
   https://dev.flare.network (FTSOv2 getting-started + Solidity reference, FAssets/FXRP pages,
   network/faucet docs) and the Coston2 explorer, confirm and record in docs/addresses.md with
   source links: the periphery-contracts npm package name + exact import paths for
   ContractRegistry/FtsoV2Interface on coston2; the XRP/USD, FLR/USD, USDT/USD feed IDs; the
   FXRP and USDT0 token addresses on Coston2 and their decimals() (read them via cast against
   the RPC); the faucet URL/flow. Anything you cannot verify: mark UNVERIFIED and tell me —
   do not guess.
3. Connectivity proofs: a cast call reading live XRP/USD through the registry (show me the
   value + timestamp); forge build passing with the periphery import; the engine container
   running locally and answering /healthz; wallet balance checks for DEPLOYER/ALICE/BOB
   addresses I will fund from the faucet (print the three addresses for me, derived from the
   .env keys I provide — never print the keys).
4. Write .env.example fully. Ask me to fill .env and fund the wallets; verify balances once
   I say done.
5. Update PROGRESS.md with the Phase-0 report and the GCP decision point: I will tell you
   whether we're attempting the real Confidential Space path or locking simulated mode —
   default to building simulated-first either way, per the build guide.

Then STOP and report against the H2 gate checklist from build-guide §6 Phase 0 before
starting Phase 1.

STANDING RULES FOR THE WHOLE BUILD (repeat back in your summary): follow CLAUDE.md guardrails
strictly; verify-then-code; test after every contract change; commit every milestone; timebox
external fights and take documented fallbacks; keep PROGRESS.md current; the E2E flow is
sacred — cut anything else first.
```

---

## SECTION C — Phase hand-off prompts (paste after each gate passes)

**→ Phase 1 (Contracts, H2–H8):**
```text
Phase 0 gate passed. Execute Phase 1 per build-guide §6: implement TeeRegistry.sol and
UmbraVault.sol exactly to the spec (state, structs, settleBatch order-of-operations, FTSOv2
band check via the verified import path, batchId replay protection, decimals from chain,
withdrawals never gated). Write the full forge test matrix from the guide including the
EIP-712 recover test and the 18/6-decimals nasty case; wrap the oracle read in an internal
virtual function so tests can override it. Then write script/Deploy.s.sol, deploy both
contracts to Coston2 with the DEPLOYER key from .env, record addresses + tx hashes in
docs/addresses.md and README, and demonstrate one manual cast deposit. Report against the
H8 gate. If you hit the H8 pivot condition, apply rule §9-B (single-fill settleMatch) and
tell me — don't ask first, just log it.
```

**→ Phase 2 (TEE engine, H8–H14):**
```text
Phase 1 gate passed. Execute Phase 2 per build-guide §6: engine modules crypto.py,
attestation.py (TEE_MODE switch — simulated token clearly labeled; confidential_space path
reads the launcher socket per the flare-ai-kit pattern), models.py using docs/eip712.json as
the single source of truth, matching.py as a pure tested function (uniform price at FTSOv2
mid, pro-rata heavy side, exact decimal mirror of the contract formula), chain.py (FTSOv2
eth_call, EIP-712 digest parity test that recovers the same address the contract would,
settleBatch submission), and the FastAPI endpoints with the no-plaintext-out rule enforced.
Seed a scripted local run: two orders in → real settleBatch lands on Coston2 → assert balance
deltas. pytest green. Report against the H14 gate; apply pivot §9-C only if truly blocked.
```

**→ Phase 3 (Frontend, H14–H19):**
```text
Phase 2 gate passed. Execute Phase 3 per build-guide §6: Next.js pages Trade (deposit/
withdraw, EIP-712 sign, libsodium sealed-box encrypt, Dark Book ciphertext panel, "what
observers see" toggle), Settlement (fills, clearing vs live FTSOv2, explorer links), Verify
(attestation decode + on-chain anchor match, REAL-TEE/SIMULATED badge), How-it-works
(diagram + trust model). Wire ABIs from Foundry out/. Two browser profiles (Alice/Bob) must
complete the whole flow with a clean console. Minimal dark styling only — function first.
Report against the H19 gate; if dragging, apply pivot §9-D.
```

**→ Phase 4 (E2E + hardening, H19–H22):**
```text
Phase 3 gate passed. Execute Phase 4: write scripts/e2e_demo.py per the guide and run it
clean twice against Coston2. If we chose the real-TEE path: build+push the image, launch the
Confidential Space VM via a deploy-tee.sh adapted from flare-ai-kit, re-register the TEE
signer with the real attestation, rerun E2E once; if flaky, revert to simulated and log it in
PROGRESS.md without further time spent. Finalize README (pitch, diagram, addresses table,
trust model from build-guide §7, honest known-limits list, run instructions, roadmap).
Prepare the raw screen recording of one pristine run.
```

**→ Phase 5 (Ship, H22–H24):**
```text
Phase 4 done. Execute Phase 5: draft docs/submission.md answering every DoraHacks field using
build-guide §11 verbatim where it fits, with real addresses and the sample settlement tx hash
filled in. Give me the demo-video shot list from §10 with our actual URLs/addresses inserted.
Final pass: repo license (MIT), tag v0.1-hackathon, confirm .env not in history
(git log --stat check), PROGRESS.md closing entry. Then print the final submission packet
for me to paste into DoraHacks. Target: submitted ≥1h before the 20:59 deadline.
```

---

## SECTION D — Rescue prompt templates

**Bug/integration failure:**
```text
BLOCKER: <one line>. Reproduce: <command>. Observed: <error/output>. Expected: <what>.
Diagnose root cause first (read the actual source/docs — fetch the relevant
dev.flare.network page or installed package code before theorizing), state the cause in one
sentence, then fix with the smallest change. If the fix would take >30 min, present the
build-guide fallback that applies and your recommendation, then proceed with my one-word
answer.
```

**Time slip / scope pressure:**
```text
We are at H<hh> and behind the gate. Re-read build-guide §8 and §9. Propose the exact cuts
(what moves to README "Next steps") and/or which pivot rule fires, with a revised remaining-
hours plan that protects the E2E flow and the video hour. One screen, then execute on my go.
```

**Pre-submission audit:**
```text
Act as a hostile hackathon judge scoring the five criteria (usefulness, Flare integration
quality, technical execution, evidence of new work, clarity/future potential). Score us 1–10
on each with the single weakest point per criterion, then list the highest-leverage fixes
achievable in <N> remaining minutes, sorted by (judge-impact ÷ time). Execute the top ones on
my go.
```

---

## Final notes

- The kickoff prompt deliberately forces a **read-back summary before building** — cheap insurance that the whole spec was actually loaded.
- Everything address-shaped is **verify-then-code** by design: the build guide's values are research-grade, and Phase 0's verification sweep is what turns them into build-grade.
- If Claude Code proposes deviating from the guide with good reason (live docs changed, package renamed), let it — the guide's own precedence rule already allows this, as long as `docs/addresses.md` records what changed and why.

Good hunting. Ship the flow, anchor the proof, tell the story. 🏴
