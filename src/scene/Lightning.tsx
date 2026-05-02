import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

interface Props {
  /** Mean seconds between flashes. Real interval is jittered ±50%. */
  meanInterval?: number;
  /** Flash duration in seconds. */
  duration?: number;
  /** Peak intensity at the flash apex. */
  intensity?: number;
  /** Flash colour — slightly cool, like cloud-to-cloud lightning. */
  color?: THREE.ColorRepresentation;
  /** World position of the strike — usually high & off to one side. */
  position?: [number, number, number];
}

/**
 * Periodic lightning flash. A directional light at zero intensity most of
 * the time, briefly ramped up at randomised intervals. The on-time follows
 * a fast ease-in / ease-out curve so it reads as a flash rather than a
 * fade-up.
 *
 * No geometry — the flash brightens whatever it can illuminate (cloud cap,
 * ground, distant haze). Intentionally cheap; no actual bolt rendered.
 */
export function Lightning({
  meanInterval = 6.5,
  duration = 0.18,
  intensity = 6.0,
  color = "#cdd6ff",
  position = [3, 6, 1.5],
}: Props) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const nextStrike = useRef<number>(2 + Math.random() * meanInterval);
  const flashEnd = useRef<number>(0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (t > nextStrike.current) {
      flashEnd.current = t + duration;
      nextStrike.current = t + meanInterval * (0.5 + Math.random()); // 0.5x..1.5x mean
    }

    if (lightRef.current) {
      if (t < flashEnd.current) {
        // u ∈ [0,1] over the flash window.
        const u = 1 - (flashEnd.current - t) / duration;
        // Smooth ramp up then down: 4·u·(1−u) peaks at u=0.5.
        const env = 4 * u * (1 - u);
        // Subtle flicker — kept ≤ 1.0 so the configured `intensity` is the
        // actual ceiling, not a centre value the flicker can spike past.
        const flicker = 0.85 + 0.15 * Math.sin(u * 50);
        lightRef.current.intensity = intensity * env * flicker;
      } else {
        lightRef.current.intensity = 0;
      }
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      position={position}
      intensity={0}
      color={color}
    />
  );
}
