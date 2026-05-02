import { useFrame, useThree } from "@react-three/fiber";
import type { WebGPURenderer } from "three/webgpu";
import { useEffect, useRef } from "react";
import { useAppStore } from "../state/store";

interface Props {
  /** Multiplier from real time (s) to simulation time (s). */
  timeScale?: number;
  /** Maximum substep count per frame. Caps cost when CFL is bad. */
  maxSubsteps?: number;
}

/**
 * Headless component that runs the LES step() each frame.
 * Reads live params from the zustand store; pauses respect the store flag.
 */
export function SolverDriver({ timeScale = 15, maxSubsteps = 2 }: Props) {
  const { gl } = useThree();
  const solver = useAppStore((s) => s.solver);
  const particles = useAppStore((s) => s.particles);
  const reductions = useAppStore((s) => s.reductions);
  const setMeasured = useAppStore((s) => s.setMeasured);
  const stepping = useRef(false);
  const frameSeed = useRef(1);
  const reductionFrame = useRef(0);
  /** Even-frame counter — solver only runs when this is 0 (every other frame). */
  const solverPhase = useRef(0);

  useEffect(() => {
    const r = gl as unknown as WebGPURenderer;
    if (typeof r.computeAsync !== "function") {
      console.error("Renderer does not expose computeAsync — WebGPU required.");
    }
  }, [gl]);

  useFrame((_state, dtReal) => {
    if (stepping.current) return;
    const { params, paused } = useAppStore.getState();
    const renderer = gl as unknown as WebGPURenderer;
    if (typeof renderer.computeAsync !== "function") return;

    const dtSim = dtReal * timeScale;
    const dxMin = Math.min(solver.grid.dx, solver.grid.dy, solver.grid.dz);
    const cfl = 1.5;
    const dtCFL = (cfl * dxMin) / Math.max(params.Vmax, 1);
    const n = Math.max(1, Math.min(maxSubsteps, Math.ceil(dtSim / dtCFL)));
    const sub = dtSim / n;

    stepping.current = true;
    void (async () => {
      try {
        if (!solver.isInitialised) {
          solver.syncParams(params, sub);
          await solver.initialise(renderer);
        }
        if (!particles.isInitialised) {
          (particles.uDt as unknown as { value: number }).value = sub;
          (particles.uSeed as unknown as { value: number }).value =
            frameSeed.current;
          await particles.initialise(renderer);
        }
        if (!paused) {
          // Throttle the solver to every other render frame. The LES step
          // is the heaviest piece of GPU work in the frame; alternating it
          // halves average compute load with negligible visual impact —
          // the next-step substep simply uses 2× dt to compensate.
          if (solverPhase.current === 0) {
            const subStretched = sub * 2;
            for (let i = 0; i < n; i++) {
              solver.syncParams(params, subStretched);
              await solver.step(renderer);
            }
          }
          solverPhase.current = (solverPhase.current + 1) % 2;

          // Particles step every frame, but with their own clamped dt so
          // they (a) don't age in lockstep when the render frame is large,
          // and (b) don't fly out of bounds in one step. Real-time motion
          // is favoured over sim-time fidelity here — the dust ring only
          // needs to read as visually plausible, not be physically exact.
          const dtPart = Math.min(dtReal * 4, 0.08);
          (particles.uDt as unknown as { value: number }).value = dtPart;
          // Tie spawn annulus radii to the active vortex's R_max so the
          // dust-ring scale tracks storm intensity. Clamp the outer radius
          // inside the lateral inflow cylinder (DOMAIN_R = 1000m, sponge 60m
          // wide) so particles never spawn into the BC sponge or out of bounds.
          const MAX_SPAWN_R = 1000 - 60 - 20; // ≈ 920m, leaves a margin
          (particles.uSpawnInner as unknown as { value: number }).value =
            Math.min(params.Rmax * 0.4, MAX_SPAWN_R - 50);
          (particles.uSpawnOuter as unknown as { value: number }).value =
            Math.min(params.Rmax * 1.8, MAX_SPAWN_R);
          frameSeed.current = (frameSeed.current + 1) % 1_000_000;
          (particles.uSeed as unknown as { value: number }).value =
            frameSeed.current;
          await particles.step(renderer);
        }

        // Reductions for HUD validation. Dispatch the kernel every 6 frames
        // (≈10 Hz) and fire-and-forget the readback — it's async and may
        // resolve a few frames later, which is fine for a HUD readout.
        reductionFrame.current = (reductionFrame.current + 1) % 6;
        if (reductionFrame.current === 0) {
          await reductions.dispatch(renderer);
          // No await: readback runs in the background; when it resolves it
          // pushes the new measured values into the store so the HUD sees
          // them on the next React render tick.
          void reductions.readback(renderer).then(() => {
            setMeasured({ ...reductions.latest });
          });
        }
        reductions.tick();
      } finally {
        stepping.current = false;
      }
    })();
  });

  return null;
}
