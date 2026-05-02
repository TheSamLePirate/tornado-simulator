import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  float,
  mix,
  smoothstep,
  texture3D,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Storage3DTexture } from "three/webgpu";
import type { GridSpec } from "../sim/grid";
import { magmaTSL, plasmaTSL, RdBuTSL, viridisTSL } from "../utils/colormap";
import type { ScientificField } from "../state/store";

interface Props {
  grid: GridSpec;
  /** Velocity field texture (RGBA = vx, vy, vz, |V|). */
  velocity: Storage3DTexture;
  /** Pressure deviation texture (R = ΔP kinematic, m²/s²). */
  pressure: Storage3DTexture;
  /** Cloud water density texture (R = ρ_c kg/m³). */
  cloud: Storage3DTexture;
  /** Vorticity field (RGB = ωx,ωy,ωz, A = |ω|). */
  vorticity: Storage3DTexture;
  /** Which scalar to render. */
  field: ScientificField;
  /** 'xz' = vertical sheet through y = slicePos·Ly − Ly/2; 'xy' = horizontal slab. */
  axis?: "xz" | "xy";
  /** Normalized [0,1] position along the slice-axis. */
  position?: number;
  /** Scale factor sim → world (default = 0.001 → render in km). */
  worldScale?: number;
  /** Vmax used as velocity normalization reference. */
  vMaxRef?: number;
  /** Rmax used as length normalization reference (for vorticity). */
  rMaxRef?: number;
  /** Surface temperature (K). Used to scale the temperature deviation field. */
  T0Ref?: number;
  /** Surface pressure (Pa). Used to scale the temperature deviation field. */
  P0Ref?: number;
  /**
   * Multiplier on the colormap saturation range. <1 = tighter range = more
   * contrast on subtle features; >1 = wider range = avoids hard clipping.
   */
  scale?: number;
  /** Overlay thin black iso-contour bands on the colormap. */
  showContours?: boolean;
  /** Number of contour bands across the field's normalized magnitude range. */
  contourCount?: number;
  /** Modulate the colormap with line-integral-convolution flow grain. */
  showLIC?: boolean;
  /** LIC modulation strength (0 = colormap unchanged, 1 = strong grain). */
  licStrength?: number;
  /** Fade quiet (low-magnitude) slice regions to transparent. */
  magnitudeFadeAlpha?: boolean;
  /** Lower edge of the smoothstep that drives the alpha fade. */
  fadeFloor?: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

/**
 * Per-field normalization scales. All return a TSL node mapping the raw scalar
 * into [0,1] (sequential) or [-1,1] (diverging), ready for the colormap.
 */
function normaliseSpeed(vMag: TSLNode, vMaxRef: number) {
  return vMag.div(Math.max(vMaxRef, 1)).clamp(float(0), float(1));
}

function normaliseSigned(s: TSLNode, scale: number) {
  return s.div(Math.max(scale, 1e-6)).clamp(float(-1), float(1));
}

/**
 * Renders a slice through the simulation, colormapped per the active field.
 * Material is rebuilt when `field` changes — cheap (one material), avoids
 * runtime branch-by-uniform shader code.
 */
export function SimSlice({
  grid,
  velocity,
  pressure,
  cloud,
  vorticity,
  field,
  axis = "xz",
  position = 0.5,
  worldScale = 0.001,
  vMaxRef = 100,
  rMaxRef = 200,
  T0Ref = 293.15,
  P0Ref = 101325,
  scale = 1.0,
  showContours = false,
  contourCount = 6,
  showLIC = false,
  licStrength = 0.55,
  magnitudeFadeAlpha = false,
  fadeFloor = 0.05,
}: Props) {
  const safeScale = Math.max(scale, 0.01);

  // Stable uniforms for slider-driven values so dragging them doesn't trigger
  // a full material rebuild every frame.
  const [uShowContours] = useState(() => uniform(showContours ? 1 : 0));
  const [uContourCount] = useState(() => uniform(contourCount));
  const [uLicEffective] = useState(() => uniform(showLIC ? licStrength : 0));
  const [uFadeOn] = useState(() => uniform(magnitudeFadeAlpha ? 1 : 0));
  const [uFadeFloor] = useState(() => uniform(fadeFloor));
  useEffect(() => {
    (uShowContours as unknown as { value: number }).value = showContours
      ? 1
      : 0;
  }, [showContours, uShowContours]);
  useEffect(() => {
    (uContourCount as unknown as { value: number }).value = contourCount;
  }, [contourCount, uContourCount]);
  useEffect(() => {
    (uLicEffective as unknown as { value: number }).value = showLIC
      ? licStrength
      : 0;
  }, [showLIC, licStrength, uLicEffective]);
  useEffect(() => {
    (uFadeOn as unknown as { value: number }).value = magnitudeFadeAlpha
      ? 1
      : 0;
  }, [magnitudeFadeAlpha, uFadeOn]);
  useEffect(() => {
    (uFadeFloor as unknown as { value: number }).value = fadeFloor;
  }, [fadeFloor, uFadeFloor]);
  const Wx = grid.Lx * worldScale;
  const Wy = grid.Ly * worldScale;
  const Wz = grid.Lz * worldScale;

  const planeArgs: [number, number] = useMemo(
    () => (axis === "xz" ? [Wx, Wz] : [Wx, Wy]),
    [axis, Wx, Wy, Wz],
  );

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const slicePos = uniform(position);
    const uvNode = uv();

    // 3D texture coord for the sampled cell (axis-dependent)
    const coord =
      axis === "xz"
        ? vec3(uvNode.x, slicePos, uvNode.y)
        : vec3(uvNode.x, uvNode.y, slicePos);

    // Sample velocity at this cell
    const velSample = texture3D(velocity, coord);
    const vx: TSLNode = velSample.r;
    const vy: TSLNode = velSample.g;
    const vz: TSLNode = velSample.b;
    const vMag: TSLNode = velSample.a;

    // World-space (x,y) for cylindrical decomposition (φ direction)
    const { Lx, Ly } = grid;
    const wx: TSLNode = uvNode.x.mul(Lx).sub(Lx / 2);
    const wy: TSLNode =
      axis === "xz"
        ? slicePos.mul(Ly).sub(Ly / 2)
        : uvNode.y.mul(Ly).sub(Ly / 2);

    const r2: TSLNode = wx.mul(wx).add(wy.mul(wy));
    const rSafe: TSLNode = r2.sqrt().add(float(1e-3));
    const cosPhi: TSLNode = wx.div(rSafe);
    const sinPhi: TSLNode = wy.div(rSafe);

    let colorNode: TSLNode;
    // Captured per-branch normalized scalar (for contour overlays etc.).
    // Sequential fields → t ∈ [0,1]; diverging fields → t ∈ [-1,1].
    let tFinal: TSLNode = float(0);

    if (field === "speed") {
      const t = normaliseSpeed(vMag, vMaxRef * safeScale);
      tFinal = t;
      colorNode = viridisTSL(t);
    } else if (field === "vtheta") {
      // v_θ = -vx · sin(φ) + vy · cos(φ)   (positive = counter-clockwise)
      // Equilibrated tangential velocity is typically a fraction of Vmax —
      // saturate at Vmax/2 so structure is visible.
      const vTheta: TSLNode = vx.negate().mul(sinPhi).add(vy.mul(cosPhi));
      const t = normaliseSigned(vTheta, vMaxRef * 0.5 * safeScale);
      tFinal = t;
      colorNode = RdBuTSL(t);
    } else if (field === "vradial") {
      // v_r = vx · cos(φ) + vy · sin(φ)   (positive = outflow)
      // Radial inflow magnitude is roughly V_in (≪ Vmax). Saturate at Vmax/4.
      const vRad: TSLNode = vx.mul(cosPhi).add(vy.mul(sinPhi));
      const t = normaliseSigned(vRad, vMaxRef * 0.25 * safeScale);
      tFinal = t;
      colorNode = RdBuTSL(t);
    } else if (field === "vz") {
      // Vertical velocity: typical updraft scale ~ V_in to Vmax/3.
      const t = normaliseSigned(vz, vMaxRef * 0.4 * safeScale);
      tFinal = t;
      colorNode = RdBuTSL(t);
    } else if (field === "pressure") {
      // The projection-step pressure is only defined up to an additive
      // constant. Reference against an "ambient" sample taken from the upper
      // domain corner — far from the vortex core — and render the deviation
      // relative to that. Sign·sqrt perceptual compression keeps a wide
      // dynamic range readable.
      const dPraw: TSLNode = texture3D(pressure, coord).r;
      const dPamb: TSLNode = texture3D(pressure, vec3(0.05, 0.05, 0.95)).r;
      const dPdev: TSLNode = dPraw.sub(dPamb);
      const sgn: TSLNode = dPdev.sign();
      const dPscale = vMaxRef * vMaxRef * 0.25 * safeScale;
      const tMag: TSLNode = dPdev
        .abs()
        .div(Math.max(dPscale, 1e-6))
        .sqrt()
        .clamp(float(0), float(1));
      const t: TSLNode = sgn.mul(tMag);
      tFinal = t;
      colorNode = RdBuTSL(t);
    } else if (field === "vorticity") {
      // Solver precomputes |ω| in alpha each step (used for the confinement
      // force) — a single sample replaces the previous 6-tap curl.
      const omegaMag: TSLNode = texture3D(vorticity, coord).a;
      // Reference scale: characteristic strain Vmax/Rmax, multiplied for visibility.
      const omegaRef = (vMaxRef / Math.max(rMaxRef, 1)) * 4 * safeScale;
      const t = omegaMag
        .div(Math.max(omegaRef, 1e-6))
        .clamp(float(0), float(1));
      tFinal = t;
      colorNode = magmaTSL(t);
    } else if (field === "cloud") {
      const rhoC: TSLNode = texture3D(cloud, coord).r;
      // Dense tornado wall-cloud LWC ≈ 5e-4 kg/m³ as a soft cap.
      const t = rhoC.div(5e-4 * safeScale).clamp(float(0), float(1));
      tFinal = t;
      colorNode = plasmaTSL(t);
    } else {
      // ── temperature deviation ──
      // Linearised perturbation around the dry-adiabatic profile at this
      // altitude:  ΔT ≈ T₀ · (R/cp) · ΔP_pa / P₀
      // Equivalent to a small-perturbation expansion of T = T₀·(p/P₀)^0.286.
      // ΔP_pa is the kinematic pressure deviation (referenced against an
      // upper-corner ambient sample, same convention as the pressure slice)
      // converted to Pa via ρ_air. Result in K.
      // Sign·sqrt perceptual compression matches the pressure slice — keeps
      // small variations visible without crushing the saturated core.
      const R_OVER_CP = 0.286;
      const rhoAirRef = P0Ref / (287.058 * T0Ref);
      const dPraw: TSLNode = texture3D(pressure, coord).r;
      const dPamb: TSLNode = texture3D(pressure, vec3(0.05, 0.05, 0.95)).r;
      const dPkin: TSLNode = dPraw.sub(dPamb);
      const dPpa: TSLNode = dPkin.mul(float(rhoAirRef));
      const dT: TSLNode = dPpa
        .mul(float(R_OVER_CP))
        .mul(float(T0Ref))
        .div(float(P0Ref));
      const dTscale = 15 * safeScale; // K
      const sgn: TSLNode = dT.sign();
      const tMag: TSLNode = dT
        .abs()
        .div(Math.max(dTscale, 1e-6))
        .sqrt()
        .clamp(float(0), float(1));
      const t: TSLNode = sgn.mul(tMag);
      tFinal = t;
      colorNode = RdBuTSL(t);
    }

    // ── LIC: line-integral convolution ──
    // Walk K steps forward + K backward along the in-plane velocity, hashing
    // a noise value at each step and averaging. The resulting [0,1] mask is
    // smeared along streamlines, so multiplying it onto the colormap yields
    // flow-aligned grain that reveals direction at every pixel.
    const LIC_K = 12;
    const licStep = float(1.0 / 96.0); // ≈ one grid cell in UV space
    const v2: TSLNode = axis === "xz" ? vec2(vx, vz) : vec2(vx, vy);
    const v2len: TSLNode = v2.length().max(float(1e-3));
    const v2n: TSLNode = v2.div(v2len);
    const hashFn = Fn(
      ([p]: [TSLNode]): TSLNode =>
        p.dot(vec2(12.9898, 78.233)).sin().mul(43758.5453).fract(),
    );
    const licAcc = float(0).toVar();
    const pF = uvNode.toVar();
    const pB = uvNode.toVar();
    Loop(LIC_K, () => {
      pF.assign(pF.add(v2n.mul(licStep)));
      pB.assign(pB.sub(v2n.mul(licStep)));
      licAcc.assign(licAcc.add(hashFn(pF)).add(hashFn(pB)));
    });
    const lic: TSLNode = licAcc.div(float(LIC_K * 2)); // ∈ [0,1]
    // licFactor ∈ [1 - uLic*0.5, 1 + uLic*0.5] when uLic ∈ [0,1]; at uLic=0 it
    // collapses to 1.0 (colormap untouched).
    const licFactor: TSLNode = lic
      .mul(uLicEffective)
      .add(float(1).sub(uLicEffective.mul(0.5)));
    const colorAfterLIC: TSLNode = colorNode.mul(licFactor);

    // ── Contour-line overlay ──
    // Bands are drawn at evenly-spaced levels of |t|, giving symmetric
    // contours around zero for diverging fields. Fixed thickness for now;
    // could be derivative-aware once dFdx/dFdy is wired up.
    const tt: TSLNode = tFinal.abs().mul(uContourCount);
    const fr: TSLNode = tt.fract();
    const distToContour: TSLNode = fr.min(float(1).sub(fr));
    const contourW = float(0.04);
    const lineMask: TSLNode = float(1).sub(
      smoothstep(float(0), contourW, distToContour),
    );
    const contourBlend: TSLNode = lineMask.mul(0.75).mul(uShowContours);
    const colorWithContours: TSLNode = mix(
      colorAfterLIC,
      vec3(0, 0, 0),
      contourBlend,
    );

    // ── Magnitude-fade alpha ──
    // Quiet regions (low |t|) fade to transparent; vibrant regions stay vivid.
    // When the toggle is off, alpha collapses to 1.0.
    const magForFade: TSLNode = tFinal.abs();
    const alphaFaded: TSLNode = smoothstep(
      uFadeFloor,
      uFadeFloor.add(0.3),
      magForFade,
    ).mul(0.92);
    const alphaFinal: TSLNode = mix(float(1), alphaFaded, uFadeOn);

    mat.colorNode = vec4(colorWithContours, alphaFinal);
    return mat;
  }, [
    velocity,
    pressure,
    cloud,
    vorticity,
    field,
    axis,
    position,
    vMaxRef,
    rMaxRef,
    T0Ref,
    P0Ref,
    safeScale,
    grid,
    uShowContours,
    uContourCount,
    uLicEffective,
    uFadeOn,
    uFadeFloor,
  ]);

  useEffect(() => () => material.dispose(), [material]);

  const rotation: [number, number, number] =
    axis === "xz" ? [0, 0, 0] : [-Math.PI / 2, 0, 0];
  // XZ slice: vertical plane that slides along world-Z (= -sim Y under the
  // RH-preserving remap). Negated relative to the previous mapping.
  // XY slice: horizontal plane that slides along world-Y (= sim Z, up).
  const yOffset = axis === "xz" ? Wz / 2 : position * Wz;
  const zOffset = axis === "xz" ? (0.5 - position) * Wy : 0;

  return (
    <mesh
      rotation={rotation}
      position={[0, yOffset, zOffset]}
      renderOrder={axis === "xz" ? 7.1 : 7}
    >
      <planeGeometry args={planeArgs} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
