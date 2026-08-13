FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Confidential Space ignores every tee-env-* metadata value unless the image author allowlists the
# variable name here. Without this label the workload silently runs with the image defaults, which
# would mean TEE_MODE=simulated on a real TDX VM.
LABEL "tee.launch_policy.allow_env_override"="TEE_MODE,VAULT_ADDRESS,REGISTRY_ADDRESS,FXRP_ADDRESS,USDT0_ADDRESS,COSTON2_RPC_URL,OPERATOR_TOKEN,OPERATOR_TOKEN_SHA256,ENGINE_PUBLIC_URL,ATTESTATION_AUDIENCE,ATTESTATION_REQUIRED,IMAGE_DIGEST,LOG_LEVEL,CHAIN_ID"
# Default is debugonly; "always" keeps stdout reaching Cloud Logging on the production image too.
LABEL "tee.launch_policy.log_redirect"="always"

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app

# Do NOT add a USER directive: /run/container_launcher/teeserver.sock is root-owned, and a
# non-root workload may be unable to open it to fetch the attestation token.
ENV PATH="/app/.venv/bin:$PATH" \
    TEE_MODE=simulated \
    PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
