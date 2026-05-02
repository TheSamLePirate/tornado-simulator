import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { Storage3DTexture } from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  cameraPosition,
  exp,
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
import { magmaTSL } from "../../utils/colormap";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  vorticityTex: Storage3DTexture;
  Wx: number;
  Wy: number;
  Wz: number;
  vMaxRef: number;
  rMaxRef: number;
  /** User-tunable extinction multiplier. 0 → invisible, 1 → opaque cores. */
  density?: number;
  steps?: number;
}

const BASE_EXTINCTION = 30;

/**
 * Volumetric ray-march of |ω| over the simulation domain. Front-to-back
 * Beer-Lambert compositing with an emissive-only source coloured by the
 * magma colormap of normalized vorticity. Renders the helical sub-structure
 * of the vortex tube as a continuous "vorticity smoke" rather than a hard
 * binary surface — captures structure that the iso-surface misses.
 *
 *   tau   = density(p) · uExt · dtRay
 *   alpha = 1 − exp(−tau)
 *   L    += T · alpha · emissive(t)
 *   T    *= 1 − alpha
 *
 * No sun term, no shadow rays — purely emissive. Default OFF (heaviest
 * scientific-view component) and only mounted when in scientific viewMode.
 */
export function VortVolume({
  vorticityTex,
  Wx,
  Wy,
  Wz,
  vMaxRef,
  rMaxRef,
  density = 0.4,
  steps = 64,
}: Props) {
  const omegaRef = (vMaxRef / Math.max(rMaxRef, 1)) * 4;

  const [uOmegaRef] = useState(() => uniform(omegaRef));
  const [uExt] = useState(() => uniform(density * BASE_EXTINCTION));
  useEffect(() => {
    (uOmegaRef as unknown as { value: number }).value = omegaRef;
  }, [omegaRef, uOmegaRef]);
  useEffect(() => {
    (uExt as unknown as { value: number }).value = density * BASE_EXTINCTION;
  }, [density, uExt]);

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

    // sim X = worldX, sim Y = worldZ, sim Z = worldY-up
    const worldToUV = (p: TSLNode): TSLNode =>
      vec3(
        p.x.add(halfWx).div(Wx),
        p.z.add(halfWy).div(Wy),
        p.y.div(Wz),
      ) as TSLNode;

    const colorNode = Fn(() => {
      const ro: TSLNode = cameraPosition;
      const rdN: TSLNode = normalize(positionWorld.sub(cameraPosition));
      const eps = 1e-6;
      const rd: TSLNode = vec3(
        rdN.x.abs().lessThan(float(eps)).select(float(eps), rdN.x),
        rdN.y.abs().lessThan(float(eps)).select(float(eps), rdN.y),
        rdN.z.abs().lessThan(float(eps)).select(float(eps), rdN.z),
      );
      const invDir: TSLNode = vec3(
        float(1).div(rd.x),
        float(1).div(rd.y),
        float(1).div(rd.z),
      );

      const t1: TSLNode = boxMin.sub(ro).mul(invDir);
      const t2: TSLNode = boxMax.sub(ro).mul(invDir);
      const tMin: TSLNode = min(t1, t2);
      const tMax: TSLNode = max(t1, t2);
      const tEnter: TSLNode = max(max(max(tMin.x, tMin.y), tMin.z), float(0));
      const tExit: TSLNode = min(min(tMax.x, tMax.y), tMax.z);

      const N = steps;
      const dtRay: TSLNode = tExit.sub(tEnter).div(float(N)).max(float(1e-5));

      const accum = vec3(0).toVar();
      const transmit = float(1).toVar();

      Loop(N, ({ i }: { i: TSLNode }) => {
        If(transmit.greaterThan(float(0.01)), () => {
          const t: TSLNode = tEnter.add(dtRay.mul(float(i).add(0.5)));
          If(t.lessThan(tExit), () => {
            const p: TSLNode = ro.add(rd.mul(t));
            const uvw: TSLNode = worldToUV(p);
            const omegaMag: TSLNode = texture3D(vorticityTex, uvw).w;
            const tNorm: TSLNode = omegaMag
              .div(uOmegaRef.max(float(1e-6)))
              .clamp(float(0), float(1));

            If(tNorm.greaterThan(float(0.02)), () => {
              const emissive: TSLNode = magmaTSL(tNorm).mul(1.6);
              const tau: TSLNode = tNorm.mul(uExt).mul(dtRay);
              const alpha: TSLNode = float(1).sub(exp(tau.negate()));
              accum.assign(accum.add(transmit.mul(alpha).mul(emissive)));
              transmit.assign(transmit.mul(float(1).sub(alpha)));
            });
          });
        });
      });

      const opacity: TSLNode = float(1).sub(transmit);
      return vec4(accum, opacity) as TSLNode;
    });

    mat.colorNode = colorNode();
    return mat;
  }, [vorticityTex, Wx, Wy, Wz, steps, uOmegaRef, uExt]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh position={[0, Wz / 2, 0]} renderOrder={3}>
      <boxGeometry args={[Wx, Wz, Wy]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
