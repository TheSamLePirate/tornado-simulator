/**
 * Live simulation parameters. All units SI (m, s, kg) unless noted.
 * Mirrors the user-editable groups in the Leva panel.
 */
export interface SimParams {
  // Core vortex
  /** Radius of maximum tangential wind, m. Typical 100-500. */
  Rmax: number;
  /** Maximum tangential wind speed, m/s. Typical 30-100. */
  Vmax: number;
  /** Davies-Jones swirl ratio S = R · v_theta / (2 · v_r · H). Typical 0.1-2.0. */
  swirlRatio: number;

  // Boundary layer
  /** Lateral inflow magnitude, m/s. */
  inflow: number;
  /** Surface roughness length z0, m. 0.001 (water) to 1.0 (forest/suburb). */
  z0: number;

  // Atmosphere
  /** Ambient surface temperature, K. */
  T0: number;
  /** Ambient surface pressure, Pa. */
  P0: number;
  /** Relative humidity, fraction 0..1. */
  RH: number;

  // Storm motion
  /** Storm translation x, m/s (frame-relative; we add to lateral inflow to keep frame stationary on vortex). */
  Ustorm: number;
  Vstorm: number;
  /** Vortex axis tilt from vertical, radians, around y-axis. */
  tilt: number;

  // Solver
  /** Smagorinsky constant. */
  Cs: number;
  /** Vorticity confinement strength, dimensionless ε. */
  vortConfine: number;
  /**
   * Latent heat release multiplier. Drives a vertical buoyancy force
   * proportional to local cloud water density: F_z = k · g · L_v / (c_p · T₀) · ρ_c.
   * 0 = no driving force (vortex spins down). 1 ≈ physical. >1 = overdriven
   * to compensate for grid-scale numerical dissipation.
   */
  latentHeat: number;
}

export const DEFAULT_PARAMS: SimParams = {
  Rmax: 150, // tight core → stronger curvature, sharp vortex tube
  Vmax: 95, // strong EF4 (≈ 213 mph)
  swirlRatio: 0.75, // past two-cell transition → multi-vortex structure can emerge
  inflow: 18, // strong driving inflow
  z0: 0.03, // moderately rough surface (farmland / scattered trees)
  T0: 295.15, // 22 °C surface — warm summer afternoon
  P0: 101_325,
  RH: 0.92, // high humidity → low LCL → tall visible funnel
  Ustorm: 0,
  Vstorm: 0,
  tilt: 0,
  Cs: 0.1, // slightly less SGS dissipation
  vortConfine: 0.22, // stronger restoration to fight grid-scale ω diffusion
  latentHeat: 8.0, // overdriven buoyancy keeps the engine running indefinitely
};

// === Atmospheric constants ===
export const G = 9.80665; // m/s^2
export const R_DRY = 287.058; // J/(kg·K)
export const R_VAP = 461.495;
export const M_AIR = 0.0289644; // kg/mol
export const M_WATER = 0.0180153;
export const KARMAN = 0.41;
export const GAMMA_DRY = 0.0098; // K/m, dry adiabatic lapse

/** Air density from ideal gas law (kg/m^3). */
export function rhoAir(T: number, P: number): number {
  return P / (R_DRY * T);
}

/** August-Roche-Magnus saturation vapor pressure, Pa. T in Kelvin. */
export function eSatPa(T: number): number {
  const Tc = T - 273.15;
  return 611.2 * Math.exp((17.67 * Tc) / (Tc + 243.5));
}

/** Lifting condensation level approx, m. */
export function zLCL(T0: number, RH: number): number {
  // Espy / Lawrence approximation: z_LCL ≈ 125 · (T - Td)
  // Td ≈ T - (1 - RH) · (T - 273.15) / 5  ... rough; use Magnus inversion
  const Tc = T0 - 273.15;
  const e = RH * eSatPa(T0);
  const lnE = Math.log(e / 611.2);
  const Td = (243.5 * lnE) / (17.67 - lnE); // °C
  return Math.max(0, 125 * (Tc - Td));
}
