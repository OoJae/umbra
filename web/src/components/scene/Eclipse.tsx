'use client';

import { useEffect, useRef } from 'react';

import { FRAG, VERT } from './shader';

/**
 * The scroll-driven eclipse that sits behind the landing page.
 *
 * Deliberately dependency-free WebGL: one fullscreen triangle, one shader, one
 * draw call. Three.js would be ~150kb for a scene that needs no scene graph.
 *
 * Costs are kept honest:
 *   · DPR capped at 1.5 — the shader is fill-rate bound, not geometry bound
 *   · rAF stops when the canvas leaves the viewport or the tab is hidden
 *   · reduced motion renders exactly one frame, held at totality
 */
export function Eclipse({
  progressRef,
  intensity = 1,
}: {
  progressRef: React.MutableRefObject<number>;
  intensity?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read through a ref so a route change does not tear down the GL context.
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // One triangle that covers the viewport. Cheaper than a quad and avoids the
    // diagonal seam a two-triangle quad puts through the middle of the screen.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uProgress = gl.getUniformLocation(prog, 'uProgress');
    const uIntensity = gl.getUniformLocation(prog, 'uIntensity');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let running = false;
    const start = performance.now();
    // Eased toward the real scroll value so the scene never snaps.
    let shown = reduced ? 0.5 : progressRef.current;
    // Likewise for intensity, so moving between routes dissolves rather than cuts.
    let shownIntensity = intensityRef.current;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };

    const draw = (time: number) => {
      gl.uniform1f(uTime, time);
      gl.uniform1f(uProgress, shown);
      gl.uniform1f(uIntensity, shownIntensity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = () => {
      if (!running) return;
      resize();
      shown += (progressRef.current - shown) * 0.08;
      shownIntensity += (intensityRef.current - shownIntensity) * 0.06;
      draw((performance.now() - start) / 1000);
      raf = requestAnimationFrame(frame);
    };

    const play = () => {
      if (running || reduced) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    if (reduced) {
      // A single held frame at totality — the state the product is named after.
      resize();
      shownIntensity = intensityRef.current;
      draw(0);
    } else {
      play();
    }

    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? play() : pause()),
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? pause() : play());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', resize);

    return () => {
      pause();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [progressRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    />
  );
}
