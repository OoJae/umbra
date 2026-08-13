// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {UmbraVault} from "../src/UmbraVault.sol";
import {TeeRegistry} from "../src/TeeRegistry.sol";
import {UmbraVaultHarness} from "./helpers/UmbraVaultHarness.sol";
import {Eip712Lib} from "./helpers/Eip712Lib.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Locks the Solidity EIP-712 implementation to docs/eip712-fixture.json, the same file the
///         Python engine (Phase 2) and the browser (Phase 3) assert against. Because all three
///         stacks derive the same key from a committed string and use RFC 6979 deterministic
///         nonces, agreement is checked on the exact 65 signature bytes, not just the recovered
///         address.
contract Eip712ParityTest is Test {
    using stdJson for string;

    /// @dev The fixture's sentinel verifyingContract. The harness is deployed AT this address so
    ///      that OZ's cached domain separator matches the fixture without pinning it to the live
    ///      vault (which would go stale on every redeploy).
    address internal constant FIXTURE_VAULT = 0x000000000000000000000000000000000000c0DE;

    string internal json;
    UmbraVaultHarness internal vault;
    TeeRegistry internal registry;
    MockERC20 internal baseToken;
    MockERC20 internal quoteToken;

    address internal owner = address(0x0117E4);
    address internal fixtureSigner;

    function setUp() public {
        json = vm.readFile("../docs/eip712-fixture.json");
        vm.chainId(uint256(json.readUint(".domain.chainId")));

        fixtureSigner = json.readAddress(".signer.address");

        baseToken = new MockERC20("Test FXRP", "FXRP", uint8(json.readUint(".decimals.base")));
        quoteToken = new MockERC20("Test USDT0", "USDT0", uint8(json.readUint(".decimals.quote")));
        registry = new TeeRegistry(owner);

        deployCodeTo(
            "UmbraVaultHarness.sol:UmbraVaultHarness",
            abi.encode(address(baseToken), address(quoteToken), address(registry), owner),
            FIXTURE_VAULT
        );
        vault = UmbraVaultHarness(FIXTURE_VAULT);
    }

    function _fixtureBatch() internal view returns (UmbraVault.Batch memory b) {
        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](2);
        for (uint256 i = 0; i < 2; ++i) {
            string memory base = string.concat(".batch.message.fills[", vm.toString(i), "]");
            fills[i] = UmbraVault.Fill({
                buyer: json.readAddress(string.concat(base, ".buyer")),
                seller: json.readAddress(string.concat(base, ".seller")),
                amountBase: json.readUint(string.concat(base, ".amountBase")),
                amountQuote: json.readUint(string.concat(base, ".amountQuote"))
            });
        }
        b = UmbraVault.Batch({
            batchId: json.readUint(".batch.message.batchId"),
            clearingPrice1e6: json.readUint(".batch.message.clearingPrice1e6"),
            oracleTs: uint64(json.readUint(".batch.message.oracleTs")),
            fills: fills
        });
    }

    function _fixtureOrder() internal view returns (UmbraVault.Order memory) {
        return UmbraVault.Order({
            trader: json.readAddress(".order.message.trader"),
            side: uint8(json.readUint(".order.message.side")),
            amountBase: json.readUint(".order.message.amountBase"),
            limitPrice1e6: json.readUint(".order.message.limitPrice1e6"),
            nonce: json.readUint(".order.message.nonce"),
            deadline: json.readUint(".order.message.deadline")
        });
    }

    // ── layer by layer, so a mismatch names the layer that diverged ──

    function test_Fixture_DomainSeparatorMatches() public view {
        assertEq(
            Eip712Lib.domainSeparator(block.chainid, FIXTURE_VAULT), json.readBytes32(".batch.expected.domainSeparator")
        );
        assertEq(vault.domainSeparator(), json.readBytes32(".batch.expected.domainSeparator"));
    }

    function test_Fixture_FillStructHashesMatch() public view {
        UmbraVault.Batch memory b = _fixtureBatch();
        bytes32[] memory expected = json.readBytes32Array(".batch.expected.fillStructHashes");
        assertEq(Eip712Lib.hashFill(b.fills[0]), expected[0]);
        assertEq(Eip712Lib.hashFill(b.fills[1]), expected[1]);
    }

    function test_Fixture_FillsArrayHashMatches() public view {
        assertEq(Eip712Lib.hashFills(_fixtureBatch().fills), json.readBytes32(".batch.expected.fillsArrayHash"));
    }

    function test_Fixture_BatchStructHashMatches() public view {
        assertEq(Eip712Lib.hashBatchStruct(_fixtureBatch()), json.readBytes32(".batch.expected.batchStructHash"));
    }

    function test_Fixture_DigestMatches() public view {
        assertEq(
            Eip712Lib.batchDigest(block.chainid, FIXTURE_VAULT, _fixtureBatch()),
            json.readBytes32(".batch.expected.digest")
        );
    }

    /// The deployed contract's OWN _hashTypedDataV4, not the test helper's.
    function test_Fixture_VaultOwnDigestMatches() public view {
        assertEq(vault.hashBatch(_fixtureBatch()), json.readBytes32(".batch.expected.digest"));
    }

    function test_Fixture_RecoversFixtureSigner() public view {
        assertEq(
            ECDSA.recover(json.readBytes32(".batch.expected.digest"), json.readBytes(".batch.expected.signature")),
            fixtureSigner
        );
        assertEq(vault.recoverBatchSigner(_fixtureBatch(), json.readBytes(".batch.expected.signature")), fixtureSigner);
    }

    /// Proves RFC 6979 determinism, which is what makes byte-comparison against Python and viem
    /// legitimate rather than merely suggestive.
    function test_Fixture_ResignIsByteIdentical() public view {
        uint256 pk = uint256(keccak256(bytes(json.readString(".signer.derivation"))));
        assertEq(vm.addr(pk), fixtureSigner, "derivation must reproduce the signer");

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, json.readBytes32(".batch.expected.digest"));
        assertEq(abi.encodePacked(r, s, v), json.readBytes(".batch.expected.signature"));
    }

    /// The one that actually matters: a signature produced outside this test is accepted by the
    /// real settlement path, end to end.
    function test_Fixture_SettleBatchAcceptsFixtureSignature() public {
        UmbraVault.Batch memory b = _fixtureBatch();

        vm.prank(owner);
        registry.registerTeeSigner(fixtureSigner, keccak256("fixture"), "fixture");

        vault.setFeed(b.clearingPrice1e6, 6, uint64(block.timestamp));
        vm.warp(b.oracleTs);
        vault.setFeed(b.clearingPrice1e6, 6, b.oracleTs);

        // fund both sides of both fills
        uint256 totalBase;
        uint256 totalQuote;
        for (uint256 i = 0; i < b.fills.length; ++i) {
            totalBase += b.fills[i].amountBase;
            totalQuote += b.fills[i].amountQuote;
        }
        address buyer = b.fills[0].buyer;
        address seller = b.fills[0].seller;

        quoteToken.mint(buyer, totalQuote);
        vm.startPrank(buyer);
        quoteToken.approve(address(vault), totalQuote);
        vault.deposit(address(quoteToken), totalQuote);
        vm.stopPrank();

        baseToken.mint(seller, totalBase);
        vm.startPrank(seller);
        baseToken.approve(address(vault), totalBase);
        vault.deposit(address(baseToken), totalBase);
        vm.stopPrank();

        vault.settleBatch(b, json.readBytes(".batch.expected.signature"));

        assertEq(vault.lastBatchId(), 1);
        assertEq(vault.balanceOf(buyer, address(baseToken)), totalBase);
        assertEq(vault.balanceOf(seller, address(quoteToken)), totalQuote);
    }

    /// Locks the settlement formula into the fixture too, so the Python mirror is checked against
    /// the same numbers the signature covers.
    function test_Fixture_QuoteAmountsSatisfyVaultFormula() public view {
        UmbraVault.Batch memory b = _fixtureBatch();
        for (uint256 i = 0; i < b.fills.length; ++i) {
            assertEq(vault.quoteFor(b.fills[i].amountBase, b.clearingPrice1e6), b.fills[i].amountQuote);
        }
    }

    function test_Fixture_OrderDigestAndSignatureMatch() public view {
        UmbraVault.Order memory o = _fixtureOrder();
        assertEq(Eip712Lib.hashOrderStruct(o), json.readBytes32(".order.expected.orderStructHash"));
        assertEq(vault.hashOrder(o), json.readBytes32(".order.expected.digest"));
        assertEq(vault.recoverOrderSigner(o, json.readBytes(".order.expected.signature")), fixtureSigner);
    }
}
