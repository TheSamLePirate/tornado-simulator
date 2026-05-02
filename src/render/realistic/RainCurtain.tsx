import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { InstancedMesh, NodeMaterial } from "three/webgpu";
import { useFrame } from "@react-three/fiber";
import {
  Fn,
  billboarding,
  float,
  fract,
  instanceIndex,
  sin,
  smoothstep,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  count?: number;
  Wx: number;
  Wy: number;
  Wz: number;
}

/**
 * Falling rain streaks rendered as instanced billboarded thin quads.
 * Each instance's position is procedurally derived from instanceIndex
 * and animated with time — no compute pass or storage buffer needed.
 * Creates the "rain curtain" atmosphere around a supercell.
 */
export function RainCurtain({ count = 3000, Wx, Wy, Wz }: Props) {
  const uTime = useMemo(() => uniform(0.0), []);
  const tRef = useRef(0);
  useFrame((_s, dt) => {
    tRef.current += dt;
    (uTime as unknown as { value: number }).value = tRef.current;
  });

  const { mesh } = useMemo(() => {
    // Tall thin quad — reads as a vertical rain streak at any distance.
    const streakH = Wz * 0.04;
    const streakW = streakH * 0.012;
    const geo = new THREE.PlaneGeometry(streakW, streakH);

    const mat = new NodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;

    // Simple hash for procedural placement.
    const hash = (a: TSLNode, b: TSLNode): TSLNode =>
      fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453));

    const fIdx: TSLNode = float(instanceIndex);
    const h1 = hash(fIdx, float(1.0));
    const h2 = hash(fIdx, float(2.0));
    const h3 = hash(fIdx, float(3.0));
    const h4 = hash(fIdx, float(4.0));

    // Cylindrical distribution — rain falls in a wide area around the storm.
    const theta: TSLNode = h1.mul(Math.PI * 2);
    const rMin = Wx * 0.2;
    const rMax = Wx * 6;
    const radius: TSLNode = float(rMin).add(h2.mul(rMax - rMin));

    const px: TSLNode = radius.mul(theta.cos());
    const pz: TSLNode = radius.mul(theta.sin());

    // Animated vertical fall with looping via fract().
    const fallRate: TSLNode = float(0.25).add(h4.mul(0.35));
    const yRange = Wz * 2.0;
    const yOffset: TSLNode = h3.mul(yRange);
    const yAnimated: TSLNode = yOffset.sub(uTime.mul(fallRate));
    const py: TSLNode = fract(yAnimated.div(yRange).add(float(1000)))
      .mul(yRange)
      .sub(Wz * 0.15);

    const worldPos: TSLNode = vec3(px, py, pz);
    mat.vertexNode = billboarding({ position: worldPos });

    // Fragment: vertical streak with soft fade at tips.
    mat.colorNode = Fn(() => {
      const uvN: TSLNode = uv();
      // Vertical fade — soft at both ends.
      const yFade: TSLNode = smoothstep(float(0.0), float(0.2), uvN.y).mul(
        smoothstep(float(1.0), float(0.8), uvN.y),
      );
      // Horizontal — bright thin core.
      const xDist: TSLNode = uvN.x.sub(0.5).abs();
      const xFade: TSLNode = smoothstep(float(0.5), float(0.05), xDist);

      const alpha: TSLNode = yFade.mul(xFade).mul(0.07);
      const col: TSLNode = vec3(0.65, 0.7, 0.8);
      return vec4(col, alpha);
    })();

    const m = new InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    m.renderOrder = 8;
    return { mesh: m };
  }, [count, Wx, Wy, Wz]);

  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as NodeMaterial).dispose();
    },
    [mesh],
  );

  return <primitive object={mesh} />;
}
