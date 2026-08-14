'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

import { Eclipse } from '@/components/scene/Eclipse';

/**
 * Smooth scroll, and the single source of scroll progress for the eclipse.
 *
 * The scene reads progress from a ref rather than React state on purpose: this
 * value changes every frame, and putting it through a re-render would burn the
 * frame budget the shader needs.
 *
 * Not scroll-jacking — Lenis only smooths the wheel-to-scroll mapping. Every
 * native affordance (keyboard, scrollbar drag, anchor links, find-in-page)
 * still works, and it is disabled outright under reduced motion.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const progress = useRef(0);
  const pathname = usePathname();
  // The eclipse is the landing page's argument. On the editorial pages the type
  // is the subject, so the scene drops back to an atmospheric wash rather than
  // running a corona underneath a paragraph.
  const intensity = pathname === '/' ? 1 : 0.16;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const readProgress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    readProgress();

    if (reduced) {
      window.addEventListener('scroll', readProgress, { passive: true });
      return () => window.removeEventListener('scroll', readProgress);
    }

    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    lenis.on('scroll', readProgress);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <>
      <Eclipse progressRef={progress} intensity={intensity} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </>
  );
}
