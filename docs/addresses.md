# Verified addresses & constants — Coston2 (chain 114)

Phase-0 verification sweep. Every row was confirmed against the live chain or the installed
package, not copied from the build guide. Re-run any "Verified by" command to re-check.

Sweep run: **2026-08-13 ~20:40 UTC**. RPC `https://coston2-api.flare.network/ext/C/rpc`.

Status legend: **VERIFIED** = confirmed on-chain / in installed source · **UNVERIFIED** = do not
build on it · **MOCK** = substituted under a pivot rule.

## Network

| Item | Value | Source | Verified by | Status |
|---|---|---|---|---|
| Chain ID | `114` | build guide | `cast chain-id --rpc-url $RPC` → `114` | VERIFIED |
| RPC | `https://coston2-api.flare.network/ext/C/rpc` | dev.flare.network | all calls below | VERIFIED |
| Explorer | `https://coston2-explorer.flare.network` | — | API v2 used throughout | VERIFIED |
| Faucet | `https://faucet.flare.network/coston2` | live page | Playwright snapshot | VERIFIED |
| FlareContractRegistry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` | build guide | resolved FtsoV2 + AssetManagerController through it | VERIFIED |

## Faucet capability — pivot §9-A does NOT fire

The Coston2 faucet dispenses **all three** tokens we need, per address per 24 hours:

> "You can request **100 C2FLR**, **10 USDT0**, **10 FXRP** for the Coston2 testnet per address in 24 hours."

Separate buttons: `Request C2FLR`, `Request USDT0`, `Request FXRP`. reCAPTCHA-gated, so funding is
a manual operator step. **No mock-token substitution is needed** — we trade the real FAssets FXRP.

## Contracts & tokens

| Item | Address | How it was established | Verified by | Status |
|---|---|---|---|---|
| FtsoV2 | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` | registry lookup, not hardcoded | `cast call $REG "getContractAddressByName(string)(address)" "FtsoV2"` | VERIFIED |
| AssetManagerController | `0x1C772F700308aF4c13897cc7b9c41EFfB82c50C0` | registry lookup | `cast call $REG "getContractAddressByName(string)(address)" "AssetManagerController"` | VERIFIED |
| FXRP AssetManager | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` | `getAssetManagers()` (sole entry) | `cast call $AMC "getAssetManagers()(address[])"` | VERIFIED |
| **FXRP (base token)** | **`0x0b6A3645c240605887a5532109323A3E12273dc7`** | canonical chain: registry → controller → asset manager → `fAsset()` | `cast call $AM "fAsset()(address)"`; `symbol()` → `FTestXRP`; `decimals()` → **6** | VERIFIED |
| **USDT0 (quote token)** | **`0xC1A5B41512496B80903D1f32d6dEa3a73212E71F`** | behavioural proof — see below | `symbol()` → `USD₮0`; `decimals()` → **6**; `name()` → `USDT0 test` | VERIFIED |

### Why that USDT0 and not one of the 30 impostors

The Coston2 explorer lists ~30 ERC-20s calling themselves some flavour of "USDT0" (many literally
named `Mock USDT0`), and the faucet's frontend bundle carries no addresses — it dispenses
server-side. Guessing was not acceptable, so the address was established behaviourally:

1. Identified the faucet's FXRP distributor `0xD5796ac33466bFAa9cBA703ac0E13994fDA77A53`, which
   sends *exactly* 10.000000 units of the **already-verified** FXRP contract — matching the
   faucet's advertised "10 FXRP" payout.
2. Took that distributor's recipients and listed their **incoming** token transfers.
3. Two independent recipients (`0x7B91d448…`, `0x808B1004…`) each received exactly 10.000000 FXRP
   **and** exactly 10.000000 of `0xC1A5B415…` — precisely the faucet's advertised
   "10 FXRP + 10 USDT0" pair.

This is re-confirmed automatically the first time our own wallets are funded: the Transfer logs
into DEPLOYER/ALICE/BOB name the contract directly.

Reproduce:
```bash
curl -s "https://coston2-explorer.flare.network/api/v2/addresses/0x808B10041e94b7446d8cD28E9222a2E51d4976f5/token-transfers?filter=to" \
  | jq -r '.items[]? | "\(.token.symbol)\t\(.token.address_hash)\t\(.total.value)"' | sort -u
```

> Note: the symbol contains the Unicode character `₮` (`USD₮0`, U+20AE), **not** ASCII `USDT0`.
> Anything doing a literal symbol comparison in the UI must account for that.

## FTSOv2 feeds — all three read live

`getFeedById` returns `(uint256 value, int8 decimals, uint64 timestamp)`.

| Feed | Feed ID (bytes21) | Live read | Status |
|---|---|---|---|
| XRP/USD | `0x015852502f55534400000000000000000000000000` | value `1010002`, decimals **6** → **$1.010002**, ts 2s old | VERIFIED |
| FLR/USD | `0x01464c522f55534400000000000000000000000000` | value `599958`, decimals **8** → $0.00599958 | VERIFIED |
| USDT/USD | `0x01555344542f555344000000000000000000000000` | value `999069`, decimals **6** → **$0.999069** | VERIFIED |

Two things worth carrying into Phase 1:

- **USDT/USD reading ≈ $0.999 is an independent sanity check** that the `(value, decimals)`
  interpretation is correct — a stablecoin must print ≈ 1.0.
- **Decimals differ per feed** (XRP/USD is 6, FLR/USD is 8). XRP/USD's 6 happens to match our
  `clearingPrice1e6` scaling 1:1 today, but the vault must still normalize generically, because
  FTSOv2 can change a feed's decimals at any time.

Feed IDs are also self-checkable offline — `0x01` (category) ‖ ASCII name ‖ zero-pad to 21 bytes:
```bash
cast from-utf8 "XRP/USD"   # → 0x5852502f555344, matching the middle of the feed ID above
```

## Solidity package — `@flarenetwork/flare-periphery-contracts@0.1.52`

Installed via npm into `contracts/node_modules`; remapped in `contracts/remappings.txt`.

| Item | Finding | Status |
|---|---|---|
| Import path | `@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol` | VERIFIED |
| Import path | `@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol` | VERIFIED |
| Import path | `@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol` | VERIFIED |
| Registry getters | `ContractRegistry.getFtsoV2()` (line 405) and `getTestFtsoV2()` (line 414), both `internal view` | VERIFIED |
| `FtsoV2Interface.getFeedById` | **`external payable`** — non-view, state-changing | VERIFIED |
| `TestFtsoV2Interface.getFeedById` | **`external view`** — free | VERIFIED |
| Required pragma | `FtsoV2Interface.sol` declares `pragma solidity ^0.8.25` | VERIFIED |

### Consequences for the contracts (deviations from the guide, live-source wins)

1. **solc bumped `^0.8.20` → `0.8.25`.** CLAUDE.md and build-guide §3 specify ^0.8.20, but the
   installed periphery cannot compile below 0.8.25. CLAUDE.md's own precedence rule ("live docs
   win, then record it here") authorizes this.
2. **The vault's oracle read cannot be a `view` function.** The production
   `FtsoV2Interface.getFeedById` is `payable`/non-view, so the internal virtual oracle helper that
   `settleBatch` calls must be non-view too. That is fine — `settleBatch` is state-changing
   anyway — but a `view` price getter for the frontend must use `TestFtsoV2Interface` instead.
3. Block-latency feeds are free, so the production call is made with zero value.

Verified with:
```bash
grep -nE "function get(Test)?FtsoV2" contracts/node_modules/@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol
grep -n -A5 "function getFeedById" contracts/node_modules/@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol
```

Both flavours are exercised by `contracts/src/ProbeFtsoV2.sol`, which compiles clean.

## Deployed by us

| Contract | Address | Tx | Status |
|---|---|---|---|
| TeeRegistry | _(Phase 1)_ | — | PENDING |
| UmbraVault | _(Phase 1)_ | — | PENDING |
| TEE signer | _(generated in enclave at boot, Phase 2)_ | — | PENDING |
