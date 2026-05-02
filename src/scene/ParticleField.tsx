import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { InstancedMesh, NodeMaterial } from "three/webgpu";
import {
  Fn,
  billboarding,
  float,
  instanceIndex,
  smoothstep,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import type { Particles } from "../sim/Particles";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  particles: Particles;
  /** Render scale: sim → world (must match Scene's WORLD_SCALE). */
  worldScale: number;
  /** Particle world-space radius (m in sim units). */
  particleSize?: number;
  /** Tint of the dust. */
  color?: THREE.ColorRepresentation;
}

/**
 * Renders the particle storage buffer as a cloud of additive billboarded
 * sprites. Each instance is a flat quad oriented to face the camera; its
 * world position is read from the particle storage at `instanceIndex`.
 *
 * Uses TSL's `billboarding({ position })` helper to substitute the per-
 * instance world position into the model-view chain while zeroing the
 * rotation rows so the quad always faces the camera.
 *
 * The fragment is a soft circular falloff so each particle reads as a
 * dust mote rather than a hard square.
 */
export function ParticleField({
  particles,
  worldScale,
  particleSize = 7,
  color = "#d9c19a",
}: Props) {
  const { mesh } = useMemo(() => {
    // Quad sized in WORLD units (after the simPos·worldScale conversion below).
    const sizeWorld = particleSize * worldScale;
    const geometry = new THREE.PlaneGeometry(sizeWorld, sizeWorld);

    const material = new NodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;
    material.side = THREE.DoubleSide;

    // ----- per-instance world position from storage buffer -----
    const state: TSLNode = particles.stateNode.element(instanceIndex);
    const simPos: TSLNode = state.xyz;
    const age: TSLNode = state.w;

    // Sim → world axis remap (sim X→world X, sim Y→world Z (depth), sim Z→world Y up)
    const ws: TSLNode = float(worldScale);
    const worldPos: TSLNode = vec3(
      simPos.x.mul(ws),
      simPos.z.mul(ws),
      simPos.y.mul(ws),
    );

    // ----- vertex shader: billboard the quad around per-instance worldPos -----
    material.vertexNode = billboarding({ position: worldPos });

    // ----- fragment shader: soft circular falloff, age-based fade, glow -----
    const c = new THREE.Color(color);
    const tint: TSLNode = vec3(c.r, c.g, c.b);

    // Triangular age fade: 0 at spawn, 1 at midlife, 0 at end of life.
    const lifeT: TSLNode = age.div(particles.uMaxAge).clamp(float(0), float(1));
    const fade: TSLNode = lifeT
      .mul(2)
      .min(float(2).sub(lifeT.mul(2)))
      .clamp(float(0), float(1));

    material.colorNode = Fn(() => {
      const uvN: TSLNode = uv();
      // Distance from quad centre (uv=(0.5,0.5)).
      const d: TSLNode = uvN.sub(vec3(0.5, 0.5, 0).xy).length();
      // Soft disc: 1 at centre → 0 at radius 0.5.
      const disc: TSLNode = smoothstep(float(0.5), float(0.0), d);
      // Brightness boost so additive blending reads even on dark backgrounds.
      const intensity: TSLNode = disc.mul(fade).mul(float(1.4));
      return vec4(tint.mul(intensity), intensity);
    })();

    const m = new InstancedMesh(geometry, material, particles.count);
    m.frustumCulled = false; // billboard math bypasses standard bounds
    m.renderOrder = 5;
    return { mesh: m };
  }, [particles, worldScale, particleSize, color]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as NodeMaterial).dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
