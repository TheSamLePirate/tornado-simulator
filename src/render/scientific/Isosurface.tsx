import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { Storage3DTexture } from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  cameraPosition,
  float,
  max,
  min,
  normalize,
  positionWorld,
  texture3D,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  vorticityTex: Storage3DTexture;
  Wx: number;
  Wy: number;
  Wz: number;
  /** Normalized base threshold [0,1] — the OUTERMOST shell. */
  threshold: number;
  vMaxRef: number;
  rMaxRef: number;
  /** Number of nested shells to render (1..4). */
  shellCount?: number;
  /** Δ between consecutive shell thresholds (in normalized units). */
  shellSpread?: number;
  steps?: number;
}

/**
 * Ray-marched multi-shell isosurface of |ω|. Up to 4 nested shells are
 * detected at increasing thresholds; each rising-edge crossing contributes
 * a Lambert-shaded slab with cool→warm colour grading, composited
 * front-to-back. Reveals the radial vorticity gradient and any sub-vortices
 * nested inside the main vortex tube.
 */
export function Isosurface({
  vorticityTex,
  Wx,
  Wy,
  Wz,
  threshold,
  vMaxRef,
  rMaxRef,
  shellCount = 3,
  shellSpread = 0.18,
  steps = 64,
}: Props) {
  const omegaRef = (vMaxRef / Math.max(rMaxRef, 1)) * 4;

  // Stable uniforms — slider drags update these without rebuilding the material.
  const [uThresh] = useState(() => uniform(threshold * omegaRef));
  const [uShellSpreadO] = useState(() => uniform(shellSpread * omegaRef));
  const [uShellCount] = useState(() => uniform(shellCount));
  useEffect(() => {
    (uThresh as unknown as { value: number }).value = threshold * omegaRef;
  }, [threshold, omegaRef, uThresh]);
  useEffect(() => {
    (uShellSpreadO as unknown as { value: number }).value =
      shellSpread * omegaRef;
  }, [shellSpread, omegaRef, uShellSpreadO]);
  useEffect(() => {
    (uShellCount as unknown as { value: number }).value = shellCount;
  }, [shellCount, uShellCount]);

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });

    const halfWx = Wx / 2;
    const halfWy = Wy / 2;
    const boxMin: TSLNode = vec3(-halfWx, 0, -halfWy);
    const boxMax: TSLNode = vec3(halfWx, Wz, halfWy);

    // World → tex UV. Inverse of the simX→worldX, simZ→worldY-up, simY→-worldZ
    // remap (negation on the Y/Z swap preserves right-handedness).
    const worldToUV = (p: TSLNode): TSLNode =>
      vec3(
        p.x.add(halfWx).div(Wx),
        p.z.negate().add(halfWy).div(Wy),
        p.y.div(Wz),
      ) as TSLNode;

    // Compute gradient-shaded base colour at a given uvw position. Wrapped
    // in Fn so the 6-tap gradient compiles once and is only evaluated when
    // a shell crossing actually fires (inside the If body).
    const litFor = Fn(
      ([uvw, baseColor, lightDir]: [TSLNode, TSLNode, TSLNode]): TSLNode => {
        const epsUV = 0.5 / 96;
        const dfdU: TSLNode = texture3D(
          vorticityTex,
          uvw.add(vec3(epsUV, 0, 0)),
        ).w.sub(texture3D(vorticityTex, uvw.sub(vec3(epsUV, 0, 0))).w);
        const dfdV: TSLNode = texture3D(
          vorticityTex,
          uvw.add(vec3(0, epsUV, 0)),
        ).w.sub(texture3D(vorticityTex, uvw.sub(vec3(0, epsUV, 0))).w);
        const dfdW: TSLNode = texture3D(
          vorticityTex,
          uvw.add(vec3(0, 0, epsUV)),
        ).w.sub(texture3D(vorticityTex, uvw.sub(vec3(0, 0, epsUV))).w);
        // Remap UV axes → world: u→X, w→Y(up), v→Z
        const normal: TSLNode = normalize(vec3(dfdU, dfdW, dfdV) as TSLNode);
        const NdotL: TSLNode = normal.dot(lightDir).max(float(0));
        const diffuse: TSLNode = NdotL.mul(0.6).add(0.4);
        return baseColor.mul(diffuse);
      },
    );

    const colorNode = Fn(() => {
      const ro: TSLNode = cameraPosition;
      const rdRaw: TSLNode = normalize(positionWorld.sub(cameraPosition));
      const eps = 1e-6;
      const rd: TSLNode = vec3(
        rdRaw.x.abs().lessThan(float(eps)).select(float(eps), rdRaw.x),
        rdRaw.y.abs().lessThan(float(eps)).select(float(eps), rdRaw.y),
        rdRaw.z.abs().lessThan(float(eps)).select(float(eps), rdRaw.z),
      );
      const invDir: TSLNode = vec3(
        float(1).div(rd.x),
        float(1).div(rd.y),
        float(1).div(rd.z),
      );

      // Slab intersection
      const t1: TSLNode = boxMin.sub(ro).mul(invDir);
      const t2: TSLNode = boxMax.sub(ro).mul(invDir);
      const tMinV: TSLNode = min(t1, t2);
      const tMaxV: TSLNode = max(t1, t2);
      const tEnter: TSLNode = max(
        max(max(tMinV.x, tMinV.y), tMinV.z),
        float(0),
      );
      const tExit: TSLNode = min(min(tMaxV.x, tMaxV.y), tMaxV.z);

      const N = steps;
      const dtRay: TSLNode = tExit.sub(tEnter).div(float(N)).max(float(1e-5));

      const accum = vec3(0).toVar();
      const transmit = float(1).toVar();
      const prevSample = float(0).toVar();

      const lightDir: TSLNode = normalize(vec3(0.5, 0.8, 0.3));

      // Shell colour palette (outer → inner): cool blue → warm orange.
      const colorOuter: TSLNode = vec3(0.2, 0.55, 0.9);
      const colorMid: TSLNode = vec3(0.7, 0.45, 0.45);
      const colorInner: TSLNode = vec3(0.85, 0.35, 0.15);

      // Per-shell enable (count gate) — uniformly checks isoShellCount ≥ s.
      const enable1: TSLNode = float(1);
      const enable2: TSLNode = uShellCount
        .greaterThanEqual(float(2))
        .select(float(1), float(0));
      const enable3: TSLNode = uShellCount
        .greaterThanEqual(float(3))
        .select(float(1), float(0));
      const enable4: TSLNode = uShellCount
        .greaterThanEqual(float(4))
        .select(float(1), float(0));

      const T1: TSLNode = uThresh;
      const T2: TSLNode = uThresh.add(uShellSpreadO);
      const T3: TSLNode = uThresh.add(uShellSpreadO.mul(2));
      const T4: TSLNode = uThresh.add(uShellSpreadO.mul(3));

      const SHELL_ALPHA = float(0.3);

      const trySample = (
        T: TSLNode,
        baseColor: TSLNode,
        enable: TSLNode,
        sample: TSLNode,
        uvw: TSLNode,
      ) => {
        const belowPrev: TSLNode = prevSample
          .lessThan(T)
          .select(float(1), float(0));
        const aboveCurr: TSLNode = sample
          .greaterThanEqual(T)
          .select(float(1), float(0));
        const cross: TSLNode = belowPrev.mul(aboveCurr).mul(enable);
        If(cross.greaterThan(float(0.5)), () => {
          const lit: TSLNode = litFor(uvw, baseColor, lightDir);
          const a: TSLNode = SHELL_ALPHA;
          accum.assign(accum.add(transmit.mul(a).mul(lit)));
          transmit.assign(transmit.mul(float(1).sub(a)));
        });
      };

      Loop(N, ({ i }: { i: TSLNode }) => {
        // Early-out: once accumulated alpha is near-opaque, further taps
        // contribute nothing visible — bail to keep cost ~1× single-iso.
        If(transmit.greaterThan(float(0.02)), () => {
          const t: TSLNode = tEnter.add(dtRay.mul(float(i).add(0.5)));
          If(t.lessThan(tExit), () => {
            const p: TSLNode = ro.add(rd.mul(t));
            const uvw: TSLNode = worldToUV(p);
            const sample: TSLNode = texture3D(vorticityTex, uvw).w;

            // Outer → inner shell rising-edge checks. At most one fires per
            // step in practice (|ω| is monotonic locally), but all four are
            // evaluated cheaply as uniform-gated multiply-zero alpha.
            trySample(T1, colorOuter, enable1, sample, uvw);
            trySample(T2, colorMid, enable2, sample, uvw);
            trySample(T3, colorInner, enable3, sample, uvw);
            trySample(T4, colorInner, enable4, sample, uvw);

            prevSample.assign(sample);
          });
        });
      });

      const finalAlpha: TSLNode = float(1).sub(transmit);
      return vec4(accum, finalAlpha) as TSLNode;
    });

    mat.colorNode = colorNode();
    return mat;
  }, [vorticityTex, Wx, Wy, Wz, steps, uThresh, uShellSpreadO, uShellCount]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh position={[0, Wz / 2, 0]} renderOrder={5}>
      <boxGeometry args={[Wx, Wz, Wy]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
