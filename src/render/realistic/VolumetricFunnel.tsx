import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Storage3DTexture } from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  atan,
  cameraPosition,
  exp,
  float,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture3D,
  uniform,
  vec3,
  vec4,
} from "three/tsl";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

interface Props {
  cloudTex: Storage3DTexture;
  vorticityTex: Storage3DTexture;
  /** World-space size in three.js units (km if worldScale=0.001). */
  Wx: number;
  Wy: number;
  Wz: number;
  /** Density → extinction multiplier. Magnus output is small (~1e-4 kg/m³) so we crank it. */
  extinction?: number;
  /** March step count. */
  steps?: number;
}

/**
 * Volumetric ray-march funnel sampling the solver's condensation 3D texture.
 *
 *   ext(p)   = density(p) · extinctionMul
 *   alpha    = 1 − exp(−ext · dt)
 *   L       += T · alpha · albedo · L_sun
 *   T       *= 1 − alpha
 *
 * Lighting is a one-bounce single-scatter approximation:
 *   - Constant ambient + Lambert-ish sun term using a finite-difference normal
 *     of the density field. No shadow rays (too costly per fragment).
 *   - Albedo: white at top, dirty grey-brown near ground (height tint).
 *
 * The mesh uses BackSide rendering so we always get one fragment per pixel
 * that intersects the AABB; ray-AABB clipping is done analytically inside the
 * shader (slab method). transparent + depthWrite=false to composite over the
 * scene without writing depth.
 */
export function VolumetricFunnel({
  cloudTex,
  vorticityTex,
  Wx,
  Wy,
  Wz,
  extinction = 8000,
  steps = 96,
}: Props) {
  // Live time uniform driving the swirl/drift of the noise field.
  const uTime = useMemo(() => uniform(0.0), []);
  const tRef = useRef(0);
  useFrame((_state, dt) => {
    tRef.current += dt;
    (uTime as unknown as { value: number }).value = tRef.current;
  });

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const uExt = uniform(extinction);
    const uSun = uniform(new THREE.Vector3(0.4, 0.7, 0.55).normalize());

    // World-space AABB
    const halfWx = Wx / 2;
    const halfWy = Wy / 2;
    const boxMin: TSLNode = vec3(-halfWx, 0, -halfWy);
    const boxMax: TSLNode = vec3(halfWx, Wz, halfWy);

    // Map a world point → 3D texture UV.
    // simX→worldX, simZ→worldY-up, simY→-worldZ (sign flip preserves RH).
    const worldToTexUV = (p: TSLNode): TSLNode =>
      vec3(
        p.x.add(halfWx).div(Wx),
        p.z.negate().add(halfWy).div(Wy),
        p.y.div(Wz),
      ) as TSLNode;

    const colorNode = Fn(() => {
      const ro: TSLNode = cameraPosition;
      const rdN: TSLNode = normalize(positionWorld.sub(cameraPosition));
      // Avoid divide-by-zero on axis-aligned rays
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

      // Slab method
      const t1: TSLNode = boxMin.sub(ro).mul(invDir);
      const t2: TSLNode = boxMax.sub(ro).mul(invDir);
      const tMin: TSLNode = min(t1, t2);
      const tMax: TSLNode = max(t1, t2);
      const tEnterRaw: TSLNode = max(max(tMin.x, tMin.y), tMin.z);
      const tExitRaw: TSLNode = min(min(tMax.x, tMax.y), tMax.z);
      const tEnter: TSLNode = max(tEnterRaw, float(0));
      const tExit: TSLNode = tExitRaw;

      const accum = vec3(0).toVar();
      const transmit = float(1).toVar();

      // Iterate even when ray misses (tEnter > tExit) — body gates on this.
      const N = steps;
      const dtRay: TSLNode = tExit.sub(tEnter).div(float(N)).max(float(1e-5));

      // Sun direction (world space) and a warm sun colour.
      const sunDir: TSLNode = uSun;
      const sunCol: TSLNode = vec3(1.85, 1.65, 1.35);
      // Height-graded ambient: warm horizon-tan at cloud base, cool slate at
      // top. Cloud bottoms catch ground-scatter, tops catch sky.
      const ambHorizon: TSLNode = vec3(0.6, 0.46, 0.32);
      const ambZenith: TSLNode = vec3(0.18, 0.22, 0.3);

      // Henyey-Greenstein phase function (forward-scatter) — clouds appear
      // brightest when viewed near the sun direction. Computed once per
      // pixel since rd and sunDir don't change along the ray.
      //   phase(θ) = (1−g²) / (1 + g² − 2g·cosθ)^(3/2)
      // cosθ here uses (-rd)·sunDir so cosθ = +1 when looking *toward* the
      // sun through the cloud (max forward scatter).
      const g = 0.6;
      const cosTheta: TSLNode = rd.negate().dot(sunDir);
      const phaseDenom: TSLNode = float(1 + g * g)
        .sub(cosTheta.mul(2 * g))
        .max(float(1e-4));
      const phase: TSLNode = float(1 - g * g).div(pow(phaseDenom, float(1.5)));

      Loop(N, ({ i }: { i: TSLNode }) => {
        // Early-out once the ray is essentially opaque — saves work on the
        // back half of dense clouds.
        If(transmit.greaterThan(float(0.01)), () => {
          const t: TSLNode = tEnter.add(dtRay.mul(float(i).add(0.5)));
          If(t.lessThan(tExit), () => {
            const p: TSLNode = ro.add(rd.mul(t));
            const uvw: TSLNode = worldToTexUV(p);
            const densSim: TSLNode = texture3D(cloudTex, uvw).x;

            // ----- Procedural funnel-bridge density -----
            // The sim's condensation only fires above the LCL, so the cloud
            // cap floats with no visible neck connecting it to ground. We
            // add a non-physical funnel-shaped density bridge (cone-ish,
            // narrow at base, wider at the cap) so the realistic view reads
            // as a continuous tornado. Strength fades to zero where the
            // simulation already supplies cap density.
            const heightT: TSLNode = p.y.div(Wz).clamp(float(0), float(1));
            const rHoriz: TSLNode = p.x.mul(p.x).add(p.z.mul(p.z)).sqrt();
            // Funnel half-radius vs height. Tight at ground, opens at top.
            const funnelR: TSLNode = float(0.04 * Wx).add(
              float(0.18 * Wx).mul(pow(heightT, float(0.7))),
            );
            const funnelMask: TSLNode = smoothstep(
              funnelR.mul(1.4),
              funnelR.mul(0.5),
              rHoriz,
            );
            // Stronger near the ground, fades upward where sim cap takes over.
            const funnelHeightFade: TSLNode = float(1).sub(
              smoothstep(float(0.35), float(0.85), heightT),
            );
            const densFunnel: TSLNode = funnelMask
              .mul(funnelHeightFade)
              .mul(0.00045);

            // Vorticity density — makes the turbulent vortex tube visible
            // below the condensation level where the sim has no cloud water.
            // |ω| is stored in vorticityTex alpha; typical tornado values
            // are O(1–10 s⁻¹), scaled to match condensation ρ_c ~ 1e-4.
            const omegaMag: TSLNode = texture3D(vorticityTex, uvw).w;
            const densVort: TSLNode = omegaMag
              .mul(0.000015)
              .mul(float(1).sub(smoothstep(float(0.55), float(0.85), heightT)));

            const dens: TSLNode = densSim.add(densFunnel).add(densVort);

            // ----- Two-octave swirling noise modulation -----
            // Sample positions are rotated around world Y (vortex axis) and
            // drifted vertically over time. Different rotation rates per
            // octave decorrelate the layers — coarse lobes spin slowly,
            // fine wisps faster.
            const phi: TSLNode = atan(p.z, p.x);

            const phi1: TSLNode = phi.sub(uTime.mul(0.4));
            const yDrift1: TSLNode = p.y.add(uTime.mul(-0.05));
            const rot1: TSLNode = vec3(
              rHoriz.mul(phi1.cos()),
              yDrift1,
              rHoriz.mul(phi1.sin()),
            );
            const noiseP1: TSLNode = rot1.mul(14).add(vec3(7.1, 11.3, 13.7));
            const n1: TSLNode = mx_noise_float(noiseP1);

            const phi2: TSLNode = phi.sub(uTime.mul(0.95));
            const yDrift2: TSLNode = p.y.add(uTime.mul(-0.11));
            const rot2: TSLNode = vec3(
              rHoriz.mul(phi2.cos()),
              yDrift2,
              rHoriz.mul(phi2.sin()),
            );
            const noiseP2: TSLNode = rot2.mul(34).add(vec3(31.7, 17.3, 23.7));
            const n2: TSLNode = mx_noise_float(noiseP2).mul(0.5);

            const fbmRaw: TSLNode = n1.add(n2);
            const fbmT: TSLNode = fbmRaw
              .mul(0.45)
              .add(0.5)
              .clamp(float(0), float(1));
            // Range [0.35, 1.1] — modulates density to give clumpy cores
            // and wispy edges; fbmT > 0.85 boosts above 1 to brighten cores.
            const noiseGain: TSLNode = fbmT.mul(0.85).add(0.35);
            const densMod: TSLNode = dens.mul(noiseGain);

            If(densMod.greaterThan(float(1e-6)), () => {
              // ----- Cone-traced self-shadow -----
              // Three taps along sun direction at exponential spacing
              // approximate the optical depth from this point to the sun.
              // Far cheaper than a full secondary ray-march, but reads
              // dramatically better than a single tap — proper light/dark
              // sides plus internal volumetric self-shadow.
              const ssA: TSLNode = sunDir.mul(0.12);
              const ssB: TSLNode = sunDir.mul(0.36);
              const ssC: TSLNode = sunDir.mul(0.85);
              const dA: TSLNode = texture3D(
                cloudTex,
                worldToTexUV(p.add(ssA)),
              ).x;
              const dB: TSLNode = texture3D(
                cloudTex,
                worldToTexUV(p.add(ssB)),
              ).x;
              const dC: TSLNode = texture3D(
                cloudTex,
                worldToTexUV(p.add(ssC)),
              ).x;
              // Trapezoidal-ish weighting (closer taps weighted higher).
              const shadowDens: TSLNode = dA
                .mul(1.0)
                .add(dB.mul(0.7))
                .add(dC.mul(0.4));
              const tauShadow: TSLNode = shadowDens.mul(uExt).mul(0.32);
              const shadow: TSLNode = exp(tauShadow.negate());

              // ----- Lighting composite -----
              // Sun term = sunCol · phase · shadow. The phase function
              // already encodes view-direction brightness; multi-tap shadow
              // gives true light/dark sides. Ambient floor keeps shadow
              // sides from going pure black.
              const tintTop: TSLNode = vec3(0.92, 0.91, 0.94);
              const tintBase: TSLNode = vec3(0.42, 0.3, 0.16);
              const albedo: TSLNode = mix(tintBase, tintTop, heightT);
              const ambCol: TSLNode = mix(ambHorizon, ambZenith, heightT);

              const sunTerm: TSLNode = sunCol.mul(phase).mul(shadow);
              // Hard floor on the sun term so no part of the cloud goes
              // pitch black even on the back side.
              const sunFloored: TSLNode = sunTerm.add(vec3(0.05, 0.05, 0.07));
              const lit: TSLNode = sunFloored.add(ambCol).mul(albedo);

              // Optical depth with slight power-curve boost — crisper edges
              // without crushing the overall opacity.
              const tauStep: TSLNode = densMod.mul(uExt).mul(dtRay).mul(1.4);
              const alpha: TSLNode = float(1).sub(exp(tauStep.negate()));
              accum.assign(accum.add(transmit.mul(alpha).mul(lit)));
              transmit.assign(transmit.mul(float(1).sub(alpha)));
            });
          });
        });
      });

      // Final color grade — light gamma + slight saturation boost so the
      // cloud pops against the storm sky without going neon.
      const graded: TSLNode = (accum as TSLNode)
        .pow(vec3(0.92, 0.92, 0.92))
        .mul(1.08);
      const opacity: TSLNode = float(1).sub(transmit);
      return vec4(graded, opacity) as TSLNode;
    });

    mat.colorNode = colorNode();
    return mat;
  }, [cloudTex, vorticityTex, Wx, Wy, Wz, extinction, steps]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh position={[0, Wz / 2, 0]} renderOrder={10}>
      <boxGeometry args={[Wx, Wz, Wy]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
