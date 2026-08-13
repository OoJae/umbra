// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// Plain ReentrancyGuard. Coston2 does support TSTORE, so the Transient variant would work, but the
// storage-based guard costs a few thousand gas on a transaction already well over 200k and keeps
// the contract portable to any chain we might later target.
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";

import {TeeRegistry} from "./TeeRegistry.sol";

/// @title UmbraVault — custody and settlement for the Umbra sealed-bid dark pool.
/// @notice Traders escrow base (FXRP) and quote (USDT0) here. A TEE matches sealed orders off-chain
///         and submits one EIP-712-signed Batch; this contract independently verifies that the
///         signer is the attested TEE key and that the clearing price sits inside a tight band of a
///         fresh on-chain FTSOv2 read before moving any balances.
/// @dev    Withdrawals are never gated by the TEE, the operator, or any pause — a liveness failure
///         can never become a fund-loss failure. There is deliberately no sweep/rescue function.
contract UmbraVault is EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────── types (mirror docs/eip712.json exactly) ───────────────────────────

    /// @dev side: 0 = BUY, 1 = SELL. Kept as uint8 rather than an enum so that calldata decoding
    ///      never reverts on an out-of-range value and the ABI type matches the frozen JSON.
    struct Order {
        address trader;
        uint8 side;
        uint256 amountBase;
        uint256 limitPrice1e6;
        uint256 nonce;
        uint256 deadline;
    }

    struct Fill {
        address buyer;
        address seller;
        uint256 amountBase;
        uint256 amountQuote;
    }

    struct Batch {
        uint256 batchId;
        uint256 clearingPrice1e6;
        uint64 oracleTs;
        Fill[] fills;
    }

    // ─────────────────────────── constants ───────────────────────────

    bytes21 public constant XRP_USD_FEED_ID = bytes21(0x015852502f55534400000000000000000000000000);
    uint256 public constant PRICE_SCALE = 1e6;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Hard cap on owner power: the band can never be widened past 10%.
    uint256 public constant MAX_DEVIATION_BPS_CEILING = 1_000;
    uint256 public constant MAX_ORACLE_AGE_CEILING = 6 hours;
    /// @dev $1e12 per XRP. A sanity clamp that makes the band arithmetic provably panic-free.
    uint256 public constant MAX_PRICE_1E6 = 1e18;
    uint256 public constant MAX_FILLS = 256;
    uint256 public constant MAX_TOKEN_DECIMALS = 36;

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "Order(address trader,uint8 side,uint256 amountBase,uint256 limitPrice1e6,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant FILL_TYPEHASH =
        keccak256("Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)");
    /// @dev EIP-712 encodeType: primary type first, then referenced types sorted by name. Adjacent
    ///      string literals concatenate at compile time.
    bytes32 public constant BATCH_TYPEHASH = keccak256(
        "Batch(uint256 batchId,uint256 clearingPrice1e6,uint64 oracleTs,Fill[] fills)"
        "Fill(address buyer,address seller,uint256 amountBase,uint256 amountQuote)"
    );

    // ─────────────────────────── immutables ───────────────────────────

    IERC20 public immutable baseToken;
    IERC20 public immutable quoteToken;
    uint8 public immutable baseDecimals;
    uint8 public immutable quoteDecimals;
    /// @dev Exactly one of quoteScaleNum / quoteScaleDen is always 1. See _quoteForBase.
    uint256 public immutable quoteScaleNum;
    uint256 public immutable quoteScaleDen;
    TeeRegistry public immutable teeRegistry;

    // ─────────────────────────── storage ───────────────────────────

    /// @notice Maximum allowed deviation of a batch's clearing price from the on-chain FTSOv2 mid.
    uint256 public maxDeviationBps = 50;
    /// @notice Maximum accepted age of an oracle reading, in seconds. 0 disables the check.
    uint256 public maxOracleAge = 900;
    /// @notice Strictly increasing; the replay-protection counter.
    uint256 public lastBatchId;

    mapping(address user => mapping(address token => uint256 amount)) public balanceOf;

    // ─────────────────────────── errors ───────────────────────────

    error ZeroAddress();
    error SameToken();
    error DecimalsOutOfRange(uint8 decimals_);
    error UnsupportedToken(address token);
    error ZeroAmount();
    error InsufficientBalance(address user, address token, uint256 requested, uint256 available);
    error BadBatchId(uint256 expected, uint256 provided);
    error EmptyBatch();
    error TooManyFills(uint256 provided, uint256 max);
    error InvalidClearingPrice(uint256 clearingPrice1e6);
    error TeeSignerNotSet();
    error InvalidTeeSignature(address recovered, address expected);
    error OracleZeroPrice();
    error OracleDecimalsOutOfRange(int8 decimals_);
    error OraclePriceOutOfRange(uint256 value);
    error OracleStale(uint64 feedTs, uint64 blockTs, uint256 maxAge);
    error BatchOracleTsInvalid(uint64 claimedTs, uint64 blockTs);
    error PriceOutOfBand(uint256 clearingPrice1e6, uint256 oraclePrice1e6, uint256 maxDeviationBps);
    error QuoteMismatch(uint256 fillIndex, uint256 provided, uint256 expected);
    error ZeroFillAmount(uint256 fillIndex);
    error SelfTrade(uint256 fillIndex, address party);
    error DeviationOutOfRange(uint256 bps);
    error OracleAgeOutOfRange(uint256 age);

    // ─────────────────────────── events ───────────────────────────

    event Deposited(address indexed user, address indexed token, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 newBalance);

    /// @dev One log per fill so the frontend can render the fills table straight from logs.
    event FillSettled(
        uint256 indexed batchId,
        address indexed buyer,
        address indexed seller,
        uint256 fillIndex,
        uint256 amountBase,
        uint256 amountQuote
    );

    /// @dev Carries both the price the TEE cleared at and the price this contract independently
    ///      read, plus both oracle timestamps, so the settlement page can show the comparison and
    ///      the honest enclave-to-chain lag from a single log. batchDigest lets a client
    ///      re-recover the signature.
    ///      Deliberately omitted because they are already derivable and the extra stack slots cost
    ///      a stack-too-deep: relayer and settledAt (both on the receipt/block) and
    ///      totalBase/totalQuote (sum the FillSettled logs).
    event BatchSettled(
        uint256 indexed batchId,
        address indexed teeSigner,
        uint256 clearingPrice1e6,
        uint256 oraclePrice1e6,
        uint64 batchOracleTs,
        uint64 chainOracleTs,
        uint256 fillCount,
        bytes32 batchDigest
    );

    event MaxDeviationBpsUpdated(uint256 previousBps, uint256 newBps);
    event MaxOracleAgeUpdated(uint256 previousAge, uint256 newAge);

    // ─────────────────────────── constructor ───────────────────────────

    constructor(address baseToken_, address quoteToken_, address teeRegistry_, address initialOwner)
        EIP712("Umbra", "1")
        Ownable(initialOwner)
    {
        if (baseToken_ == address(0) || quoteToken_ == address(0) || teeRegistry_ == address(0)) {
            revert ZeroAddress();
        }
        if (baseToken_ == quoteToken_) revert SameToken();

        baseToken = IERC20(baseToken_);
        quoteToken = IERC20(quoteToken_);
        teeRegistry = TeeRegistry(teeRegistry_);

        uint8 bd = IERC20Metadata(baseToken_).decimals();
        uint8 qd = IERC20Metadata(quoteToken_).decimals();
        if (bd > MAX_TOKEN_DECIMALS) revert DecimalsOutOfRange(bd);
        if (qd > MAX_TOKEN_DECIMALS) revert DecimalsOutOfRange(qd);
        baseDecimals = bd;
        quoteDecimals = qd;

        int256 d = int256(uint256(qd)) - int256(uint256(bd)) - int256(6);
        uint256 num;
        uint256 den;
        if (d >= 0) {
            num = 10 ** uint256(d);
            den = 1;
        } else {
            num = 1;
            den = 10 ** uint256(-d);
        }
        quoteScaleNum = num;
        quoteScaleDen = den;
    }

    // ─────────────────── custody: never gated by the TEE, the operator, or a pause ───────────────────

    function deposit(address token, uint256 amount) external nonReentrant {
        _requireSupported(token);
        if (amount == 0) revert ZeroAmount();

        IERC20 t = IERC20(token);
        uint256 balBefore = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        // Credit what actually arrived, not what was requested, so a fee-on-transfer token can
        // never make the vault credit more than it holds.
        uint256 received = t.balanceOf(address(this)) - balBefore;
        if (received == 0) revert ZeroAmount();

        uint256 newBalance = balanceOf[msg.sender][token] + received;
        balanceOf[msg.sender][token] = newBalance;
        emit Deposited(msg.sender, token, received, newBalance);
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        _requireSupported(token);
        if (amount == 0) revert ZeroAmount();

        uint256 bal = balanceOf[msg.sender][token];
        if (bal < amount) revert InsufficientBalance(msg.sender, token, amount, bal);

        uint256 newBalance;
        unchecked {
            newBalance = bal - amount;
        }
        balanceOf[msg.sender][token] = newBalance;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount, newBalance);
    }

    function withdrawAll(address token) external nonReentrant {
        _requireSupported(token);
        uint256 bal = balanceOf[msg.sender][token];
        if (bal == 0) revert ZeroAmount();

        balanceOf[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, bal);
        emit Withdrawn(msg.sender, token, bal, 0);
    }

    // ─────────────────────────── settlement ───────────────────────────

    /// @notice Apply a TEE-signed batch of fills. Permissionless: the signature is the
    ///         authorization, so the operator cannot censor a batch once the enclave has signed it.
    /// @dev The body is split across _validateShape / _verifySigner / _checkOracleAndBand /
    ///      _applyFills purely to keep the stack shallow; solc cannot hold this many live locals in
    ///      one frame. The guide's five-step order is preserved exactly.
    function settleBatch(Batch calldata b, bytes calldata teeSig) external nonReentrant {
        // (1) Replay protection. lastBatchId is bumped immediately rather than at the end so that
        //     reentry through the oracle read below cannot re-apply this batch, independent of the
        //     nonReentrant guard. A later revert rolls it back.
        if (b.batchId != lastBatchId + 1) revert BadBatchId(lastBatchId + 1, b.batchId);
        lastBatchId = b.batchId;

        _validateShape(b);

        // (2) The signer must be the currently attested TEE key.
        bytes32 digest = _hashTypedDataV4(_hashBatch(b));
        address recovered = _verifySigner(digest, teeSig);

        // (3) Independent on-chain FTSOv2 read, freshness, then the band.
        (uint256 oracle1e6, uint64 chainOracleTs) = _checkOracleAndBand(b);

        // (4) Apply every fill atomically. Any shortfall reverts the whole batch.
        _applyFills(b);

        // (5) Commit.
        emit BatchSettled(
            b.batchId, recovered, b.clearingPrice1e6, oracle1e6, b.oracleTs, chainOracleTs, b.fills.length, digest
        );
    }

    function _validateShape(Batch calldata b) private pure {
        uint256 n = b.fills.length;
        if (n == 0) revert EmptyBatch();
        if (n > MAX_FILLS) revert TooManyFills(n, MAX_FILLS);
        if (b.clearingPrice1e6 == 0 || b.clearingPrice1e6 > MAX_PRICE_1E6) {
            revert InvalidClearingPrice(b.clearingPrice1e6);
        }
    }

    function _verifySigner(bytes32 digest, bytes calldata teeSig) private view returns (address recovered) {
        recovered = ECDSA.recoverCalldata(digest, teeSig);
        address expected = teeRegistry.teeSigner();
        if (expected == address(0)) revert TeeSignerNotSet();
        if (recovered != expected) revert InvalidTeeSignature(recovered, expected);
    }

    function _checkOracleAndBand(Batch calldata b) private returns (uint256 oracle1e6, uint64 chainOracleTs) {
        uint256 rawValue;
        int8 rawDecimals;
        (rawValue, rawDecimals, chainOracleTs) = _readFeed();
        if (rawValue == 0) revert OracleZeroPrice();
        oracle1e6 = _toPrice1e6(rawValue, rawDecimals);
        if (oracle1e6 == 0) revert OracleZeroPrice();
        if (oracle1e6 > MAX_PRICE_1E6) revert OraclePriceOutOfRange(oracle1e6);

        uint256 age = maxOracleAge;
        if (age != 0) {
            if (block.timestamp > chainOracleTs && block.timestamp - chainOracleTs > age) {
                revert OracleStale(chainOracleTs, uint64(block.timestamp), age);
            }
            // The TEE's claimed read must be recent and never from the future. Deliberately NOT
            // required to equal chainOracleTs: block-latency feeds tick every block, so the
            // timestamps legitimately differ between the enclave's read and this transaction.
            if (b.oracleTs == 0 || b.oracleTs > block.timestamp + 60) {
                revert BatchOracleTsInvalid(b.oracleTs, uint64(block.timestamp));
            }
            if (block.timestamp > b.oracleTs && block.timestamp - b.oracleTs > age) {
                revert OracleStale(b.oracleTs, uint64(block.timestamp), age);
            }
        }

        // Division-free and symmetric. The oracle is the denominator on purpose: a supplied
        // clearing price must never be able to widen its own tolerance.
        uint256 diff = b.clearingPrice1e6 >= oracle1e6 ? b.clearingPrice1e6 - oracle1e6 : oracle1e6 - b.clearingPrice1e6;
        if (diff * BPS_DENOMINATOR > oracle1e6 * maxDeviationBps) {
            revert PriceOutOfBand(b.clearingPrice1e6, oracle1e6, maxDeviationBps);
        }
    }

    function _applyFills(Batch calldata b) private {
        address bt = address(baseToken);
        address qt = address(quoteToken);
        uint256 n = b.fills.length;

        for (uint256 i = 0; i < n; ++i) {
            Fill calldata f = b.fills[i];
            if (f.amountBase == 0) revert ZeroFillAmount(i);
            if (f.buyer == f.seller) revert SelfTrade(i, f.buyer);

            uint256 q = _quoteForBase(f.amountBase, b.clearingPrice1e6);
            // Floor rounding can take a dust fill to zero quote; base must never move for free.
            if (q == 0) revert ZeroFillAmount(i);
            if (f.amountQuote != q) revert QuoteMismatch(i, f.amountQuote, q);

            _debit(f.buyer, qt, q);
            _debit(f.seller, bt, f.amountBase);
            balanceOf[f.buyer][bt] += f.amountBase;
            balanceOf[f.seller][qt] += q;

            emit FillSettled(b.batchId, f.buyer, f.seller, i, f.amountBase, q);
        }
    }

    // ─────────────────────────── views ───────────────────────────

    /// @notice The settlement formula, callable off-chain. The engine must eth_call this for every
    ///         fill before signing a batch, so a formula disagreement becomes a refusal to sign
    ///         rather than a reverted settlement.
    function quoteFor(uint256 amountBase, uint256 clearingPrice1e6) external view returns (uint256) {
        return _quoteForBase(amountBase, clearingPrice1e6);
    }

    /// @notice Live XRP/USD normalized to 1e6, readable via eth_call.
    /// @dev Uses TestFtsoV2Interface, which is declared `view` and resolves to the same on-chain
    ///      address as the production interface. Testnet-only — settlement deliberately does not
    ///      depend on it (see _readFeed).
    function peekPrice1e6() public view returns (uint256 price1e6, uint64 oracleTs) {
        (uint256 v, int8 d, uint64 t) = ContractRegistry.getTestFtsoV2().getFeedById(XRP_USD_FEED_ID);
        return (_toPrice1e6(v, d), t);
    }

    /// @notice Would this clearing price pass the band right now? For the order form and engine.
    function previewBand(uint256 clearingPrice1e6)
        external
        view
        returns (bool ok, uint256 oracle1e6, uint256 deviationBps)
    {
        (oracle1e6,) = peekPrice1e6();
        if (oracle1e6 == 0) return (false, 0, type(uint256).max);
        uint256 diff = clearingPrice1e6 >= oracle1e6 ? clearingPrice1e6 - oracle1e6 : oracle1e6 - clearingPrice1e6;
        deviationBps = (diff * BPS_DENOMINATOR) / oracle1e6;
        ok = deviationBps <= maxDeviationBps;
    }

    function hashBatch(Batch calldata b) external view returns (bytes32) {
        return _hashTypedDataV4(_hashBatch(b));
    }

    function hashOrder(Order calldata o) external view returns (bytes32) {
        return _hashTypedDataV4(_hashOrder(o));
    }

    function recoverBatchSigner(Batch calldata b, bytes calldata sig) external view returns (address) {
        return ECDSA.recoverCalldata(_hashTypedDataV4(_hashBatch(b)), sig);
    }

    function recoverOrderSigner(Order calldata o, bytes calldata sig) external view returns (address) {
        return ECDSA.recoverCalldata(_hashTypedDataV4(_hashOrder(o)), sig);
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function nextBatchId() external view returns (uint256) {
        return lastBatchId + 1;
    }

    function isSupportedToken(address token) external view returns (bool) {
        return token == address(baseToken) || token == address(quoteToken);
    }

    function balancesOf(address user) external view returns (uint256 baseBal, uint256 quoteBal) {
        return (balanceOf[user][address(baseToken)], balanceOf[user][address(quoteToken)]);
    }

    // ───────────────────── admin: the band only, never custody ─────────────────────

    function setMaxDeviationBps(uint256 newBps) external onlyOwner {
        if (newBps == 0 || newBps > MAX_DEVIATION_BPS_CEILING) revert DeviationOutOfRange(newBps);
        emit MaxDeviationBpsUpdated(maxDeviationBps, newBps);
        maxDeviationBps = newBps;
    }

    function setMaxOracleAge(uint256 newAge) external onlyOwner {
        if (newAge > MAX_ORACLE_AGE_CEILING) revert OracleAgeOutOfRange(newAge);
        emit MaxOracleAgeUpdated(maxOracleAge, newAge);
        maxOracleAge = newAge;
    }

    // ─────────────────────────── internals ───────────────────────────

    /// @notice Reads the live XRP/USD feed from FTSOv2.
    /// @dev Non-view by necessity: the production FtsoV2Interface.getFeedById is `external payable`.
    ///      ContractRegistry is a library whose internal accessors inline a hardcoded address, so
    ///      this function is the only mock seam in the contract. It returns the raw triple rather
    ///      than a normalized price so that _toPrice1e6 is itself exercised by the test suite.
    ///      Block-latency feeds are free, so it is called with zero value.
    function _readFeed() internal virtual returns (uint256 value, int8 decimals, uint64 timestamp) {
        return ContractRegistry.getFtsoV2().getFeedById(XRP_USD_FEED_ID);
    }

    /// @dev price1e6 = value * 10^(6 - decimals). Handles decimals above 6, below 6, and negative
    ///      (int8 sign-extends into int256). Truncation here affects the band check only —
    ///      settlement always uses the signed clearing price.
    function _toPrice1e6(uint256 value, int8 decimals) internal pure returns (uint256 price1e6) {
        if (decimals > 30 || decimals < -30) revert OracleDecimalsOutOfRange(decimals);
        int256 shift = int256(6) - int256(decimals);
        if (shift >= 0) {
            (bool ok, uint256 p) = Math.tryMul(value, 10 ** uint256(shift));
            if (!ok) revert OraclePriceOutOfRange(value);
            price1e6 = p;
        } else {
            price1e6 = value / (10 ** uint256(-shift));
        }
    }

    /// @notice THE settlement formula. Mirrored byte-for-byte in engine/app/matching.py.
    ///         amountQuote = floor(amountBase * clearingPrice1e6 * 10^quoteDec / (10^baseDec * 1e6))
    ///                     = floor(amountBase * clearingPrice1e6 * quoteScaleNum / quoteScaleDen)
    /// @dev Floor rounding, chosen because Math.mulDiv, Solidity `/` and Python `//` all floor for
    ///      free — any other direction needs hand-rolled adjustments that diverge across languages
    ///      exactly where the division is exact. mulDiv keeps the numerator at full 512-bit
    ///      precision, so the only revert path is a genuine overflow of the result. Rounding shifts
    ///      at most one quote unit between counterparties and can never affect solvency, since the
    ///      same integer is debited from the buyer and credited to the seller.
    function _quoteForBase(uint256 amountBase, uint256 clearingPrice1e6) internal view returns (uint256) {
        return Math.mulDiv(amountBase, clearingPrice1e6 * quoteScaleNum, quoteScaleDen);
    }

    function _hashFill(Fill calldata f) internal pure returns (bytes32) {
        return keccak256(abi.encode(FILL_TYPEHASH, f.buyer, f.seller, f.amountBase, f.amountQuote));
    }

    /// @dev EIP-712 array encoding is the keccak of the bare concatenation of the elements'
    ///      struct hashes. encodePacked over bytes32[] emits exactly 32*n bytes; abi.encode would
    ///      prepend an offset and a length and break parity with eth_account and viem.
    function _hashFills(Fill[] calldata fills) internal pure returns (bytes32) {
        uint256 n = fills.length;
        bytes32[] memory hashes = new bytes32[](n);
        for (uint256 i = 0; i < n; ++i) {
            hashes[i] = _hashFill(fills[i]);
        }
        return keccak256(abi.encodePacked(hashes));
    }

    function _hashBatch(Batch calldata b) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(BATCH_TYPEHASH, b.batchId, b.clearingPrice1e6, uint256(b.oracleTs), _hashFills(b.fills))
            );
    }

    function _hashOrder(Order calldata o) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(ORDER_TYPEHASH, o.trader, uint256(o.side), o.amountBase, o.limitPrice1e6, o.nonce, o.deadline)
        );
    }

    function _debit(address user, address token, uint256 amount) private {
        uint256 bal = balanceOf[user][token];
        if (bal < amount) revert InsufficientBalance(user, token, amount, bal);
        unchecked {
            balanceOf[user][token] = bal - amount;
        }
    }

    function _requireSupported(address token) private view {
        if (token != address(baseToken) && token != address(quoteToken)) revert UnsupportedToken(token);
    }
}
