#!/usr/bin/env bash
# Umbra -> Google Cloud Confidential Space (Intel TDX).
#
# Shape cribbed from flare-foundation/flare-ai-kit's deploy-tee.sh, adapted from AMD SEV to
# Intel TDX per build-guide §5.4. Every step is idempotent, so re-running is safe.
#
# Usage: ./engine/deploy-tee.sh [build|push|launch|status|logs|destroy|all]
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# shellcheck disable=SC1091
[[ -f .gcp-env ]] && source .gcp-env
set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
set +a

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID in .gcp-env}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-umbra-tee-1}"
IMAGE_REPO="${IMAGE_REPO:?set IMAGE_REPO in .gcp-env}"
IMAGE_TAG="${IMAGE_TAG:-phase2}"
SA_EMAIL="${SA_EMAIL:?set SA_EMAIL in .gcp-env}"
STATIC_IP="${STATIC_IP:-}"
MACHINE_TYPE="${MACHINE_TYPE:-c3-standard-4}"
CC_TYPE="${CC_TYPE:-TDX}"
IMAGE_FAMILY="${IMAGE_FAMILY:-confidential-space-debug}"

run() { echo "+ $*"; "$@"; }

cmd_build() {
  # The dev host is arm64 Darwin. An arm64 image fails inside the Confidential Space launcher
  # with an opaque exec-format error, so --platform is mandatory, not an optimization.
  command -v docker >/dev/null || { echo "docker missing"; exit 1; }
  docker buildx version >/dev/null || { echo "docker buildx missing"; exit 1; }
  run docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
    -t "${IMAGE_REPO}:${IMAGE_TAG}" --push engine/
}

cmd_digest() {
  gcloud artifacts docker images describe "${IMAGE_REPO}:${IMAGE_TAG}" \
    --project="$PROJECT_ID" --format='value(image_summary.digest)'
}

cmd_launch() {
  local digest
  digest="$(cmd_digest)"
  [[ -n "$digest" ]] || { echo "could not resolve image digest"; exit 1; }
  local reference="${IMAGE_REPO}@${digest}"
  echo "tee-image-reference = $reference"

  local token_sha
  token_sha="$(printf '%s' "${OPERATOR_TOKEN:-}" | shasum -a 256 | cut -d' ' -f1)"

  local address_flag=()
  [[ -n "$STATIC_IP" ]] && address_flag=(--address "$STATIC_IP")

  local public_url="http://${STATIC_IP:-PLACEHOLDER}:8080"

  # ^~^ makes ~ the metadata delimiter so values may contain commas.
  run gcloud compute instances create "$VM_NAME" \
    --project="$PROJECT_ID" --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --confidential-compute-type="$CC_TYPE" \
    --maintenance-policy=TERMINATE \
    --shielded-secure-boot \
    --image-project=confidential-space-images \
    --image-family="$IMAGE_FAMILY" \
    --service-account="$SA_EMAIL" \
    --scopes=cloud-platform \
    --tags=umbra-engine \
    "${address_flag[@]}" \
    --metadata="^~^tee-image-reference=${reference}\
~tee-restart-policy=Never\
~tee-container-log-redirect=true\
~tee-env-TEE_MODE=confidential_space\
~tee-env-VAULT_ADDRESS=${VAULT_ADDRESS}\
~tee-env-REGISTRY_ADDRESS=${REGISTRY_ADDRESS}\
~tee-env-FXRP_ADDRESS=${FXRP_ADDRESS}\
~tee-env-USDT0_ADDRESS=${USDT0_ADDRESS}\
~tee-env-COSTON2_RPC_URL=${COSTON2_RPC_URL}\
~tee-env-OPERATOR_TOKEN_SHA256=${token_sha}\
~tee-env-IMAGE_DIGEST=${digest}\
~tee-env-ENGINE_PUBLIC_URL=${public_url}"
}

cmd_ip() {
  gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
}

cmd_status() {
  local ip; ip="$(cmd_ip)"
  echo "VM   : $VM_NAME  ($ZONE)"
  echo "IP   : $ip"
  echo "state: $(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --format='get(status)')"
  curl -fsS --max-time 8 "http://${ip}:8080/healthz" && echo || echo "  (engine not answering yet)"
  curl -fsS --max-time 8 "http://${ip}:8080/attestation" 2>/dev/null \
    | jq -r '"mode=\(.mode) status=\(.status) hwmodel=\(.decoded.payload.hwmodel) digest=\(.image_digest)"' || true
}

cmd_wait() {
  local ip deadline; ip="$(cmd_ip)"; deadline=$(( $(date +%s) + ${WAIT_SECONDS:-420} ))
  echo "waiting for http://${ip}:8080/healthz ..."
  while (( $(date +%s) < deadline )); do
    if curl -fsS --max-time 5 "http://${ip}:8080/healthz" 2>/dev/null; then echo; return 0; fi
    sleep 10
  done
  echo "timed out; last 40 log lines:"; cmd_logs | tail -40; return 1
}

cmd_logs() {
  # Confidential Space routes container stdout/stderr (tee-container-log-redirect) into the
  # `confidential-space-launcher` log, as jsonPayload.MESSAGE on a gce_instance resource.
  #
  # The previous filter matched on labels."compute.googleapis.com/resource_name" and printed
  # textPayload, and silently returned zero bytes for both reasons — which meant the only window
  # into a running enclave was broken exactly when it would be needed. --freshness is required too:
  # `gcloud logging read` defaults to the last day only.
  gcloud logging read \
    "logName=\"projects/${PROJECT_ID}/logs/confidential-space-launcher\"" \
    --project="$PROJECT_ID" --limit="${LOG_LIMIT:-80}" \
    --format='value(jsonPayload.MESSAGE)' --order=desc --freshness="${LOG_FRESHNESS:-7d}"
}

cmd_destroy() { run gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --project="$PROJECT_ID" --quiet; }

case "${1:-status}" in
  build) cmd_build ;;
  push) cmd_build ;;
  digest) cmd_digest ;;
  launch) cmd_launch ;;
  wait) cmd_wait ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  destroy) cmd_destroy ;;
  all) cmd_build && cmd_launch && cmd_wait && cmd_status ;;
  *) echo "usage: $0 [build|launch|wait|status|logs|destroy|all]"; exit 1 ;;
esac
