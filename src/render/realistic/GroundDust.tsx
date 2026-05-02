import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as THREE from "three";
import {
  Fn,
  atan,
  float,
  mx_noise_float,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  Wx: number;
  Wy: number;
  Wz: number;
}

/**
 * Spinning disc of dust/debris haze at ground level around the tornado base.
 * A single large plane with a TSL material that creates animated swirling
 * tendrils concentrated in a ring at the funnel radius. Provides the
 * ground-level dust atmosphere that the volumetric funnel alone can't deliver.
 */
export function GroundDust({ Wx, Wy }: Props) {
  const discR = Wx * 3;

  const uTime = useMemo(() => uniform(0.0), []);
  const tRef = useRef(0);
  useFrame((_s, dt) => {
    tRef.current += dt;
    (uTime as unknown as { value: number }).value = tRef.current;
  });

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    mat.colorNode = Fn(() => {
      const wp: TSLNode = positionWorld;
      const dist: TSLNode = wp.x.mul(wp.x).add(wp.z.mul(wp.z)).sqrt();

      // Radial falloff — concentrated ring near the funnel base,
      // fading out slowly toward the far field.
      const innerR = Wx * 0.06;
      const peakR = Wx * 0.25;
      const fadeR = Wx * 1.8;
      const innerFade: TSLNode = smoothstep(float(innerR), float(peakR), dist);
      const outerFade: TSLNode = smoothstep(
        float(fadeR),
        float(peakR * 1.5),
        dist,
      );
      const radial: TSLNode = innerFade.mul(outerFade);

      // Coarse spinning tendrils — rotate world-space coords around Y axis
      // so the dust pattern visibly swirls with the vortex.
      const phi: TSLNode = atan(wp.z, wp.x);
      const rotPhi: TSLNode = phi.sub(uTime.mul(0.25));
      const rotX: TSLNode = dist.mul(rotPhi.cos());
      const rotZ: TSLNode = dist.mul(rotPhi.sin());

      const nP1: TSLNode = vec3(rotX, float(0), rotZ).mul(6);
      const n1: TSLNode = mx_noise_float(nP1.add(vec3(5.1, 0, 8.3)));
      const mask1: TSLNode = n1.mul(0.5).add(0.5).clamp(float(0), float(1));

      // Finer detail at a faster rotation rate for wispy layered texture.
      const rotPhi2: TSLNode = phi.sub(uTime.mul(0.55));
      const rotX2: TSLNode = dist.mul(rotPhi2.cos());
      const rotZ2: TSLNode = dist.mul(rotPhi2.sin());
      const nP2: TSLNode = vec3(rotX2, float(0), rotZ2).mul(16);
      const n2: TSLNode = mx_noise_float(nP2.add(vec3(17.3, 0, 23.1)));
      const mask2: TSLNode = n2.mul(0.4).add(0.6).clamp(float(0), float(1));

      const noise: TSLNode = mask1.mul(mask2);
      const alpha: TSLNode = radial.mul(noise).mul(0.15);

      // Warm dust colour with variation from the noise field.
      const dustA: TSLNode = vec3(0.5, 0.38, 0.22);
      const dustB: TSLNode = vec3(0.35, 0.28, 0.18);
      const col: TSLNode = dustA.mul(mask1).add(dustB.mul(float(1).sub(mask1)));

      return vec4(col, alpha);
    })();

    return mat;
  }, [Wx, Wy, discR]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.002, 0]}
      renderOrder={3}
    >
      <planeGeometry args={[discR * 2, discR * 2, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
