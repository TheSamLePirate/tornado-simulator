import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { InstancedMesh, NodeMaterial } from "three/webgpu";
import type { Storage3DTexture, WebGPURenderer } from "three/webgpu";
import {
  Fn,
  Loop,
  attributeArray,
  cameraPosition,
  cross,
  float,
  instanceIndex,
  positionLocal,
  smoothstep,
  texture3D,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { viridisTSL } from "../../utils/colormap";
import { uTime } from "./TimeDriver";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

/** Number of individual streamlines seeded around the vortex. */
const M = 16;
/** Points per streamline. */
const N = 120;
const TOTAL_PTS = M * N;

interface Props {
  velocityTex: Storage3DTexture;
  Wx: number;
  Wy: number;
  Wz: number;
  vMaxRef: number;
  /** Sim domain extents in metres. */
  Lx: number;
  Ly: number;
  Lz: number;
  worldScale: number;
}

/**
 * GPU-traced streamlines rendered as dotted paths. A lightweight compute
 * kernel traces M streamlines from evenly-spaced seed points around the
 * vortex, each advancing N steps along the normalised velocity field.
 * The traced positions are stored in a shared buffer and rendered as
 * billboarded dots coloured by velocity magnitude (viridis).
 */
export function Streamlines({
  velocityTex,
  Wx,
  Wy,
  Wz,
  vMaxRef,
  Lx,
  Ly,
  Lz,
  worldScale,
}: Props) {
  const { gl } = useThree();
  const tracing = useRef(false);

  const { traceKernel, mesh } = useMemo(() => {
    // Storage buffer: xyz (world) + speed for each traced point.
    const buf: TSLNode = attributeArray(TOTAL_PTS, "vec4");
    // Tangent buffer: world-space unit flow direction at each traced point,
    // used to orient the rendered tube segments along the local flow.
    const tanBuf: TSLNode = attributeArray(TOTAL_PTS, "vec4");

    // ── Compute kernel ──
    // Each of M work-items traces one complete streamline using RK4 on the
    // normalised velocity field. RK4 ≈ 4× the texture3D taps of Euler but
    // virtually eliminates curvature drift in tight swirling regions.
    const sampleVelN = Fn(([x, y, z]: [TSLNode, TSLNode, TSLNode]): TSLNode => {
      const u: TSLNode = x
        .add(Lx / 2)
        .div(Lx)
        .clamp(float(0), float(1));
      const v: TSLNode = y
        .add(Ly / 2)
        .div(Ly)
        .clamp(float(0), float(1));
      const w: TSLNode = z.div(Lz).clamp(float(0), float(1));
      const vv: TSLNode = texture3D(velocityTex, vec3(u, v, w)).xyz;
      const sp: TSLNode = vv.length().max(float(0.1));
      return vv.div(sp);
    });

    const kernel = Fn(() => {
      const lineIdx: TSLNode = instanceIndex; // 0 .. M-1
      const theta: TSLNode = float(lineIdx)
        .div(float(M))
        .mul(Math.PI * 2);

      // Seed on a circle at r ≈ 300 m, z ≈ 50 m (above no-slip layer).
      const seedR = 300;
      const px: TSLNode = float(seedR).mul(theta.cos()).toVar();
      const py: TSLNode = float(seedR).mul(theta.sin()).toVar();
      const pz: TSLNode = float(50).toVar();

      const ds = 15; // spatial step in metres
      const halfDs = ds * 0.5;

      Loop(N, ({ i }: { i: TSLNode }) => {
        const bufIdx: TSLNode = lineIdx.mul(N).add(i);

        // Sample at current position for un-normalised speed → colour channel.
        const u0: TSLNode = px
          .add(Lx / 2)
          .div(Lx)
          .clamp(float(0), float(1));
        const v0: TSLNode = py
          .add(Ly / 2)
          .div(Ly)
          .clamp(float(0), float(1));
        const w0: TSLNode = pz.div(Lz).clamp(float(0), float(1));
        const vel0: TSLNode = texture3D(velocityTex, vec3(u0, v0, w0)).xyz;
        const speed: TSLNode = vel0.length().max(float(0.1));

        // Store world-space position + speed.
        // World axes: X = simX, Y(up) = simZ, Z = -simY (sign flip preserves
        // right-handedness so sim CCW renders as world CCW from above).
        buf
          .element(bufIdx)
          .assign(
            vec4(
              px.mul(worldScale),
              pz.mul(worldScale),
              py.negate().mul(worldScale),
              speed,
            ) as TSLNode,
          );

        // RK4 on the unit-velocity field.
        const k1: TSLNode = vel0.div(speed);

        // Write tangent in world axes (same negate-Y remap as position).
        tanBuf
          .element(bufIdx)
          .assign(vec4(k1.x, k1.z, k1.y.negate(), float(0)) as TSLNode);

        const k2: TSLNode = sampleVelN(
          px.add(k1.x.mul(halfDs)),
          py.add(k1.y.mul(halfDs)),
          pz.add(k1.z.mul(halfDs)),
        );
        const k3: TSLNode = sampleVelN(
          px.add(k2.x.mul(halfDs)),
          py.add(k2.y.mul(halfDs)),
          pz.add(k2.z.mul(halfDs)),
        );
        const k4: TSLNode = sampleVelN(
          px.add(k3.x.mul(ds)),
          py.add(k3.y.mul(ds)),
          pz.add(k3.z.mul(ds)),
        );
        const k: TSLNode = k1.add(k2.mul(2)).add(k3.mul(2)).add(k4).div(6);
        px.assign(px.add(k.x.mul(ds)));
        py.assign(py.add(k.y.mul(ds)));
        pz.assign(pz.add(k.z.mul(ds)));
      });
    })().compute(M);

    // ── Render: tangent-aligned tube segments at each traced position ──
    // Local plane vertex (positionLocal.x ∈ [-w/2, +w/2]) → mapped along the
    // world-space tangent for the long axis (a "tube"). positionLocal.y maps
    // to a screen-perpendicular offset (tube width). This is camera-aware
    // billboarding constrained to the flow direction, not the screen plane.
    const tubeLength = Wz * 0.05; // ≈ 75 m world; 4–5× the spatial ds
    const tubeWidth = Wz * 0.005; // ≈ 7 m world
    const geo = new THREE.PlaneGeometry(1, 1); // unit plane; we apply scales in TSL
    const mat = new NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;

    const state: TSLNode = buf.element(instanceIndex);
    const worldPos: TSLNode = state.xyz;
    const tan: TSLNode = tanBuf.element(instanceIndex).xyz;

    mat.vertexNode = Fn(() => {
      // local: PlaneGeometry vertex, x ∈ [-0.5, +0.5] is "along tube",
      // y ∈ [-0.5, +0.5] is "across tube"
      const local: TSLNode = positionLocal;
      const view: TSLNode = cameraPosition.sub(worldPos).normalize();
      const right: TSLNode = cross(tan, view).normalize();
      const offsetAlong: TSLNode = tan.mul(local.x.mul(float(tubeLength)));
      const offsetAcross: TSLNode = right.mul(local.y.mul(float(tubeWidth)));
      return worldPos.add(offsetAlong).add(offsetAcross);
    })();

    // Colour by velocity (viridis).
    const speed: TSLNode = state.w;
    const tColor: TSLNode = speed
      .div(Math.max(vMaxRef, 1))
      .clamp(float(0), float(1));

    // Fade along each streamline → tail is dimmer (direction cue).
    const ptInLine: TSLNode = instanceIndex.mod(N);
    const lineIdx: TSLNode = instanceIndex.div(N);
    const fadeT: TSLNode = float(ptInLine).div(float(N));
    const fadeFactor: TSLNode = float(1).sub(fadeT.mul(0.7));

    mat.colorNode = Fn(() => {
      const cmapColor: TSLNode = viridisTSL(tColor);

      // Soft cylindrical alpha — fade across the tube width using uv.y;
      // along the length, slight fade at the very tips for a "dot" look.
      const uvN: TSLNode = uv();
      const widthFalloff: TSLNode = smoothstep(
        float(0.5),
        float(0.0),
        uvN.y.sub(0.5).abs(),
      );
      const tipFalloff: TSLNode = smoothstep(
        float(0.5),
        float(0.25),
        uvN.x.sub(0.5).abs(),
      );
      const disc: TSLNode = widthFalloff.mul(tipFalloff);

      // Comet pulse — a bright triangular peak slides along each line over
      // time. Per-line phase offset so the 16 streamlines pulse out of sync.
      const phase: TSLNode = float(ptInLine).div(float(N));
      const cometSpeed = float(0.5);
      const lineOffset: TSLNode = float(lineIdx).mul(0.137);
      const cometT: TSLNode = phase
        .sub(uTime.mul(cometSpeed).add(lineOffset))
        .fract();
      const triangle: TSLNode = float(1).sub(cometT.mul(2).sub(1).abs());
      const pulse: TSLNode = smoothstep(float(0.85), float(1.0), triangle);
      const brightness: TSLNode = pulse.mul(1.5).add(0.4);

      const alpha: TSLNode = disc.mul(fadeFactor).mul(0.9);
      return vec4(cmapColor.mul(brightness), alpha);
    })();

    const m = new InstancedMesh(geo, mat, TOTAL_PTS);
    m.frustumCulled = false;
    m.renderOrder = 9;

    return { traceKernel: kernel, mesh: m };
  }, [velocityTex, Wx, Wy, Wz, vMaxRef, Lx, Ly, Lz, worldScale]);

  // Dispatch the trace compute kernel each frame.
  useFrame(() => {
    if (tracing.current) return;
    const renderer = gl as unknown as WebGPURenderer;
    if (typeof renderer.computeAsync !== "function") return;

    tracing.current = true;
    void (async () => {
      try {
        await renderer.computeAsync(traceKernel);
      } finally {
        tracing.current = false;
      }
    })();
  });

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as NodeMaterial).dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
