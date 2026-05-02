import type { GridSpec } from "./grid";
import { cellCenter } from "./grid";
import type { SimParams } from "./params";
import { DOMAIN_R } from "./grid";

/**
 * Burgers-Rott analytical vortex with vertical stretching, used as initial
 * condition seed for the LES. References:
 *   Burgers (1948), Rott (1958), Rotunno (2013) Annu. Rev. Fluid Mech.
 *
 *   v_theta(r) = Vmax · (Rmax/r) · (1 - exp(-alpha · r²/Rmax²)) / (1 - exp(-alpha))
 *   v_r(r,z)   = -a · r        (radial inflow due to stretching)
 *   w(z)       =  2 · a · z    (axial stretching)
 *
 * alpha solves (2α + 1) = e^α  →  α ≈ 1.25643, ensuring v_theta is maximal at r=Rmax.
 */
const BURGERS_ALPHA = 1.25643;
const NORM = 1 - Math.exp(-BURGERS_ALPHA); // ≈ 0.7152

/** Stretching rate `a` derived from inflow + domain — keeps mass balance. */
function stretchingRate(p: SimParams): number {
  // Volume flux Q = V_in · 2π · R_dom · H_inflow  ≈  ∫ ∇·v_horiz dV
  // For axisymmetric inflow with uniform a: 2a · (cylinder volume) ≈ flux at lateral wall
  // → a ≈ V_in / R_dom
  return p.inflow / DOMAIN_R;
}

/**
 * Fill a Float32Array of length Nx·Ny·Nz·4 with (vx, vy, vz, |V|) per cell.
 * Adds 1% white noise to break perfect axisymmetry so multi-vortex / helical
 * instabilities can develop once the LES starts running.
 */
export function seedBurgersRott(
  g: GridSpec,
  p: SimParams,
  out: Float32Array = new Float32Array(g.Nx * g.Ny * g.Nz * 4),
  rng: () => number = Math.random,
): Float32Array {
  const a = stretchingRate(p);
  const Vmax = p.Vmax;
  const Rmax = p.Rmax;
  const noiseAmp = 0.01 * Vmax;

  for (let k = 0; k < g.Nz; k++) {
    for (let j = 0; j < g.Ny; j++) {
      for (let i = 0; i < g.Nx; i++) {
        const c = cellCenter(g, i, j, k);
        const r = Math.hypot(c.x, c.y);
        const rSafe = Math.max(r, 1e-3);
        const phi = Math.atan2(c.y, c.x);

        // Burgers-Rott tangential
        const vTheta =
          Vmax *
          (Rmax / rSafe) *
          ((1 - Math.exp((-BURGERS_ALPHA * (rSafe * rSafe)) / (Rmax * Rmax))) /
            NORM);
        // Radial inflow (negative = inward)
        const vRadial = -a * rSafe;
        // Vertical stretching
        const w = 2 * a * c.z;

        // Convert (v_theta, v_r) → (vx, vy)
        const vx = -vTheta * Math.sin(phi) + vRadial * Math.cos(phi);
        const vy = vTheta * Math.cos(phi) + vRadial * Math.sin(phi);

        // Symmetry-breaking perturbation
        const nx = (rng() - 0.5) * 2 * noiseAmp;
        const ny = (rng() - 0.5) * 2 * noiseAmp;
        const nz = (rng() - 0.5) * 2 * noiseAmp;

        const fx = vx + nx;
        const fy = vy + ny;
        const fz = w + nz;
        const mag = Math.hypot(fx, fy, fz);

        const o = 4 * (i + g.Nx * (j + g.Ny * k));
        out[o + 0] = fx;
        out[o + 1] = fy;
        out[o + 2] = fz;
        out[o + 3] = mag;
      }
    }
  }
  return out;
}
