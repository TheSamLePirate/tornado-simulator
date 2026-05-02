import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { InstancedMesh, NodeMaterial } from "three/webgpu";
import type { Storage3DTexture } from "three/webgpu";
import {
  Fn,
  cameraPosition,
  cross,
  float,
  instanceIndex,
  normalize,
  positionLocal,
  smoothstep,
  texture3D,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import type { Particles } from "../sim/Particles";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  particles: Particles;
  /** Velocity field texture so the vertex shader can stretch quads along flow. */
  velocityTex: Storage3DTexture;
  /** Sim domain extents in metres (must match the solver's grid). */
  Lx: number;
  Ly: number;
  Lz: number;
  /** Render scale: sim → world (must match Scene's WORLD_SCALE). */
  worldScale: number;
  /** Particle world-space radius (m in sim units). */
  particleSize?: number;
  /** Tint of the dust. */
  color?: THREE.ColorRepresentation;
  /** Length-to-width ratio of the streak (1 = round dot, >>1 = long streak). */
  streakRatio?: number;
}

/**
 * Renders the particle storage buffer as instanced motion-blur streaks.
 * Each quad is oriented along the local flow velocity (tangent) and faces
 * the camera (perpendicular axis = view × tangent), so the particle reads
 * as a short bright streak rather than a static dot — at low speeds it
 * collapses back to a dot. Additive blending; soft alpha falloff at the
 * tips and across the width for a "comet" look.
 */
export function ParticleField({
  particles,
  velocityTex,
  Lx,
  Ly,
  Lz,
  worldScale,
  particleSize = 7,
  color = "#d9c19a",
  streakRatio = 5,
}: Props) {
  const { mesh } = useMemo(() => {
    const sizeWorld = particleSize * worldScale;
    // Unit-plane geometry; we apply the world-space stretch in the vertex
    // shader so it tracks live velocity at each frame.
    const geometry = new THREE.PlaneGeometry(1, 1);

    const material = new NodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.AdditiveBlending;
    material.side = THREE.DoubleSide;

    const state: TSLNode = particles.stateNode.element(instanceIndex);
    const simPos: TSLNode = state.xyz;
    const age: TSLNode = state.w;

    // Sim → world remap with sign flip on Y to preserve handedness:
    //   simX → worldX, simZ → worldY-up, simY → -worldZ.
    const ws: TSLNode = float(worldScale);
    const worldPos: TSLNode = vec3(
      simPos.x.mul(ws),
      simPos.z.mul(ws),
      simPos.y.negate().mul(ws),
    ) as TSLNode;

    // Sample velocity at the particle's location. UV is sim-space.
    const u: TSLNode = simPos.x
      .add(Lx / 2)
      .div(Lx)
      .clamp(float(0), float(1));
    const v: TSLNode = simPos.y
      .add(Ly / 2)
      .div(Ly)
      .clamp(float(0), float(1));
    const w: TSLNode = simPos.z.div(Lz).clamp(float(0), float(1));
    const velSim: TSLNode = texture3D(velocityTex, vec3(u, v, w)).xyz;
    // World-space velocity (same axis remap as worldPos).
    const velWorld: TSLNode = vec3(
      velSim.x,
      velSim.z,
      velSim.y.negate(),
    ) as TSLNode;
    const speed: TSLNode = velWorld.length().max(float(1e-3));

    // Streak length scales softly with speed so calm-air particles stay
    // dot-shaped while fast-air ones smear into streaks. Capped to streakRatio.
    const speedT: TSLNode = speed.div(40.0).clamp(float(0), float(1)); // 40 m/s as the "fully stretched" reference
    const lengthMul: TSLNode = float(1).add(speedT.mul(streakRatio - 1));

    // Build a camera-perpendicular basis: tangent ‖ flow, perpendicular = cross(view, tangent).
    const tangent: TSLNode = velWorld.div(speed); // unit world-space tangent
    const view: TSLNode = cameraPosition.sub(worldPos).normalize();
    const perp: TSLNode = normalize(cross(tangent, view));

    material.vertexNode = Fn(() => {
      const local: TSLNode = positionLocal; // x, y ∈ [-0.5, +0.5]
      const along: TSLNode = tangent
        .mul(local.x)
        .mul(float(sizeWorld))
        .mul(lengthMul);
      const across: TSLNode = perp.mul(local.y).mul(float(sizeWorld));
      return worldPos.add(along).add(across);
    })();

    // ----- fragment: soft tip + width falloff, age-based fade -----
    const c = new THREE.Color(color);
    const tint: TSLNode = vec3(c.r, c.g, c.b);
    const lifeT: TSLNode = age.div(particles.uMaxAge).clamp(float(0), float(1));
    const fade: TSLNode = lifeT
      .mul(2)
      .min(float(2).sub(lifeT.mul(2)))
      .clamp(float(0), float(1));

    material.colorNode = Fn(() => {
      const uvN: TSLNode = uv();
      // Across-width falloff (uv.y ∈ [0,1], tube cross-section).
      const widthFall: TSLNode = smoothstep(
        float(0.5),
        float(0.0),
        uvN.y.sub(0.5).abs(),
      );
      // Along-length falloff (head bright, tail dim).
      const tipFall: TSLNode = smoothstep(float(0.0), float(0.4), uvN.x).mul(
        smoothstep(float(1.0), float(0.6), uvN.x),
      );
      const intensity: TSLNode = widthFall
        .mul(tipFall)
        .mul(fade)
        .mul(float(1.4));
      return vec4(tint.mul(intensity), intensity);
    })();

    const m = new InstancedMesh(geometry, material, particles.count);
    m.frustumCulled = false;
    m.renderOrder = 5;
    return { mesh: m };
  }, [
    particles,
    velocityTex,
    Lx,
    Ly,
    Lz,
    worldScale,
    particleSize,
    color,
    streakRatio,
  ]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as NodeMaterial).dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
