'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-once-on-approach.
 *
 * No animation library: an IntersectionObserver toggles one class, and the CSS
 * in globals.css does the rest. Headlines reveal by LINE, masked by overflow —
 * letter-by-letter is the tell of generated design and it hurts readability at
 * display size.
 *
 * Fires once, at roughly "top 85%", and then disconnects.
 */
export function Reveal({
  children,
  className = '',
  as: Tag = 'div',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'header' | 'li' | 'article';
  delay?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`${shown ? 'is-revealed' : ''} ${className}`}
      style={{ ['--d' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * A display headline that reveals line by line.
 *
 * Lines are authored explicitly rather than measured at runtime — measuring
 * causes a flash of unmasked text and a layout read on every resize, and at
 * display size the line breaks are a typographic decision anyway.
 */
export function RevealLines({
  lines,
  className = '',
  stagger = 80,
}: {
  lines: React.ReactNode[];
  className?: string;
  stagger?: number;
}) {
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <span className="reveal-line" key={i}>
          <span style={{ ['--d' as string]: `${i * stagger}ms` }}>{line}</span>
        </span>
      ))}
    </span>
  );
}
