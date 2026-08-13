// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {UmbraVault} from "../src/UmbraVault.sol";
import {TeeRegistry} from "../src/TeeRegistry.sol";
import {UmbraVaultHarness} from "./helpers/UmbraVaultHarness.sol";
import {Eip712Lib} from "./helpers/Eip712Lib.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice The full vault matrix, written once and instantiated per decimal pairing at the bottom
///         of this file. Everything is expressed in ONE_BASE / ONE_QUOTE units so the same test
///         body is meaningful at 6/6, 18/6 and 6/18.
abstract contract UmbraVaultTestBase is Test {
    uint8 internal BASE_DEC;
    uint8 internal QUOTE_DEC;

    uint256 internal ONE_BASE;
    uint256 internal ONE_QUOTE;

    MockERC20 internal baseToken;
    MockERC20 internal quoteToken;
    TeeRegistry internal registry;
    UmbraVaultHarness internal vault;

    address internal owner = address(0x0117E4);
    address internal alice = address(0xA11CE); // buyer
    address internal bob = address(0xB0B); // seller
    address internal carol = address(0xCA401);
    address internal dave = address(0xDA7E);
    address internal relayer = address(0xEE1A7);

    uint256 internal teePk;
    address internal teeAddr;
    uint256 internal wrongPk;
    address internal wrongAddr;

    uint64 internal nowTs;

    /// @dev Live XRP/USD as observed on Coston2 in Phase 0.
    uint256 internal constant PRICE = 1_010_002;
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function setUp() public {
        // The frozen EIP-712 domain pins chainId 114; Foundry defaults to 31337, which would make
        // every signature fail to recover.
        vm.chainId(114);
        vm.warp(1_700_000_000);
        nowTs = uint64(block.timestamp);

        ONE_BASE = 10 ** BASE_DEC;
        ONE_QUOTE = 10 ** QUOTE_DEC;

        (teeAddr, teePk) = makeAddrAndKey("tee");
        (wrongAddr, wrongPk) = makeAddrAndKey("wrong");

        baseToken = new MockERC20("Test FXRP", "FXRP", BASE_DEC);
        quoteToken = new MockERC20("Test USDT0", "USDT0", QUOTE_DEC);

        registry = new TeeRegistry(owner);
        vault = new UmbraVaultHarness(address(baseToken), address(quoteToken), address(registry), owner);
        vault.setFeed(PRICE, 6, nowTs);

        vm.prank(owner);
        registry.registerTeeSigner(teeAddr, keccak256("attestation"), "https://umbra.test/att");
    }

    // ─────────────────────────── helpers ───────────────────────────

    function _fund(address who, MockERC20 token, uint256 amount) internal {
        token.mint(who, amount);
        vm.startPrank(who);
        token.approve(address(vault), amount);
        vault.deposit(address(token), amount);
        vm.stopPrank();
    }

    function _oneFill(address buyer, address seller, uint256 amountBase, uint256 price)
        internal
        view
        returns (UmbraVault.Fill[] memory fills)
    {
        fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill({
            buyer: buyer, seller: seller, amountBase: amountBase, amountQuote: vault.quoteFor(amountBase, price)
        });
    }

    function _batch(uint256 batchId, uint256 price, UmbraVault.Fill[] memory fills)
        internal
        view
        returns (UmbraVault.Batch memory)
    {
        return UmbraVault.Batch({batchId: batchId, clearingPrice1e6: price, oracleTs: nowTs, fills: fills});
    }

    function _sign(uint256 pk, UmbraVault.Batch memory b) internal view returns (bytes memory) {
        return _signFor(pk, block.chainid, address(vault), b);
    }

    function _signFor(uint256 pk, uint256 chainId, address verifying, UmbraVault.Batch memory b)
        internal
        pure
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, Eip712Lib.batchDigest(chainId, verifying, b));
        return abi.encodePacked(r, s, v); // r ‖ s ‖ v — the layout OZ ECDSA expects
    }

    /// Sets up the canonical single-fill trade: Alice buys `amountBase` from Bob at PRICE.
    function _seedSimpleTrade(uint256 amountBase)
        internal
        returns (UmbraVault.Batch memory b, bytes memory sig, uint256 q)
    {
        q = vault.quoteFor(amountBase, PRICE);
        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amountBase);
        b = _batch(1, PRICE, _oneFill(alice, bob, amountBase, PRICE));
        sig = _sign(teePk, b);
    }

    // ═══════════════════════ EIP-712 shape ═══════════════════════

    /// If the independently-written helper disagrees with the contract, every signature test below
    /// is meaningless. This must be the first thing that goes green.
    function test_TestHelperDigestEqualsContractDigest() public view {
        UmbraVault.Batch memory b = _batch(1, PRICE, _oneFill(alice, bob, ONE_BASE, PRICE));
        assertEq(vault.hashBatch(b), Eip712Lib.batchDigest(block.chainid, address(vault), b));
    }

    function test_Eip712Domain_MatchesFrozenSpec() public view {
        (, string memory name, string memory version, uint256 cid, address vc,,) = vault.eip712Domain();
        assertEq(name, "Umbra");
        assertEq(version, "1");
        assertEq(cid, 114);
        assertEq(vc, address(vault));
    }

    function test_Typehashes_MatchFrozenSpec() public view {
        assertEq(
            vault.FILL_TYPEHASH(),
            keccak256("Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)")
        );
        assertEq(
            vault.BATCH_TYPEHASH(),
            keccak256(
                "Batch(uint256 batchId,uint256 clearingPrice1e6,uint64 oracleTs,Fill[] fills)"
                "Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)"
            )
        );
        assertEq(
            vault.ORDER_TYPEHASH(),
            keccak256(
                "Order(address trader,uint8 side,uint256 amountBase,uint256 limitPrice1e6,uint256 nonce,uint256 deadline)"
            )
        );
    }

    // ═══════════════════════ constructor ═══════════════════════

    function test_Constructor_ReadsTokenDecimalsFromChain() public view {
        assertEq(vault.baseDecimals(), BASE_DEC);
        assertEq(vault.quoteDecimals(), QUOTE_DEC);
    }

    function test_Constructor_ComputesQuoteScale() public view {
        int256 d = int256(uint256(QUOTE_DEC)) - int256(uint256(BASE_DEC)) - 6;
        if (d >= 0) {
            assertEq(vault.quoteScaleNum(), 10 ** uint256(d));
            assertEq(vault.quoteScaleDen(), 1);
        } else {
            assertEq(vault.quoteScaleNum(), 1);
            assertEq(vault.quoteScaleDen(), 10 ** uint256(-d));
        }
    }

    function test_Constructor_RevertWhen_SameToken() public {
        vm.expectRevert(UmbraVault.SameToken.selector);
        new UmbraVaultHarness(address(baseToken), address(baseToken), address(registry), owner);
    }

    function test_Constructor_RevertWhen_ZeroAddress() public {
        vm.expectRevert(UmbraVault.ZeroAddress.selector);
        new UmbraVaultHarness(address(0), address(quoteToken), address(registry), owner);
    }

    // ═══════════════════════ deposit ═══════════════════════

    function test_Deposit_Base_CreditsAndPulls() public {
        baseToken.mint(alice, 5 * ONE_BASE);
        vm.startPrank(alice);
        baseToken.approve(address(vault), 5 * ONE_BASE);
        vault.deposit(address(baseToken), 5 * ONE_BASE);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice, address(baseToken)), 5 * ONE_BASE);
        assertEq(baseToken.balanceOf(address(vault)), 5 * ONE_BASE);
        assertEq(baseToken.balanceOf(alice), 0);
    }

    function test_Deposit_Quote_CreditsAndPulls() public {
        _fund(alice, quoteToken, 7 * ONE_QUOTE);
        assertEq(vault.balanceOf(alice, address(quoteToken)), 7 * ONE_QUOTE);
        assertEq(quoteToken.balanceOf(address(vault)), 7 * ONE_QUOTE);
    }

    function test_Deposit_Accumulates() public {
        _fund(alice, baseToken, ONE_BASE);
        _fund(alice, baseToken, 2 * ONE_BASE);
        assertEq(vault.balanceOf(alice, address(baseToken)), 3 * ONE_BASE);
    }

    function test_Deposit_RevertWhen_InsufficientAllowance() public {
        baseToken.mint(alice, ONE_BASE);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, ONE_BASE)
        );
        vault.deposit(address(baseToken), ONE_BASE);
    }

    function test_Deposit_RevertWhen_InsufficientBalance() public {
        vm.startPrank(alice);
        baseToken.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 0, ONE_BASE));
        vault.deposit(address(baseToken), ONE_BASE);
        vm.stopPrank();
    }

    function test_Deposit_RevertWhen_UnsupportedToken() public {
        MockERC20 rogue = new MockERC20("Rogue", "RGE", 18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.UnsupportedToken.selector, address(rogue)));
        vault.deposit(address(rogue), 1);
    }

    function test_Deposit_RevertWhen_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(UmbraVault.ZeroAmount.selector);
        vault.deposit(address(baseToken), 0);
    }

    // ═══════════════════════ withdraw ═══════════════════════

    function test_Withdraw_Partial() public {
        _fund(alice, baseToken, 5 * ONE_BASE);
        vm.prank(alice);
        vault.withdraw(address(baseToken), 2 * ONE_BASE);

        assertEq(vault.balanceOf(alice, address(baseToken)), 3 * ONE_BASE);
        assertEq(baseToken.balanceOf(alice), 2 * ONE_BASE);
        assertEq(baseToken.balanceOf(address(vault)), 3 * ONE_BASE);
    }

    function test_Withdraw_Full_ZeroesBalance() public {
        _fund(alice, baseToken, 5 * ONE_BASE);
        vm.prank(alice);
        vault.withdrawAll(address(baseToken));

        assertEq(vault.balanceOf(alice, address(baseToken)), 0);
        assertEq(baseToken.balanceOf(address(vault)), 0);
        assertEq(baseToken.balanceOf(alice), 5 * ONE_BASE);
    }

    function test_Withdraw_RevertWhen_ExceedsBalance() public {
        _fund(alice, baseToken, ONE_BASE);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmbraVault.InsufficientBalance.selector, alice, address(baseToken), ONE_BASE + 1, ONE_BASE
            )
        );
        vault.withdraw(address(baseToken), ONE_BASE + 1);
    }

    function test_Withdraw_CannotTouchAnotherUsersBalance() public {
        _fund(alice, baseToken, 5 * ONE_BASE);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(UmbraVault.InsufficientBalance.selector, bob, address(baseToken), ONE_BASE, 0)
        );
        vault.withdraw(address(baseToken), ONE_BASE);

        assertEq(vault.balanceOf(alice, address(baseToken)), 5 * ONE_BASE);
    }

    // ── CLAUDE.md guardrail: withdrawals are never gated by the TEE, operator, or oracle ──

    function test_Withdraw_WorksWhenNoTeeSignerRegistered() public {
        TeeRegistry emptyRegistry = new TeeRegistry(owner);
        UmbraVaultHarness v =
            new UmbraVaultHarness(address(baseToken), address(quoteToken), address(emptyRegistry), owner);

        baseToken.mint(alice, ONE_BASE);
        vm.startPrank(alice);
        baseToken.approve(address(v), ONE_BASE);
        v.deposit(address(baseToken), ONE_BASE);
        v.withdraw(address(baseToken), ONE_BASE);
        vm.stopPrank();

        assertEq(baseToken.balanceOf(alice), ONE_BASE);
    }

    function test_Withdraw_WorksWithBogusTeeSignerRegistered() public {
        vm.prank(owner);
        registry.registerTeeSigner(address(0xDEAD), bytes32(0), "bogus");

        _fund(alice, baseToken, ONE_BASE);
        vm.prank(alice);
        vault.withdraw(address(baseToken), ONE_BASE);
        assertEq(baseToken.balanceOf(alice), ONE_BASE);
    }

    function test_Withdraw_WorksWhenOracleReverts() public {
        _fund(alice, baseToken, ONE_BASE);
        vault.setFeedReverts(true);

        vm.prank(alice);
        vault.withdraw(address(baseToken), ONE_BASE);
        assertEq(baseToken.balanceOf(alice), ONE_BASE);
    }

    function test_Withdraw_WorksAfterSettleReverted() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        bytes memory badSig = _sign(wrongPk, b);

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.InvalidTeeSignature.selector, wrongAddr, teeAddr));
        vault.settleBatch(b, badSig);

        vm.prank(bob);
        vault.withdrawAll(address(baseToken));
        assertEq(baseToken.balanceOf(bob), ONE_BASE);
    }

    // ═══════════════════════ settle: happy paths ═══════════════════════

    function test_Settle_SingleFill_SwapsBalances() public {
        (UmbraVault.Batch memory b, bytes memory sig, uint256 q) = _seedSimpleTrade(2 * ONE_BASE);

        vault.settleBatch(b, sig);

        assertEq(vault.balanceOf(alice, address(baseToken)), 2 * ONE_BASE, "buyer base");
        assertEq(vault.balanceOf(alice, address(quoteToken)), 0, "buyer quote spent");
        assertEq(vault.balanceOf(bob, address(baseToken)), 0, "seller base sold");
        assertEq(vault.balanceOf(bob, address(quoteToken)), q, "seller quote");
        assertEq(vault.lastBatchId(), 1);
    }

    /// The literal demo path, end to end.
    function test_Settle_ThenBothWithdrawEverything_VaultIsEmpty() public {
        (UmbraVault.Batch memory b, bytes memory sig, uint256 q) = _seedSimpleTrade(2 * ONE_BASE);
        vault.settleBatch(b, sig);

        vm.prank(alice);
        vault.withdrawAll(address(baseToken));
        vm.prank(bob);
        vault.withdrawAll(address(quoteToken));

        assertEq(baseToken.balanceOf(alice), 2 * ONE_BASE);
        assertEq(quoteToken.balanceOf(bob), q);
        assertEq(baseToken.balanceOf(address(vault)), 0);
        assertEq(quoteToken.balanceOf(address(vault)), 0);
    }

    /// The TEE signature is the authorization, not msg.sender: anyone may relay a signed batch.
    function test_Settle_IsPermissionless_AnyoneCanRelay() public {
        (UmbraVault.Batch memory b, bytes memory sig,) = _seedSimpleTrade(ONE_BASE);
        vm.prank(relayer);
        vault.settleBatch(b, sig);
        assertEq(vault.lastBatchId(), 1);
    }

    function test_Settle_MultiFill_TwoPairs() public {
        uint256 amtA = 2 * ONE_BASE;
        uint256 amtC = 3 * ONE_BASE;
        uint256 qA = vault.quoteFor(amtA, PRICE);
        uint256 qC = vault.quoteFor(amtC, PRICE);

        _fund(alice, quoteToken, qA);
        _fund(carol, quoteToken, qC);
        _fund(bob, baseToken, amtA);
        _fund(dave, baseToken, amtC);

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](2);
        fills[0] = UmbraVault.Fill(alice, bob, amtA, qA);
        fills[1] = UmbraVault.Fill(carol, dave, amtC, qC);

        UmbraVault.Batch memory b = _batch(1, PRICE, fills);
        vault.settleBatch(b, _sign(teePk, b));

        assertEq(vault.balanceOf(alice, address(baseToken)), amtA);
        assertEq(vault.balanceOf(bob, address(quoteToken)), qA);
        assertEq(vault.balanceOf(carol, address(baseToken)), amtC);
        assertEq(vault.balanceOf(dave, address(quoteToken)), qC);
    }

    function test_Settle_SequentialBatches() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, 2 * q);
        _fund(bob, baseToken, 2 * amt);

        UmbraVault.Batch memory b1 = _batch(1, PRICE, _oneFill(alice, bob, amt, PRICE));
        vault.settleBatch(b1, _sign(teePk, b1));

        UmbraVault.Batch memory b2 = _batch(2, PRICE, _oneFill(alice, bob, amt, PRICE));
        vault.settleBatch(b2, _sign(teePk, b2));

        assertEq(vault.lastBatchId(), 2);
        assertEq(vault.balanceOf(alice, address(baseToken)), 2 * amt);
    }

    // ═══════════════════════ batchId replay protection ═══════════════════════

    function test_Settle_RevertWhen_BatchIdReplayed() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, 2 * q);
        _fund(bob, baseToken, 2 * amt);

        UmbraVault.Batch memory b = _batch(1, PRICE, _oneFill(alice, bob, amt, PRICE));
        bytes memory sig = _sign(teePk, b);
        vault.settleBatch(b, sig);

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.BadBatchId.selector, 2, 1));
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_BatchIdSkipsAhead() public {
        (, bytes memory ignored,) = _seedSimpleTrade(ONE_BASE);
        ignored; // silence

        UmbraVault.Batch memory b = _batch(2, PRICE, _oneFill(alice, bob, ONE_BASE, PRICE));
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.BadBatchId.selector, 1, 2));
        vault.settleBatch(b, _sign(teePk, b));
    }

    function test_Settle_RevertWhen_BatchIdZero() public {
        UmbraVault.Batch memory b = _batch(0, PRICE, _oneFill(alice, bob, ONE_BASE, PRICE));
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.BadBatchId.selector, 1, 0));
        vault.settleBatch(b, _sign(teePk, b));
    }

    // ═══════════════════════ signature: malformed ═══════════════════════

    function test_Settle_RevertWhen_SignatureLengthWrong() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, uint256(64)));
        vault.settleBatch(b, new bytes(64));
    }

    function test_Settle_RevertWhen_SignatureAllZeros() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        vault.settleBatch(b, new bytes(65));
    }

    function test_Settle_RevertWhen_SignatureHasHighS() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teePk, Eip712Lib.batchDigest(block.chainid, address(vault), b));
        bytes32 sHigh = bytes32(SECP256K1_N - uint256(s));
        uint8 vFlip = v == 27 ? 28 : 27;

        vm.expectRevert(abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureS.selector, sHigh));
        vault.settleBatch(b, abi.encodePacked(r, sHigh, vFlip));
    }

    // ═══════════════════════ signature: wrong key / tampering ═══════════════════════

    function test_Settle_RevertWhen_SignedByWrongKey() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.InvalidTeeSignature.selector, wrongAddr, teeAddr));
        vault.settleBatch(b, _sign(wrongPk, b));
    }

    function test_Settle_RevertWhen_TeeSignerNotRegistered() public {
        TeeRegistry emptyRegistry = new TeeRegistry(owner);
        UmbraVaultHarness v =
            new UmbraVaultHarness(address(baseToken), address(quoteToken), address(emptyRegistry), owner);
        v.setFeed(PRICE, 6, nowTs);

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill(alice, bob, ONE_BASE, v.quoteFor(ONE_BASE, PRICE));
        UmbraVault.Batch memory b =
            UmbraVault.Batch({batchId: 1, clearingPrice1e6: PRICE, oracleTs: nowTs, fills: fills});

        vm.expectRevert(UmbraVault.TeeSignerNotSet.selector);
        v.settleBatch(b, _signFor(teePk, block.chainid, address(v), b));
    }

    function test_Settle_RevertWhen_ClearingPriceTamperedAfterSigning() public {
        (UmbraVault.Batch memory b, bytes memory sig,) = _seedSimpleTrade(ONE_BASE);
        b.clearingPrice1e6 = PRICE + 1; // still inside the band, but no longer what was signed
        vm.expectPartialRevert(UmbraVault.InvalidTeeSignature.selector);
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_FillsTamperedAfterSigning() public {
        (UmbraVault.Batch memory b, bytes memory sig,) = _seedSimpleTrade(2 * ONE_BASE);
        b.fills[0].amountBase = ONE_BASE;
        vm.expectPartialRevert(UmbraVault.InvalidTeeSignature.selector);
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_OracleTsTamperedAfterSigning() public {
        (UmbraVault.Batch memory b, bytes memory sig,) = _seedSimpleTrade(ONE_BASE);
        b.oracleTs = nowTs - 1;
        vm.expectPartialRevert(UmbraVault.InvalidTeeSignature.selector);
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_SignedForDifferentVault() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        vm.expectPartialRevert(UmbraVault.InvalidTeeSignature.selector);
        vault.settleBatch(b, _signFor(teePk, block.chainid, address(0xBEEF), b));
    }

    function test_Settle_RevertWhen_SignedForDifferentChainId() public {
        (UmbraVault.Batch memory b,,) = _seedSimpleTrade(ONE_BASE);
        vm.expectPartialRevert(UmbraVault.InvalidTeeSignature.selector);
        vault.settleBatch(b, _signFor(teePk, 115, address(vault), b));
    }

    function test_Settle_UsesLiveRegistrySigner_AfterRotation() public {
        (UmbraVault.Batch memory b, bytes memory oldSig,) = _seedSimpleTrade(ONE_BASE);

        (address newAddr, uint256 newPk) = makeAddrAndKey("tee2");
        vm.prank(owner);
        registry.registerTeeSigner(newAddr, keccak256("att2"), "uri2");

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.InvalidTeeSignature.selector, teeAddr, newAddr));
        vault.settleBatch(b, oldSig);

        vault.settleBatch(b, _sign(newPk, b));
        assertEq(vault.lastBatchId(), 1);
    }

    // ═══════════════════════ price band ═══════════════════════

    /// Funds both sides and builds the signed batch, WITHOUT submitting it. Reverting tests must
    /// use this so that vm.expectRevert binds to settleBatch rather than to a funding call.
    function _prepareAtPrice(uint256 price) internal returns (UmbraVault.Batch memory b, bytes memory sig) {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, price);
        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt);
        b = _batch(1, price, _oneFill(alice, bob, amt, price));
        sig = _sign(teePk, b);
    }

    function _settleAtPrice(uint256 price) internal {
        (UmbraVault.Batch memory b, bytes memory sig) = _prepareAtPrice(price);
        vault.settleBatch(b, sig);
    }

    function test_Settle_PriceExactlyEqualsOracle() public {
        vault.setFeed(1_000_000, 6, nowTs);
        _settleAtPrice(1_000_000);
        assertEq(vault.lastBatchId(), 1);
    }

    function test_Settle_PriceAtUpperBandEdge_Succeeds() public {
        vault.setFeed(1_000_000, 6, nowTs);
        _settleAtPrice(1_005_000); // exactly +50 bps, inclusive
        assertEq(vault.lastBatchId(), 1);
    }

    function test_Settle_PriceAtLowerBandEdge_Succeeds() public {
        vault.setFeed(1_000_000, 6, nowTs);
        _settleAtPrice(995_000); // exactly -50 bps, inclusive
        assertEq(vault.lastBatchId(), 1);
    }

    function test_Settle_RevertWhen_PriceOneUnitAboveBand() public {
        vault.setFeed(1_000_000, 6, nowTs);
        (UmbraVault.Batch memory b, bytes memory sig) = _prepareAtPrice(1_005_001);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmbraVault.PriceOutOfBand.selector, uint256(1_005_001), uint256(1_000_000), uint256(50)
            )
        );
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_PriceOneUnitBelowBand() public {
        vault.setFeed(1_000_000, 6, nowTs);
        (UmbraVault.Batch memory b, bytes memory sig) = _prepareAtPrice(994_999);
        vm.expectRevert(
            abi.encodeWithSelector(
                UmbraVault.PriceOutOfBand.selector, uint256(994_999), uint256(1_000_000), uint256(50)
            )
        );
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_OracleValueZero() public {
        (UmbraVault.Batch memory b, bytes memory sig) = _prepareAtPrice(PRICE);
        vault.setFeed(0, 6, nowTs);
        vm.expectRevert(UmbraVault.OracleZeroPrice.selector);
        vault.settleBatch(b, sig);
    }

    function testFuzz_Settle_AnyPriceInsideBandSucceeds(uint256 p) public {
        vault.setFeed(1_000_000, 6, nowTs);
        p = bound(p, 995_000, 1_005_000);
        _settleAtPrice(p);
        assertEq(vault.lastBatchId(), 1);
    }

    // ═══════════════════════ oracle decimal normalisation ═══════════════════════

    function test_Oracle_Decimals6_IsIdentity() public view {
        assertEq(vault.exposedToPrice1e6(1_010_002, 6), 1_010_002);
    }

    /// FLR/USD really is decimals = 8 on Coston2 while XRP/USD is 6 — this path is not theoretical.
    function test_Oracle_Decimals8_ScalesDown() public view {
        assertEq(vault.exposedToPrice1e6(101_000_200, 8), 1_010_002);
    }

    function test_Oracle_Decimals2_ScalesUp() public view {
        assertEq(vault.exposedToPrice1e6(101, 2), 1_010_000);
    }

    function test_Oracle_Decimals0_ScalesUp() public view {
        assertEq(vault.exposedToPrice1e6(1, 0), 1_000_000);
    }

    function test_Oracle_NegativeDecimals_ScalesUp() public view {
        assertEq(vault.exposedToPrice1e6(1, -1), 10_000_000);
    }

    function test_Oracle_SettlesCorrectlyWithDecimals8Feed() public {
        // Same $1.000000 price expressed with 8 decimals: normalisation must make this in-band.
        vault.setFeed(100_000_000, 8, nowTs);
        _settleAtPrice(1_000_000);
        assertEq(vault.lastBatchId(), 1);
    }

    // ═══════════════════════ oracle staleness ═══════════════════════

    function test_Settle_RevertWhen_ChainFeedStale() public {
        (UmbraVault.Batch memory b, bytes memory sig) = _prepareAtPrice(PRICE);
        vault.setFeed(PRICE, 6, nowTs - 901);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.OracleStale.selector, nowTs - 901, nowTs, uint256(900)));
        vault.settleBatch(b, sig);
    }

    function test_Settle_RevertWhen_BatchOracleTsInFuture() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt);

        UmbraVault.Batch memory b = UmbraVault.Batch({
            batchId: 1, clearingPrice1e6: PRICE, oracleTs: nowTs + 61, fills: _oneFill(alice, bob, amt, PRICE)
        });
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.BatchOracleTsInvalid.selector, nowTs + 61, nowTs));
        vault.settleBatch(b, _sign(teePk, b));
    }

    /// The kill switch: maxOracleAge = 0 disables freshness entirely, so a stalled feed cannot
    /// block a demo.
    function test_Settle_StalenessDisabledWhenMaxOracleAgeZero() public {
        vault.setFeed(PRICE, 6, nowTs - 100_000);
        vm.prank(owner);
        vault.setMaxOracleAge(0);
        _settleAtPrice(PRICE);
        assertEq(vault.lastBatchId(), 1);
    }

    // ═══════════════════════ quote invariant ═══════════════════════

    function test_Settle_RevertWhen_QuoteOneWeiTooHigh() public {
        uint256 amt = 2 * ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, q + 1);
        _fund(bob, baseToken, amt);

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill(alice, bob, amt, q + 1);
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.QuoteMismatch.selector, uint256(0), q + 1, q));
        vault.settleBatch(b, _sign(teePk, b));
    }

    function test_Settle_RevertWhen_QuoteOneWeiTooLow() public {
        uint256 amt = 2 * ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt);

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill(alice, bob, amt, q - 1);
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.QuoteMismatch.selector, uint256(0), q - 1, q));
        vault.settleBatch(b, _sign(teePk, b));
    }

    /// The frozen formula, checked against an independently written expression.
    function testFuzz_QuoteFor_MatchesReferenceFormula(uint96 amountBase, uint32 price) public view {
        uint256 a = bound(uint256(amountBase), 1, 1e30);
        uint256 p = bound(uint256(price), 1, 1e12);
        uint256 expected = (a * p * (10 ** QUOTE_DEC)) / ((10 ** BASE_DEC) * 1e6);
        assertEq(vault.quoteFor(a, p), expected);
    }

    function test_QuoteFor_KnownVector() public view {
        // 10 base at $1.010002 must be 10.100020 quote, expressed in each side's own decimals.
        assertEq(vault.quoteFor(10 * ONE_BASE, 1_010_002), (10_100_020 * ONE_QUOTE) / 1_000_000);
    }

    // ═══════════════════════ escrow / atomicity ═══════════════════════

    function test_Settle_RevertWhen_BuyerQuoteEscrowShort() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, q - 1);
        _fund(bob, baseToken, amt);

        UmbraVault.Batch memory b = _batch(1, PRICE, _oneFill(alice, bob, amt, PRICE));
        vm.expectRevert(
            abi.encodeWithSelector(UmbraVault.InsufficientBalance.selector, alice, address(quoteToken), q, q - 1)
        );
        vault.settleBatch(b, _sign(teePk, b));
    }

    function test_Settle_RevertWhen_SellerBaseEscrowShort() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);
        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt - 1);

        UmbraVault.Batch memory b = _batch(1, PRICE, _oneFill(alice, bob, amt, PRICE));
        vm.expectRevert(
            abi.encodeWithSelector(UmbraVault.InsufficientBalance.selector, bob, address(baseToken), amt, amt - 1)
        );
        vault.settleBatch(b, _sign(teePk, b));
    }

    /// A shortfall in fill[1] must roll back fill[0] entirely — no partial settlement.
    function test_Settle_SecondFillShort_RevertsWholeBatch_NoPartialState() public {
        uint256 amt = ONE_BASE;
        uint256 q = vault.quoteFor(amt, PRICE);

        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt);
        _fund(carol, quoteToken, q);
        _fund(dave, baseToken, amt - 1); // short

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](2);
        fills[0] = UmbraVault.Fill(alice, bob, amt, q);
        fills[1] = UmbraVault.Fill(carol, dave, amt, q);
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);

        vm.expectPartialRevert(UmbraVault.InsufficientBalance.selector);
        vault.settleBatch(b, _sign(teePk, b));

        // every balance byte-identical, and no batchId burned
        assertEq(vault.balanceOf(alice, address(quoteToken)), q);
        assertEq(vault.balanceOf(alice, address(baseToken)), 0);
        assertEq(vault.balanceOf(bob, address(baseToken)), amt);
        assertEq(vault.balanceOf(bob, address(quoteToken)), 0);
        assertEq(vault.balanceOf(carol, address(quoteToken)), q);
        assertEq(vault.balanceOf(dave, address(baseToken)), amt - 1);
        assertEq(vault.lastBatchId(), 0);
    }

    function test_Settle_RevertWhen_FillsArrayEmpty() public {
        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](0);
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);
        vm.expectRevert(UmbraVault.EmptyBatch.selector);
        vault.settleBatch(b, _sign(teePk, b));
        assertEq(vault.lastBatchId(), 0);
    }

    function test_Settle_RevertWhen_SelfTrade() public {
        _fund(alice, quoteToken, vault.quoteFor(ONE_BASE, PRICE));
        _fund(alice, baseToken, ONE_BASE);

        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill(alice, alice, ONE_BASE, vault.quoteFor(ONE_BASE, PRICE));
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);

        vm.expectRevert(abi.encodeWithSelector(UmbraVault.SelfTrade.selector, uint256(0), alice));
        vault.settleBatch(b, _sign(teePk, b));
    }

    function test_Settle_RevertWhen_AmountBaseZero() public {
        UmbraVault.Fill[] memory fills = new UmbraVault.Fill[](1);
        fills[0] = UmbraVault.Fill(alice, bob, 0, 0);
        UmbraVault.Batch memory b = _batch(1, PRICE, fills);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.ZeroFillAmount.selector, uint256(0)));
        vault.settleBatch(b, _sign(teePk, b));
    }

    // ═══════════════════════ conservation of value ═══════════════════════

    function testFuzz_Settle_ConservesTotals(uint96 rawAmt, uint16 rawPrice) public {
        vault.setFeed(1_000_000, 6, nowTs);
        uint256 amt = bound(uint256(rawAmt), ONE_BASE / 1000 + 1, 5 * ONE_BASE);
        uint256 price = bound(uint256(rawPrice), 995_000, 1_005_000);
        uint256 q = vault.quoteFor(amt, price);
        vm.assume(q > 0);

        _fund(alice, quoteToken, q);
        _fund(bob, baseToken, amt);

        uint256 baseBefore = vault.balanceOf(alice, address(baseToken)) + vault.balanceOf(bob, address(baseToken));
        uint256 quoteBefore = vault.balanceOf(alice, address(quoteToken)) + vault.balanceOf(bob, address(quoteToken));

        UmbraVault.Batch memory b = _batch(1, price, _oneFill(alice, bob, amt, price));
        vault.settleBatch(b, _sign(teePk, b));

        uint256 baseAfter = vault.balanceOf(alice, address(baseToken)) + vault.balanceOf(bob, address(baseToken));
        uint256 quoteAfter = vault.balanceOf(alice, address(quoteToken)) + vault.balanceOf(bob, address(quoteToken));

        assertEq(baseAfter, baseBefore, "base conserved");
        assertEq(quoteAfter, quoteBefore, "quote conserved");
        // and the vault remains solvent against its own accounting
        assertEq(baseToken.balanceOf(address(vault)), baseAfter);
        assertEq(quoteToken.balanceOf(address(vault)), quoteAfter);
    }

    // ═══════════════════════ admin ═══════════════════════

    function test_SetMaxDeviationBps_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setMaxDeviationBps(100);
    }

    function test_SetMaxDeviationBps_RespectsCeiling() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.DeviationOutOfRange.selector, uint256(1001)));
        vault.setMaxDeviationBps(1001);

        vm.prank(owner);
        vault.setMaxDeviationBps(1000);
        assertEq(vault.maxDeviationBps(), 1000);
    }

    function test_SetMaxDeviationBps_RevertWhen_Zero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(UmbraVault.DeviationOutOfRange.selector, uint256(0)));
        vault.setMaxDeviationBps(0);
    }

    /// Ownership governs the band only — never custody.
    function test_Owner_CannotTouchUserBalances() public {
        _fund(alice, baseToken, ONE_BASE);
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(UmbraVault.InsufficientBalance.selector, owner, address(baseToken), ONE_BASE, 0)
        );
        vault.withdraw(address(baseToken), ONE_BASE);
        assertEq(vault.balanceOf(alice, address(baseToken)), ONE_BASE);
    }
}

// ─────────────────── the decimals matrix: same body, three pairings ───────────────────

contract UmbraVault_6_6_Test is UmbraVaultTestBase {
    constructor() {
        BASE_DEC = 6;
        QUOTE_DEC = 6;
    }
}

/// The "nasty" pairing called out in the build guide.
contract UmbraVault_18_6_Test is UmbraVaultTestBase {
    constructor() {
        BASE_DEC = 18;
        QUOTE_DEC = 6;
    }
}

contract UmbraVault_6_18_Test is UmbraVaultTestBase {
    constructor() {
        BASE_DEC = 6;
        QUOTE_DEC = 18;
    }
}
