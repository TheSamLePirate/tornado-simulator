import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import {
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  WebGPURenderer,
} from "three/webgpu";
import {
  float,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  vec3,
  vec4,
} from "three/tsl";
import { useAppStore } from "../state/store";
import { SimSlice } from "./SimSlice";
import { SolverDriver } from "./SolverDriver";
import { ParticleField } from "./ParticleField";
import { VolumetricFunnel } from "../render/realistic/VolumetricFunnel";
// WallCloud temporarily disabled for perf; import retained near the JSX.
// import { WallCloud } from "../render/realistic/WallCloud";
import { RainCurtain } from "../render/realistic/RainCurtain";
import { GroundDust } from "../render/realistic/GroundDust";
import { Isosurface } from "../render/scientific/Isosurface";
import { VectorGlyphs } from "../render/scientific/VectorGlyphs";
import { Streamlines } from "../render/scientific/Streamlines";
import { TimeDriver } from "../render/scientific/TimeDriver";
import { VortVolume } from "../render/scientific/VortVolume";
import { Lightning } from "./Lightning";
import { DOMAIN_LX, DOMAIN_LY, DOMAIN_LZ } from "../sim/grid";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

const WORLD_SCALE = 0.001; // 1 m → 0.001 km
const Wx = DOMAIN_LX * WORLD_SCALE;
const Wy = DOMAIN_LY * WORLD_SCALE;
const Wz = DOMAIN_LZ * WORLD_SCALE;

// Storm palette — used both by the sky dome and by ambient lights / fog so
// elements blend rather than fight.
const C_HORIZON = new THREE.Color("#9a8242"); // warm amber-gold, low-sun supercell base
const C_MID = new THREE.Color("#1e3328"); // dark teal-green, iconic supercell green sky
const C_ZENITH = new THREE.Color("#060a0d"); // near-black storm top
const C_GROUND = new THREE.Color("#1a1610"); // dark warm earth

/**
 * Inverted sphere drawn behind everything. Vertical gradient runs from a
 * dirty-tan horizon through grey to a deep slate zenith — the classic
 * supercell-base palette.
 */
function SkyDome({ radius }: { radius: number }) {
  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    const tRaw: TSLNode = positionWorld.y.div(radius).mul(0.5).add(0.5);
    const t: TSLNode = tRaw.clamp(float(0), float(1));

    const horizon: TSLNode = vec3(C_HORIZON.r, C_HORIZON.g, C_HORIZON.b);
    const midC: TSLNode = vec3(C_MID.r, C_MID.g, C_MID.b);
    const zenith: TSLNode = vec3(C_ZENITH.r, C_ZENITH.g, C_ZENITH.b);

    const lower: TSLNode = mix(
      horizon,
      midC,
      t.mul(2).clamp(float(0), float(1)),
    );
    const upper: TSLNode = mix(
      midC,
      zenith,
      t.sub(0.5).mul(2).clamp(float(0), float(1)),
    );
    const finalColor: TSLNode = t.greaterThan(float(0.5)).select(upper, lower);

    mat.colorNode = vec4(finalColor, 1.0);
    return mat;
  }, [radius]);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[radius, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * Ground plane with FBM-noise colour variation so it doesn't read as a flat
 * synthetic plate. Receives ambient/hemisphere light so it picks up the
 * storm-sky tint via the standard PBR pipeline.
 */
function Ground() {
  const material = useMemo(() => {
    const mat = new MeshStandardNodeMaterial({
      roughness: 1.0,
      metalness: 0,
    });

    // World-space coords (XZ plane only — Y of ground = 0). Scale tunes the
    // noise frequency to "patches" of ground a few hundred metres across.
    // Octaves kept low (2 + 1) — ground covers an enormous fragment area
    // (40× world units) and fine detail is invisible past the fog band.
    const wp: TSLNode = positionWorld.mul(0.6);
    const baseFBM: TSLNode = mx_fractal_noise_float(wp, 2, 2.0, 0.55);
    const dampFBM: TSLNode = mx_fractal_noise_float(
      wp.mul(0.25).add(vec3(11.3, 0, 7.7)),
      1,
      2.2,
      0.5,
    );

    // Two-tone ground: dry tan vs darker damp earth, swapped by a low-freq
    // FBM mask so we get visible patches instead of a uniform mush.
    const dry: TSLNode = vec3(0.16, 0.14, 0.1);
    const damp: TSLNode = vec3(0.08, 0.08, 0.06);
    const baseT: TSLNode = baseFBM.mul(0.5).add(0.5);
    const dampT: TSLNode = dampFBM.mul(0.5).add(0.5).clamp(float(0), float(1));

    const mixed: TSLNode = mix(damp, dry, baseT);
    const finalColor: TSLNode = mix(mixed, damp, dampT.mul(0.7));

    mat.colorNode = vec4(finalColor, 1.0);
    return mat;
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[Wx * 40, Wy * 40, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function SimContent() {
  const grid = useAppStore((s) => s.grid);
  const solver = useAppStore((s) => s.solver);
  const particles = useAppStore((s) => s.particles);
  const viewMode = useAppStore((s) => s.viewMode);
  const field = useAppStore((s) => s.field);
  const params = useAppStore((s) => s.params);
  const sliceXZ = useAppStore((s) => s.sliceXZ);
  const sliceXY = useAppStore((s) => s.sliceXY);
  const isoValue = useAppStore((s) => s.isoValue);
  const showIso = useAppStore((s) => s.showIso);
  const showGlyphs = useAppStore((s) => s.showGlyphs);
  const showStreamlines = useAppStore((s) => s.showStreamlines);
  const fieldScale = useAppStore((s) => s.fieldScale);
  const showContours = useAppStore((s) => s.showContours);
  const contourCount = useAppStore((s) => s.contourCount);
  const showLIC = useAppStore((s) => s.showLIC);
  const licStrength = useAppStore((s) => s.licStrength);
  const magnitudeFadeAlpha = useAppStore((s) => s.magnitudeFadeAlpha);
  const fadeFloor = useAppStore((s) => s.fadeFloor);
  const isoShellCount = useAppStore((s) => s.isoShellCount);
  const isoShellSpread = useAppStore((s) => s.isoShellSpread);
  const showVortVolume = useAppStore((s) => s.showVortVolume);
  const vortVolumeDensity = useAppStore((s) => s.vortVolumeDensity);

  return (
    <>
      <SolverDriver />
      <TimeDriver />

      {viewMode === "realistic" && (
        <>
          {/* WallCloud disabled for perf — was a screen-large alpha-blended
              FBM-textured disc and the single biggest fragment-shading cost
              after the volumetric. Re-enable if FPS budget allows. */}
          {/* <WallCloud altitude={Wz * 1.25} radius={Wx * 6} /> */}
          <VolumetricFunnel
            cloudTex={solver.cloudTex}
            vorticityTex={solver.vorticityTex}
            Wx={Wx}
            Wy={Wy}
            Wz={Wz}
            steps={48}
          />
          <ParticleField
            particles={particles}
            velocityTex={solver.velocity[0]}
            Lx={grid.Lx}
            Ly={grid.Ly}
            Lz={grid.Lz}
            worldScale={WORLD_SCALE}
          />
          <RainCurtain Wx={Wx} Wy={Wy} Wz={Wz} />
          <GroundDust Wx={Wx} Wy={Wy} Wz={Wz} />
        </>
      )}

      {viewMode === "scientific" && (
        <>
          {showVortVolume && (
            <VortVolume
              vorticityTex={solver.vorticityTex}
              Wx={Wx}
              Wy={Wy}
              Wz={Wz}
              vMaxRef={params.Vmax}
              rMaxRef={params.Rmax}
              density={vortVolumeDensity}
            />
          )}
          <SimSlice
            grid={grid}
            velocity={solver.velocity[0]}
            pressure={solver.pressure[0]}
            cloud={solver.cloudTex}
            vorticity={solver.vorticityTex}
            field={field}
            axis="xz"
            position={sliceXZ}
            vMaxRef={params.Vmax}
            rMaxRef={params.Rmax}
            scale={fieldScale[field] ?? 1.0}
            showContours={showContours}
            contourCount={contourCount}
            showLIC={showLIC}
            licStrength={licStrength}
            magnitudeFadeAlpha={magnitudeFadeAlpha}
            fadeFloor={fadeFloor}
            worldScale={WORLD_SCALE}
          />
          <SimSlice
            grid={grid}
            velocity={solver.velocity[0]}
            pressure={solver.pressure[0]}
            cloud={solver.cloudTex}
            vorticity={solver.vorticityTex}
            field={field}
            axis="xy"
            position={sliceXY}
            vMaxRef={params.Vmax}
            rMaxRef={params.Rmax}
            scale={fieldScale[field] ?? 1.0}
            showContours={showContours}
            contourCount={contourCount}
            showLIC={showLIC}
            licStrength={licStrength}
            magnitudeFadeAlpha={magnitudeFadeAlpha}
            fadeFloor={fadeFloor}
            worldScale={WORLD_SCALE}
          />
          {showIso && (
            <Isosurface
              vorticityTex={solver.vorticityTex}
              Wx={Wx}
              Wy={Wy}
              Wz={Wz}
              threshold={isoValue}
              vMaxRef={params.Vmax}
              rMaxRef={params.Rmax}
              shellCount={isoShellCount}
              shellSpread={isoShellSpread}
            />
          )}
          {showGlyphs && (
            <VectorGlyphs
              velocityTex={solver.velocity[0]}
              Wx={Wx}
              Wy={Wy}
              Wz={Wz}
              vMaxRef={params.Vmax}
            />
          )}
          {showStreamlines && (
            <Streamlines
              velocityTex={solver.velocity[0]}
              Wx={Wx}
              Wy={Wy}
              Wz={Wz}
              vMaxRef={params.Vmax}
              Lx={grid.Lx}
              Ly={grid.Ly}
              Lz={grid.Lz}
              worldScale={WORLD_SCALE}
            />
          )}
        </>
      )}
    </>
  );
}

export function Scene() {
  const viewMode = useAppStore((s) => s.viewMode);
  const realistic = viewMode === "realistic";

  return (
    <Canvas
      camera={{
        position: [Wx * 1.5, Wz * 1.1, Wy * 1.5],
        fov: 45,
        near: 0.01,
        far: 500,
      }}
      dpr={1}
      gl={async (props) => {
        const renderer = new WebGPURenderer({
          canvas: props.canvas as HTMLCanvasElement,
          antialias: true,
          powerPreference: "high-performance",
        });
        await renderer.init();
        return renderer;
      }}
    >
      {/* Realistic gets the full storm dressing; scientific stays neutral. */}
      {realistic ? (
        <>
          <SkyDome radius={Wx * 60} />
          <fog attach="fog" args={[C_HORIZON, Wx * 5, Wx * 30]} />
          {/* Diffuse storm lighting: dim cool ambient + hemisphere fill that
              picks up sky-and-ground tints + a soft warm key from above. */}
          <ambientLight intensity={0.18} color="#4a7a68" />
          <hemisphereLight args={[C_MID, C_GROUND, 0.45]} />
          <directionalLight
            position={[Wx * 2.5, Wz * 3, -Wy * 0.8]}
            intensity={0.7}
            color="#e8b868"
          />
          <Lightning
            position={[Wx * 2.5, Wz * 5, Wy * 1.0]}
            meanInterval={12}
            duration={0.1}
            intensity={1.8}
          />
          <Ground />
        </>
      ) : (
        <>
          <color attach="background" args={["#0a0c10"]} />
          <fog attach="fog" args={["#0a0c10", Wx * 4, Wx * 14]} />
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[Wx * 2, Wz * 4, Wy * 2]}
            intensity={1.6}
          />
          <Ground />
          <gridHelper
            args={[Wx * 4, 40, "#1f2530", "#161a22"]}
            position={[0, 0.0005, 0]}
          />
        </>
      )}
      <SimContent />
      <OrbitControls makeDefault enableDamping target={[0, Wz * 0.4, 0]} />
      <Stats className="r3f-stats" />
    </Canvas>
  );
}
