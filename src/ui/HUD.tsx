import { rhoAir } from "../sim/params";
import { useAppStore } from "../state/store";
import { EF_COLORS, efFromVmax } from "../utils/ef-rating";
import { msToKmh, paToHpa } from "../utils/units";
import { useFps } from "./useFps";
import { useCompactViewport } from "./useMediaQuery";

export function HUD() {
  const params = useAppStore((s) => s.params);
  const measured = useAppStore((s) => s.measured);
  const fps = useFps(500);
  const compact = useCompactViewport();

  // The detail panel now shows only values coming from the running simulation
  // readback. No analytic targets, no input parameters, no target-vs-measured
  // comparisons.
  const measuredFresh = measured.freshnessMs < 2000;
  const vmax = measured.maxVmag;
  const ef = efFromVmax(vmax);
  const efColor = EF_COLORS[ef.tier];
  const rho = rhoAir(params.T0, params.P0);
  const dPminPaMeasured = rho * measured.minPressure;
  const dPminHpaMeasured = paToHpa(dPminPaMeasured);

  if (compact) {
    return (
      <CompactHUD
        efTier={ef.tier}
        efLabel={ef.label}
        efColor={efColor}
        vmax={vmax}
        fps={fps}
        fresh={measuredFresh}
      />
    );
  }

  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        padding: 12,
        minWidth: 250,
        zIndex: 9,
        fontSize: 12,
        opacity: measuredFresh ? 1 : 0.62,
      }}
      title={
        measuredFresh
          ? "Données de simulation à jour"
          : "Données de simulation en attente"
      }
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
            Simulation en direct
          </div>
          <div className="mono dim">
            {measuredFresh ? "mesures GPU" : "mesures en attente"} · {ef.label}
          </div>
        </div>
      </div>

      <Separator />
      <div className="mono dim" style={{ display: "grid", gap: 4 }}>
        <SectionLabel>Valeurs réelles simulées</SectionLabel>
        <Row
          k="|V|max"
          v={`${vmax.toFixed(1)} m/s`}
          hint="Vitesse maximale mesurée sur le GPU"
        />
        <Row
          k="Vent"
          v={`${msToKmh(vmax).toFixed(0)} km/h`}
          hint="Conversion de |V|max"
        />
        <Row
          k="ΔP min"
          v={`${dPminHpaMeasured.toFixed(1)} hPa`}
          hint={`Pression simulée minimale : ${measured.minPressure.toFixed(1)} m²/s²`}
        />
        <Row
          k="|ω|max"
          v={`${measured.maxVorticity.toFixed(2)} s⁻¹`}
          hint="Vorticité maximale mesurée sur le GPU"
        />
        <Row
          k="Âge données"
          v={
            measuredFresh
              ? `${measured.freshnessMs.toFixed(0)} ms`
              : "en attente"
          }
          accent={measuredFresh ? "#5fd58a" : "#e8b868"}
          hint="Temps depuis la dernière lecture GPU réussie"
        />
      </div>

      <Separator />
      <div className="mono dim" style={{ display: "grid", gap: 2 }}>
        <SectionLabel>Performances</SectionLabel>
        <Row
          k="IPS"
          v={`${fps.toFixed(0)}`}
          accent={fps >= 50 ? "#5fd58a" : fps >= 25 ? "#e8b868" : "#ff8b6b"}
        />
      </div>
    </div>
  );
}

function CompactHUD({
  efTier,
  efLabel,
  efColor,
  vmax,
  fps,
  fresh,
}: {
  efTier: number;
  efLabel: string;
  efColor: string;
  vmax: number;
  fps: number;
  fresh: boolean;
}) {
  return (
    <div
      className="panel mobile-hud"
      aria-label="Résumé de l’intensité simulée"
      role="status"
      style={{ opacity: fresh ? 1 : 0.62 }}
    >
      <div
        className="mobile-hud__ef"
        style={{ background: efColor }}
        title={`Échelle de Fujita améliorée : EF${efTier} · ${efLabel}`}
      >
        EF{efTier}
      </div>
      <div className="mobile-hud__metrics">
        <div className="mono mobile-hud__primary">{vmax.toFixed(1)} m/s</div>
        <div className="mono dim mobile-hud__secondary">
          {msToKmh(vmax).toFixed(0)} km/h · {fps.toFixed(0)} ips
        </div>
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
