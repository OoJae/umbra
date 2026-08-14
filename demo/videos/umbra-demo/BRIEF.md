---
workflow: product-launch-video
flow: build
storyboard: sketches-skipped
VO_MODE: verbatim
length: 148
format: landscape
destination: youtube-embed
style_preset: null
---

# Umbra — demo film

## Intent

**Show the product as it actually is.** Feature the site's own captured screens as the video's
assets — every frame is a real screenshot of https://umbra-beta.vercel.app taken while driving the
live system on 2026-08-14, including a real settlement (batch #11) on Flare Coston2.

This is a hackathon submission film (Flare Summer Signal, DoraHacks), judged by technically deep
people. Credibility is the product. Nothing may be staged, mocked, or dramatised.

## Angle

**A dark pool is a promise. Umbra is a check.**

Basis, from the product's own positioning: between 2011 and 2018 the SEC fined essentially every
major US dark pool operator ~$300M for misrepresenting how their own venue worked, and no customer
ever detected any of it from their own fill data. Umbra moves two of those promises — "we cleared
you at the fair mid" and "only the code we described saw your order" — somewhere a machine checks
them before the trade rather than a regulator litigates them years after.

Deliberately **not** the angle: MEV / front-running statistics. Sandwich losses are shrinking year
over year and an informed judge would catch an inflated claim. The enforcement record is stronger
and uncontested.

## Message

You should not have to trust a dark pool operator. Umbra makes the two claims worth lying about
checkable before the trade — and says out loud what it still cannot prove.

## Must-haves

- **Length** 2:28 (148s). Longer than the 30–90s sweet spot because the piece carries a real
  end-to-end walkthrough plus the evidence; inside the ~3 min cap.
- **Destination** 16:9 1920×1080, DoraHacks embed + YouTube.
- The real settled batch (#11, 0 bps of 50) must appear on screen.
- The honest-limits beat must survive any trim. It is the differentiator, not filler.

## Voiceover

`VO_MODE: verbatim`. Script fixed at `../../voiceover-script.md` — 20 numbered lines with per-line
durations. The user records it in Clipchamp and returns timed audio. **Do not rewrite the copy.**
Every claim was verified against the live system, and line 18 exists specifically to avoid an
overclaim.

## Customizations

- **Motion, not stills.** Screens are live material: scale/parallax drift, masked reveals, a
  deviation counter that actually counts to 0 bps, ciphertext that scrambles. No crossfade slideshow.
- **The eclipse is the transition.** Scene changes wipe via an occluding disc — the brand's own
  metaphor doing the cutting — rather than a generic fade.
- **Design system is the product's own:**
  - void `#06070B` · ash `#0E1017` · bone `#F2EEE8` · dim `#7B8290` · chromosphere red `#E8442A`
  - display **Bodoni Moda** · body **Instrument Sans** · data **IBM Plex Mono**
  - Red is signal only — never a fill on a call to action.
- Restraint over flash. One idea per scene.

## Assets

13 real 1920×1080 captures in `../../shots/`. Inventory in
`capture/extracted/asset-descriptions.md`.
