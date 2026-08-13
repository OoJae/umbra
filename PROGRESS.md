# PROGRESS — Umbra

Running log. Updated after every work block. Deadline: **Aug 14 2026, 20:59**.

## DONE
- **Phase 0 / Block 1** — repo initialized (`git init -b main`), three companion docs moved into
  `docs/` (`claude-code-master-prompt (2).md` → `docs/claude-code-master-prompt.md`), root
  `CLAUDE.md` written from master-prompt Section A, `.gitignore` covering `.env`, foundry `out/`,
  `node_modules`, `__pycache__`, `broadcast/`.

## NEXT
- Block 2: generate DEPLOYER/ALICE/BOB wallets into gitignored `.env`; print addresses for faucet funding.
- Block 4: verification sweep (periphery import paths, FXRP/USDT0 addresses + decimals, feed IDs, faucet capability).
- Block 5: scaffold `contracts/`, `engine/`, `web/`.
- Block 6: connectivity proofs → H2 gate.

## BLOCKERS
- _(none yet)_

## DECISIONS
- **TEE mode:** operator chose to attempt the real GCP Confidential Space path with setup during
  Phase 0, under CLAUDE.md's hard 45-minute timebox, run as a concurrent track off the critical
  path. Simulated-first remains the build order regardless (build-guide §5.4). On timebox expiry:
  fall back to "simulated mode primary, real TEE stretch" and log where it blocked.
- **Wallets:** DEPLOYER/ALICE/BOB generated locally via `cast wallet new` straight into gitignored
  `.env`; private keys never displayed or committed, only addresses printed for faucet funding.
- **EIP-712 shape:** the build guide contradicts itself — §2 puts `vault`/`chainId` inside the
  Order struct, §6 puts them in the EIP-712 domain. Resolved to the **§6/domain** version and
  frozen in `docs/eip712.json`: that is what domain separators are for, it is the native shape for
  viem `signTypedData` and `eth_account.sign_typed_data` (parity for free across all three
  languages), and duplicating the fields creates a second place for digest mismatches.
- **Solc:** harmonized to `^0.8.20` (guide §3 says "0.8.2x", CLAUDE.md says ^0.8.20).
- **evm_version = london** in foundry.toml — Flare chains have historically rejected PUSH0
  (Shanghai) bytecode; cheap insurance against a Phase-1 deploy revert. Revisit if the periphery
  package demands a newer target.
