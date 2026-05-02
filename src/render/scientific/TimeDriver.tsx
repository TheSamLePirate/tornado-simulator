import { useFrame } from "@react-three/fiber";
import { uniform } from "three/tsl";

/**
 * Singleton time uniform shared across animated scientific shaders
 * (stream-tube comet pulse, future LIC noise drift, etc.). The driver
 * component below ticks it forward each frame and folds via mod(100) to
 * preserve float precision over long sessions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const uTime = uniform(0.0) as any;

/**
 * Mount once near the top of the R3F tree. Has no visual; it just
 * registers a single `useFrame` so consumers can read `uTime` as a
 * stable shared TSL uniform.
 */
export function TimeDriver() {
  useFrame((_, dt) => {
    uTime.value = (uTime.value + dt) % 100;
  });
  return null;
}
