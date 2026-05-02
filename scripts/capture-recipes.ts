/**
 * Predefined capture shots for the tornado-simulator illustration set.
 *
 * Each recipe maps a stable name → URL params + output PNG path. The names
 * are designed to be referenceable from documentation prose ("see
 * funnel-wide-side"). All paths are relative to the repo root.
 *
 * Adding a new recipe: append to RECIPES below. Use raw URL-param names
 * (matching `src/capture/url.ts`'s recognised keys) — boolean flags accept
 * `1` / `0`.
 */

export interface Recipe {
  name: string;
  description: string;
  params: Record<string, string | number>;
  /** Output path relative to repo root. */
  out: string;
}

/**
 * Encode a recipe's params as a query string, with `capture=1` always set.
 * Numbers become decimal strings.
 */
export function recipeQueryString(r: Recipe): string {
  const q = new URLSearchParams();
  q.set("capture", "1");
  for (const [k, v] of Object.entries(r.params)) {
    q.set(k, String(v));
  }
  return q.toString();
}

const OUT_DIR = "docs/illustrations";

export const RECIPES: Recipe[] = [
  {
    name: "funnel-wide-side",
    description:
      "Realistic-mode wide side view of the visible funnel cloud at default params (EF4-class).",
    params: {
      viewMode: "realistic",
      Vmax: 95,
      Rmax: 150,
      swirlRatio: 0.75,
      RH: 0.92,
      latentHeat: 8,
      cameraAz: 35,
      cameraElev: 8,
      cameraDist: 1.6,
      w: 1280,
      h: 720,
      settle: 280,
    },
    out: `${OUT_DIR}/funnel-wide-side.png`,
  },
  {
    name: "vorticity-tube-iso",
    description:
      "Scientific |ω| 3-shell isosurface from above-and-aside, cool→warm gradient reveals the vortex tube core and outer skin.",
    params: {
      viewMode: "scientific",
      field: "vorticity",
      showIso: 1,
      isoShellCount: 3,
      isoShellSpread: 0.18,
      isoValue: 0.45,
      showStreamlines: 0,
      magnitudeFadeAlpha: 0,
      cameraAz: 50,
      cameraElev: 28,
      cameraDist: 1.3,
      w: 1280,
      h: 720,
      settle: 240,
    },
    out: `${OUT_DIR}/vorticity-tube-iso.png`,
  },
  {
    name: "pressure-deficit-slice",
    description:
      "Scientific ΔP slice through the vortex axis. Cyclostrophic deficit shows as deep blue at the core.",
    params: {
      viewMode: "scientific",
      field: "pressure",
      sliceXZ: 0.5,
      sliceXY: 0.05,
      magnitudeFadeAlpha: 0,
      showLIC: 0,
      showStreamlines: 0,
      showIso: 0,
      cameraAz: 0,
      cameraElev: 5,
      cameraDist: 1.4,
      w: 1280,
      h: 720,
      settle: 240,
    },
    out: `${OUT_DIR}/pressure-deficit-slice.png`,
  },
  {
    name: "two-cell-low-S",
    description:
      "Vertical-velocity slice at S=0.4 — single-cell vortex with uniform updraft on-axis.",
    params: {
      viewMode: "scientific",
      field: "vz",
      swirlRatio: 0.4,
      sliceXZ: 0.5,
      magnitudeFadeAlpha: 0,
      showStreamlines: 0,
      showIso: 0,
      cameraAz: 0,
      cameraElev: 5,
      cameraDist: 1.4,
      w: 1280,
      h: 720,
      settle: 280,
    },
    out: `${OUT_DIR}/two-cell-low-S.png`,
  },
  {
    name: "two-cell-high-S",
    description:
      "Vertical-velocity slice at S=0.85 — central downdraft develops on-axis (Davies-Jones two-cell threshold crossed).",
    params: {
      viewMode: "scientific",
      field: "vz",
      swirlRatio: 0.85,
      sliceXZ: 0.5,
      magnitudeFadeAlpha: 0,
      showStreamlines: 0,
      showIso: 0,
      cameraAz: 0,
      cameraElev: 5,
      cameraDist: 1.4,
      w: 1280,
      h: 720,
      settle: 320,
    },
    out: `${OUT_DIR}/two-cell-high-S.png`,
  },
  {
    name: "lcl-low-rh",
    description:
      "Realistic mode at RH=0.45 — high LCL means the visible funnel cloud doesn't reach the ground.",
    params: {
      viewMode: "realistic",
      RH: 0.45,
      Vmax: 80,
      latentHeat: 6,
      cameraAz: 35,
      cameraElev: 6,
      cameraDist: 1.6,
      w: 1280,
      h: 720,
      settle: 280,
    },
    out: `${OUT_DIR}/lcl-low-rh.png`,
  },
  {
    name: "lcl-high-rh",
    description:
      "Realistic mode at RH=0.95 — low LCL puts the funnel base near the ground.",
    params: {
      viewMode: "realistic",
      RH: 0.95,
      Vmax: 80,
      latentHeat: 6,
      cameraAz: 35,
      cameraElev: 6,
      cameraDist: 1.6,
      w: 1280,
      h: 720,
      settle: 280,
    },
    out: `${OUT_DIR}/lcl-high-rh.png`,
  },
  {
    name: "multi-vortex-high-S",
    description:
      "Vorticity isosurface at S=1.2 — sub-vortex breakdown, multiple smaller tubes orbit the main axis.",
    params: {
      viewMode: "scientific",
      field: "vorticity",
      swirlRatio: 1.2,
      Vmax: 100,
      showIso: 1,
      isoShellCount: 3,
      isoShellSpread: 0.15,
      isoValue: 0.4,
      showStreamlines: 0,
      magnitudeFadeAlpha: 0,
      cameraAz: 40,
      cameraElev: 35,
      cameraDist: 1.2,
      w: 1280,
      h: 720,
      settle: 320,
    },
    out: `${OUT_DIR}/multi-vortex-high-S.png`,
  },
  {
    name: "speed-LIC",
    description:
      "Scientific |V| slice with LIC flow grain — reveals tangential vs radial flow direction at every pixel.",
    params: {
      viewMode: "scientific",
      field: "speed",
      showLIC: 1,
      licStrength: 0.7,
      showStreamlines: 0,
      magnitudeFadeAlpha: 0,
      sliceXZ: 0.5,
      cameraAz: 5,
      cameraElev: 8,
      cameraDist: 1.3,
      w: 1280,
      h: 720,
      settle: 240,
    },
    out: `${OUT_DIR}/speed-LIC.png`,
  },
];
