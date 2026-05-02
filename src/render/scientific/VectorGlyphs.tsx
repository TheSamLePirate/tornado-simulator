import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { InstancedMesh, NodeMaterial } from "three/webgpu";
import type { Storage3DTexture } from "three/webgpu";
import {
  Fn,
  float,
  instanceIndex,
  mix,
  normalize,
  positionLocal,
  texture3D,
  vec3,
  vec4,
} from "three/tsl";
import { viridisTSL } from "../../utils/colormap";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  velocityTex: Storage3DTexture;
  Wx: number;
  Wy: number;
  Wz: number;
  vMaxRef: number;
}

/** Sparse lattice resolution — 8×8×6 = 384 arrows. */
const NX = 8;
const NY = 8;
const NZ = 6;
const TOTAL = NX * NY * NZ;

/** Manual cross product for TSL vec3 nodes. */
function tslCross(a: TSLNode, b: TSLNode): TSLNode {
  return vec3(
    a.y.mul(b.z).sub(a.z.mul(b.y)),
    a.z.mul(b.x).sub(a.x.mul(b.z)),
    a.x.mul(b.y).sub(a.y.mul(b.x)),
  ) as TSLNode;
}

/**
 * Instanced cone glyphs on a sparse lattice, oriented and scaled by the
 * local velocity vector. Colour follows the viridis colormap keyed to
 * speed / Vmax. Gives an immediate read on the flow pattern — radial
 * inflow, tangential swirl, vertical updraft.
 */
export function VectorGlyphs({ velocityTex, Wx, Wy, Wz, vMaxRef }: Props) {
  const { mesh } = useMemo(() => {
    const arrowLen = Wz * 0.06;
    const arrowRad = arrowLen * 0.2;
    const geo = new THREE.ConeGeometry(arrowRad, arrowLen, 6);

    const mat = new NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;

    // ── Per-instance lattice position ──
    const ix: TSLNode = instanceIndex.mod(NX);
    const iy: TSLNode = instanceIndex.div(NX).mod(NY);
    const iz: TSLNode = instanceIndex.div(NX * NY);

    // Texture UV for this lattice cell.
    const u: TSLNode = float(ix).add(0.5).div(NX);
    const v: TSLNode = float(iy).add(0.5).div(NY);
    const w: TSLNode = float(iz).add(0.5).div(NZ);

    // World position (sim X→worldX, simZ→worldY-up, simY→-worldZ; the sign
    // flip on Y preserves right-handedness so sim CCW renders as world CCW).
    const worldX: TSLNode = u.sub(0.5).mul(Wx);
    const worldY: TSLNode = w.mul(Wz);
    const worldZ: TSLNode = float(0.5).sub(v).mul(Wy);

    // ── Sample velocity and remap to world axes ──
    const vel: TSLNode = texture3D(velocityTex, vec3(u, v, w));
    const speed: TSLNode = vel.w.max(float(0.01));
    // sim (vx, vy, vz) → world (vx, vz, -vy)  — match position remap.
    const worldVel: TSLNode = vec3(vel.x, vel.z, vel.y.negate());
    const dir: TSLNode = normalize(worldVel) as TSLNode;

    // ── Build orthonormal basis: dir replaces cone's Y axis ──
    // Pick a reference vector not parallel to dir.
    const isVertical: TSLNode = dir.y.abs().greaterThan(float(0.95));
    const t: TSLNode = isVertical.select(float(1), float(0));
    const ref: TSLNode = mix(vec3(0, 1, 0), vec3(1, 0, 0), t) as TSLNode;
    const right: TSLNode = normalize(tslCross(dir, ref));
    const up: TSLNode = tslCross(right, dir);

    // ── Rotate local cone vertex → world orientation ──
    const local: TSLNode = positionLocal;
    const rotated: TSLNode = right
      .mul(local.x)
      .add(dir.mul(local.y))
      .add(up.mul(local.z));

    // Scale by velocity magnitude, clamp so near-zero arrows are tiny.
    const scaleFactor: TSLNode = speed
      .div(Math.max(vMaxRef, 1))
      .clamp(float(0.15), float(1.5));
    const scaled: TSLNode = rotated.mul(scaleFactor);

    // Translate to lattice world position.
    const worldPos: TSLNode = vec3(worldX, worldY, worldZ);
    mat.positionNode = scaled.add(worldPos);

    // ── Colour by velocity magnitude (viridis) ──
    const tColor: TSLNode = speed
      .div(Math.max(vMaxRef, 1))
      .clamp(float(0), float(1));
    mat.colorNode = Fn(() => {
      const cmapColor = viridisTSL(tColor);
      return vec4(cmapColor, float(0.9));
    })();

    const m = new InstancedMesh(geo, mat, TOTAL);
    m.frustumCulled = false;
    return { mesh: m };
  }, [velocityTex, Wx, Wy, Wz, vMaxRef]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as NodeMaterial).dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
