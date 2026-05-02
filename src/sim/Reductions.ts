import {
  Fn,
  Loop,
  attributeArray,
  float,
  instanceIndex,
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
 * Number of partial-reduction bins. Each bin's work-item handles
 * `totalCells / BIN_COUNT` cells. CPU finalises across BIN_COUNT bins.
 * Power-of-two; 1024 leaves ~860 cells per bin at 96³, plenty parallel.
 */
const BIN_COUNT = 1024;

export interface ReductionResult {
  /** Max velocity magnitude (m/s). */
  maxVmag: number;
  /** Min kinematic pressure deviation, m²/s² (referenced to upper-corner ambient). */
  minPressure: number;
  /** Max vorticity magnitude (1/s). */
  maxVorticity: number;
  /** Wall-clock ms since the last successful readback. */
  freshnessMs: number;
}

/**
 * GPU parallel reduction over the simulation state textures, with async
 * readback for HUD display. Each frame the dispatch kernel is fast (~1 ms);
 * readback is non-blocking and updates `latest` whenever it resolves.
 */
export class Reductions {
  readonly grid: GridSpec;
  /** Per-bin output: vec4 = (maxVmag, minPressure, maxVorticity, _). */
  readonly buf: TSLNode;

  private velocityTex: Storage3DTexture;
  private pressureTex: Storage3DTexture;
  private vorticityTex: Storage3DTexture;
  private kernel: TSLNode;
  /** Reference pressure sample location (matches SimSlice convention). */
  readonly uPRefU = uniform(0.05);
  readonly uPRefV = uniform(0.05);
  readonly uPRefW = uniform(0.95);

  private inFlight = false;
  private lastReadback = -Infinity;

  /** Latest measured values (CPU-side mirror of the readback). */
  latest: ReductionResult = {
    maxVmag: 0,
    minPressure: 0,
    maxVorticity: 0,
    freshnessMs: Infinity,
  };

  constructor(
    grid: GridSpec,
    velocityTex: Storage3DTexture,
    pressureTex: Storage3DTexture,
    vorticityTex: Storage3DTexture,
  ) {
    this.grid = grid;
    this.velocityTex = velocityTex;
    this.pressureTex = pressureTex;
    this.vorticityTex = vorticityTex;
    this.buf = attributeArray(BIN_COUNT, "vec4");
    this.kernel = this.makeKernel();
  }

  private makeKernel(): TSLNode {
    const { Nx, Ny, Nz } = this.grid;
    const totalCells = Nx * Ny * Nz;
    const perBin = Math.ceil(totalCells / BIN_COUNT);

    const node = Fn(() => {
      const binIdx = instanceIndex; // 0 .. BIN_COUNT-1
      const startIdx: TSLNode = binIdx.mul(perBin);

      const maxV = float(0).toVar();
      const minP = float(1e20).toVar();
      const maxW = float(0).toVar();

      // Reference (ambient) pressure sample for deviation, matching SimSlice.
      const pRef: TSLNode = texture3D(
        this.pressureTex,
        vec3(this.uPRefU, this.uPRefV, this.uPRefW),
      ).x;

      Loop(perBin, ({ i }: { i: TSLNode }) => {
        const flat: TSLNode = startIdx.add(i);
        // Bail if past the end (last bin can be partial).
        // (TSL has no early-break in Loop, so we just clamp the index and
        //  re-process the last cell harmlessly when overflowing — the
        //  max/min ops are idempotent so it doesn't double-count.)
        const idxClamped: TSLNode = flat.min(totalCells - 1);
        const ci: TSLNode = idxClamped.mod(Nx);
        const cj: TSLNode = idxClamped.div(Nx).mod(Ny);
        const ck: TSLNode = idxClamped.div(Nx * Ny);

        const u: TSLNode = float(ci).add(0.5).div(Nx);
        const v: TSLNode = float(cj).add(0.5).div(Ny);
        const w: TSLNode = float(ck).add(0.5).div(Nz);
        const uvw: TSLNode = vec3(u, v, w);

        const vMagSample: TSLNode = texture3D(this.velocityTex, uvw).w; // |V|
        const pSample: TSLNode = texture3D(this.pressureTex, uvw).x.sub(pRef);
        const wMagSample: TSLNode = texture3D(this.vorticityTex, uvw).w; // |ω|

        maxV.assign(maxV.max(vMagSample));
        minP.assign(minP.min(pSample));
        maxW.assign(maxW.max(wMagSample));
      });

      this.buf
        .element(binIdx)
        .assign(vec4(maxV, minP, maxW, float(0)) as TSLNode);
    });
    return node().compute(BIN_COUNT);
  }

  /** Dispatch the reduction kernel on the GPU. Cheap; safe to call frequently. */
  async dispatch(renderer: WebGPURenderer): Promise<void> {
    const r = renderer as any;
    await r.computeAsync(this.kernel);
  }

  /**
   * Async readback of the partial-reduction buffer + CPU finalisation.
   * Non-blocking: returns immediately if a previous readback is in-flight.
   */
  async readback(renderer: WebGPURenderer): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;

    try {
      const r = renderer as any;
      // three.js WebGPURenderer exposes async readback for storage buffers.
      // The TSL attributeArray returns a node whose underlying buffer/attribute
      // is what `getArrayBufferAsync` accepts.
      const data: ArrayBuffer = await r.getArrayBufferAsync(this.buf.value);
      const f32 = new Float32Array(data);

      let mv = 0;
      let mp = Number.POSITIVE_INFINITY;
      let mw = 0;
      for (let i = 0; i < BIN_COUNT; i++) {
        const off = i * 4;
        const v = f32[off];
        const p = f32[off + 1];
        const w = f32[off + 2];
        if (v > mv) mv = v;
        if (p < mp) mp = p;
        if (w > mw) mw = w;
      }

      const now = performance.now();
      this.latest = {
        maxVmag: mv,
        minPressure: mp,
        maxVorticity: mw,
        freshnessMs: 0,
      };
      this.lastReadback = now;
    } catch (err) {
      // First-frame failures (texture not yet bound) are expected; swallow
      // and try again next time. Other errors surface to the console.
      if (this.lastReadback < 0) {
        // first-time, ignore
      } else {
        console.warn("Reductions readback failed:", err);
      }
    } finally {
      this.inFlight = false;
    }
  }

  /** Refresh `freshnessMs` field for HUD display (call each frame). */
  tick() {
    if (this.lastReadback < 0) return;
    this.latest.freshnessMs = performance.now() - this.lastReadback;
  }
}
