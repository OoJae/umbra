// Vendored byte-for-byte from docs/eip712.json — the frozen single source of truth.
// Vercel deploys only web/, so importing across the repo root builds locally and fails in
// production. engine/app/eip712.json is vendored the same way for the same reason.
export const EIP712_SPEC = {
  "_comment": [
    "SINGLE SOURCE OF TRUTH for EIP-712 across contracts/, engine/, and web/.",
    "The build guide contradicts itself: §2 lists `vault` and `chainId` as Order struct members,",
    "while §6 (models.py) puts them in the EIP-712 domain. Resolved to the DOMAIN version.",
    "Rationale: that is exactly what the domain separator provides (same replay protection), it is",
    "the native shape for viem/wagmi signTypedData and eth_account.sign_typed_data so all three",
    "languages get parity for free, and duplicating the fields creates a second place for the",
    "digest to diverge. See PROGRESS.md DECISIONS.",
    "verifyingContract is filled with the deployed UmbraVault address at the end of Phase 1."
  ],
  "domain": {
    "name": "Umbra",
    "version": "1",
    "chainId": 114,
    "verifyingContract": "0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10"
  },
  "types": {
    "Order": [
      {
        "name": "trader",
        "type": "address"
      },
      {
        "name": "side",
        "type": "uint8"
      },
      {
        "name": "amountBase",
        "type": "uint256"
      },
      {
        "name": "limitPrice1e6",
        "type": "uint256"
      },
      {
        "name": "nonce",
        "type": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "Fill": [
      {
        "name": "buyer",
        "type": "address"
      },
      {
        "name": "seller",
        "type": "address"
      },
      {
        "name": "amountBase",
        "type": "uint256"
      },
      {
        "name": "amountQuote",
        "type": "uint256"
      }
    ],
    "Batch": [
      {
        "name": "batchId",
        "type": "uint256"
      },
      {
        "name": "clearingPrice1e6",
        "type": "uint256"
      },
      {
        "name": "oracleTs",
        "type": "uint64"
      },
      {
        "name": "fills",
        "type": "Fill[]"
      }
    ]
  },
  "sideEnum": {
    "BUY": 0,
    "SELL": 1
  },
  "notes": [
    "Order is signed by the trader in the browser; the TEE verifies it after decryption.",
    "Batch is signed by the TEE key; UmbraVault.settleBatch recovers it and requires it to equal",
    "TeeRegistry.teeSigner(). Both use the same domain.",
    "limitPrice1e6 and clearingPrice1e6 are XRP/USD scaled to 1e6. The live Coston2 XRP/USD feed",
    "already reports decimals=6, so the common case is a 1:1 mapping, but the contract still",
    "normalizes generically because FTSOv2 may change a feed's decimals."
  ]
} as const;

// Filtered to the primary type's closure. The spec holds Order, Fill and Batch, and both Order
// and Batch are unreferenced roots, so passing the whole dict makes primary-type inference
// ambiguous in some signers. viem takes an explicit primaryType, but filtering keeps the browser
// byte-identical to the engine and the Foundry tests.
export const ORDER_TYPES = { Order: EIP712_SPEC.types.Order } as const;
export const SIDE = { BUY: 0, SELL: 1 } as const;
