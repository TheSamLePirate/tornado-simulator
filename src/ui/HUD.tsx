import { useAppStore } from "../state/store";
import { msToMph } from "../utils/units";
import { efFromVmax, EF_COLORS } from "../utils/ef-rating";

export function HUD() {
  const params = useAppStore((s) => s.params);
  const ef = efFromVmax(params.Vmax);
  const efColor = EF_COLORS[ef.tier];

  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        padding: 12,
        minWidth: 200,
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
      <hr
        style={{
          border: 0,
          borderTop: "1px solid var(--panel-border)",
          margin: "10px 0",
        }}
      />
      <div className="mono dim" style={{ display: "grid", gap: 2 }}>
        <Row k="R_max" v={`${params.Rmax} m`} />
        <Row k="Swirl S" v={params.swirlRatio.toFixed(2)} />
        <Row k="V_in" v={`${params.inflow.toFixed(1)} m/s`} />
        <Row k="z₀" v={`${params.z0.toFixed(3)} m`} />
        <Row
          k="T / RH"
          v={`${(params.T0 - 273.15).toFixed(1)}°C · ${(params.RH * 100).toFixed(0)}%`}
        />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{k}</span>
      <span style={{ color: "var(--text)" }}>{v}</span>
    </div>
  );
}
