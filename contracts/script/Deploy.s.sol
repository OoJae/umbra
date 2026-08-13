// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {TeeRegistry} from "../src/TeeRegistry.sol";
import {UmbraVault} from "../src/UmbraVault.sol";

/// @notice Deploys TeeRegistry then UmbraVault to Coston2.
/// @dev Order matters: the vault stores the registry as an immutable, so the registry must exist
///      first. registerTeeSigner is deliberately NOT done here — the enclave key does not exist
///      until Phase 2 — which keeps this script idempotent and re-runnable.
///      The deployer key is read via vm.envUint and never printed; only its address is logged.
contract Deploy is Script {
    function run() external returns (TeeRegistry registry, UmbraVault vault) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address baseToken = vm.envAddress("FXRP_ADDRESS");
        address quoteToken = vm.envAddress("USDT0_ADDRESS");
        address deployer = vm.addr(pk);

        // CLAUDE.md guardrail: testnet only.
        require(block.chainid == 114, "Deploy: not Coston2 (chain 114)");
        require(baseToken != address(0) && quoteToken != address(0), "Deploy: token address unset");
        require(baseToken != quoteToken, "Deploy: base == quote");

        // Read decimals from chain rather than assuming; the vault does the same in its constructor.
        uint8 baseDec = IERC20Metadata(baseToken).decimals();
        uint8 quoteDec = IERC20Metadata(quoteToken).decimals();

        console2.log("chainId         ", block.chainid);
        console2.log("deployer        ", deployer);
        console2.log("deployer balance", deployer.balance);
        console2.log("base  (FXRP)    ", baseToken);
        console2.log("base  symbol    ", IERC20Metadata(baseToken).symbol());
        console2.log("base  decimals  ", baseDec);
        console2.log("quote (USDT0)   ", quoteToken);
        console2.log("quote symbol    ", IERC20Metadata(quoteToken).symbol());
        console2.log("quote decimals  ", quoteDec);

        vm.startBroadcast(pk);
        registry = new TeeRegistry(deployer);
        vault = new UmbraVault(baseToken, quoteToken, address(registry), deployer);
        vm.stopBroadcast();

        // Assert the deployed code actually wired up the way we expect.
        require(vault.baseDecimals() == baseDec, "Deploy: baseDecimals mismatch");
        require(vault.quoteDecimals() == quoteDec, "Deploy: quoteDecimals mismatch");
        require(address(vault.teeRegistry()) == address(registry), "Deploy: registry wiring");
        require(address(vault.baseToken()) == baseToken, "Deploy: base wiring");
        require(address(vault.quoteToken()) == quoteToken, "Deploy: quote wiring");
        require(registry.owner() == deployer, "Deploy: registry owner");
        require(vault.owner() == deployer, "Deploy: vault owner");
        require(registry.teeSigner() == address(0), "Deploy: signer must start unset");
        require(vault.lastBatchId() == 0, "Deploy: batch counter must start at 0");

        // The single most valuable post-deploy check: the settlement formula, evaluated by the
        // deployed bytecode. 10 base at $1.010002 must be 10.100020 quote. If this is wrong, the
        // Python mirror in Phase 2 would be written against the wrong formula.
        uint256 probe = vault.quoteFor(10 ** baseDec * 10, 1_010_002);
        uint256 expected = (10_100_020 * (10 ** quoteDec)) / 1_000_000;
        require(probe == expected, "Deploy: quoteFor probe mismatch");

        console2.log("");
        console2.log("REGISTRY_ADDRESS=", address(registry));
        console2.log("VAULT_ADDRESS=", address(vault));
        console2.log("quoteFor(10 base, 1.010002) =", probe);
        console2.log("maxDeviationBps =", vault.maxDeviationBps());
        console2.log("maxOracleAge    =", vault.maxOracleAge());
    }
}
