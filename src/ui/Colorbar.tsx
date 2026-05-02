import { useAppStore, type ScientificField } from "../state/store";

/** Colormap CSS gradients approximating the TSL polynomial colormaps. */
const CMAP_CSS: Record<string, string> = {
  viridis:
    "linear-gradient(to top, #440154, #31688e, #21918c, #5ec962, #fde725)",
  magma: "linear-gradient(to top, #000004, #3b0f70, #8c2981, #de4968, #fcfdbf)",
  plasma:
    "linear-gradient(to top, #0d0887, #6a00a8, #b12a90, #e16462, #f0f921)",
  rdbu: "linear-gradient(to top, #2166ac, #67a9cf, #f7f7f7, #ef8a62, #b2182b)",
};

interface FieldMeta {
  name: string;
  unit: string;
  cmap: string;
  range: (vMax: number, rMax: number) => [number, number];
  description: string;
}

const FIELDS: Record<ScientificField, FieldMeta> = {
  speed: {
    name: "|V|",
    unit: "m/s",
    cmap: "viridis",
    range: (v) => [0, v],
    description:
      "Wind speed magnitude. Bright regions mark the vortex core and near-surface inflow jet where air accelerates toward the axis.",
  },
  vtheta: {
    name: "V_θ",
    unit: "m/s",
    cmap: "rdbu",
    range: (v) => [-v / 2, v / 2],
    description:
      "Tangential (swirl) velocity. Red = counter-clockwise rotation, blue = clockwise. The Rankine-like peak at the core radius drives the pressure deficit.",
  },
  vradial: {
    name: "V_r",
    unit: "m/s",
    cmap: "rdbu",
    range: (v) => [-v / 4, v / 4],
    description:
      "Radial velocity relative to the vortex axis. Blue = inflow converging toward the core, red = outflow. Strong inflow at low levels feeds the updraft.",
  },
  vz: {
    name: "V_z",
    unit: "m/s",
    cmap: "rdbu",
    range: (v) => [-v * 0.4, v * 0.4],
    description:
      "Vertical velocity. Red = updraft (air rising in the core), blue = downdraft. A two-cell vortex shows a central downdraft surrounded by an annular updraft.",
  },
  pressure: {
    name: "ΔP",
    unit: "m²/s²",
    cmap: "rdbu",
    range: (v) => [-(v * v) / 4, (v * v) / 4],
    description:
      "Pressure deviation from ambient (kinematic). The deep blue minimum at the axis is the cyclostrophic deficit that balances centrifugal force in the core.",
  },
  vorticity: {
    name: "|ω|",
    unit: "s⁻¹",
    cmap: "magma",
    range: (v, r) => [0, (v / Math.max(r, 1)) * 4],
    description:
      "Vorticity magnitude (curl of velocity). Highlights the concentrated vortex tube and any secondary sub-vortices orbiting the main axis.",
  },
  cloud: {
    name: "ρ_c",
    unit: "kg/m³",
    cmap: "plasma",
    range: () => [0, 5e-4],
    description:
      "Cloud water density. Condensation forms above the lifting condensation level (LCL) where moist air cools adiabatically. Brighter = denser visible funnel.",
  },
  temperature: {
    name: "T'",
    unit: "K",
    cmap: "rdbu",
    range: () => [-10, 10],
    description:
      "Temperature deviation from the dry-adiabatic profile, linearised: ΔT ≈ T₀·(R/cp)·ΔP/P₀. Blue cold spot at the vortex axis = adiabatic cooling driven by the pressure deficit. Red = warm regions (rare in the core).",
  },
};

function fmtVal(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

/**
 * HTML overlay showing the active colormap, field name, physical units,
 * and min/max labels. Visible only in scientific mode.
 */
export function Colorbar() {
  const viewMode = useAppStore((s) => s.viewMode);
  const field = useAppStore((s) => s.field);
  const params = useAppStore((s) => s.params);
  const fieldScale = useAppStore((s) => s.fieldScale);

  if (viewMode !== "scientific") return null;

  const meta = FIELDS[field];
  const scale = fieldScale[field] ?? 1.0;
  const [loBase, hiBase] = meta.range(params.Vmax, params.Rmax);
  const lo = loBase * scale;
  const hi = hiBase * scale;
  const gradient = CMAP_CSS[meta.cmap] ?? CMAP_CSS.viridis;

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 60,
        display: "flex",
        gap: 6,
        alignItems: "stretch",
        zIndex: 10,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {/* Labels column */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "flex-end",
          fontSize: 10,
          color: "var(--text-dim, #999)",
          lineHeight: 1,
          padding: "2px 0",
        }}
      >
        <span>{fmtVal(hi)}</span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-h, #eee)",
            fontWeight: 600,
          }}
        >
          {meta.name}
        </span>
        <span>{fmtVal(lo)}</span>
      </div>

      {/* Gradient bar */}
      <div
        style={{
          width: 14,
          height: 140,
          borderRadius: 3,
          background: gradient,
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      />

      {/* Unit label */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          fontSize: 9,
          color: "var(--text-dim, #888)",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          letterSpacing: 0.5,
        }}
      >
        {meta.unit}
      </div>

      {/* Field description */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          width: 200,
          fontSize: 10,
          lineHeight: 1.4,
          color: "var(--text-dim, #999)",
          background: "rgba(10, 12, 16, 0.75)",
          borderRadius: 4,
          padding: "6px 8px",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {meta.description}
      </div>
    </div>
  );
}
