import { useEffect, useState } from "react";

/**
 * Lightweight FPS sampler using raw requestAnimationFrame so it works
 * outside the R3F `<Canvas>` (the HUD is a sibling, not inside the canvas).
 * Averages over `windowMs` to keep the readout stable.
 */
export function useFps(windowMs = 500): number {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      frames += 1;
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= windowMs) {
        setFps((frames * 1000) / elapsed);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [windowMs]);

  return fps;
}
