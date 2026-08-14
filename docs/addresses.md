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

### Consequences for the contracts (live source wins over the plan)

1. **solc bumped `^0.8.20` → `0.8.25`.** The build plan specified ^0.8.20, but the installed Flare
   periphery cannot compile below 0.8.25 — `FtsoV2Interface.sol` declares `pragma solidity ^0.8.25`
   itself. Where the plan and the live package disagree, the package wins and the deviation gets
   recorded here.
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

## Deployed by us — Coston2, Phase 1

| Contract | Address | Deploy tx | Status |
|---|---|---|---|
| TeeRegistry | [`0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4`](https://coston2-explorer.flare.network/address/0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4) | [`0xba8633d2…`](https://coston2-explorer.flare.network/tx/0xba8633d2a8a5dfb92dfc73a02f310325f0b0bda8dc44f80843712fd987dccb23) | DEPLOYED + SOURCE VERIFIED |
| UmbraVault | [`0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10`](https://coston2-explorer.flare.network/address/0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10) | [`0x6a0039c1…`](https://coston2-explorer.flare.network/tx/0x6a0039c142a9e0dedeb67954be073d3e8fff5e430e0147440fcd18a6697cc817) | DEPLOYED + SOURCE VERIFIED |
| TEE signer | `0x1d9C5a793C501B5781bA8c0a58C7F983593d1913` | anchored via `RegisterTee.s.sol` | REGISTERED — real Intel TDX enclave |

### Confidential Space (Phase 2) — genuine Intel TDX, not simulated

The engine runs in a Google Confidential Space VM and its settlement key was generated **inside
the enclave**. The attestation is a real Google-signed vTPM token, not our simulated fallback:

| Claim | Value |
|---|---|
| `alg` | `RS256` (simulated mode uses `alg: none`) |
| `iss` | `https://confidentialcomputing.googleapis.com` |
| `hwmodel` | **`GCP_INTEL_TDX`** |
| `swname` | `CONFIDENTIAL_SPACE` |
| `secboot` | `true` |
| `dbgstat` | **`disabled-since-boot`** (production `confidential-space` image family) |
| `eat_nonce` | `0x229931683e1c2acca0a47685d102b259bbe3e3b8fb465893bab14dd7fbf05f30` |
| `submods.container.image_digest` | `sha256:6538c99447f578c28a5b583476c50609b3d4086df7dffb8b38a2dd74cef25f92` |

Two independent bindings make this meaningful rather than decorative. The `eat_nonce` equals
`keccak256(bytes20(teeAddress) ‖ bytes20(vaultAddress))`, so the token commits to *this* enclave
key settling to *this* vault. And `image_digest` is asserted by the launcher — not by the
workload — so it says which code is actually running.

| Item | Value |
|---|---|
| Engine (live) | `http://136.112.118.220:8080` |
| GCP project | `umbra-tee-08132358` |
| VM | `umbra-tee-1`, `c3-standard-4`, Intel TDX, `us-central1-a` |
| Image | `us-central1-docker.pkg.dev/umbra-tee-08132358/umbra/umbra-engine@sha256:6538c994…` |
| Anchored attestation hash | `0xab08784b9e9cfbe63f2ef62ebeaf48c698f6888d777c8d41898e4debb1b5f991` |

Verify the anchor yourself, independently of the engine:

```bash
curl -s http://136.112.118.220:8080/attestation | jq -r .raw | tr -d '\n' | cast keccak
cast call $REGISTRY_ADDRESS "attestationHash()(bytes32)" --rpc-url $RPC
# both -> 0xab08784b9e9cfbe63f2ef62ebeaf48c698f6888d777c8d41898e4debb1b5f991
```

(`tr -d '\n'` matters — `jq -r` appends a newline that would change the hash.)

### Settlements (Phase 2)

| Batch | Settled by | Tx |
|---|---|---|
| 2 | local simulated enclave | [`0x195de036…`](https://coston2-explorer.flare.network/tx/0x195de036e202a23fc5dfddee53c69b684b9b51590d52152a45cf6a138f37998e) |
| 3 | real Intel TDX enclave (debug image) | [`0x9bde5c5a…`](https://coston2-explorer.flare.network/tx/0x9bde5c5a801c17d4d0268aa7deb967cbd8daff228cf1044d396cf5f1ee140aca) |
| 4 | real TDX, triggered through the **Vercel proxy** | [`0xf69e0077…`](https://coston2-explorer.flare.network/tx/0xf69e0077cfdbb6f88050a7e6ca6bcf035df47afceebc769fcaab88493ea32855) |
| 6 | **production image**, E2E rehearsal run 1 | [`0x052bb9d1…`](https://coston2-explorer.flare.network/tx/0x052bb9d1c380c7d19c216e137a9e7a4abd1ff4069b030c7a7b8f2866f7a0ac34) |
| 7 | **production image**, E2E rehearsal run 2 | [`0xd2e98820…`](https://coston2-explorer.flare.network/tx/0xd2e988201a9ad172750be4d88fd3cb04b2bcb9bb38399d53851ac3e3ae3a12a5) |
| 8 | **current enclave** (`sha256:6538c994…`), post-audit relaunch | [`0x869647b1…`](https://coston2-explorer.flare.network/tx/0x869647b14305e075da9d38a337aeceaaf4716b5f7cd241be835b92a766dc146e) |

The enclave was relaunched on the production `confidential-space` image family in Phase 4, which
cleared the `dbgstat: enabled` caveat. That minted a new enclave key, so the signer and attestation
hash above are the post-swap values; `registrationCount` on the registry records every rotation.

Batch 3 cleared at $1.007226 against an on-chain FTSOv2 read of $1.007469 — 2 bps of the 50 bps
band, verified by the vault itself before it moved a single balance.

Owner of both: DEPLOYER `0x70a3D24068C064195a17D921712FdC747F2465f9`.
`UmbraVault` is the EIP-712 `verifyingContract` — `docs/eip712.json` has been updated to match.

### Live proofs against the deployed vault

```bash
# the settlement formula, evaluated by deployed bytecode: 10 FXRP at $1.010002 -> 10.100020 USDT0
cast call $VAULT_ADDRESS "quoteFor(uint256,uint256)(uint256)" 10000000 1010002 --rpc-url $RPC
#   -> 10100020

# FTSOv2 read through the vault's own normalization path
cast call $VAULT_ADDRESS "peekPrice1e6()(uint256,uint64)" --rpc-url $RPC
#   -> 1009924, 1786659482   ($1.009924, 1 second old)

cast call $VAULT_ADDRESS "previewBand(uint256)(bool,uint256,uint256)" 1010002 --rpc-url $RPC
#   -> true, 1009924, 0      (in band, 0 bps deviation)
```

### Manual custody round trip (gate H8)

| Step | Tx |
|---|---|
| approve 1.000000 FXRP | [`0xdaac3534…`](https://coston2-explorer.flare.network/tx/0xdaac35344b0efb1ba92cb435f3927064f37507ec68419ee854e1e11e956132ef) |
| deposit | [`0x0960b03e…`](https://coston2-explorer.flare.network/tx/0x0960b03e5a6426fd5f183f1dfd827708db21e45c0c3a29592d175608b6ab24c0) |
| **withdraw** | [`0x6bf57ae7…`](https://coston2-explorer.flare.network/tx/0x6bf57ae79c58655e9ad242c6a4bab908840d286d479f3338b7d63892376fcdb5) |

After deposit, three reads agreed exactly: vault internal balance `1000000`, FXRP held by the vault
`1000000`, deployer wallet `9000000`. After withdraw the wallet was back to `10000000` and the
internal balance to `0` — withdrawals are ungated on real chain, not just in tests.
