import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  /** World altitude where the wall cloud sits. */
  altitude: number;
  /** World radius of the disc. */
  radius: number;
}

/**
 * Mesocyclone / wall-cloud overhead layer. A horizontal disc sitting above
 * the funnel cap with FBM noise modulating both colour and alpha. Reads as a
 * dark, lumpy ceiling that the tornado hangs from.
 *
 * Implementation:
 *   • Geometry: large flat circle, normal pointing down (we look up at it).
 *   • Alpha: FBM-noise mask × radial falloff. Edges fade so the disc doesn't
 *     terminate at a sharp ring.
 *   • Colour: dark slate base with a warmer tint patched in by a second-octave
 *     FBM, picking up the horizon palette like real cloud-base scattering.
 *   • Additive=false, normal alpha blend, depthWrite=false so the funnel
 *     punches through cleanly.
 */
export function WallCloud({ altitude, radius }: Props) {
  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });

    // Deeper blend toward black at the bottom of the cloud, slightly less
    // at the top — mostly we look up at it from below.
    const dark: TSLNode = vec3(0.04, 0.05, 0.07);
    const lighter: TSLNode = vec3(0.16, 0.16, 0.18);
    const warmTint: TSLNode = vec3(0.4, 0.32, 0.22);

    mat.colorNode = Fn(() => {
      const uvN: TSLNode = uv();
      // Distance from disc centre (uv ∈ [0,1]² with centre at 0.5)
      const dCenter: TSLNode = uvN.sub(vec2(0.5, 0.5)).length();

      // Soft circular falloff: full opacity inside ~0.3, fading to 0 at 0.5.
      const radial: TSLNode = smoothstep(float(0.5), float(0.2), dCenter);

      // World-space coords for noise so it doesn't move with camera/UV.
      const wpScaled: TSLNode = positionWorld
        .mul(0.6)
        .add(vec3(13.7, 0.0, 7.3));
      // Two FBM lookups: one for clumpy structure, one for warm tint patches.
      // Octave counts kept low (2 + 1) — wall cloud is far from camera and
      // covers a large screen area, fine detail is invisible but expensive.
      const cloudFBM: TSLNode = mx_fractal_noise_float(
        wpScaled,
        2, // octaves
        2.0, // lacunarity
        0.55, // diminish
      );
      const tintFBM: TSLNode = mx_fractal_noise_float(
        wpScaled.mul(0.4).add(vec3(31, 7, 19)),
        1,
        2.0,
        0.6,
      );

      // Remap [-1,1] → [0,1].
      const cloudT: TSLNode = cloudFBM.mul(0.5).add(0.5);
      const tintT: TSLNode = tintFBM
        .mul(0.5)
        .add(0.5)
        .clamp(float(0), float(1));

      const baseColor: TSLNode = mix(dark, lighter, cloudT);
      const finalColor: TSLNode = mix(baseColor, warmTint, tintT.mul(0.35));

      // Alpha: clumpy mask × radial. Bias the mask so small noise values
      // become fully transparent gaps (you can see sky through the cloud).
      const mask: TSLNode = smoothstep(float(0.25), float(0.75), cloudT);
      const alpha: TSLNode = radial.mul(mask).mul(0.85);

      return vec4(finalColor, alpha);
    })();

    return mat;
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      position={[0, altitude, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      renderOrder={4}
    >
      <circleGeometry args={[radius, 96]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
