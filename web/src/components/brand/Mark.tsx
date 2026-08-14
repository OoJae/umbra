/**
 * The Umbra mark.
 *
 * An umbra is the darkest core of a shadow, where the light source is completely
 * occluded. The mark is that moment: an occluding body crossing a light source,
 * leaving only the corona.
 *
 * `phase` is not decoration — it is the order lifecycle:
 *   0.00  light source clear      no order
 *   0.50  partial occlusion       resting in the Dark Book (penumbra)
 *   1.00  totality, corona only   sealed (umbra)
 *
 * Drawn with two circles and a mask so it stays crisp at 16px and at 2000px,
 * and so it costs nothing to animate — the occluder only translates.
 */

export function Mark({
  size = 24,
  phase = 1,
  corona = true,
  title,
}: {
  size?: number | string;
  /** 0 = light clear, 1 = totality. */
  phase?: number;
  corona?: boolean;
  title?: string;
}) {
  const p = Math.min(1, Math.max(0, phase));
  // At phase 0 the occluder sits fully clear of the disc; at 1 it is concentric.
  const cx = 50 + (1 - p) * 46;
  const uid = `u${Math.round(p * 1000)}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <mask id={`${uid}-m`}>
          <rect width="100" height="100" fill="#000" />
          <circle cx="50" cy="50" r="34" fill="#fff" />
          <circle cx={cx} cy="50" r="34" fill="#000" />
        </mask>
      </defs>

      {/* the corona: only ever fully visible at totality */}
      {corona ? (
        <circle
          cx="50"
          cy="50"
          r="34"
          stroke="currentColor"
          strokeWidth="1.25"
          opacity={0.25 + p * 0.75}
        />
      ) : null}

      {/* the light that survives the occlusion */}
      <circle cx="50" cy="50" r="34" fill="currentColor" mask={`url(#${uid}-m)`} />
    </svg>
  );
}

/** Wordmark lockup. Totality by default — the state the product is named after. */
export function Wordmark({
  phase = 1,
  className = '',
}: {
  phase?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={16} phase={phase} title="Umbra" />
      <span
        className="mono"
        style={{ letterSpacing: '0.22em', fontSize: '0.8125rem', fontWeight: 500 }}
      >
        UMBRA
      </span>
    </span>
  );
}
