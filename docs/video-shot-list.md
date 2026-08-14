# Demo video shot list — 2:40 target

Everything below is a real URL or element that exists right now. Nothing needs staging beyond
having two browser profiles connected.

**Production notes (from the guide):** 1080p · mic on · **no music over narration** · captions for
contract addresses.

## Before you hit record

1. **Reset the book to a clean state** so counts start at zero:
   `curl -s https://umbra-beta.vercel.app/api/engine/orderbook/public | jq '{count_buys,count_sells}'`
2. **Check which direction has inventory.** Each settled batch rotates Alice's and Bob's holdings,
   so run the E2E script once first (`--reverse` if needed) to confirm the flow is green, then top
   the wallets back up if either side is short.
3. **Have two browser profiles connected** — one on Alice, one on Bob. The Trade page shows the
   connected address, so the cut between them reads clearly on camera.
4. The header strip carries **mode · enclave address · image digest** on every page, so the digest
   is on screen in every shot without cutting to a terminal.

## Shot 1 — 0:00–0:20 · The hook

**Not in this app.** Screen-record a public DEX swap with a mempool inspector open, showing the
naked order.

> "Everyone saw the whale coming. Dark pools were supposed to fix this — and between 2011 and 2018
> the SEC fined essentially every major dark pool operator about three hundred million dollars for
> lying about how their pool actually worked. Nobody caught it from their own fill data. It took
> subpoenas, and years."

Hold on that for a beat before the cut. This is the line that separates us from every other
sealed-bid submission, all of which will open on MEV alone.

## Shot 2 — 0:20–0:50 · The sealed order

**Page:** https://umbra-beta.vercel.app/ (Trade), profile 1.

1. Fill the order form — amount and the "use mid +2%" button. `QuotePreview` shows the live FTSOv2
   price and exactly what will be escrowed.
2. Click **Sign, seal and submit**. MetaMask shows the readable EIP-712 struct — good on camera.
3. The `SubmitSteps` list ticks **sign EIP-712 → crypto_box_seal → POST ciphertext**, with the seal
   time in milliseconds.
4. Open **"What observers see" → tab 2, "The raw POST body"**. It is literally
   `{"ciphertext_b64":"..."}`.
5. Click **"grep the wire for my amount"** → **"not found ✓"**.
6. Scroll to the **Dark Book — even we can't read these**.

> "Not the operator, not the chain, not us."

## Shot 3 — 0:50–1:30 · The match

**Profile 2**, fast cut: submit the opposite side. Then
https://umbra-beta.vercel.app/settlement.

1. Dark Book now reads **1 buy · 1 sell**.
2. Click **Trigger batch**. The progress panel runs an elapsed timer, the live FTSOv2 ticker, and a
   ciphertext marquee for the 10–40 seconds the enclave takes — all real signals.
3. The image digest is in the header strip throughout.

> "The orders are decrypted for the first time inside the enclave, matched at the FTSOv2 mid, and
> settled in a single transaction."

## Shot 4 — 1:30–2:10 · The proof

1. `BatchResultCard` shows **cleared vs oracle** and the deviation in bps — the last run was
   **0 bps of 50**.
2. **The "Your execution" card** — this is the money shot. It shows the connected wallet's own fill:
   FXRP received, USDT0 paid, effective price, and *your price vs the oracle the vault read*. Land
   the line under it: everyone in the batch cleared at the same uniform price, and the vault checked
   that price against FTSOv2 before it moved a balance.

   > "This is the receipt Barclays' clients never got."

3. Click **view on explorer →** for the real `settleBatch` transaction on Coston2.
4. Back to the Fills table and balances — FXRP and USDT0 have swapped sides.
4. Go to https://umbra-beta.vercel.app/verify:
   - **REAL TEE · Intel TDX** badge
   - `hwmodel GCP_INTEL_TDX` · `secboot true` · `dbgstat disabled-since-boot`
   - **On-chain anchor: ✓ MATCH** — the two identical hashes stacked, with the caption that it was
     computed in the browser, not asked of the engine.

> "The vault doesn't take the enclave's word for the price. It reads FTSOv2 itself and refuses
> anything more than half a percent away."

## Shot 5 — 2:10–2:40 · Why Flare, and where it goes

**Page:** https://umbra-beta.vercel.app/how

1. The architecture diagram.
2. The trust-model section — say plainly what the operator *cannot* do, and what they *can*
   (rotate the signer, publicly and detectably).
3. Roadmap: migrating to native FCC — registration is already open on Coston2; we kept our own
   registry so the demo runs unattended through judging week.
4. End card: `github.com/OoJae/umbra` + the addresses table.

> "Confidential compute isn't bolted onto this — a sealed-bid auction is impossible without it.
> Someone has to see the bids to match them. Here that someone is an enclave whose code is
> attested and whose key never leaves it."

## The three lines worth landing

- **"A sealed-bid auction without a TEE is impossible — someone has to see the bids to match
  them."** This is the meaningful-vs-superficial-integration argument in one sentence.
- **"The vault re-reads FTSOv2 itself."** The band is enforced *in the contract*, so a malicious
  engine cannot settle off-market.
- **"Withdrawals are never gated."** Not by the TEE, not by the operator, not by a pause switch —
  there isn't one.

## Reference values

| Thing | Value |
|---|---|
| App | https://umbra-beta.vercel.app |
| Repo | https://github.com/OoJae/umbra |
| UmbraVault | `0x9EFEc298a59c7F4B9C1f1De7116A701bf70f7A10` |
| TeeRegistry | `0x1D67f6aa2b99843ae1ad1335778D94d590B97FB4` |
| TEE signer | `0xcee433588CDB86Ff462095569A9E8D2625beA4DA` |
| Sample settlement | `0xd2e988201a9ad172750be4d88fd3cb04b2bcb9bb38399d53851ac3e3ae3a12a5` |
