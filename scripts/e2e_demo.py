#!/usr/bin/env python3
"""Scripted two-wallet end-to-end rehearsal against Coston2. Phase 4 fills this in.

This is the demo spine and the fallback demo if the frontend slips (build-guide pivot §9-D):
a terminal run that proves real on-chain settlement still beats a pretty mock.

Planned sequence (build-guide §6 Phase 4):

  1. Preflight
       - assert chain id 114 and a fresh FTSOv2 XRP/USD read
       - assert ALICE and BOB hold C2FLR for gas plus their trading tokens
       - assert the engine answers /healthz and /info, and report which TEE_MODE is live
  2. Deposit
       - ALICE approves + deposits USDT0 (buyer side), BOB approves + deposits FXRP (seller side)
       - record vault balanceOf for both before the batch
  3. Two sealed orders
       - build each Order per docs/eip712.json, sign EIP-712 with the trader key
       - seal to the TEE's X25519 pubkey (libsodium sealed box) and POST /orders
       - assert the response carries no plaintext, only {accepted, order_id}
  4. Batch
       - POST /batch/run with the operator token
       - wait for the settleBatch receipt on Coston2, print the tx hash and explorer link
  5. Assertions
       - clearing price is inside maxDeviationBps of a fresh on-chain FTSOv2 read
       - balance deltas mirror exactly: base moves seller -> buyer, quote moves buyer -> seller
       - lastBatchId incremented by exactly 1
       - re-submitting the same batch reverts (replay protection)

Run twice clean before recording the demo video.
"""

raise SystemExit("not implemented until Phase 4 — see docstring for the planned sequence")
