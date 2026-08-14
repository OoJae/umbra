# Umbra — locked narration

**VO_MODE: verbatim.** This copy is final and must not be rewritten, tightened, or re-ordered.
Every claim was verified against the live system on 2026-08-14. Line 18 exists specifically to
avoid an overclaim, and removing it would make the film less accurate, not shorter.

**Audio is user-supplied.** The user records these lines in Clipchamp and returns timed audio.
This project does not run TTS. When the audio arrives, drop it at `assets/vo.wav` (single file) or
`assets/vo/01.wav`…`20.wav` (per-line stems, preferred — it lets each frame's reveals be pinned to
its own line without re-cutting the whole bed).

Line numbers match `../../voiceover-script.md` and the `voiceover:` field on each storyboard frame.

---

| # | Frame | Est. | Line |
|---|---|---|---|
| 01 | 1 | 6.0s | A dark pool exists so that a large order does not move the market against the person placing it. |
| 02 | 1 | 5.2s | To do that, it has to hide your order. Which means you have to trust whoever is holding it. |
| 03 | 2 | 7.6s | Between 2011 and 2018, the SEC fined essentially every major US dark pool operator for misrepresenting how their own venue worked. About three hundred million dollars. |
| 04 | 3 | 8.4s | ITG ran a secret desk that traded two hundred and sixty-two million shares against its own subscribers. Barclays deleted its most predatory trader from the charts it showed clients. Merrill fabricated the execution venue on fifteen million orders. |
| 05 | 4 | 8.0s | Every one of those took between two and six years to surface, and required subpoena power to prove. No customer ever caught any of it from their own fill data. |
| 06 | 4 | 7.2s | The charge was always the same sentence. You did not operate the way you said you did. Which means the whole system is punishment, after the fact, for claims that were never checkable. |
| 07 | 5 | 6.8s | Umbra is a dark pool that does not ask you to believe that sentence. It moves two of those promises somewhere a machine can check them. |
| 08 | 6 | 7.6s | Here is the whole product. You escrow into a vault on Flare. You build an order, and you sign it in your own wallet. |
| 09 | 7 | 8.0s | Then your browser encrypts it to a key that exists only inside a Trusted Execution Environment. What leaves your machine is this. Ciphertext. |
| 10 | 8 | 7.2s | Two real orders are now resting in the book. This is everything the operator holds. The byte length, and the fact that something is there. |
| 11 | 8 | 5.6s | Not the side. Not the size. Not the price. That is what the name means. |
| 12 | 9 | 7.6s | At batch time the enclave decrypts every order, checks every signature itself, reads the oracle, and clears everything that crosses at one uniform price. |
| 13 | 10 | 8.4s | Then the vault does the part that matters. It reads the same oracle itself, and it refuses the batch if the price is more than fifty basis points away. This one cleared at zero. |
| 14 | 10 | 6.4s | A malicious engine cannot settle you off-market. That guarantee holds even if the entire engine is replaced. |
| 15 | 11 | 8.0s | And you do not have to take our word for the enclave either. The attestation is signed by Google, not by us. Intel TDX. Secure boot on. Debug disabled since boot. |
| 16 | 11 | 7.6s | Your browser hashes that token and compares it to what is anchored on Flare. We never ask the engine whether it matched. |
| 17 | 12 | 6.8s | The container registry is public. Pull the exact image the attestation names, and diff it against the source yourself. |
| 18 | 13 | 8.4s | And here is what it cannot do. The attestation covers the signing key, not the encryption key. So an operator willing to serve a substituted key could read orders. That is an active, detectable act. But it is not nothing, so we say it. |
| 19 | 13 | 6.0s | Withdrawals are never gated. Not by the enclave, not by the operator, not by a pause switch, because there isn't one. |
| 20 | 14 | 9.0s | Two hundred and thirty-nine contract tests. Seventy-one engine tests. Live on Flare Coston2. Don't trust it. Check it. |

**Estimated total: 2:28.**

---

## Three timings that decide whether this feels directed

Everything else can drift a little. These cannot:

1. **Line 03** — the `$300 million` counter must finish on the word *"dollars"*.
2. **Line 13** — the deviation counter must land on `0` under the word *"zero"*.
3. **Line 16** — the **✓ MATCH** chip must resolve on the word *"matched"*.

When the recorded audio comes back, read the exact offsets of those three words out of the stems and
pin the counters to them before anything else is adjusted.

## Read direction

Low, unhurried, certain. Not an ad. The material is damning on its own — the moment it sounds like a
pitch it stops sounding true. Full stops are real stops; do not lift at the end of sentences.

Pronunciation: FXRP "eff ex are pee" · FTSOv2 "eff tee ess oh vee two" · TDX "tee dee ex" ·
ITG "eye tee gee" · bps "basis points", never "bips" · Coston2 "COST-on two" · Umbra "UM-bra".
