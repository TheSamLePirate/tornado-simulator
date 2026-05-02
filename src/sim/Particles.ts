import {
  Fn,
  attributeArray,
  float,
  fract,
  instanceIndex,
  sin,
  texture3D,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import type { Storage3DTexture, WebGPURenderer } from "three/webgpu";
import type { GridSpec } from "./grid";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

/**
 * GPU dust/debris particle system. State lives in a single storage buffer
 * (vec4 = position.xyz, age). One compute kernel advances every particle by
 * sampling the solver's velocity field; particles respawn near the ground
 * once they drift out of bounds or grow too old.
 *
 * Seeded near the surface inside a disk to imitate the dust ring kicked up
 * by a tornado. Render-side pulls positions via vertexIndex in a NodeMaterial.
 */
export class Particles {
  readonly count: number;
  readonly grid: GridSpec;
  /** TSL StorageBufferNode (vec4 = position.xyz, age). Read by render shader. */
  readonly stateNode: TSLNode;

  // Live-tunable uniforms
  readonly uDt = uniform(0.0);
  /**
   * Maximum particle lifetime in seconds of sim time. Long enough for a
   * particle to be advected radially inward, swept up the vortex column,
   * and dispersed — typical residence time at default params ≈ 6–10 s.
   */
  readonly uMaxAge = uniform(8.0);
  /** Inner radius of the spawn annulus (m). Set ≈ 0.4·Rmax for a ring shape. */
  readonly uSpawnInner = uniform(80.0);
  /** Outer radius of the spawn annulus (m). Set ≈ 1.6·Rmax. */
  readonly uSpawnOuter = uniform(320.0);
  /**
   * Spawn altitude floor (m). Must sit above the no-slip layer (k=0 in the
   * solver, which zeroes velocity for z < dz). dz ≈ 20m at medium preset.
   */
  readonly uSpawnZmin = uniform(25.0);
  /** Spawn altitude ceiling (m). */
  readonly uSpawnZmax = uniform(80.0);
  /** Hash seed bumped each frame so respawn positions decorrelate. */
  readonly uSeed = uniform(1.0);
  /**
   * Stokes settling velocity, m/s. Particle motion = flow_velocity + (0,0,-w_s).
   * Typical for dust ≈ 50 µm: 0.07 m/s. Larger debris (sand, leaves): 0.5–2 m/s.
   * 0 disables settling (purely flow-following).
   */
  readonly uSettling = uniform(0.05);

  private velocityTex: Storage3DTexture;
  private initKernel: TSLNode;
  private stepKernel: TSLNode;
  private hasInitialised = false;

  constructor(grid: GridSpec, velocityTex: Storage3DTexture, count = 20_000) {
    this.grid = grid;
    this.count = count;
    this.velocityTex = velocityTex;

    this.stateNode = attributeArray(count, "vec4");
    this.initKernel = this.makeInitKernel();
    this.stepKernel = this.makeStepKernel();
  }

  async initialise(renderer: WebGPURenderer): Promise<void> {
    const r = renderer as any;
    await r.computeAsync(this.initKernel);
    this.hasInitialised = true;
  }

  get isInitialised() {
    return this.hasInitialised;
  }

  async step(renderer: WebGPURenderer): Promise<void> {
    const r = renderer as any;
    await r.computeAsync(this.stepKernel);
  }

  /** Force re-init on next driver tick. */
  reseed() {
    this.hasInitialised = false;
  }

  // ============================================================
  // Kernel construction
  // ============================================================

  /**
   * GLSL-style hash → pseudo-random float in [0,1]. Cheap, low-quality, and
   * good enough for dust seeding. Distinct (a,b) pairs yield decorrelated
   * outputs.
   */
  private hash(a: TSLNode, b: TSLNode): TSLNode {
    return fract(sin(a.mul(12.9898).add(b.mul(78.233))).mul(43758.5453));
  }

  private spawnPosition(idx: TSLNode, seed: TSLNode): TSLNode {
    const fIdx: TSLNode = float(idx);
    const r0: TSLNode = this.hash(fIdx, seed.add(1.0));
    const r1: TSLNode = this.hash(fIdx, seed.add(2.0));
    const r2: TSLNode = this.hash(fIdx, seed.add(3.0));
    const r3: TSLNode = this.hash(fIdx, seed.add(4.0));

    // Two spawn regions:
    //   • Ring  (60%): low-altitude annulus — the dust ring at the surface.
    //   • Column (40%): inside the vortex core at varied heights — gets
    //     swept tangentially by vθ to produce a visible swirling column.
    // r3 picks the region; both share the (theta, radius²) inverse sampling.
    const isColumn: TSLNode = r3.greaterThan(float(0.6));

    // Ring branch
    const innerRing2: TSLNode = this.uSpawnInner.mul(this.uSpawnInner);
    const outerRing2: TSLNode = this.uSpawnOuter.mul(this.uSpawnOuter);
    const radiusRing: TSLNode = innerRing2
      .add(r0.mul(outerRing2.sub(innerRing2)))
      .sqrt();
    const zRange: TSLNode = this.uSpawnZmax.sub(this.uSpawnZmin);
    const zRing: TSLNode = this.uSpawnZmin.add(r2.mul(zRange));

    // Column branch — radius up to inner ring radius (the funnel core),
    // height anywhere from the spawn floor up to ~6× the ring ceiling.
    const radiusCol: TSLNode = r0.sqrt().mul(this.uSpawnInner);
    const zCol: TSLNode = this.uSpawnZmin.add(
      r2.mul(this.uSpawnZmax.mul(6).sub(this.uSpawnZmin)),
    );

    const radius: TSLNode = isColumn.select(radiusCol, radiusRing);
    const z: TSLNode = isColumn.select(zCol, zRing);
    const theta: TSLNode = r1.mul(Math.PI * 2);
    const x: TSLNode = radius.mul(theta.cos());
    const y: TSLNode = radius.mul(theta.sin());
    return vec3(x, y, z);
  }

  private makeInitKernel(): TSLNode {
    const node = Fn(() => {
      const idx = instanceIndex;
      const pos: TSLNode = this.spawnPosition(idx, this.uSeed);
      // Stagger initial ages across [0, maxAge) so respawns desynchronise.
      const initAge: TSLNode = this.hash(float(idx), this.uSeed.add(99.0)).mul(
        this.uMaxAge,
      );
      this.stateNode.element(idx).assign(vec4(pos, initAge) as TSLNode);
    });
    return node().compute(this.count);
  }

  private makeStepKernel(): TSLNode {
    const { Lx, Ly, Lz } = this.grid;

    const node = Fn(() => {
      const idx = instanceIndex;
      const state: TSLNode = this.stateNode.element(idx);
      const pos: TSLNode = state.xyz;
      const age: TSLNode = state.w;

      // World → texture UV (matches Solver convention)
      const u: TSLNode = pos.x.add(Lx / 2).div(Lx);
      const v: TSLNode = pos.y.add(Ly / 2).div(Ly);
      const w: TSLNode = pos.z.div(Lz);

      const uClamp: TSLNode = u.clamp(float(0), float(1));
      const vClamp: TSLNode = v.clamp(float(0), float(1));
      const wClamp: TSLNode = w.clamp(float(0), float(1));

      const vel: TSLNode = texture3D(
        this.velocityTex,
        vec3(uClamp, vClamp, wClamp),
      ).xyz;

      // Stokes settling: in the dust-grain regime, drag relaxes the particle
      // to flow velocity within milliseconds, leaving a steady fall offset
      // w_s relative to air. Modeled as a constant downward bias.
      const effVel: TSLNode = vec3(
        vel.x,
        vel.y,
        vel.z.sub(this.uSettling),
      ) as TSLNode;
      const advanced: TSLNode = pos.add(effVel.mul(this.uDt));
      const newAge: TSLNode = age.add(this.uDt);

      // Respawn if out of domain or aged out
      const outX: TSLNode = u.lessThan(float(0)).or(u.greaterThan(float(1)));
      const outY: TSLNode = v.lessThan(float(0)).or(v.greaterThan(float(1)));
      const outZ: TSLNode = w.lessThan(float(0)).or(w.greaterThan(float(1)));
      const expired: TSLNode = newAge.greaterThan(this.uMaxAge);
      const needsRespawn: TSLNode = outX.or(outY).or(outZ).or(expired);

      const respawnPos: TSLNode = this.spawnPosition(idx, this.uSeed);
      const finalPos: TSLNode = needsRespawn.select(respawnPos, advanced);
      const finalAge: TSLNode = needsRespawn.select(float(0), newAge);

      this.stateNode.element(idx).assign(vec4(finalPos, finalAge) as TSLNode);
    });
    return node().compute(this.count);
  }
}
