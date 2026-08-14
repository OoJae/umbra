# Frame packet: 07-sealed

## Project inputs

- Project: /Users/oluwademilade/Desktop/umbra/demo/videos/umbra-demo
- Design tokens: /Users/oluwademilade/Desktop/umbra/demo/videos/umbra-demo/frame.md
- RULES_DIR: /Users/oluwademilade/.claude/skills/hyperframes-animation/rules

## Assigned storyboard block

## Frame 7 — Sealed

- src: compositions/frames/07-sealed.html
- status: outline
- duration: 8.97s
- transition_in: cut
- scene: What actually leaves the browser. Ciphertext.
- voiceover: VO 09
- blueprint: typewriter-reveal
- asset_candidates: 05-trade.png
- vo_marks: VO 09 0.0–8.0s   (frame-relative, from the recorded read)
- poster: 5

**Shot sequence**

| t | Scene | Layout | Motion |
|---|---|---|---|
| 0.0–2.7 | Three step labels tick in sequence: `sign EIP-712` → `crypto_box_seal` → `POST ciphertext`. | left column, mono | `discrete-text-sequence`, each ticks as VO names it |
| 2.7–5.6 | A plaintext order JSON is visible, then **scrambles character-by-character into base64**. | centred code surface | `chromatic-glitch` at low amplitude during the scramble only, 0.9s |
| 5.6–9.0 | Settles into the real ciphertext string from the capture. Hold. | — | none after settle |

The scramble is the one flourish in the film. It earns its place because it is literally what the
product does. Keep it under one second and never repeat it.

---

## Selected blueprint: typewriter-reveal

# typewriter-reveal — Typewriter Reveal

**intent**: A live text caret types (and edits) a line as a human would, then either collapses it to a point and pops a brand payoff, or holds it under a persistent brand mark while a sub-line types/swaps into the final CTA — making "someone is typing this" the engine of the shot.

**roles served**

- Hook (from hook-typed-line-to-reveal): Type a relatable question/statement live, then COLLAPSE it and spring-pop the brand — a logo lockup OR a product-UI moment ("here's the everyday pain, now here's us").
- Brand_Outro (from brand-outro-persistent-mark-cta-rail): Hold the hero mark dead-center/top the whole shot while a sub-line beneath it swaps or types its way into the final CTA — landing the ask once the logo is already established.

**duration**: 3.6–7s (Brand_Outro 3.6–6.0s · Hook 5.5–7s)

**shot structure** (one consolidated template; `[slots]` are product-agnostic)

- Scene 1 (0.0–~2.0s): On a solid `[bg color]` field, a blinking text-input caret `|` sits at the line start, then `[primary line]` TYPES on character-by-character with the caret trailing.
  - _Variant — Hook_: nothing else is on screen; the typed `[hook line]` owns the frame. (Sub-variant: the line types inside UI chrome — a rounded `[input/pill]` — and the whole assembly continuously TRANSLATES leftward + scales slightly so the active caret stays pinned near frame-center while earlier words scroll off and clip past the left edge — a ticker push.)
  - _Variant — Brand_Outro_: a `[logo mark]` (+ optional `[wordmark]`) is already centered/upper and STAYS fully visible for the entire shot; an entry flourish plays on the mark itself (e.g. `[checkmark/icon]` strokes into the mark, or thin concentric rings ripple outward from it), and the typed `[tagline / product label]` is the SUB-LINE beneath the mark.

- Scene 2 (~2.0–4.5s): The typed line is MODIFIED in place — the active text is edited rather than re-shot.
  - _Variant — Hook_: final word(s) BACKSPACE out and a new word RETYPES (`[word A]` → `[word B]`), or the fill/caret snaps to `[accent color]` on the final word. Holds briefly.
  - _Variant — Brand_Outro_: the sub-line is REMOVED in place — a direct hard CUT/replace (NO backspace) or a moving mask-WIPE erases it — while the mark performs a small idle move (gentle rotate / sparkle reposition); the mark never leaves frame.

- Scene 3 — resolve:
  - _Variant — Hook (collapse, ~0.3–0.7s)_: caret vanishes; the whole text/assembly COLLAPSES to a point at center (horizontal X-collapse or scale-to-0 zoom-out) and disappears, leaving a clean `[bg]`. Then (remainder) a centered `[brand element]` SPRING-POPS in:
    - _logo-lockup sub-variant_: a `[mark/icon]` pops, then slides aside as a `[wordmark]` UNMASKS / slides out from behind it; both settle into a centered lockup.
    - _product-UI sub-variant_: a `[UI control]` (e.g. button) pops; a `[cursor]` sweeps in from a corner and homes onto it; on contact a ~150ms state-FLIP — base cross-fades to `[accent color]`, icon inverts, and a soft radial GLOW blooms outward and persists.
  - _Variant — Brand_Outro (~4.5s–end)_: the final `[CTA]` resolves in the sub-line slot — TYPED in with a caret and/or shown as a `[CTA in accent-color button]` beside plain text; an optional `[accent color]` GLOW ring / halo settles around the persistent mark. Holds to end. Final frame: `[logo mark]` + (glow ring) + `[CTA]`.

**motion vocabulary**: blinking text caret; character-by-character type-on; backspace-and-retype OR in-place hard-cut/mask-wipe text swap; optional leftward ticker push (assembly translates to keep caret centered); persistent centered hero mark (never vanishes) with entry flourish (icon stroke-draw, concentric ripple rings) and small idle move (rotate / sparkle); X-collapse / scale-to-0 zoom-out of the typed line; spring-pop brand reveal; wordmark unmask-slide into lockup; cursor sweep + UI state-flip + radial glow bloom; accent glow/halo ring settle; pill/button CTA reveal; hold.

**rule mapping** (per motion verb → `rules/<id>.md`)

- blinking text caret → `context-sensitive-cursor` (caret color-switch + blink)
- character-by-character type-on → `discrete-text-sequence` (typing/typos/holds/backspace); recipe `gsap-effects` (typewriter)
- backspace-and-retype → `discrete-text-sequence`
- in-place hard-cut / replace text swap → `discrete-text-sequence` (whole-text state swaps)
- mask-wipe erase of sub-line → `techniques.md` clip-path reveal (run in reverse)
- leftward ticker push (assembly translates to keep caret centered) → `camera-cursor-tracking` (viewport follows a moving caret)
- persistent hero mark hold → no motion rule needed (static anchor; intentional — it's the absence of motion)
- entry flourish: icon stroke-draw into mark → `svg-path-draw`
- entry flourish: concentric ripple rings from mark → `cursor-click-ripple` (ripple bloom)
- small idle mark move (rotate / sparkle reposition) → `sine-wave-loop` (idle)
- X-collapse / scale-to-0 zoom-out of typed line → `scale-swap-transition` (closest fit — it morphs/collapses elements at a shared center; approximation, since a standalone collapse-and-vanish without the paired same-center brand pop isn't its exact case)
- spring-pop brand reveal → `spring-pop-entrance` (alt `physics-press-reaction`)
- collapse-text → pop-brand as a same-center morph pair → `scale-swap-transition` (morph two elements at same center)
- wordmark unmask-slide into lockup → `techniques.md` clip-path reveal (unmask); slide via `spring-pop-entrance`
- cursor sweep onto UI control + press → `cursor-click-ripple` (cursor→target press + ripple)
- UI state-flip (base/icon invert on contact) → `hacker-flip-3d`
- radial glow bloom / accent glow-halo ring settle → `asr-keyword-glow` (accent glow); ring expansion via `center-outward-expansion`
- pill/button CTA reveal → `spring-pop-entrance` (alt `scale-swap-transition`)

**camera modifier**: none required — camera is static for both roles. The Hook ticker push is an ELEMENT translate (the typed assembly slides leftward to keep the caret centered), not a camera move → modeled by `camera-cursor-tracking` rather than a true camera rule.

## Selected motion rule: chromatic-glitch

---
name: chromatic-glitch
description: RGB-split / slice glitch that snaps sharp — offset color copies jitter on a deterministic hash of quantized timeline time (never Math.random), or horizontal slices displace and converge; a brief vibration, then a clean resolve. Entrance or emphasis punctuation; finite, seek-safe.
metadata:
  tags: glitch, rgb-split, chromatic, slice, jitter, stutter, text, snap, distortion
---

# Chromatic Glitch

Digital interference as punctuation: for a fraction of a second the element **breaks** — offset color copies shudder behind it, or horizontal slices displace sideways — then it **snaps sharp** and holds clean. The payoff is the resolve; the glitch exists to make the clean state land harder. Two forms: an **RGB-split jitter** (warm + cool ghost copies vibrating behind the base) and a **slice displacement** (horizontal bands that arrive offset and converge).

Boundaries: [motion-blur-streak.md](motion-blur-streak.md) is velocity blur tied to **travel** — its element is going somewhere fast. A glitching element is **in place**; the disturbance is temporal, not directional. [hacker-flip-3d.md](hacker-flip-3d.md) substitutes **glyphs** (a decode); here the glyphs are fixed and only displaced copies of them move.

## How It Works

The subject is stacked: the **base copy on top** (full legibility at every frame), ghost copies behind. All motion comes from one finite **amplitude-envelope** tween read by an `onUpdate`:

1. **Quantized time** — `const step = Math.floor(tl.time() / JITTER_STEP)`. The stutter comes from offsets that hold for `JITTER_STEP` and then jump. Smoothly interpolated offsets read as wobble, not glitch — **the quantization IS the digital texture**.
2. **Deterministic hash** — offsets are a pure function of `(step, layerIndex)`:

   ```js
   const glitchHash = (n) => {
     const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
     return x - Math.floor(x); // 0..1, pure — a scrub to any t recomputes the same frame
   };
   ```

3. **Amplitude envelope** — a proxy tween carries `amp: 1 → 0` over `GLITCH_DUR`. Per-frame offset = `amp × (glitchHash(step * 13 + layer * 7) * 2 − 1) × MAX_SPLIT`. When the envelope hits zero the copies sit at exactly 0 — the snap-sharp is built into the math, and a final `tl.set` clamps the rest state so the hold is bit-exact.

The **slice form** swaps color copies for `SLICE_COUNT` full copies, each clipped to a horizontal band via `clip-path: inset()`; per-band `x` (and optional `scaleX` stretch) start at hash-derived offsets and converge to 0 under a stepped ease.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<!-- Form A: RGB-split — ghosts behind, base on top. Copies metric-identical (one grid cell, same font stack); aria-hidden on every non-base copy. -->
<div class="glitch-stack" id="glitch-stack">
  <span class="glitch-copy warm" aria-hidden="true">{glitchText}</span>
  <span class="glitch-copy cool" aria-hidden="true">{glitchText}</span>
  <span class="glitch-base">{glitchText}</span>
</div>
```

```css
.glitch-stack {
  display: grid; /* all copies share one cell — pixel-identical boxes */
}
.glitch-base,
.glitch-copy {
  grid-area: 1 / 1;
}
.glitch-base {
  z-index: 2; /* grid items take z-index without position */
  color: {textColor};
}
.glitch-copy {
  z-index: 1;
  opacity: 0; /* raised only while the envelope is live */
  will-change: transform; /* updates every frame while live */
  mix-blend-mode: screen; /* additive on dark bg; drop to normal (and lower opacity) on light */
}
.glitch-copy.warm {
  color: {warmSplit}; /* classic: red/orange */
}
.glitch-copy.cool {
  color: {coolSplit}; /* classic: cyan/blue */
}
```

```js
// Form A: RGB-split jitter — envelope snaps to full amplitude, decays to zero.
// All per-frame state derives from tl.time() + the envelope: pure, replays on seek.
const copies = gsap.utils.toArray("#glitch-stack .glitch-copy");
const amp = { a: 0 };
tl.set(amp, { a: 1 }, GLITCH_START);
tl.set(copies, { opacity: SPLIT_OPACITY }, GLITCH_START);
tl.to(
  amp,
  {
    a: 0,
    duration: GLITCH_DUR,
    ease: "power3.in", // most of the violence up front, dying fast
    onUpdate: () => {
      const step = Math.floor(tl.time() / JITTER_STEP); // quantized — the stutter
      copies.forEach((el, layer) => {
        const jx = (glitchHash(step * 13 + layer * 7) * 2 - 1) * MAX_SPLIT * amp.a;
        const jy = (glitchHash(step * 29 + layer * 11) * 2 - 1) * MAX_SPLIT * 0.35 * amp.a;
        gsap.set(el, { x: jx, y: jy });
      });
    },
  },
  GLITCH_START,
);
// The clean resolve: clamp ghosts to exact rest — never rely on the decay
// landing on zero. A ghost left 1px off reads as a bug every frame after.
tl.set(copies, { x: 0, y: 0, opacity: 0 }, GLITCH_START + GLITCH_DUR);

// Form B: slice displacement — N band copies of the same content converge.
const slices = gsap.utils.toArray("#slice-stack .slice");
const bandH = 100 / slices.length;
slices.forEach((el, i) => {
  gsap.set(el, { clipPath: `inset(${i * bandH}% 0 ${100 - (i + 1) * bandH}% 0)` });
  const dir = glitchHash(i * 3 + 1) > 0.5 ? 1 : -1;
  tl.fromTo(
    el,
    {
      x: dir * (SLICE_OFFSET_MIN + glitchHash(i * 5 + 2) * (SLICE_OFFSET_MAX - SLICE_OFFSET_MIN)),
      scaleX: 1 + glitchHash(i * 7 + 3) * SLICE_STRETCH,
      opacity: 1,
    },
    { x: 0, scaleX: 1, duration: SLICE_RESOLVE_DUR, ease: "steps(SLICE_STEPS)" },
    SLICE_START + glitchHash(i * 11 + 4) * SLICE_JITTER_LAG,
  );
});
```

## Variations

- **Glitch-stretch entrance** — the element ENTERS glitching: layer `fromTo(stack, { scaleX: STRETCH_FROM, opacity: 0 }, { scaleX: 1, opacity: 1, duration: GLITCH_DUR, ease: "power4.out" })` (`STRETCH_FROM` 1.3–1.8) on the whole stack while the envelope runs. Stretch, split, and envelope all die at the same frame — the word is simply _there_, sharp.
- **Emphasis burst on a held word** — a spasm, not an arrival: 2–3 short envelopes (`GLITCH_DUR` ~0.12–0.2s each) separated by clean gaps of ~0.2–0.4s, each its own `set(amp)/to(amp)/set(rest)` triplet. The clean frames between bursts make it read as energy instead of a rendering fault.
- **Slice reveal** — Form B as the arrival itself: bands start opaque but displaced, converge under the stepped ease. Drop the color copies for the monochrome version — the restrained enterprise read of this rule.
- **Card / non-text glitch** — the stacked-copy machinery is content-agnostic (logo lockup, small card). Keep `MAX_SPLIT` proportional (~1% of element width) — oversized splits read as broken layout, not interference.

## Values

| token                                        | range                                  | notes                                                                                         |
| -------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- |
| MAX_SPLIT                                    | 4–14px at headline sizes (~0.06–0.1em) | vertical ~35% of horizontal; base must stay legible at peak                                   |
| JITTER_STEP                                  | 1/30–1/12 s                            | shorter = frantic buzz, longer = VHS stutter; **≥ one render frame** or quantization vanishes |
| GLITCH_DUR                                   | 0.25–0.6s entrance; 0.12–0.2s burst    | ≥ ~1s stops reading as an event and starts reading as a broken render                         |
| SPLIT_OPACITY                                | 0.5–0.9 (screen on dark)               | 0.35–0.6 unblended on light — screen on white is invisible                                    |
| SLICE_COUNT                                  | 4–10                                   | more = finer tear, diminishing past ~10                                                       |
| SLICE_OFFSET_MIN / MAX                       | 12–60px                                | derive per-band values from `glitchHash(i)`, never uniform — equal offsets read mechanical    |
| SLICE_STRETCH                                | 0–0.5                                  | 0 pure displacement; ~0.3 stretched-scanline read                                             |
| SLICE_RESOLVE_DUR / SLICE_STEPS / JITTER_LAG | 0.2–0.4s / 3–6 / ≤0.08s per band       | the stepped ease keeps the settle digital                                                     |
| {warmSplit} / {coolSplit}                    | —                                      | classic red/cyan; any opposing warm+cool brand pair survives                                  |

## Critical Constraints

- **Quantize time — the stutter IS the effect.** Offsets hold for `JITTER_STEP` then jump; if the glitch looks like jelly, you interpolated. `JITTER_STEP` ≥ one render frame or the quantization silently disappears.
- **Pure functions of (quantized time, index)** — every per-frame value comes from `glitchHash`; the hash inputs use `tl.time()`, nothing else.
- **Clamp the rest state** — `tl.set({ x: 0, y: 0, opacity: 0 })` on the ghosts at envelope end; never rely on the decay landing exactly on zero.
- **Base on top, always legible** — ghosts vibrate _behind_ the base; a glitch that destroys legibility for more than ~2 frames is a tear-down, not an accent.
- **Brief, then clean** — the clean hold after the snap is the actual beat; `GLITCH_DUR` well under half the element's screen time. Emphasis bursts are separate finite triplets.
- **No CSS `@keyframes` glitch loops** — the classic CSS glitch snippet runs on the wall clock and desyncs from seek; every displacement goes through the timeline's `onUpdate`.
- **Match the register** — RGB-split is a loud consumer/tech gesture; the monochrome slice variant is the only form that belongs in a restrained enterprise composition.

## See also

`kinetic-beat-slam` (one beat lands with the glitch-stretch entrance) · `spring-pop-entrance` (pop clean, burst on the stress beat) · `gradient-text-sweep` (gradient carries the hold after the resolve) · `discrete-text-sequence` (state swap masked at max amplitude) · `motion-blur-streak` (the traveling sibling — if it's moving fast, blur it there).

## Selected motion rule: discrete-text-sequence

---
name: discrete-text-sequence
description: Replace entire text states at frame thresholds for non-linear typing effects — typos, bulk additions, pauses, backspaces, simulated thinking.
metadata:
  tags: text, typing, discrete, threshold, non-linear, sequence
---

# Discrete Text Sequence

Instead of character-by-character typewriter, replace entire string states at time thresholds — enabling non-linear effects (typos, backspaces, bulk paste, "thinking" gaps) that smooth per-char typing can't achieve. If your effect is "type each character, no edits", this rule is overkill — use the smooth-slice variation below.

## How It Works

The typing is authored as a sparse array of `{ t, text }` states; on every `onUpdate` a **reverse search** finds the latest entry whose `t` has passed and renders its text. Display jumps between states with no animation between them — the realism comes from the schedule shape: fast keystroke clusters (0.06–0.20s apart), pauses at word breaks (0.3–0.6s), a typo, backspaces peeling back to the fork, then a bulk paste replacing many chars in one entry. A block cursor blinks via a deterministic sin square wave on the same timeline.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="terminal">
  <div class="prompt">$</div>
  <div class="text-wrap">
    <span class="text" id="text"></span><span class="cursor" id="cursor">_</span>
  </div>
</div>
```

```css
.terminal {
  font-family: {monoFont}; /* monospace required — proportional jitters even in a fixed box */
  display: flex;
  align-items: baseline;
  font-size: TERMINAL_FONT_SIZE;
}
.text-wrap {
  display: inline-flex;
  align-items: baseline;
  min-width: TEXT_WRAP_MIN_WIDTH; /* ≥ widest state — stops right-edge jitter */
  white-space: nowrap;
}
.cursor {
  display: inline-block; /* inline ignores width */
  width: CURSOR_WIDTH;
}
```

```js
// Each entry shows from its t until the NEXT entry's t.
// Shape: keystrokes → typo → backspace to the fork → bulk paste → completion mark.
const SEQUENCE = [
  { t: 0.0, text: "" },
  { t: T_K1, text: "{p1}" }, // first keystrokes (~3-5 chars, 0.1-0.2s apart)
  { t: T_K2, text: "{p1 + ' ' + p2_typo}" }, // continuation containing a typo
  { t: T_BS, text: "{p1 + ' ' + p2_partial}" }, // backspace(s) — peel back to the fork
  { t: T_BULK, text: "{fullCorrectedText}" }, // bulk paste — many chars in one jump
  { t: T_DONE, text: "{fullCorrectedText + ' ✓'}" }, // completion marker
];

// Reverse-search for the latest entry whose t has passed
function textAt(time) {
  for (let i = SEQUENCE.length - 1; i >= 0; i--) {
    if (time >= SEQUENCE[i].t) return SEQUENCE[i].text;
  }
  return "";
}

const textEl = document.getElementById("text");
const cursorEl = document.getElementById("cursor");

const driver = { t: 0 };
tl.to(
  driver,
  {
    t: TOTAL_DURATION,
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      textEl.textContent = textAt(driver.t);
    },
  },
  0,
);

// Cursor blink — deterministic sin square wave, never a CSS animation
const blink = { p: 0 };
tl.to(
  blink,
  {
    p: Math.PI * 2 * BLINK_CYCLES,
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      cursorEl.style.opacity = Math.sin(blink.p) > 0 ? "1" : "0";
    },
  },
  0,
);
```

## Variations

- **Smooth character slice** (continuous typewriter — no pauses, no edits): faster to author but uniformly "machine-typed", missing the human realism:

```js
const fullText = "{fullPhrase}";
const len = { v: 0 };
tl.to(
  len,
  {
    v: fullText.length,
    duration: TYPE_DUR,
    ease: "power1.inOut",
    onUpdate: () => {
      textEl.textContent = fullText.substring(0, Math.floor(len.v));
    },
  },
  0,
);
```

- **Thinking pause** — hold one state for `THINK_HOLD_DUR` (0.8–2.0s; under 0.5s reads as a stutter, not thought) simply by leaving a gap before the next entry's `t`.
- **State pulse on completion** — when the final state lands, `tl.to(".text", { scale: 1.03–1.08, duration: 0.15–0.3, yoyo: true, repeat: 1 }, T_DONE)`.
- **Per-state color shift** — in `onUpdate`, branch on `driver.t` vs the milestones: success color after `T_DONE`, dim mid-edit, normal while typing.

## Values

| token               | range                                        | notes                                                                  |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| TERMINAL_FONT_SIZE  | 48–96px                                      | full-bleed comps; smaller for terminal-style detail                    |
| TEXT_WRAP_MIN_WIDTH | ≥ widest state                               | measure with a hidden probe after `document.fonts.ready` if unsure     |
| milestone `t`s      | keystrokes 0.06–0.20s apart; pauses 0.3–0.6s | monotonically increasing; `T_DONE ≤ TOTAL_DURATION − ~1s` climax dwell |
| TYPE_DUR (smooth)   | `chars × 0.06–0.12s`                         | fast → relaxed                                                         |
| BLINK_CYCLES        | one cycle per 0.5–0.8s                       | `TOTAL_DURATION / 0.8 ≤ BLINK_CYCLES ≤ TOTAL_DURATION / 0.5`           |
| CURSOR_WIDTH        | ~0.3× font size                              | gap to text single-digit px so the cursor feels attached               |

## Critical Constraints

- **Reverse-search the array each frame** — O(n) with small n (≤30 typical); don't index by frame, the sequence is sparse.
- **`min-width` on the text wrap is mandatory** — without it the right edge jitters as state length changes.
- **Discrete jumps must be INSTANT** — any transition on the text turns the jump into a smear and kills the "typing" feel.
- **Cursor blink is sin/sequence-driven on the timeline**, `display: inline-block`, monospace font, `white-space: nowrap` (wrapping mid-state breaks the illusion; trailing spaces must survive).
- **Discrete vs smooth** — use discrete only for non-linear states (typos, pauses, bulk paste); plain typing takes the smooth-slice variation.

## See also

`context-sensitive-cursor` (same SEQUENCE pattern + segment-colored cursor) · `3d-text-depth-layers` (discrete text with layered depth) · `counting-dynamic-scale` (discrete label beside a smooth counter) · `press-release-spring` (post-completion press beat).
