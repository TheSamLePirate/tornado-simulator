import * as THREE from "three";
import { Storage3DTexture } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";
import {
  Fn,
  float,
  instanceIndex,
  int,
  ivec3,
  mix,
  texture3D,
  textureStore,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import type { GridSpec } from "./grid";
import { DOMAIN_R } from "./grid";
import type { SimParams } from "./params";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TSLNode = any;

/**
 * GPU LES solver — M3 baseline.
 *
 * Pass schedule per substep:
 *   1. advect velocity      (semi-Lagrangian, RK1 backtrace) with BCs baked in
 *   2. compute divergence   (central differences)
 *   3. Jacobi pressure ×N   (∇²p = ∇·v)
 *   4. subtract pressure gradient (v ← v − ∇p)
 *
 * Storage layout (all Storage3DTexture, RGBA + FloatType):
 *   velocity[2]  RGB = (vx,vy,vz), A = |V|. velocity[0] is always the post-step output.
 *   pressure[2]  R = pressure deviation, GBA unused.
 *   divergenceTex R = ∇·v.
 *
 * Boundary conditions baked into advection:
 *   - Lateral cylinder: in a sponge band of width 60 m at the lateral cylinder
 *     wall, the advected sample is smoothly blended toward Dirichlet
 *     v_θ = S · V_in, v_r = -V_in (Davies-Jones 1973 swirl-ratio definition).
 *   - Ground (k==0): no-slip (v=0).
 *   - Top: zero-gradient (advected value retained).
 */
export class Solver {
  readonly grid: GridSpec;
  readonly velocity: [Storage3DTexture, Storage3DTexture];
  readonly pressure: [Storage3DTexture, Storage3DTexture];
  readonly divergenceTex: Storage3DTexture;
  readonly cloudTex: Storage3DTexture;
  /** ω = ∇×v, RGB = (ωx,ωy,ωz), A = |ω|. Recomputed each step. */
  readonly vorticityTex: Storage3DTexture;

  // Live-tunable uniforms
  readonly uDt = uniform(0.0);
  readonly uVmax = uniform(0.0);
  readonly uRmax = uniform(0.0);
  readonly uSwirl = uniform(0.0);
  readonly uVin = uniform(0.0);
  readonly uZ0 = uniform(0.0);
  readonly uT0 = uniform(293.15);
  readonly uP0 = uniform(101325.0);
  readonly uRH = uniform(0.6);
  /** Air density at surface, kg/m³, recomputed from T0/P0 when params change. */
  readonly uRhoAir = uniform(1.225);
  /** Vorticity confinement strength, dimensionless ε. 0 disables the force. */
  readonly uVortConfine = uniform(0.0);
  /**
   * Latent-heat-release multiplier driving buoyancy from condensed water.
   * 0 = no driving force; vortex decays under viscous + numerical dissipation.
   */
  readonly uLatentHeat = uniform(0.0);
  /**
   * Smagorinsky-Lilly constant. Drives the SGS eddy viscosity
   * ν_t = (Cs · Δ)² · |S|, where |S| is the strain-rate magnitude.
   * 0 disables the LES closure; typical 0.10–0.17 for atmospheric flow.
   */
  readonly uCs = uniform(0.0);

  // Compiled kernels (two variants per pass for ping-pong without rebinding)
  private advectAB: TSLNode;
  private advectBA: TSLNode;
  private divFromA: TSLNode;
  private divFromB: TSLNode;
  private jacobiAB: TSLNode;
  private jacobiBA: TSLNode;
  private gradSubAUsingPa: TSLNode;
  private gradSubBUsingPa: TSLNode;
  private initKernel0: TSLNode;
  private initKernel1: TSLNode;
  private cloudKernelA: TSLNode;
  private cloudKernelB: TSLNode;
  private vorticityFromA: TSLNode;
  private vorticityFromB: TSLNode;

  /** Velocity ping-pong index. step() always ends with this back at 0. */
  private velPhase: 0 | 1 = 0;
  private pressPhase: 0 | 1 = 0;
  private hasInitialised = false;
  jacobiIters = 14;

  constructor(grid: GridSpec) {
    this.grid = grid;
    const { Nx, Ny, Nz } = grid;

    this.velocity = [makeStorage3D(Nx, Ny, Nz), makeStorage3D(Nx, Ny, Nz)];
    this.pressure = [makeStorage3D(Nx, Ny, Nz), makeStorage3D(Nx, Ny, Nz)];
    this.divergenceTex = makeStorage3D(Nx, Ny, Nz);
    this.cloudTex = makeStorage3D(Nx, Ny, Nz);
    this.vorticityTex = makeStorage3D(Nx, Ny, Nz);

    this.initKernel0 = this.makeInitVortex(this.velocity[0]);
    this.initKernel1 = this.makeInitVortex(this.velocity[1]);
    this.advectAB = this.makeAdvect(this.velocity[0], this.velocity[1]);
    this.advectBA = this.makeAdvect(this.velocity[1], this.velocity[0]);
    this.divFromA = this.makeDivergence(this.velocity[0]);
    this.divFromB = this.makeDivergence(this.velocity[1]);
    this.jacobiAB = this.makeJacobi(this.pressure[0], this.pressure[1]);
    this.jacobiBA = this.makeJacobi(this.pressure[1], this.pressure[0]);
    this.vorticityFromA = this.makeVorticity(this.velocity[0]);
    this.vorticityFromB = this.makeVorticity(this.velocity[1]);
    this.gradSubAUsingPa = this.makeGradSub(
      this.velocity[0],
      this.velocity[1],
      this.pressure[0],
    );
    this.gradSubBUsingPa = this.makeGradSub(
      this.velocity[1],
      this.velocity[0],
      this.pressure[0],
    );
    this.cloudKernelA = this.makeCondensation(this.pressure[0]);
    this.cloudKernelB = this.makeCondensation(this.pressure[1]);
  }

  /** Run the on-GPU Burgers-Rott initial-condition kernel on both velocity slots. */
  async initialise(renderer: WebGPURenderer): Promise<void> {
    const r = renderer as any;
    await r.computeAsync(this.initKernel0);
    await r.computeAsync(this.initKernel1);
    this.hasInitialised = true;
  }

  get isInitialised() {
    return this.hasInitialised;
  }

  /** Velocity texture safe to sample after step(). Identity is stable. */
  get readVelocity(): Storage3DTexture {
    return this.velocity[0];
  }

  /** Pressure texture safe to sample after step(). Identity may swap. */
  get readPressure(): Storage3DTexture {
    return this.pressure[this.pressPhase];
  }

  syncParams(p: SimParams, dt: number) {
    (this.uDt as any).value = dt;
    (this.uVmax as any).value = p.Vmax;
    (this.uRmax as any).value = p.Rmax;
    (this.uSwirl as any).value = p.swirlRatio;
    (this.uVin as any).value = p.inflow;
    (this.uZ0 as any).value = p.z0;
    (this.uT0 as any).value = p.T0;
    (this.uP0 as any).value = p.P0;
    (this.uRH as any).value = p.RH;
    (this.uVortConfine as any).value = p.vortConfine;
    (this.uLatentHeat as any).value = p.latentHeat;
    (this.uCs as any).value = p.Cs;
    // Air density from ideal gas
    (this.uRhoAir as any).value = p.P0 / (287.058 * p.T0);
  }

  async step(renderer: WebGPURenderer): Promise<void> {
    const r = renderer as any;

    // 1) advect
    await r.computeAsync(this.velPhase === 0 ? this.advectAB : this.advectBA);
    this.velPhase = (1 - this.velPhase) as 0 | 1;

    // 2) compute vorticity ω = ∇×v from post-advect velocity → vorticityTex.
    //    Used both for the confinement force and as a derived field for the UI.
    await r.computeAsync(
      this.velPhase === 0 ? this.vorticityFromA : this.vorticityFromB,
    );

    // 3) divergence
    await r.computeAsync(this.velPhase === 0 ? this.divFromA : this.divFromB);

    // 4) Jacobi pressure iterations
    this.pressPhase = 0;
    for (let i = 0; i < this.jacobiIters; i++) {
      await r.computeAsync(
        this.pressPhase === 0 ? this.jacobiAB : this.jacobiBA,
      );
      this.pressPhase = (1 - this.pressPhase) as 0 | 1;
    }

    // 5) subtract pressure gradient and add vorticity-confinement force in one
    //    pass. Velocity ping-pong parity unchanged: this is the only velocity
    //    write besides advect, so step() ends with velPhase back at 0.
    await r.computeAsync(
      this.velPhase === 0 ? this.gradSubAUsingPa : this.gradSubBUsingPa,
    );
    this.velPhase = (1 - this.velPhase) as 0 | 1;

    // 6) condensation derived field (reads current pressure)
    await r.computeAsync(
      this.pressPhase === 0 ? this.cloudKernelA : this.cloudKernelB,
    );
  }

  dispose() {
    for (const t of [
      ...this.velocity,
      ...this.pressure,
      this.divergenceTex,
      this.cloudTex,
      this.vorticityTex,
    ])
      t.dispose();
  }

  // ============================================================
  // Kernels
  // ============================================================

  /**
   * Condensation derived field. For each cell, compute local pressure as
   *   p_local(z) ≈ P0 − ρ·g·z + ΔP(x,y,z)
   * where ΔP is the projection-step pressure deviation (dimensionless,
   * scaled by ρ to get Pa). Local temperature follows dry-adiabatic descent:
   *   T_local(z) = T0 · (p_local/P0)^(R/cp)   with R/cp ≈ 0.286.
   * Saturation vapor pressure via August-Roche-Magnus:
   *   e_s(T) = 611.2 · exp(17.67·Tc / (Tc + 243.5))   Pa, Tc in °C
   * Vapor pressure assumed conserved at surface value e = RH · e_s(T0).
   * Cloud water density:
   *   ρ_c = max(0, (e − e_s(T_local))) · M_w / (R_v · T_local)   kg/m³
   * Stored as a scalar in the R channel of cloudTex.
   */
  private makeCondensation(pTex: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dz } = this.grid;
    const totalCells = Nx * Ny * Nz;
    const G_ACCEL = 9.80665;
    const R_OVER_CP = 0.286;
    const MAGNUS_A = 17.67;
    const MAGNUS_B = 243.5;
    const E_REF_PA = 611.2;
    const M_WATER = 0.0180153;
    const R_VAP = 461.495;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      const wz: TSLNode = fk.add(0.5).mul(dz);

      // Hydrostatic ambient pressure at this height
      const pHydro: TSLNode = this.uP0.sub(this.uRhoAir.mul(G_ACCEL).mul(wz));
      // The projection-step "pressure" is only defined up to an additive
      // constant, so we reference against an upper-domain corner sample
      // (assumed undisturbed) to recover the true gauge-zero deviation.
      const dP_kin: TSLNode = texture3D(pTex, this.uvCenter(fi, fj, fk)).x;
      const dP_amb: TSLNode = texture3D(
        pTex,
        vec3(0.05, 0.05, 0.95) as TSLNode,
      ).x;
      const dP_dev: TSLNode = dP_kin.sub(dP_amb);
      const dP_pa: TSLNode = dP_dev.mul(this.uRhoAir);

      const pLocal: TSLNode = pHydro.add(dP_pa).max(float(1.0));

      // Dry-adiabatic temperature
      const ratio: TSLNode = pLocal.div(this.uP0);
      const tLocal: TSLNode = this.uT0.mul(ratio.pow(float(R_OVER_CP)));

      // Saturation vapor pressure at surface (uses uT0)
      const tcSurface: TSLNode = this.uT0.sub(273.15);
      const esSurfArg: TSLNode = float(MAGNUS_A)
        .mul(tcSurface)
        .div(tcSurface.add(MAGNUS_B));
      const esSurface: TSLNode = float(E_REF_PA).mul(
        (esSurfArg as TSLNode).exp(),
      );
      const eVapor: TSLNode = this.uRH.mul(esSurface);

      // Saturation at local temperature
      const tcLocal: TSLNode = tLocal.sub(273.15);
      const esLocalArg: TSLNode = float(MAGNUS_A)
        .mul(tcLocal)
        .div(tcLocal.add(MAGNUS_B));
      const esLocal: TSLNode = float(E_REF_PA).mul(
        (esLocalArg as TSLNode).exp(),
      );

      // Supersaturation (positive only) → condensed water mass density
      const deficit: TSLNode = eVapor.sub(esLocal).max(float(0));
      const rhoC: TSLNode = deficit.mul(M_WATER).div(float(R_VAP).mul(tLocal));

      textureStore(
        this.cloudTex,
        idx3,
        vec4(rhoC, 0, 0, 0) as TSLNode,
      ).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  /**
   * One-shot initialiser: writes a Burgers-Rott analytical vortex to a
   * single velocity texture using current uniforms (Vmax, Rmax, V_in).
   *
   *   v_θ(r)   = Vmax · (Rmax/r) · (1 − e^(−α (r/Rmax)²)) / (1 − e^(−α))
   *             with α = 1.25643 (root of (2α + 1) = e^α)
   *   v_r(r)   = −a · r,   a = V_in / R_dom  (mass-balance stretching rate)
   *   w(z)     =  2 · a · z
   */
  private makeInitVortex(dst: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dx, dy, dz, Lx, Ly } = this.grid;
    const totalCells = Nx * Ny * Nz;
    const ALPHA = 1.25643;
    const NORM = 1 - Math.exp(-ALPHA);

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      const wx: TSLNode = fi
        .add(0.5)
        .mul(dx)
        .sub(Lx / 2);
      const wy: TSLNode = fj
        .add(0.5)
        .mul(dy)
        .sub(Ly / 2);
      const wz: TSLNode = fk.add(0.5).mul(dz);

      const r2: TSLNode = wx.mul(wx).add(wy.mul(wy));
      const r: TSLNode = r2.sqrt();
      const rSafe: TSLNode = r.max(float(1e-3));

      // a = V_in / R_dom
      const a: TSLNode = this.uVin.div(DOMAIN_R);
      // exponent: -ALPHA * (r/Rmax)^2
      const expArg: TSLNode = float(-ALPHA)
        .mul(r2)
        .div(this.uRmax.mul(this.uRmax));
      const expVal: TSLNode = expArg.exp();
      const oneMinusExp: TSLNode = float(1).sub(expVal);
      // v_theta = Vmax * (Rmax/r) * oneMinusExp / NORM
      const vTheta: TSLNode = this.uVmax
        .mul(this.uRmax)
        .div(rSafe)
        .mul(oneMinusExp)
        .div(NORM);
      const vRad: TSLNode = a.negate().mul(rSafe);
      const vw: TSLNode = a.mul(2).mul(wz);

      const phiCos: TSLNode = wx.div(rSafe);
      const phiSin: TSLNode = wy.div(rSafe);
      const vx: TSLNode = vTheta.negate().mul(phiSin).add(vRad.mul(phiCos));
      const vy: TSLNode = vTheta.mul(phiCos).add(vRad.mul(phiSin));
      const vz: TSLNode = vw;

      const v: TSLNode = vec3(vx, vy, vz);
      const mag: TSLNode = v.length();
      textureStore(dst, idx3, vec4(v, mag) as TSLNode).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  /** Unflatten 1D dispatch index → (i,j,k) as float / int nodes. */
  private indexNode() {
    const { Nx, Ny } = this.grid;
    const idx = instanceIndex;
    const iU: TSLNode = idx.mod(Nx);
    const jU: TSLNode = idx.div(Nx).mod(Ny);
    const kU: TSLNode = idx.div(Nx * Ny);
    const i: TSLNode = int(iU);
    const j: TSLNode = int(jU);
    const k: TSLNode = int(kU);
    const fi: TSLNode = float(i);
    const fj: TSLNode = float(j);
    const fk: TSLNode = float(k);
    return { i, j, k, fi, fj, fk };
  }

  private uvCenter(fi: TSLNode, fj: TSLNode, fk: TSLNode): TSLNode {
    const { Nx, Ny, Nz } = this.grid;
    return vec3(fi.add(0.5).div(Nx), fj.add(0.5).div(Ny), fk.add(0.5).div(Nz));
  }

  private makeAdvect(src: Storage3DTexture, dst: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dx, dy, dz, Lx, Ly, Lz } = this.grid;
    const totalCells = Nx * Ny * Nz;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      // Cell-centred world position in metres
      const wx = fi
        .add(0.5)
        .mul(dx)
        .sub(Lx / 2);
      const wy = fj
        .add(0.5)
        .mul(dy)
        .sub(Ly / 2);
      const wz = fk.add(0.5).mul(dz);

      // Sample current velocity at cell centre
      const vCur = texture3D(src, this.uvCenter(fi, fj, fk)).xyz;

      // ----- RK2 (midpoint) semi-Lagrangian backtrace -----
      // Stage 1: half-step backtrace using v(x), look up velocity there.
      const xMid = wx.sub(vCur.x.mul(this.uDt).mul(0.5));
      const yMid = wy.sub(vCur.y.mul(this.uDt).mul(0.5));
      const zMid = wz.sub(vCur.z.mul(this.uDt).mul(0.5));
      const uMid: TSLNode = xMid
        .add(Lx / 2)
        .div(Lx)
        .clamp(float(0), float(1));
      const vMid: TSLNode = yMid
        .add(Ly / 2)
        .div(Ly)
        .clamp(float(0), float(1));
      const wMid: TSLNode = zMid.div(Lz).clamp(float(0), float(1));
      const vAtMid = texture3D(src, vec3(uMid, vMid, wMid) as TSLNode).xyz;

      // Stage 2: full backtrace using midpoint velocity (second-order accurate).
      const xb = wx.sub(vAtMid.x.mul(this.uDt));
      const yb = wy.sub(vAtMid.y.mul(this.uDt));
      const zb = wz.sub(vAtMid.z.mul(this.uDt));

      // Backtraced position → texture UV (clamp at edges)
      const u: TSLNode = xb
        .add(Lx / 2)
        .div(Lx)
        .clamp(float(0), float(1));
      const v: TSLNode = yb
        .add(Ly / 2)
        .div(Ly)
        .clamp(float(0), float(1));
      const w: TSLNode = zb.div(Lz).clamp(float(0), float(1));
      const sampled: TSLNode = texture3D(src, vec3(u, v, w) as TSLNode).xyz;

      // ----- Lateral cylinder swirl-inflow Dirichlet (sponge blend) -----
      const r: TSLNode = wx.mul(wx).add(wy.mul(wy)).sqrt();
      const sponge = 60.0; // m
      const blend: TSLNode = r
        .sub(DOMAIN_R - sponge)
        .div(sponge)
        .clamp(float(0), float(1));

      const rSafe: TSLNode = r.add(1e-3);
      const phiCos: TSLNode = wx.div(rSafe);
      const phiSin: TSLNode = wy.div(rSafe);
      const vTheta: TSLNode = this.uVin.mul(this.uSwirl);
      const vRad: TSLNode = this.uVin.negate();
      const tx: TSLNode = vTheta.negate().mul(phiSin).add(vRad.mul(phiCos));
      const ty: TSLNode = vTheta.mul(phiCos).add(vRad.mul(phiSin));
      const lateralTarget: TSLNode = vec3(tx, ty, float(0)) as TSLNode;

      // Smooth blend toward Dirichlet target near lateral boundary
      const afterLateral: TSLNode = mix(sampled, lateralTarget, blend);

      // ----- Ground no-slip: zero out at k==0 -----
      const groundFactor: TSLNode = fk
        .lessThan(float(0.5))
        .select(float(0), float(1));
      const finalV: TSLNode = afterLateral.mul(groundFactor);

      const mag: TSLNode = finalV.length();
      textureStore(dst, idx3, vec4(finalV, mag) as TSLNode).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  private makeDivergence(src: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dx, dy, dz } = this.grid;
    const totalCells = Nx * Ny * Nz;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      // Neighbour float indices clamped at boundary
      const fip: TSLNode = fi.add(1).min(float(Nx - 1));
      const fim: TSLNode = fi.sub(1).max(float(0));
      const fjp: TSLNode = fj.add(1).min(float(Ny - 1));
      const fjm: TSLNode = fj.sub(1).max(float(0));
      const fkp: TSLNode = fk.add(1).min(float(Nz - 1));
      const fkm: TSLNode = fk.sub(1).max(float(0));

      const vIp = texture3D(src, this.uvCenter(fip, fj, fk)).xyz;
      const vIm = texture3D(src, this.uvCenter(fim, fj, fk)).xyz;
      const vJp = texture3D(src, this.uvCenter(fi, fjp, fk)).xyz;
      const vJm = texture3D(src, this.uvCenter(fi, fjm, fk)).xyz;
      const vKp = texture3D(src, this.uvCenter(fi, fj, fkp)).xyz;
      const vKm = texture3D(src, this.uvCenter(fi, fj, fkm)).xyz;

      const dvx = vIp.x.sub(vIm.x).div(2 * dx);
      const dvy = vJp.y.sub(vJm.y).div(2 * dy);
      const dvz = vKp.z.sub(vKm.z).div(2 * dz);
      const div = dvx.add(dvy).add(dvz);

      textureStore(this.divergenceTex, idx3, vec4(div, 0, 0, 0)).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  private makeJacobi(srcP: Storage3DTexture, dstP: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dx } = this.grid;
    const totalCells = Nx * Ny * Nz;
    const dx2 = dx * dx;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      const fip: TSLNode = fi.add(1).min(float(Nx - 1));
      const fim: TSLNode = fi.sub(1).max(float(0));
      const fjp: TSLNode = fj.add(1).min(float(Ny - 1));
      const fjm: TSLNode = fj.sub(1).max(float(0));
      const fkp: TSLNode = fk.add(1).min(float(Nz - 1));
      const fkm: TSLNode = fk.sub(1).max(float(0));

      const pip = texture3D(srcP, this.uvCenter(fip, fj, fk)).x;
      const pim = texture3D(srcP, this.uvCenter(fim, fj, fk)).x;
      const pjp = texture3D(srcP, this.uvCenter(fi, fjp, fk)).x;
      const pjm = texture3D(srcP, this.uvCenter(fi, fjm, fk)).x;
      const pkp = texture3D(srcP, this.uvCenter(fi, fj, fkp)).x;
      const pkm = texture3D(srcP, this.uvCenter(fi, fj, fkm)).x;

      const div = texture3D(this.divergenceTex, this.uvCenter(fi, fj, fk)).x;

      const sum = pip.add(pim).add(pjp).add(pjm).add(pkp).add(pkm);
      const newP = sum.sub(div.mul(dx2)).div(6.0);

      textureStore(dstP, idx3, vec4(newP, 0, 0, 0)).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  /**
   * Compute the curl of velocity at every cell:
   *   ωx = ∂vz/∂y − ∂vy/∂z
   *   ωy = ∂vx/∂z − ∂vz/∂x
   *   ωz = ∂vy/∂x − ∂vx/∂y
   * Stored as RGBA = (ωx, ωy, ωz, |ω|). |ω| is precomputed so the
   * confinement-force kernel can sample neighbour magnitudes without recomputing.
   */
  private makeVorticity(velSrc: Storage3DTexture): TSLNode {
    const { Nx, Ny, Nz, dx, dy, dz } = this.grid;
    const totalCells = Nx * Ny * Nz;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      const fip: TSLNode = fi.add(1).min(float(Nx - 1));
      const fim: TSLNode = fi.sub(1).max(float(0));
      const fjp: TSLNode = fj.add(1).min(float(Ny - 1));
      const fjm: TSLNode = fj.sub(1).max(float(0));
      const fkp: TSLNode = fk.add(1).min(float(Nz - 1));
      const fkm: TSLNode = fk.sub(1).max(float(0));

      const vIp = texture3D(velSrc, this.uvCenter(fip, fj, fk)).xyz;
      const vIm = texture3D(velSrc, this.uvCenter(fim, fj, fk)).xyz;
      const vJp = texture3D(velSrc, this.uvCenter(fi, fjp, fk)).xyz;
      const vJm = texture3D(velSrc, this.uvCenter(fi, fjm, fk)).xyz;
      const vKp = texture3D(velSrc, this.uvCenter(fi, fj, fkp)).xyz;
      const vKm = texture3D(velSrc, this.uvCenter(fi, fj, fkm)).xyz;

      const dvy_dx: TSLNode = vIp.y.sub(vIm.y).div(2 * dx);
      const dvz_dx: TSLNode = vIp.z.sub(vIm.z).div(2 * dx);
      const dvx_dy: TSLNode = vJp.x.sub(vJm.x).div(2 * dy);
      const dvz_dy: TSLNode = vJp.z.sub(vJm.z).div(2 * dy);
      const dvx_dz: TSLNode = vKp.x.sub(vKm.x).div(2 * dz);
      const dvy_dz: TSLNode = vKp.y.sub(vKm.y).div(2 * dz);

      const omegaX: TSLNode = dvz_dy.sub(dvy_dz);
      const omegaY: TSLNode = dvx_dz.sub(dvz_dx);
      const omegaZ: TSLNode = dvy_dx.sub(dvx_dy);
      const omegaMag: TSLNode = vec3(omegaX, omegaY, omegaZ).length();

      textureStore(
        this.vorticityTex,
        idx3,
        vec4(omegaX, omegaY, omegaZ, omegaMag) as TSLNode,
      ).toWriteOnly();
    });
    return node().compute(totalCells);
  }

  /**
   * Project out the divergent part of velocity AND apply the
   * vorticity-confinement force in the same pass.
   *
   *   v_new = (v − ∇p) + ε · h · (N̂ × ω) · dt
   *   N̂   = ∇|ω| / max(|∇|ω||, eps)
   *   h    = (dx + dy + dz) / 3   (characteristic cell size)
   *
   * The confinement force pushes velocity toward regions of higher |ω|,
   * counteracting the dissipation introduced by semi-Lagrangian advection
   * (Steinhoff & Underhill 1994).
   */
  private makeGradSub(
    velSrc: Storage3DTexture,
    velDst: Storage3DTexture,
    pTex: Storage3DTexture,
  ): TSLNode {
    const { Nx, Ny, Nz, dx, dy, dz } = this.grid;
    const totalCells = Nx * Ny * Nz;
    const hChar = (dx + dy + dz) / 3;
    // Smagorinsky filter width Δ = (dx · dy · dz)^(1/3); precompute Δ².
    const delta2 = Math.cbrt(dx * dy * dz) ** 2;

    const node = Fn(() => {
      const { i, j, k, fi, fj, fk } = this.indexNode();
      const idx3 = ivec3(i, j, k);

      const fip: TSLNode = fi.add(1).min(float(Nx - 1));
      const fim: TSLNode = fi.sub(1).max(float(0));
      const fjp: TSLNode = fj.add(1).min(float(Ny - 1));
      const fjm: TSLNode = fj.sub(1).max(float(0));
      const fkp: TSLNode = fk.add(1).min(float(Nz - 1));
      const fkm: TSLNode = fk.sub(1).max(float(0));

      // ----- Pressure gradient (existing) -----
      const dpdx = texture3D(pTex, this.uvCenter(fip, fj, fk))
        .x.sub(texture3D(pTex, this.uvCenter(fim, fj, fk)).x)
        .div(2 * dx);
      const dpdy = texture3D(pTex, this.uvCenter(fi, fjp, fk))
        .x.sub(texture3D(pTex, this.uvCenter(fi, fjm, fk)).x)
        .div(2 * dy);
      const dpdz = texture3D(pTex, this.uvCenter(fi, fj, fkp))
        .x.sub(texture3D(pTex, this.uvCenter(fi, fj, fkm)).x)
        .div(2 * dz);

      // ----- Vorticity confinement force -----
      // Sample local ω and the magnitude gradient ∇|ω| via 6 neighbour fetches
      // of the precomputed |ω| (alpha channel).
      const omegaHere = texture3D(this.vorticityTex, this.uvCenter(fi, fj, fk));
      const om: TSLNode = omegaHere.xyz;
      const dwdx: TSLNode = texture3D(
        this.vorticityTex,
        this.uvCenter(fip, fj, fk),
      )
        .a.sub(texture3D(this.vorticityTex, this.uvCenter(fim, fj, fk)).a)
        .div(2 * dx);
      const dwdy: TSLNode = texture3D(
        this.vorticityTex,
        this.uvCenter(fi, fjp, fk),
      )
        .a.sub(texture3D(this.vorticityTex, this.uvCenter(fi, fjm, fk)).a)
        .div(2 * dy);
      const dwdz: TSLNode = texture3D(
        this.vorticityTex,
        this.uvCenter(fi, fj, fkp),
      )
        .a.sub(texture3D(this.vorticityTex, this.uvCenter(fi, fj, fkm)).a)
        .div(2 * dz);

      const gradMag: TSLNode = vec3(dwdx, dwdy, dwdz).length().add(float(1e-6));
      const Nx_: TSLNode = dwdx.div(gradMag);
      const Ny_: TSLNode = dwdy.div(gradMag);
      const Nz_: TSLNode = dwdz.div(gradMag);

      // F = ε · h · (N̂ × ω)
      const fx: TSLNode = Ny_.mul(om.z).sub(Nz_.mul(om.y));
      const fy: TSLNode = Nz_.mul(om.x).sub(Nx_.mul(om.z));
      const fz: TSLNode = Nx_.mul(om.y).sub(Ny_.mul(om.x));

      const epsH: TSLNode = this.uVortConfine.mul(float(hChar));
      const fxScaled: TSLNode = fx.mul(epsH).mul(this.uDt);
      const fyScaled: TSLNode = fy.mul(epsH).mul(this.uDt);
      const fzScaled: TSLNode = fz.mul(epsH).mul(this.uDt);

      // ----- Buoyancy from latent heat release -----
      // Where water condenses (ρ_c > 0), latent heat warms the parcel and
      // produces upward buoyancy F_z = k · g · L_v / (c_p · T₀) · ρ_c.
      // For typical T₀ ≈ 293 K: g·L_v/(c_p·T₀) ≈ 9.81·2.5e6/(1005·293) ≈ 83.4
      // (m/s²) per (kg/m³) of cloud water. uLatentHeat is the user-tunable
      // multiplier (0 → vortex decays, 1 ≈ physical, >1 overdrives to fight
      // grid-scale dissipation).
      const BUOY_K = 83.4;
      const cloudHere: TSLNode = texture3D(
        this.cloudTex,
        this.uvCenter(fi, fj, fk),
      ).x;
      const buoy: TSLNode = this.uLatentHeat
        .mul(float(BUOY_K))
        .mul(cloudHere)
        .mul(this.uDt);

      // ----- Smagorinsky-Lilly SGS closure -----
      // Sample velocity at centre + 6 neighbours; reuse for strain rate AND
      // velocity Laplacian. Van Driest near-wall damping is omitted at this
      // grid resolution (Δx ≈ 21 m) — y+ is already well past the buffer
      // layer in the first cell, so the damping factor would be ~1 anyway.
      const v: TSLNode = texture3D(velSrc, this.uvCenter(fi, fj, fk)).xyz;
      const vIp: TSLNode = texture3D(velSrc, this.uvCenter(fip, fj, fk)).xyz;
      const vIm: TSLNode = texture3D(velSrc, this.uvCenter(fim, fj, fk)).xyz;
      const vJp: TSLNode = texture3D(velSrc, this.uvCenter(fi, fjp, fk)).xyz;
      const vJm: TSLNode = texture3D(velSrc, this.uvCenter(fi, fjm, fk)).xyz;
      const vKp: TSLNode = texture3D(velSrc, this.uvCenter(fi, fj, fkp)).xyz;
      const vKm: TSLNode = texture3D(velSrc, this.uvCenter(fi, fj, fkm)).xyz;

      // Velocity gradients (vec3, central diff).
      const dvdX: TSLNode = vIp.sub(vIm).div(2 * dx);
      const dvdY: TSLNode = vJp.sub(vJm).div(2 * dy);
      const dvdZ: TSLNode = vKp.sub(vKm).div(2 * dz);

      // Strain-rate tensor S_ij = ½(∂u_i/∂x_j + ∂u_j/∂x_i).
      const sxx: TSLNode = dvdX.x;
      const syy: TSLNode = dvdY.y;
      const szz: TSLNode = dvdZ.z;
      const sxy: TSLNode = dvdX.y.add(dvdY.x).mul(0.5);
      const sxz: TSLNode = dvdX.z.add(dvdZ.x).mul(0.5);
      const syz: TSLNode = dvdY.z.add(dvdZ.y).mul(0.5);

      // |S| = √(2 · S_ij S_ij). Off-diagonal terms doubled for symmetry.
      const sNormSq: TSLNode = sxx
        .mul(sxx)
        .add(syy.mul(syy))
        .add(szz.mul(szz))
        .add(sxy.mul(sxy).mul(2))
        .add(sxz.mul(sxz).mul(2))
        .add(syz.mul(syz).mul(2));
      const sMag: TSLNode = sNormSq.mul(2).sqrt();

      // Eddy viscosity: ν_t = (Cs · Δ)² · |S|.
      const nuT: TSLNode = this.uCs.mul(this.uCs).mul(float(delta2)).mul(sMag);

      // 7-point Laplacian, per velocity component. Diffuses each component
      // along ALL three axes (cross-axis is what makes momentum transport
      // isotropic). Anisotropic dx/dy/dz are folded into the dominant scale
      // so we approximate dx≈dy≈dz here — the grid is roughly cubic.
      const lapDenom = dx * dx;
      const lapVx: TSLNode = vIp.x
        .add(vIm.x)
        .add(vJp.x)
        .add(vJm.x)
        .add(vKp.x)
        .add(vKm.x)
        .sub(v.x.mul(6))
        .div(lapDenom);
      const lapVy: TSLNode = vIp.y
        .add(vIm.y)
        .add(vJp.y)
        .add(vJm.y)
        .add(vKp.y)
        .add(vKm.y)
        .sub(v.y.mul(6))
        .div(lapDenom);
      const lapVz: TSLNode = vIp.z
        .add(vIm.z)
        .add(vJp.z)
        .add(vJm.z)
        .add(vKp.z)
        .add(vKm.z)
        .sub(v.z.mul(6))
        .div(lapDenom);

      const diffX: TSLNode = nuT.mul(lapVx).mul(this.uDt);
      const diffY: TSLNode = nuT.mul(lapVy).mul(this.uDt);
      const diffZ: TSLNode = nuT.mul(lapVz).mul(this.uDt);

      const corrected = vec3(
        v.x.sub(dpdx).add(fxScaled).add(diffX),
        v.y.sub(dpdy).add(fyScaled).add(diffY),
        v.z.sub(dpdz).add(fzScaled).add(diffZ).add(buoy),
      );
      const mag = corrected.length();
      textureStore(velDst, idx3, vec4(corrected, mag)).toWriteOnly();
    });
    return node().compute(totalCells);
  }
}

// ============================================================
// Helpers
// ============================================================

function makeStorage3D(Nx: number, Ny: number, Nz: number): Storage3DTexture {
  const tex = new Storage3DTexture(Nx, Ny, Nz);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.FloatType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  return tex;
}
