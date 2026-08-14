---
format: 1920x1080
duration: 148s
message: You should not have to trust a dark pool operator — Umbra makes the two claims worth lying about checkable before the trade.
arc: Promise → Betrayal → Turn → Mechanism → Proof → Limits → Close
audience: Flare Summer Signal judges; XRPfi funds and OTC desks
mode: collaborative
music: tense-minimal-bed
---

# Umbra — demo film

Every screen in this film is a real capture of the live system taken while driving it on
2026-08-14, including a real settlement (batch #11) on Flare Coston2. Nothing is mocked.

Voiceover is **verbatim** from `../../voiceover-script.md`. Line numbers below (`VO 01`…`VO 20`) map
1:1 to that file, so the returned Clipchamp audio can be cut straight against these frames.

---

## Frame 1 — The promise

- status: outline
- duration: 11.2s
- transition_in: cut
- scene: A crescent resolves out of black. What a dark pool is for, and the catch.
- voiceover: VO 01 + VO 02
- blueprint: titlecard-reveal
- asset_candidates: 01-hero.png
- poster: 6

Open on true black and let the eclipse crescent arrive before any word does. The film should feel
like it starts in the dark on purpose.

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–2.2 | Black. The crescent fades up at 40% scale, centred right. | full-bleed, focal right-of-centre | `ambient-glow-bloom` on the corona, opacity 0→1 over 1.6s, ease expo.out |
| 2.2–6.0 | VO 01 lands. Nothing on screen but the crescent, breathing. | — | slow 1.00→1.04 scale drift, continuous, no easing snap |
| 6.0–9.0 | Word **UMBRA** sets in IBM Plex Mono, 0.22em tracked, bottom-left, against the ash rule. | lower-left chrome | `discrete-text-sequence`, letters settle, 60ms stagger |
| 9.0–11.2 | VO 02's "trust whoever is holding it" — the crescent dims 15%. | — | opacity 1→0.85, hold |

Do **not** show the headline "Nobody ever caught them" here. It is stronger as a payoff at Frame 4.

---

## Frame 2 — Eight venues

- status: outline
- duration: 7.6s
- transition_in: eclipse-wipe
- scene: The enforcement record, stated as a headline. $300 million.
- voiceover: VO 03
- blueprint: dataviz-countup
- asset_candidates: 14-record-hero.png
- poster: 5

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.0 | Occluding disc wipes across from screen-right, revealing the `/record` hero beneath. | full-bleed | eclipse-wipe (see Video direction) |
| 1.0–4.4 | "Eight venues." holds. The dollar figure is masked. | left-anchored display | plate held at 1:1, 0.5% parallax drift only |
| 4.4–6.4 | **$300 million** counts up from $0 as VO 03 reaches the number. | focal, chromosphere red | `counting-dynamic-scale` — count 0→300, scale 0.96→1.0 on settle |
| 6.4–7.6 | Hold. Red stays on the numeral alone. | — | none |

The count must finish **on** the spoken word "dollars", not before it.

---

## Frame 3 — What they actually did

- status: outline
- duration: 8.4s
- transition_in: cut
- scene: Three cases land one at a time, with their fines.
- voiceover: VO 04
- blueprint: fixed-anchor-cycle
- asset_candidates: 15-record-cases.png
- poster: 6

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–2.6 | ITG / POSIT row lands. "262 million shares against its own subscribers." | full-width row, hairline above | row slides y+18→0, opacity 0→1, expo.out 0.5s |
| 2.6–5.2 | Barclays LX row lands beneath. Previous row drops to 45% ink. | stacked | same, previous dims |
| 5.2–8.4 | Merrill row lands. **ADMITTED** flags pulse once in mono. | stacked | `discrete-text-sequence` on the flags, 1 pulse, no loop |

Each row lands on the firm's name in the read, not between names. Fines stay chromosphere red;
everything else is bone and dim.

---

## Frame 4 — Nobody caught it

- status: outline
- duration: 15.2s
- transition_in: cut
- scene: The rows dim out to nothing. The sentence that was always the charge.
- voiceover: VO 05 + VO 06
- blueprint: kinetic-type-beats
- asset_candidates: none
- poster: 9

The one frame with no product and no capture in it. Earned silence.

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–2.0 | The case rows from Frame 3 fade out one at a time, bottom to top, leaving void. | — | staggered opacity→0, 220ms apart |
| 2.0–7.0 | VO 05. Empty frame. Only a single hairline remains, centred. | — | rule scaleX 1→0.2, very slow |
| 7.0–11.0 | **"No customer ever caught any of it from their own fill data."** sets in Bodoni, centre-left, one line at a time. | centred block, max 22ch | line-masked reveal, yPercent 100→0, 90ms stagger |
| 11.0–15.2 | VO 06's italic clause — *"You did not operate the way you said you did."* — appears beneath in Bodoni italic, 60% ink. | beneath | opacity 0→1, no movement |

Hold the last frame a full beat after the line ends. Do not cut on the word.

---

## Frame 5 — What an umbra is

- status: outline
- duration: 6.8s
- transition_in: eclipse-wipe
- scene: Totality. The name explained.
- voiceover: VO 07
- blueprint: titlecard-reveal
- asset_candidates: 02-totality.png
- poster: 4

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.2 | The occluder slides fully over the source — totality. Screen falls to near-black, corona only. | centred | disc x-translate to concentric, 1.0s expo.out |
| 1.2–4.4 | The definition line from the site is legible beneath. | left-anchored | plate held, corona `ambient-glow-bloom` breathing |
| 4.4–6.8 | Push to the three-state row (umbra / penumbra / antumbra) — brief, 2s. | three columns | `coordinate-target-zoom`, 1.00→1.06, slow |

This is the film's still centre. Resist adding anything.

---

## Frame 6 — Escrow and sign

- status: outline
- duration: 7.6s
- transition_in: cut
- scene: The Trade screen. Real FTSOv2 price ticking, REAL TEE strip.
- voiceover: VO 08
- blueprint: device-surface-showcase
- asset_candidates: 05-trade.png
- poster: 4

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.4 | Trade plate arrives at 1.06 scale, settling to 1.0. | full-bleed | scale 1.06→1.00, expo.out 1.2s |
| 1.4–4.0 | Callout ring on the `REAL TEE · Intel TDX` strip, then on the live FTSOv2 readout. | overlay ring, mono label | ring draws 0→360°, 0.5s each, sequential |
| 4.0–7.6 | Push into the order form; the escrow figure is highlighted. | crop to left column | `coordinate-target-zoom` to the form, 1.0→1.25 |

Do not fake a cursor typing. The form is already filled in the capture; move the camera, not the UI.

---

## Frame 7 — Sealed

- status: outline
- duration: 8.0s
- transition_in: cut
- scene: What actually leaves the browser. Ciphertext.
- voiceover: VO 09
- blueprint: typewriter-reveal
- asset_candidates: 05-trade.png
- poster: 5

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–2.4 | Three step labels tick in sequence: `sign EIP-712` → `crypto_box_seal` → `POST ciphertext`. | left column, mono | `discrete-text-sequence`, each ticks as VO names it |
| 2.4–5.0 | A plaintext order JSON is visible, then **scrambles character-by-character into base64**. | centred code surface | `chromatic-glitch` at low amplitude during the scramble only, 0.9s |
| 5.0–8.0 | Settles into the real ciphertext string from the capture. Hold. | — | none after settle |

The scramble is the one flourish in the film. It earns its place because it is literally what the
product does. Keep it under one second and never repeat it.

---

## Frame 8 — The Dark Book

- status: outline
- duration: 12.8s
- transition_in: cut
- scene: Two real sealed orders resting. Everything the operator holds.
- voiceover: VO 10 + VO 11
- blueprint: zoom-out-workspace-reveal
- asset_candidates: 06-dark-book.png
- poster: 7

The most persuasive frame in the film. Two orders really were resting in the live book when this
was captured.

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–3.0 | Tight on one ciphertext blob, filling frame. Unreadable. | crop, 2.2 scale | slow drift left, continuous |
| 3.0–6.0 | Pull back to reveal the full Dark Book card — `1 buys · 1 sells`, byte length, sha256. | full-bleed | scale 2.2→1.0, expo.out 2.0s |
| 6.0–9.4 | VO 11's three denials. Each strikes through a UI label that is **not** present: side, size, price. | overlay, right third | three mono labels appear then strike, 0.3s apart |
| 9.4–12.8 | Everything dims except the blobs. | — | non-blob elements → 25% opacity |

---

## Frame 9 — The batch

- status: outline
- duration: 7.6s
- transition_in: cut
- scene: Trigger batch. The enclave opens the orders.
- voiceover: VO 12
- blueprint: cursor-ui-demo
- asset_candidates: 07-settlement-armed.png
- poster: 3

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.6 | Settlement plate. `1 buys · 1 sells · last batch #10`. | full-bleed | held |
| 1.6–2.6 | Cursor arrives at **Trigger batch** and presses. | overlay cursor | `cursor-click-ripple` + `press-release-spring` on the button |
| 2.6–7.6 | Elapsed timer runs. The four enclave actions tick in as VO names them: decrypt · verify · read oracle · clear. | mono list, right | `discrete-text-sequence`, one per clause |

The cursor is legitimate here — a real click did trigger this batch. Do not use a cursor anywhere
else in the film.

---

## Frame 10 — Zero of fifty

- status: outline
- duration: 14.8s
- transition_in: cut
- scene: Batch #11 settled. The vault checked the price itself.
- voiceover: VO 13 + VO 14
- blueprint: dataviz-countup
- asset_candidates: 08-settled-result.png
- poster: 8

The payoff. The entire argument rests on this number being real, and it is.

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.2 | Result card wipes up into place. "Batch #11 settled". | full-bleed | y+40→0, opacity 0→1, expo.out |
| 1.2–5.0 | `Cleared at $1.001605` and `Oracle read on-chain $1.001603` reveal side by side. | two columns | `discrete-text-sequence`, 400ms apart |
| 5.0–8.4 | **Deviation counts down to `0 bps`**, with `band is 50 bps` beneath. | focal centre-right | `counting-dynamic-scale` — count 50→0, settle scale 1.08→1.0 |
| 8.4–11.4 | The band renders as a hairline gauge; the marker sits dead centre. | horizontal rule | marker slides to centre, 0.8s, then holds |
| 11.4–14.8 | Drop to the fills row: `2.000000 FXRP ⇄ 2.003210 USDT0`. | bottom third | row fades up |

The counter must land on `0` under the spoken word "zero", not before.

---

## Frame 11 — Signed by someone else

- status: outline
- duration: 15.6s
- transition_in: eclipse-wipe
- scene: The attestation, and the on-chain anchor matching.
- voiceover: VO 15 + VO 16
- blueprint: comparison-split
- asset_candidates: 13-verify.png
- poster: 10

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–4.0 | Attestation claims populate as VO names them: `GCP_INTEL_TDX`, `secboot true`, `dbgstat disabled-since-boot`. | left column, mono rows | rows land 500ms apart, `discrete-text-sequence` |
| 4.0–7.0 | The `REAL TEE · Intel TDX` chip settles top-right. | chrome | scale 0.9→1.0, single settle |
| 7.0–12.0 | The two hashes stack — browser-computed above, on-chain below — and align character by character. | centred, mono, 2 rows | second row slides up to align; matching chars flash bone→red→bone left to right |
| 12.0–15.6 | **✓ MATCH** resolves. | right chip | scale 0.8→1.0, expo.out, then hold |

Land **✓ MATCH** on the word "matched". This is the film's second-strongest moment; give it air.

---

## Frame 12 — Check it yourself

- status: outline
- duration: 6.8s
- transition_in: cut
- scene: The two verification commands. Public registry.
- voiceover: VO 17
- blueprint: transcript-scroll-artifact-reveal
- asset_candidates: 17-proof-commands.png
- poster: 4

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–3.4 | First command types in — hash the token, compare to `attestationHash()`. | left code surface | `typewriter-reveal`, 45 chars/sec, no cursor blink after |
| 3.4–6.8 | Second command types — `crane export … \| diff` against source. | right code surface | same, staggered start |

Real commands, copied exactly from the live `/proof` page. Do not shorten them for fit; reduce the
type size instead.

---

## Frame 13 — What it can't do

- status: outline
- duration: 14.4s
- transition_in: cut
- scene: The honest limits. The differentiator.
- voiceover: VO 18 + VO 19
- blueprint: kinetic-type-beats
- asset_candidates: 04-limits.png
- poster: 8

This beat must survive any trim. A film that only lists strengths reads as marketing; this is the
frame that makes the rest credible.

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–1.0 | Hard cut to the limits section. Heading **"What it can't do."** in Bodoni italic. | left-anchored | none — the cut does the work |
| 1.0–7.0 | The X25519 limitation sets, one line at a time. No emphasis colour. | 2-column body | line-masked reveal, 100ms stagger |
| 7.0–10.0 | The clause "an active, detectable act" underlines itself in chromosphere red. | inline | rule scaleX 0→1, 0.5s, left origin |
| 10.0–14.4 | Cut to the withdrawal line. **"Not by the enclave, not by the operator, not by a pause switch."** | centred | three-beat reveal, one per negation |

---

## Frame 14 — Don't trust it

- status: outline
- duration: 9.0s
- transition_in: eclipse-wipe
- scene: The counts, the network, the close.
- voiceover: VO 20
- blueprint: titlecard-reveal
- asset_candidates: 02-totality.png
- poster: 6

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–3.0 | Three figures set in mono, evenly spaced: `239 contract tests` · `71 engine tests` · `Flare Coston2`. | horizontal row | `discrete-text-sequence`, 300ms apart |
| 3.0–5.0 | They dim. The eclipse begins to open — light returning past totality. | full-bleed | disc translates off-centre, corona brightens |
| 5.0–7.6 | **Don't trust it. *Check* it.** in Bodoni, "Check" italic. | centred | line-masked reveal, 2 lines |
| 7.6–9.0 | `umbra-beta.vercel.app` in mono beneath. Fade to void. | beneath | opacity 0→1, then whole frame →0 over 0.8s |

End on void, not on a logo. Let the last thing be the dark.

---

## Video direction

**Ground.** Void `#06070B` under everything. No frame ever sits on pure black `#000` — the corona
needs somewhere to fall off to. Every full-bleed background rides its own `class="clip"` layer, never
`#root`.

**The eclipse is the transition.** `transition_in: eclipse-wipe` means an occluding disc travels
across the frame and the next scene is revealed behind its trailing edge — the brand's own metaphor
doing the cutting. Duration 1.0s, `expo.out`. Used exactly four times: Frames 2, 5, 11, 14. Every
other seam is a hard cut. A wipe on every cut would make it wallpaper.

**Colour discipline.** Chromosphere red `#E8442A` appears on: the $300M figure, the fines, the
`0 bps` counter, the ✓ MATCH chip, and one underline in Frame 13. Nowhere else. If a frame has two
red elements, one of them is wrong.

**Type.** Bodoni Moda 400 for display only — never below 2.8cqw, never for body. Instrument Sans for
all reading copy. IBM Plex Mono for every number, hash, address, label and command. Display is
sentence case with negative tracking; mono chrome is uppercase at 0.14em.

**Camera doctrine.** Screens are treated as plates: scale, crop and drift, but never re-typeset. Push
in, pull back, or hold — one camera move per frame maximum. Nothing zooms past 1:1 on the full-page
plate; it has no headroom above 1x.

**Motion doctrine.** One idea per frame. Reveals fire once and hold — nothing loops except the
corona breath and the drift on Frame 8. Everything eases `expo.out` (`cubic-bezier(0.16,1,0.3,1)`);
state toggles use `cubic-bezier(0.65,0,0.35,1)`. No bounce, no elastic, no spin.

**Counters land on the word.** The $300M count, the `0 bps` count, and the ✓ MATCH resolve are timed
to the syllable in the voiceover, not to the frame start. These three timings are the difference
between a film that feels directed and one that feels assembled.

**Audio.** Voiceover is supplied by the user (Clipchamp), verbatim, on track 1. A sparse tense bed
sits on track 2 at low level, ducked under narration via `/hyperframes-audio` voiceover carve. No
whooshes on the wipes — the piece is quiet on purpose. No music at all under Frame 4; the silence is
the point.

**Captions.** On, using the project caption skin, bottom-centre, keep-out band 140px. The material is
full of proper nouns and hashes that a viewer will want to read.
