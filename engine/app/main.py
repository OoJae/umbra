"""Umbra TEE matching engine — FastAPI skeleton (Phase 0).

Phase 2 fills in the real modules (crypto, attestation, models, matching, chain). For now this
exists to prove the container builds and answers /healthz, which is an H2 gate item.

Hard rule from CLAUDE.md: no endpoint on this service may ever return or log decrypted order
plaintext.
"""

import os

from fastapi import FastAPI

app = FastAPI(title="Umbra TEE Engine", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "mode": os.environ.get("TEE_MODE", "simulated"),
        "version": app.version,
    }
