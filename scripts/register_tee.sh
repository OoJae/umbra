#!/usr/bin/env bash
# Anchor a running enclave's key on-chain, and fund it with gas.
#
# The enclave mints a fresh secp256k1 key on every boot, so this must be re-run after any engine
# restart. It reads the address and attestation straight from the live engine, independently
# recomputes the attestation hash rather than trusting the engine's own report, then registers.
set -euo pipefail

cd "$(dirname "$0")/.."

# Capture the caller's intent BEFORE sourcing .env, which would otherwise clobber it and
# silently anchor the wrong engine's key.
CALLER_ENGINE_URL="${ENGINE_URL:-}"
CALLER_ENGINE_PUBLIC_URL="${ENGINE_PUBLIC_URL:-}"

set -a
# shellcheck disable=SC1091
source .env
set +a

ENGINE_URL="${CALLER_ENGINE_URL:-${ENGINE_URL:-http://127.0.0.1:8080}}"
ENGINE_PUBLIC_URL="${CALLER_ENGINE_PUBLIC_URL:-$ENGINE_URL}"
MIN_GAS_WEI="${MIN_GAS_WEI:-1000000000000000000}"   # 1 C2FLR
TOPUP="${TOPUP:-5ether}"

INFO=$(curl -fsS --max-time 10 "$ENGINE_URL/info")
ATT=$(curl -fsS --max-time 20 "$ENGINE_URL/attestation")

TEE_SIGNER_ADDRESS=$(jq -r .tee_eth_address <<<"$INFO")
MODE=$(jq -r .mode <<<"$INFO")
TEE_ATTESTATION_HASH=$(jq -r .keccak256 <<<"$ATT")
ATT_STATUS=$(jq -r .status <<<"$ATT")
IMAGE_DIGEST=$(jq -r '.image_digest // "none"' <<<"$ATT")
TEE_ATTESTATION_URI="${ENGINE_PUBLIC_URL%/}/attestation"

[[ "$TEE_SIGNER_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "bad signer address"; exit 1; }
[[ "$TEE_ATTESTATION_HASH" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "bad attestation hash"; exit 1; }

# Recompute the hash ourselves. If the engine were lying about its own attestation, this catches
# it before the wrong value is anchored on-chain.
RECOMPUTED=$(jq -r .raw <<<"$ATT" | tr -d '\n' | cast keccak)
if [[ "$(echo "$RECOMPUTED" | tr 'A-Z' 'a-z')" != "$(echo "$TEE_ATTESTATION_HASH" | tr 'A-Z' 'a-z')" ]]; then
  echo "attestation hash mismatch: engine says $TEE_ATTESTATION_HASH, recomputed $RECOMPUTED"
  exit 1
fi

echo "mode=$MODE  attestation=$ATT_STATUS  image=$IMAGE_DIGEST"
echo "signer=$TEE_SIGNER_ADDRESS"
echo "hash=$TEE_ATTESTATION_HASH"
echo "uri=$TEE_ATTESTATION_URI"

BALANCE=$(cast balance "$TEE_SIGNER_ADDRESS" --rpc-url "$COSTON2_RPC_URL")
if [[ "$(python3 -c "print(1 if $BALANCE < $MIN_GAS_WEI else 0)")" == "1" ]]; then
  echo "funding enclave with $TOPUP ..."
  cast send "$TEE_SIGNER_ADDRESS" --value "$TOPUP" \
    --private-key "$DEPLOYER_PRIVATE_KEY" --rpc-url "$COSTON2_RPC_URL" --json \
    | jq -r '"  funding tx " + .transactionHash'
fi

export TEE_SIGNER_ADDRESS TEE_ATTESTATION_HASH TEE_ATTESTATION_URI
# forge resolves the script path relative to cwd, so run from inside the Foundry project.
(cd contracts && forge script script/RegisterTee.s.sol:RegisterTee \
  --rpc-url "$COSTON2_RPC_URL" --broadcast 2>&1 | tail -8)

echo "=== independent post-conditions, read from chain ==="
echo "  teeSigner():       $(cast call "$REGISTRY_ADDRESS" 'teeSigner()(address)' --rpc-url "$COSTON2_RPC_URL")"
echo "  attestationHash(): $(cast call "$REGISTRY_ADDRESS" 'attestationHash()(bytes32)' --rpc-url "$COSTON2_RPC_URL")"
echo "  enclave balance:   $(cast balance "$TEE_SIGNER_ADDRESS" --rpc-url "$COSTON2_RPC_URL" --ether) C2FLR"
