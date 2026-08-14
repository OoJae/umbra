# Umbra — demo film · voiceover script

**Target runtime 2:28.** Timings assume a measured product-film read at ~150 wpm (2.5 words/sec).
Every number below was verified against the live system on 2026-08-14 — nothing is illustrative.

**Read direction:** low, unhurried, certain. This is not an ad. The material is damning on its own,
so it should be delivered flat — the moment it sounds like a pitch, it stops sounding true. Full
stops are real stops. Do not lift at the end of sentences.

---

## PART A — shooting script

| # | In | Dur | On screen | Voiceover |
|---|---|---|---|---|
| 01 | 0:00 | 6.0s | Black. The eclipse crescent resolves out of the dark. | A dark pool exists so that a large order does not move the market against the person placing it. |
| 02 | 0:06 | 5.2s | Hold on the crescent. Title: **UMBRA**. | To do that, it has to hide your order. Which means you have to trust whoever is holding it. |
| 03 | 0:11 | 7.6s | Cut to `/record` — the eight cases scroll. | Between 2011 and 2018, the SEC fined essentially every major US dark pool operator for misrepresenting how their own venue worked. About three hundred million dollars. |
| 04 | 0:19 | 8.4s | Case rows land one at a time: ITG, Barclays, Merrill. | I.T.G. ran a secret desk that traded two hundred and sixty-two million shares against its own subscribers. Barclays deleted its most predatory trader from the charts it showed clients. Merrill fabricated the execution venue on fifteen million orders. |
| 05 | 0:27 | 8.0s | Numbers dim out one by one until the screen is empty. | Every one of those took between two and six years to surface, and required subpoena power to prove. **No customer ever caught any of it from their own fill data.** |
| 06 | 0:35 | 7.2s | Text alone on black. | The charge was always the same sentence. *You did not operate the way you said you did.* Which means the whole system is punishment, after the fact, for claims that were never checkable. |
| 07 | 0:43 | 6.8s | Eclipse moves toward totality. | Umbra is a dark pool that does not ask you to believe that sentence. It moves two of those promises somewhere a machine can check them. |
| 08 | 0:49 | 7.6s | Cut to `/app` — the order form, FTSOv2 ticking live. | Here is the whole product. You escrow into a vault on Flare. You build an order, and you sign it in your own wallet. |
| 09 | 0:57 | 8.0s | The seal steps tick: sign, seal, POST. Then the raw POST body. | Then your browser encrypts it to a key that exists only inside a Trusted Execution Environment. What leaves your machine is this. Ciphertext. |
| 10 | 1:05 | 7.2s | Dark Book: one buy, one sell, opaque blobs. | Two real orders are now resting in the book. This is everything the operator holds — the byte length, and the fact that something is there. |
| 11 | 1:12 | 5.6s | Hold on the blobs. Totality on the eclipse. | Not the side. Not the size. Not the price. That is what the name means. |
| 12 | 1:18 | 7.6s | Cut to `/settlement`. Trigger batch. Timer runs. | At batch time the enclave decrypts every order, checks every signature itself, reads the oracle, and clears everything that crosses at one uniform price. |
| 13 | 1:26 | 8.4s | Batch #11 settled card resolves. Deviation counts to **0 bps**. | Then the vault does the part that matters. It reads the same oracle itself, and it refuses the batch if the price is more than fifty basis points away. This one cleared at zero. |
| 14 | 1:34 | 6.4s | Fills table. Two point zero FXRP, two point zero zero three USDT0. | A malicious engine cannot settle you off-market. That guarantee holds even if the entire engine is replaced. |
| 15 | 1:41 | 8.0s | Cut to `/verify`. Claims populate. | And you do not have to take our word for the enclave either. The attestation is signed by Google, not by us. Intel T.D.X. Secure boot on. Debug disabled since boot. |
| 16 | 1:49 | 7.6s | The two hashes stack. **✓ MATCH**. | Your browser hashes that token and compares it to what is anchored on Flare. We never ask the engine whether it matched. |
| 17 | 1:57 | 6.8s | `/proof` — the two shell commands. | The container registry is public. Pull the exact image the attestation names, and diff it against the source yourself. |
| 18 | 2:04 | 8.4s | `/` — the honest-limits section. | And here is what it cannot do. The attestation covers the signing key, not the encryption key — so an operator willing to serve a substituted key could read orders. That is an active, detectable act. But it is not nothing, so we say it. |
| 19 | 2:13 | 6.0s | Limits continue scrolling past. | Withdrawals are never gated. Not by the enclave, not by the operator, not by a pause switch, because there isn't one. |
| 20 | 2:19 | 9.0s | Pull back to the eclipse. Light returns. End card. | Two hundred and thirty-nine contract tests. Seventy-one engine tests. Live on Flare Coston2. Don't trust it. Check it. |

**Total: 2:28.**

---

## PART B — clean read, for Clipchamp

Paste straight into the TTS box. One block per numbered line above — keep the numbering so the
returned audio can be cut back against the table.

```
01. A dark pool exists so that a large order does not move the market against the person placing it.

02. To do that, it has to hide your order. Which means you have to trust whoever is holding it.

03. Between 2011 and 2018, the SEC fined essentially every major US dark pool operator for misrepresenting how their own venue worked. About three hundred million dollars.

04. ITG ran a secret desk that traded two hundred and sixty-two million shares against its own subscribers. Barclays deleted its most predatory trader from the charts it showed clients. Merrill fabricated the execution venue on fifteen million orders.

05. Every one of those took between two and six years to surface, and required subpoena power to prove. No customer ever caught any of it from their own fill data.

06. The charge was always the same sentence. You did not operate the way you said you did. Which means the whole system is punishment, after the fact, for claims that were never checkable.

07. Umbra is a dark pool that does not ask you to believe that sentence. It moves two of those promises somewhere a machine can check them.

08. Here is the whole product. You escrow into a vault on Flare. You build an order, and you sign it in your own wallet.

09. Then your browser encrypts it to a key that exists only inside a Trusted Execution Environment. What leaves your machine is this. Ciphertext.

10. Two real orders are now resting in the book. This is everything the operator holds. The byte length, and the fact that something is there.

11. Not the side. Not the size. Not the price. That is what the name means.

12. At batch time the enclave decrypts every order, checks every signature itself, reads the oracle, and clears everything that crosses at one uniform price.

13. Then the vault does the part that matters. It reads the same oracle itself, and it refuses the batch if the price is more than fifty basis points away. This one cleared at zero.

14. A malicious engine cannot settle you off-market. That guarantee holds even if the entire engine is replaced.

15. And you do not have to take our word for the enclave either. The attestation is signed by Google, not by us. Intel TDX. Secure boot on. Debug disabled since boot.

16. Your browser hashes that token and compares it to what is anchored on Flare. We never ask the engine whether it matched.

17. The container registry is public. Pull the exact image the attestation names, and diff it against the source yourself.

18. And here is what it cannot do. The attestation covers the signing key, not the encryption key. So an operator willing to serve a substituted key could read orders. That is an active, detectable act. But it is not nothing, so we say it.

19. Withdrawals are never gated. Not by the enclave, not by the operator, not by a pause switch, because there isn't one.

20. Two hundred and thirty-nine contract tests. Seventy-one engine tests. Live on Flare Coston2. Don't trust it. Check it.
```

---

## Pronunciation

- **FXRP** — "eff ex are pee"
- **FTSOv2** — "eff tee ess oh vee two"
- **TDX** — "tee dee ex"
- **ITG** — "eye tee gee"
- **bps** — say "basis points", never "bips"
- **Coston2** — "COST-on two"
- **Umbra** — "UM-bra"

## What is deliberately not in this script

- No "revolutionary", "seamless", "game-changing", "powered by".
- No MEV statistics. Sandwich losses are shrinking year over year, and a judge who knows that would
  catch an inflated claim. The enforcement record is the stronger argument and it is not contested.
- No claim that the operator *cannot* read orders. Line 18 exists specifically to not make it.
