# CLAUDE.md — Umbra project standing orders

## What this project is
Umbra: a confidential sealed-bid dark pool for FXRP on Flare's Coston2 testnet.
Hackathon: Flare Summer Signal (DoraHacks). HARD DEADLINE: Aug 14, 2026, 20:59 — treat every hour as scarce.
The full specification is docs/umbra-build-guide.md — it is the single source of truth for
architecture, phases, acceptance criteria, scope, and pivot rules. If code and the build guide
conflict, the guide wins; if the guide and live Flare docs conflict, live docs
(https://dev.flare.network) win — then update docs/addresses.md with what you verified.

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
