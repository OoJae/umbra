/**
 * The eclipse.
 *
 * One fragment shader over a fullscreen triangle. No geometry, no 3D library,
 * one draw call. `uProgress` is scroll position, and it drives the occulting
 * body across the light source:
 *
 *   0.00  the source is clear      everyone sees the order
 *   0.25  first contact            penumbra — the Dark Book
 *   0.50  TOTALITY                 umbra — the order is sealed
 *   0.75  third contact            antumbra — settlement
 *   1.00  the light returns        the public record
 *
 * The light source is FTSOv2. Everything the page says is timed against this.
 */

export const VERT = /* glsl */ `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FRAG = /* glsl */ `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uProgress;
/* 1.0 on the landing page, where the layout is built around the scene. Much
   lower elsewhere: on the editorial pages the type is the subject, and a corona
   running underneath a paragraph is just a legibility problem. */
uniform float uIntensity;

varying vec2 vUv;

const vec3 VOID   = vec3(0.024, 0.027, 0.043);
const vec3 HALO   = vec3(0.949, 0.933, 0.910);
const vec3 CHROMA = vec3(0.910, 0.267, 0.165);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // On landscape the source sits off-centre, up and to the right, so the display
  // type on the left has a clean dark field. Portrait is not that layout scaled
  // down: with no horizontal room to give away, the source moves into the empty
  // band above the headline rather than sitting behind it, and shrinks so the
  // corona still has somewhere to go.
  float wide = step(1.0, uRes.x / uRes.y);
  vec2 origin = mix(vec2(0.0, 0.74), vec2(0.30, 0.11), wide);
  vec2 c = uv - origin;

  float R  = mix(0.125, 0.17, wide);   // the light source
  float MR = R * 1.053;                // the occluder, slightly larger — a total eclipse

  // Scroll drives the eclipse, but not from zero: at the top of the page the
  // source is already bitten into. A plain white disc is a worse first frame
  // than a crescent, and the crescent states what the page is about.
  float t = 0.30 + clamp(uProgress, 0.0, 1.0) * 0.46;

  // The occluder's path. Shaped rather than linear so totality HOLDS through a
  // section of the page instead of flicking past in one scroll tick, and scaled
  // to the disc rather than the screen so the whole scroll range is spent on the
  // part of the event worth watching.
  float s = t < 0.5 ? -pow(1.0 - 2.0 * t, 1.5) : pow(2.0 * t - 1.0, 1.5);
  vec2  moon = vec2(s * (R + MR) * 1.21, s * R * 0.29);

  float dSun  = length(c);
  float dMoon = length(c - moon);

  // How completely the source is covered. 1.0 at totality.
  float sep = length(moon);
  float cover = 1.0 - smoothstep(0.0, R + MR, sep);
  cover = pow(cover, 1.6);

  vec3 col = VOID;

  // ── the photosphere, with limb darkening ──────────────────────────────────
  // Held below the ink colour: this sits behind display type, and a disc at full
  // #f2eee8 erases any letterform that crosses it.
  float sun = smoothstep(R, R - 0.005, dSun);
  float limb = sqrt(max(0.0, 1.0 - pow(dSun / R, 2.0)));
  vec3 sunCol = HALO * (0.74 + 0.30 * limb);

  // Bloom. Without light spilling past its own edge the disc reads as a lit
  // sphere rather than a source, which inverts the entire metaphor.
  float bloom = exp(-max(0.0, dSun - R) * 13.0) * (1.0 - smoothstep(0.9, 1.0, cover));
  col += HALO * bloom * 0.22;
  col += CHROMA * bloom * 0.05;

  // ── the corona ────────────────────────────────────────────────────────────
  // Streamers: radial fbm that only becomes visible as the disc is covered,
  // which is true — you cannot see the corona until totality.
  // Sampled on the direction vector rather than on atan(): the angle has a
  // branch cut at ±π, which drew a visible seam straight across the corona.
  float rad = dSun;
  vec2 dir = c / max(rad, 1e-4);
  float streamers =
      fbm(dir * 3.1 + vec2(0.0, uTime * 0.018) + rad * 2.2) * 0.65
    + fbm(dir * 7.2 - vec2(uTime * 0.011, 0.0)) * 0.35;

  float falloff = exp(-(rad - R) * 11.0);
  float corona = falloff * smoothstep(R * 0.98, R * 1.02, rad) * (0.35 + streamers * 0.9);
  corona *= cover;

  col += HALO * corona * 0.85;

  // ── the chromosphere ──────────────────────────────────────────────────────
  // The hydrogen-alpha rim. Visible for a moment either side of totality only —
  // this is where the accent colour in the brand comes from.
  float rim = smoothstep(R * 1.035, R, rad) * smoothstep(R * 0.965, R * 1.0, rad);
  float chromaWindow = smoothstep(0.55, 0.95, cover) * (1.0 - smoothstep(0.97, 1.0, cover));
  col += CHROMA * rim * chromaWindow * 2.6;

  // ── the disc, then the occluder over it ───────────────────────────────────
  col = mix(col, sunCol, sun * (1.0 - smoothstep(0.985, 1.0, cover)));

  float moonMask = smoothstep(MR, MR - 0.004, dMoon);
  // Not a hole: a faint cool wash so the occluder reads as a body with volume.
  vec3 moonCol = VOID + vec3(0.010, 0.012, 0.020) * (1.0 - dMoon / MR);
  col = mix(col, moonCol, moonMask);

  // ── the diamond ring ──────────────────────────────────────────────────────
  // The last bead of photosphere at second and third contact.
  float beadPhase = 1.0 - smoothstep(0.86, 0.995, cover);
  float beadEdge = smoothstep(0.02, 0.0, abs(dMoon - MR)) * smoothstep(R * 1.02, R * 0.9, dSun);
  float bead = beadEdge * beadPhase * smoothstep(0.6, 0.9, cover);
  col += HALO * bead * 2.2;

  // ── inner glow so the black disc sits in atmosphere, not a vacuum ─────────
  col += HALO * exp(-max(0.0, dSun - R) * 3.0) * 0.030 * cover;

  // Fade the whole event toward the void before the film is applied, so the
  // grain and vignette stay constant across routes and only the subject recedes.
  col = mix(VOID, col, uIntensity);

  // ── vignette + grain ──────────────────────────────────────────────────────
  // Centred on the source, not the screen, so the type side stays deepest.
  col *= 1.0 - 0.5 * smoothstep(0.25, 1.05, dSun);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5) * 0.016;

  gl_FragColor = vec4(max(col, VOID * 0.6), 1.0);
}
`;
