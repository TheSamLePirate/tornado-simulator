import { useAppStore } from "../state/store";
import { msToMph, paToHpa, kToC } from "../utils/units";
import { efFromVmax, EF_COLORS } from "../utils/ef-rating";
import { rhoAir, zLCL } from "../sim/params";
import { useFps } from "./useFps";

export function HUD() {
  const params = useAppStore((s) => s.params);
  const measured = useAppStore((s) => s.measured);
  const ef = efFromVmax(params.Vmax);
  const efColor = EF_COLORS[ef.tier];
  const fps = useFps(500);

  // ── Analytic diagnostics (target / expected values) ──
  const rho = rhoAir(params.T0, params.P0); // kg/m³
  const dPminPaTarget = -rho * params.Vmax * params.Vmax; // cyclostrophic
  const dPminHpaTarget = paToHpa(dPminPaTarget);
  const omegaMaxAnalytic = (2 * params.Vmax) / Math.max(params.Rmax, 1); // 1/s
  const zLclMeters = zLCL(params.T0, params.RH);
  const isTwoCell = params.swirlRatio >= 0.6; // Davies-Jones threshold
  const tDewC = kToC(params.T0) - (1 - params.RH) * (kToC(params.T0) / 5);

  // ── Measured values from GPU readback ──
  // measured.minPressure is kinematic (m²/s²) referenced to the upper-corner
  // ambient sample — convert to Pa via ρ·ΔP_kin to compare with target.
  const dPminPaMeasured = rho * measured.minPressure;
  const dPminHpaMeasured = paToHpa(dPminPaMeasured);
  const measuredFresh = measured.freshnessMs < 2000; // <2s stale = fresh
  const ratioV = pctOf(measured.maxVmag, params.Vmax);
  const ratioOmega = pctOf(measured.maxVorticity, omegaMaxAnalytic);
  const ratioP = pctOf(dPminHpaMeasured, dPminHpaTarget);

  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        padding: 12,
        minWidth: 230,
        zIndex: 9,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: efColor,
            color: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 18,
            fontFamily: "var(--mono)",
          }}
        >
          EF{ef.tier}
        </div>
        <div>
          <div
            className="mono"
            style={{ color: "var(--text-h)", fontSize: 14 }}
          >
            V<sub>max</sub> = {params.Vmax.toFixed(0)} m/s
          </div>
          <div className="mono dim">
            {msToMph(params.Vmax).toFixed(0)} mph · {ef.label}
          </div>
        </div>
      </div>

      <Separator />
      <div className="mono dim" style={{ display: "grid", gap: 2 }}>
        <Row k="R_max" v={`${params.Rmax} m`} />
        <Row k="Swirl S" v={params.swirlRatio.toFixed(2)} />
        <Row k="V_in" v={`${params.inflow.toFixed(1)} m/s`} />
        <Row k="z₀" v={`${params.z0.toFixed(3)} m`} />
        <Row
          k="T / RH"
          v={`${kToC(params.T0).toFixed(1)}°C · ${(params.RH * 100).toFixed(0)}%`}
        />
      </div>

      <Separator />
      <div
        className="mono dim"
        style={{
          display: "grid",
          gap: 2,
          fontSize: 11,
        }}
      >
        <SectionLabel>Validation — measured vs target</SectionLabel>
        <ValidationRow
          k="|V|_max"
          measured={`${measured.maxVmag.toFixed(0)} m/s`}
          target={`${params.Vmax.toFixed(0)}`}
          ratio={ratioV}
          fresh={measuredFresh}
          hint="Max velocity magnitude across the domain"
        />
        <ValidationRow
          k="ΔP core"
          measured={`${dPminHpaMeasured.toFixed(1)} hPa`}
          target={`${dPminHpaTarget.toFixed(1)}`}
          ratio={ratioP}
          fresh={measuredFresh}
          hint={`Target ≈ −ρ·V_max² (= ${dPminPaTarget.toFixed(0)} Pa)`}
        />
        <ValidationRow
          k="|ω|_max"
          measured={`${measured.maxVorticity.toFixed(2)} /s`}
          target={`${omegaMaxAnalytic.toFixed(2)}`}
          ratio={ratioOmega}
          fresh={measuredFresh}
          hint="Target ≈ 2·V_max/R_max (Burgers-Rott)"
        />
      </div>

      <Separator />
      <div
        className="mono dim"
        style={{
          display: "grid",
          gap: 2,
          fontSize: 11,
        }}
      >
        <SectionLabel>Diagnostics (analytic)</SectionLabel>
        <Row
          k="LCL"
          v={`${zLclMeters.toFixed(0)} m`}
          hint={`Cloud base; T_dew ≈ ${tDewC.toFixed(1)}°C`}
        />
        <Row
          k="Cell mode"
          v={isTwoCell ? "two-cell" : "single-cell"}
          hint="S ≥ 0.6 → axial downdraft (Davies-Jones)"
          accent={isTwoCell ? "#5fd58a" : undefined}
        />
        <Row
          k="ρ_air"
          v={`${rho.toFixed(3)} kg/m³`}
          hint="Ideal gas at surface T₀, P₀"
        />
      </div>

      <Separator />
      <div className="mono dim" style={{ display: "grid", gap: 2 }}>
        <SectionLabel>Performance</SectionLabel>
        <Row
          k="FPS"
          v={`${fps.toFixed(0)}`}
          accent={fps >= 50 ? "#5fd58a" : fps >= 25 ? "#e8b868" : "#ff8b6b"}
        />
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  hint,
  accent,
}: {
  k: string;
  v: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div
      style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      title={hint}
    >
      <span>{k}</span>
      <span style={{ color: accent ?? "var(--text)" }}>{v}</span>
    </div>
  );
}

function Separator() {
  return (
    <hr
      style={{
        border: 0,
        borderTop: "1px solid var(--panel-border)",
        margin: "10px 0",
      }}
    />
  );
}

/**
 * Validation row showing a measured value next to a target, with a colored
 * ratio chip. Green if within ~15% of target, amber within ~40%, red beyond.
 */
function ValidationRow({
  k,
  measured,
  target,
  ratio,
  fresh,
  hint,
}: {
  k: string;
  measured: string;
  target: string;
  ratio: number;
  fresh: boolean;
  hint?: string;
}) {
  const dist = Math.abs(ratio - 1);
  const accent = dist < 0.15 ? "#5fd58a" : dist < 0.4 ? "#e8b868" : "#ff8b6b";
  const opacity = fresh ? 1 : 0.45;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        opacity,
      }}
      title={hint}
    >
      <span>{k}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ color: "var(--text)" }}>{measured}</span>
        <span style={{ color: "var(--text-dim)", fontSize: 10 }}>
          / {target}
        </span>
        <span
          style={{
            background: accent,
            color: "#000",
            padding: "0 4px",
            borderRadius: 3,
            fontSize: 9,
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {(ratio * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function pctOf(measured: number, target: number): number {
  if (Math.abs(target) < 1e-9) return 0;
  return measured / target;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: "var(--text-dim)",
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}
