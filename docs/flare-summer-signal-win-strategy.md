# Flare Summer Signal — Win Strategy for a Solo, 24-Hour, From-Scratch Build

> Research document. Companion files: `umbra-build-guide.md` (execution) and `claude-code-master-prompt.md` (build prompts).

## TL;DR

- **Enter Bounty 2 (Confidential Compute Apps).** It gives the best statistical shot at 1st place ($4,000): it is harder to build (so fewer and weaker submissions), and Flare's judges are strategically motivated to showcase Confidential Compute because it is the flagship "Flare 2.0" launch they just voted onto Songbird (STP.13/FIP.16, vote July 6–13, 2026). Bounty 1 (Interoperable Asset Products) pits a 24-hour solo against mature, already-live teams (SparkDEX, Kinetic, Firelight, Sentora×Morpho) with real TVL — a losing matchup on the "usefulness/traction" axis.
- **Champion idea: "Umbra" — a confidential, MEV-proof sealed-bid settlement desk ("dark pool") for FXRP.** Orders are encrypted to a Trusted Execution Environment (Google Cloud Confidential Space — the same TEE substrate Flare's own FCC `tee-node` runs on), matched privately at the FTSOv2 fair price, settled on-chain in FXRP on Coston2, with the TEE's vTPM attestation verified on Flare. Privacy is *load-bearing* (sealed bids can't be front-run), the Flare integration is deep and non-superficial, and it rides Flare's #1 narrative, XRPfi.
- **Feasibility caveat to design around:** A real Flare Confidential Compute (FCC) extension is NOT fully deployable by an outsider in 24h — TEE nodes are Foundation-operated and extensions need code-hash whitelisting. The winning move is to build on **Google Cloud Confidential Space + on-chain attestation** (the proven route that won prior Flare confidential-compute hackathons) and deploy **real Coston2 contracts** (FTSOv2 + FXRP) so "technical execution" scores maximally.

## Key Findings

**1. What Flare is promoting right now (mid-2026) = where judge sympathy lies.** Flare's two loudest narratives are **XRPfi** and **Flare Confidential Compute / Flare 2.0**. FXRP went live on Flare mainnet on September 24, 2025 (as FXRP v1.2); since launch, over 155M FXRP has been minted, ~140M XRP is deployed across Flare DeFi, and Flare TVL sits around $151M. On the confidential-compute side, the governance vote to deploy FCC on Songbird — the first live implementation of the Flare 2.0 architecture first outlined in March 2025 — ran July 6–13, 2026 after a notice period beginning June 29. The hackathon's two bounties map exactly onto these two narratives, and the Flare Dev Hub X account stated builders "are already experimenting with FCC, XRPFi and new financial primitives."

**2. FCC is powerful but gated for outsiders.** During the initial rollout, TEE nodes are operated by the Flare Foundation using Google Confidential Compute, while participating Songbird data providers validate execution through weighted consensus. The on-chain design uses `TeeExtensionRegistry`, `TeeMachineRegistry`, and an `InstructionSender` that is the only address allowed to submit instructions, with **code-hash whitelisting** for extensions. FCC is labeled "(In development)" / "FCC (beta)" on the Dev Hub and is not on mainnet. There IS a local/simulated mode plus a `fce-extension-scaffold` "Hello World," so you can *demo* FCC-style code locally — but you cannot get a real extension whitelisted onto the live TEE fleet in 24 hours.

**3. The accessible confidential-compute route is Google Cloud Confidential Space via the Flare AI Kit.** The `flare-foundation/flare-ai-kit` repo is an SDK for building verifiable AI agents on Flare using Confidential Space, with an architecture chain of Secure Enclave → Confidential Space → Intel TDX → RA-verify / RA-TLS. It runs locally in Docker, deploys to a real TEE with a single `./deploy-tee.sh`, and ships a `flare-vtpm-attestation` submodule for on-chain-verifiable attestation. This is the stack that produced prior Flare confidential-compute winners (2DeFi, Quince Finance). Caveat: it's alpha, and a live TEE needs a GCP project with billing.

**4. Everything you need for a real on-chain demo is live and free on Coston2 (chain ID 114).** The Coston2 faucet dispenses C2FLR, **FXRP**, and USDT0 (no XRPL round-trip needed). FTSOv2's block-latency feeds update incrementally with each new block (~1.8s) and are free to query on Flare. `RandomNumberV2` (secure RNG) is at `0x5CdF9eAF3EB8b44fB696984a1420B56A7575D250` on Coston2. All contracts resolve via `FlareContractRegistry` at `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` (same address on every network). A Firelight FXRP yield vault is live on Coston2 at `0xC90D6847747b85d1fa2E07859869fb9fB72c0361`. FDC supports `Web2Json`/`JsonApi` on Coston/Coston2. Hardhat and Foundry starter kits exist.

**5. Competition reads.** ~592 registered hackers, but active builders crossed only ~100+ — most registrations won't submit. Existing FCC-space competitors already exist (a "private conditional orders" project where the trigger is encrypted to a TEE and never published, and a Flare-based cross-chain assurance/attestation project). Bounty 1 will attract ports of mature DeFi apps. On judging taste: Filip Koprivec, Flare's head of dev-rel, said of a prior hackathon that they liked projects that used Flare to connect different existing technologies into "one nicely rounded product," and that prizes went to projects that best exemplified the capabilities of the FDC and FTSO. Co-founder Hugo Philion has been a repeat judge.

## Details

### (a) Landscape & tech summary

Flare is an EVM L1 whose differentiator is enshrined data protocols. The pieces relevant to a 24-hour build:

- **FTSOv2** — free, ~1.8s block-latency price feeds read on-chain via `FtsoV2Interface.getFeedById` (e.g., FLR/USD feed id `0x01464c522f55534400000000000000000000000000`). Trivial to integrate; strong "meaningful integration" signal.
- **FDC (Flare Data Connector)** — attestation of external data: `Web2Json`/`JsonApi`, `EVMTransaction`, `Payment` (BTC/DOGE/XRPL), `AddressValidity`. Workflow: request → `FdcHub` → round finalization → fetch Merkle proof from DA Layer → verify via `FdcVerification`. Starter examples exist (`fdcExample`, `weatherInsurance`, `proofOfReserves`).
- **FAssets / FXRP** — 1:1 overcollateralized XRP on Flare; on Coston2 you can grab test FXRP straight from the faucet or direct-mint. Firelight (ERC-4626) provides yield vaults. This is the core of Bounty 1.
- **Secure random numbers** — `RandomNumberV2Interface`, updates every 90s, returns an `_isSecureRandom` flag.
- **Confidential Compute** — FCC (Foundation-gated, beta) OR Google Cloud Confidential Space via Flare AI Kit (accessible). Both use the same TEE + attestation model.

### (b) Bounty odds assessment & recommendation

| Factor | Bounty 1 — Interoperable Assets | Bounty 2 — Confidential Compute |
|---|---|---|
| Expected # of submissions | Higher (broad, easy on-ramp) | Lower (hard, niche) |
| Strength of competition | High — mature teams can port live products with real TVL | Moderate — a few serious FCC/TEE entries, rest superficial |
| Judge strategic motivation | Medium (well-trodden) | **High — flagship Flare 2.0 launch they want to showcase** |
| 24h from-scratch feasibility (real, deployed) | **High** (FXRP/FTSO/FDC all live & free on Coston2) | Medium (must use GCP Confidential Space, not real FCC; GCP setup overhead) |
| Demo wow-factor ceiling | Medium | **High** (privacy + attestation is visually striking and rare) |
| Odds a 24h solo takes **1st** | Lower — you're out-tractioned | **Higher — smaller, weaker field + judge tailwind** |

**Recommendation: Bounty 2.** The single biggest lever on winning is *the strength of the field you're compared against*, and Bounty 2's field is thinner and weaker while carrying a judge tailwind. The tradeoff — that a real FCC extension isn't 24h-deployable — is neutralized by using Google Cloud Confidential Space (the same TEE substrate FCC uses) plus real Coston2 contracts, and by being transparent about the FCC roadmap in the write-up. Enter Bounty 2 as the primary; because Umbra settles in FXRP, you can also select Bounty 1 (both bounties are allowed) — but lead with Confidential Compute.

### (c) The five ideas

**1. Umbra — Confidential sealed-bid "dark pool" settlement desk for FXRP (CHAMPION, Bounty 2)**

- *One-liner:* A private order book where large FXRP orders are encrypted to a TEE, matched at the FTSOv2 fair price, and settled on-chain — so whales can't be front-run or hunted.
- *Target user:* XRP whales, OTC desks, and XRPfi funds who move size and get sandwiched/leaked on public DEXes.
- *Flare protocols:* Confidential Space TEE (private matching + vTPM attestation verified on Flare) + **FTSOv2** (fair reference price for the clearing cross) + **FXRP** (settlement asset on Coston2) + optional **FDC** (proof a counterparty funded on XRPL). Contract-level: a `SettlementVault.sol` holds FXRP escrow and exposes `settle(matchId, priceProof, attestation)`; only the attested TEE key can call it; it reads FTSOv2 for the reference-price bound and verifies the TEE attestation on-chain.
- *Why judges score it high:* Usefulness (MEV/leak protection is a real, painful problem); integration quality (privacy is *essential*, not cosmetic; three Flare protocols wired together); technical execution (real Coston2 contracts + real TEE attestation); new work (built from scratch); future potential (dark pools are a proven TradFi primitive with a clear path to Songbird FCC).
- *24h feasibility:* High — TEE matching logic is small; flare-ai-kit scaffolds attestation; FXRP/FTSO are live on Coston2.
- *Wow-factor:* Very high — show two encrypted orders no observer can read, then a single on-chain settlement tx + verifiable attestation.
- *Risks:* An existing "private conditional orders" competitor is adjacent — differentiate via *batch sealed-bid matching + on-chain FXRP settlement + attestation*, not single triggers. GCP setup time.

**2. VaultSeer — Confidential AI yield strategist for XRPfi (Bounty 2)**

- *One-liner:* Upload your (private) portfolio; a TEE-run agent designs and executes an FXRP allocation across Firelight/Kinetic without exposing your holdings.
- *Flare:* Confidential Space TEE + FTSOv2 (valuation) + FXRP/Firelight (execution) + FDC Web2Json (prove off-chain balances).
- *Scores:* Strong usefulness/onboarding, but **derivative of prior winners 2DeFi and Quince Finance** — weaker on "new work/originality." Good backup, not the champion.

**3. ProofPurse — Confidential proof-of-solvency for XRPfi (Bounty 2)**

- *One-liner:* Prove you (or a FAssets agent) hold ≥ X in reserves across exchanges/XRPL without revealing balances — a private, verifiable solvency badge.
- *Flare:* TEE reads private balances via **FDC Web2Json** + XRPL `Payment`/`AddressValidity`, computes a threshold proof, posts attestation on Flare. Institutional angle fits Flare's institutional-DeFi messaging.
- *Scores:* High meaning/novelty; risk is a less flashy demo and heavier FDC plumbing in 24h.

**4. TrueSettle — FDC-settled parametric product on FXRP (Bounty 1)**

- *One-liner:* FXRP-collateralized parametric insurance / prediction market that auto-settles from FDC-attested real-world data.
- *Flare:* **FDC Web2Json** (settlement data) + **FTSOv2** (pricing) + **FXRP** (collateral/payout) + secure random (tie-breaks). Mirrors the official `weatherInsurance`/prediction-market patterns.
- *Scores:* Very buildable and fully deployable; but Bounty 1's crowded, traction-heavy field caps 1st-place odds for a solo.

**5. CoveredXRP — One-click FXRP structured-yield vault (Bounty 1)**

- *One-liner:* A from-scratch ERC-4626 FXRP vault running an automated covered-call / principal-protected strategy with FTSO-priced rebalancing.
- *Flare:* FXRP + FTSOv2 + Firelight + secure random.
- *Scores:* Clean, deployable, useful — but competes head-on with SparkDEX/Kinetic/Firelight-caliber teams. Lower differentiation.

### (d) Champion pick — full justification

**Umbra wins the internal bake-off** because it is the only idea that simultaneously: (1) sits in the thinner, judge-favored Bounty 2 field; (2) makes privacy *load-bearing* (a sealed-bid auction is meaningless without a TEE — the opposite of a superficial integration, which is exactly the axis judges explicitly grade); (3) wires together three Flare primitives (TEE attestation + FTSOv2 + FXRP) into "one nicely rounded product," the pattern Flare's DevRel lead praised by name; (4) is genuinely new work, unlike the AI-onboarding-agent lane that already won twice (2DeFi/Quince) and will be re-attempted; (5) lands on XRPfi, Flare's dominant 2026 narrative, so it also implicitly satisfies Bounty 1; and (6) has a demo you can *feel* — encrypted orders on screen that even the operator can't read, then one clean on-chain settlement with a verifiable attestation. VaultSeer and ProofPurse are strong but respectively more derivative and less demo-friendly; the Bounty 1 ideas are more buildable but structurally out-competed on traction.

### (e) Detailed 24-hour build + submission plan

**Architecture (describe this diagram in the write-up):**

`Taker/Maker frontend (Next.js) → encrypts order to TEE public key → TEE matching service (Go/Python in GCP Confidential Space) reads FTSOv2 reference price → produces a signed match + vTPM attestation → SettlementVault.sol on Coston2 verifies attestation + price bound → transfers escrowed FXRP → emits Settled event → frontend shows attestation + Coston2 explorer tx.`

**Hour-by-hour:**

- **H0–2:** Clone `flare-hardhat-starter` and `flare-ai-kit`. Configure Coston2 (RPC `https://coston2-api.flare.network/ext/C/rpc`, chain 114), fund wallet from the faucet (C2FLR + FXRP). Stand up flare-ai-kit locally in Docker; get a GCP Confidential Space project ready (or run the TEE in local/simulated mode as fallback).
- **H2–8:** Write and deploy contracts on Coston2: `SettlementVault.sol` (escrow FXRP, `settle()` gated to the attested TEE key, reads `FtsoV2Interface` for the reference-price bound), plus a minimal `AttestationVerifier` using the `flare-vtpm-attestation` pattern. Record deployed addresses.
- **H8–14:** TEE matching service: accept encrypted orders, decrypt inside the enclave, run price-time sealed-bid matching against the FTSOv2 mid, sign the match, produce attestation, submit `settle()`.
- **H14–19:** Frontend: wallet connect, order form with client-side encryption to the TEE key, live "order book is dark" visualization, settlement + attestation + explorer link.
- **H19–22:** End-to-end rehearsal on Coston2 with two wallets; capture a clean run for the video.
- **H22–24:** Record 2–3 min demo; write submission; final deploy; optionally deploy read-only pieces to Songbird for bonus.

**Exact resources:** Dev Hub FTSOv2 getting-started (`getFeedById`), FDC getting-started (if adding a funding proof), `flare-ai-kit` README + `deploy-tee.sh` + `flare-vtpm-attestation`, `fce-extension-scaffold` (reference the FCC roadmap in the write-up), Coston2 faucet (`faucet.flare.network`), `FlareContractRegistry` `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`, `RandomNumberV2` `0x5CdF9eAF3EB8b44fB696984a1420B56A7575D250`, Firelight Coston2 vault `0xC90D6847747b85d1fa2E07859869fb9fB72c0361`.

**Demo video script:** (1) Problem: "A whale swaps 2M FXRP on a public DEX and gets sandwiched — everyone sees the order." (2) Umbra: submit an encrypted order; show that neither the mempool nor the operator can read it. (3) Second order arrives; the TEE matches privately at the FTSOv2 fair price. (4) One on-chain settlement tx on Coston2; open the explorer; show the FXRP transfer and the verifiable TEE attestation. (5) Roadmap slide: migrate the matching enclave to native Flare Confidential Compute on Songbird once extension registration opens.

**Write-up framing (map to each criterion):**

- *Product description:* "A confidential settlement layer for XRPfi that prevents front-running by matching sealed FXRP orders inside a TEE and settling on Flare."
- *Target user:* XRP whales, OTC desks, XRPfi funds.
- *How it uses Flare:* attestation verified on Flare, FTSOv2 as the manipulation-resistant fair-price oracle, FXRP as the settlement asset — three native components, privacy load-bearing.
- *What was newly built:* 100% from scratch during the hackathon — contracts, TEE service, attestation verification, frontend (list the commit history and Coston2 addresses).
- *Clarity & future potential:* Dark pools are a proven multi-trillion-dollar TradFi primitive; the credible path is native FCC on Songbird → mainnet, plus permissioned institutional pools.
- *Pre-empt 24h weaknesses:* Ship real Coston2 addresses and a working end-to-end tx (beats slideware); be explicit that live-TEE FCC registration is Foundation-gated today and that you used Confidential Space (the same substrate) as the interim, with a concrete migration plan — turning a limitation into a roadmap and signaling deep understanding of Flare's stack.

## Recommendations

1. **Commit to Bounty 2 with Umbra now.** Select Confidential Compute as the primary bounty; you may also tick Interoperable Assets since it settles in FXRP.
2. **De-risk GCP first (first 2 hours).** If Confidential Space access/billing stalls, immediately fall back to flare-ai-kit local/simulated TEE mode so the attestation story still demos — do not let cloud setup burn your night.
3. **Prioritize a real, on-chain Coston2 settlement over feature breadth.** One flawless end-to-end encrypted-order → private-match → FXRP-settlement → attestation flow beats a broad but faked demo. Deploy real contracts; put the addresses in the submission.
4. **Explicitly differentiate from the existing "private conditional orders" project:** batch sealed-bid matching + on-chain FXRP settlement + verifiable attestation, not single encrypted triggers.
5. **Benchmarks that would change the plan:** if by Hour 8 the TEE attestation path isn't working, pivot to **VaultSeer** (same stack, simpler execution); if the entire TEE route is blocked, pivot to **TrueSettle** in Bounty 1 (pure FXRP + FDC + FTSO, fully deployable) — accepting lower 1st-place odds in exchange for a guaranteed working demo.

## Caveats

- **Timeline sourcing:** Forward-looking items (FCC mainnet, "Flare 2.0 Confidential Compute Q3 2026") come from market-commentary/roadmap trackers, not hard release notes; treat them as planned, not shipped. The Songbird FCC vote (July 6–13, 2026) is well-documented; whether FCC is fully live on Songbird as of Aug 13, 2026 was not confirmable in primary docs (Dev Hub still labels FCC "in development/beta").
- **FCC accessibility is inferred:** No doc explicitly states testnet FCC extension registration is permissionless; the code-hash-whitelisting + single-`InstructionSender` + Foundation-operated-node design strongly implies it is gated. Verify on the FCC overview and Solidity-reference pages before relying on real FCC deployment.
- **Flare AI Kit is alpha** — APIs may shift; budget buffer time.
- **Competition visibility is limited:** the DoraHacks BUIDL gallery for this hackathon wasn't fully enumerable, so the "thin field" read for Bounty 2 is a reasoned inference from difficulty + historical patterns, not a headcount of submitted projects.
- **Registered ≠ submitted:** 592 registrations overstate real competition; prior Flare hackathons converted a minority of registrants into approved BUIDLs (e.g., 358 devs → 46 BUIDLs virtually; 105 devs → 24 submissions IRL).
