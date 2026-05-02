import {
  useAppStore,
  type ScientificField,
  type ViewMode,
} from "../state/store";
import { SCENE_PRESETS } from "../presets/scenePresets";

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: "realistic", label: "Realistic" },
  { id: "scientific", label: "Scientific" },
];

const FIELD_OPTIONS: Array<{ id: ScientificField; label: string }> = [
  { id: "speed", label: "|V|" },
  { id: "vtheta", label: "V_θ" },
  { id: "vradial", label: "V_r" },
  { id: "vz", label: "V_z" },
  { id: "pressure", label: "ΔP" },
  { id: "vorticity", label: "|ω|" },
  { id: "cloud", label: "cloud" },
  { id: "temperature", label: "T'" },
];

type ToggleKey =
  | "showIso"
  | "showGlyphs"
  | "showStreamlines"
  | "showContours"
  | "showLIC"
  | "magnitudeFadeAlpha"
  | "showVortVolume";

const LAYER_OPTIONS: Array<{ key: ToggleKey; label: string }> = [
  { key: "showIso", label: "Iso" },
  { key: "showGlyphs", label: "Arrows" },
  { key: "showStreamlines", label: "Lines" },
  { key: "showContours", label: "Contour" },
  { key: "showLIC", label: "LIC" },
  { key: "magnitudeFadeAlpha", label: "Fade" },
  { key: "showVortVolume", label: "Vol-ω" },
];

function SliderControl({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--text-dim)",
      }}
    >
      <span style={{ minWidth: 30 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: 72, accentColor: "var(--accent-2, #6cd4ff)" }}
      />
      <span
        style={{
          minWidth: 32,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value.toFixed(2)}
      </span>
    </label>
  );
}

export function TopBar() {
  const {
    viewMode,
    setViewMode,
    field,
    setField,
    paused,
    setPaused,
    showIso,
    setShowIso,
    showGlyphs,
    setShowGlyphs,
    showStreamlines,
    setShowStreamlines,
    sliceXZ,
    setSliceXZ,
    sliceXY,
    setSliceXY,
    isoValue,
    setIsoValue,
    fieldScale,
    setFieldScale,
    showContours,
    setShowContours,
    contourCount,
    setContourCount,
    showLIC,
    setShowLIC,
    licStrength,
    setLicStrength,
    magnitudeFadeAlpha,
    setMagnitudeFadeAlpha,
    fadeFloor,
    setFadeFloor,
    isoShellCount,
    setIsoShellCount,
    isoShellSpread,
    setIsoShellSpread,
    showVortVolume,
    setShowVortVolume,
    vortVolumeDensity,
    setVortVolumeDensity,
  } = useAppStore();

  const togglers: Record<string, (v: boolean) => void> = {
    showIso: setShowIso,
    showGlyphs: setShowGlyphs,
    showStreamlines: setShowStreamlines,
    showContours: setShowContours,
    showLIC: setShowLIC,
    magnitudeFadeAlpha: setMagnitudeFadeAlpha,
    showVortVolume: setShowVortVolume,
  };
  const toggleState: Record<string, boolean> = {
    showIso,
    showGlyphs,
    showStreamlines,
    showContours,
    showLIC,
    magnitudeFadeAlpha,
    showVortVolume,
  };

  return (
    <div
      className="panel"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        zIndex: 10,
      }}
    >
      {/* Row 1: view mode + field + layer toggles + pause */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {VIEW_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setViewMode(o.id)}
              style={{
                background:
                  viewMode === o.id ? "rgba(255,179,71,0.18)" : undefined,
                borderColor:
                  viewMode === o.id ? "var(--accent)" : "var(--panel-border)",
                color: viewMode === o.id ? "var(--text-h)" : "var(--text)",
                fontSize: 12,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {viewMode === "scientific" && (
          <>
            <div style={{ display: "flex", gap: 2 }}>
              {FIELD_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setField(o.id)}
                  style={{
                    background:
                      field === o.id ? "rgba(108,212,255,0.18)" : undefined,
                    borderColor:
                      field === o.id
                        ? "var(--accent-2)"
                        : "var(--panel-border)",
                    color: field === o.id ? "var(--text-h)" : "var(--text-dim)",
                    fontSize: 11,
                    padding: "4px 7px",
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div
              style={{
                width: 1,
                height: 18,
                background: "var(--panel-border)",
              }}
            />

            <div style={{ display: "flex", gap: 2 }}>
              {LAYER_OPTIONS.map((o) => {
                const active = toggleState[o.key];
                return (
                  <button
                    key={o.key}
                    onClick={() => togglers[o.key](!active)}
                    style={{
                      background: active ? "rgba(120,220,160,0.18)" : undefined,
                      borderColor: active ? "#5fd58a" : "var(--panel-border)",
                      color: active ? "var(--text-h)" : "var(--text-dim)",
                      fontSize: 11,
                      padding: "4px 7px",
                    }}
                  >
                    {active ? "● " : "○ "}
                    {o.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ marginLeft: 6, display: "flex", gap: 4 }}>
          <button
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume" : "Pause"}
            style={{ fontSize: 12, minWidth: 64 }}
          >
            {paused ? "▶ Resume" : "❚❚ Pause"}
          </button>
          <ReseedButton />
          <PresetSelector />
        </div>
      </div>

      {/* Row 2: sliders (scientific mode only) */}
      {viewMode === "scientific" && (
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <SliderControl label="XZ" value={sliceXZ} onChange={setSliceXZ} />
          <SliderControl label="XY" value={sliceXY} onChange={setSliceXY} />
          <SliderControl
            label={`${FIELD_OPTIONS.find((o) => o.id === field)?.label ?? ""} ×`}
            value={fieldScale[field] ?? 1.0}
            onChange={(v) => setFieldScale(field, v)}
            min={0.1}
            max={3.0}
            step={0.05}
          />
          {showIso && (
            <>
              <SliderControl
                label="ω iso"
                value={isoValue}
                onChange={setIsoValue}
              />
              <SliderControl
                label="shells"
                value={isoShellCount}
                onChange={(v) => setIsoShellCount(Math.round(v))}
                min={1}
                max={4}
                step={1}
              />
              <SliderControl
                label="spread"
                value={isoShellSpread}
                onChange={setIsoShellSpread}
                min={0}
                max={0.4}
                step={0.01}
              />
            </>
          )}
          {showContours && (
            <SliderControl
              label="bands"
              value={contourCount}
              onChange={(v) => setContourCount(Math.round(v))}
              min={3}
              max={12}
              step={1}
            />
          )}
          {showLIC && (
            <SliderControl
              label="LIC"
              value={licStrength}
              onChange={setLicStrength}
              min={0}
              max={1}
              step={0.05}
            />
          )}
          {magnitudeFadeAlpha && (
            <SliderControl
              label="fade"
              value={fadeFloor}
              onChange={setFadeFloor}
              min={0}
              max={0.3}
              step={0.01}
            />
          )}
          {showVortVolume && (
            <SliderControl
              label="vol-ω"
              value={vortVolumeDensity}
              onChange={setVortVolumeDensity}
              min={0}
              max={1.5}
              step={0.05}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ReseedButton() {
  const solver = useAppStore((s) => s.solver);
  const params = useAppStore((s) => s.params);
  return (
    <button
      onClick={() => {
        // Mark as not initialised so SolverDriver re-runs makeInitVortex
        (solver as unknown as { hasInitialised: boolean }).hasInitialised =
          false;
        solver.syncParams(params, 0.0);
      }}
      title="Re-seed Burgers-Rott IC with current params"
      style={{ fontSize: 12 }}
    >
      ↻ Re-seed
    </button>
  );
}

/**
 * Dropdown that snaps the scene to one of the predefined presets used by
 * the doc illustrations. Each option matches a PNG in `docs/illustrations/`.
 */
function PresetSelector() {
  const applyPreset = useAppStore((s) => s.applyPreset);
  const appliedPreset = useAppStore((s) => s.appliedPreset);
  return (
    <select
      value={appliedPreset?.id ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        if (id) applyPreset(id);
      }}
      title="Apply a doc-illustration preset"
      style={{
        fontSize: 11,
        background: "rgba(108,212,255,0.10)",
        borderColor: "var(--accent-2, #6cd4ff)",
        color: "var(--text)",
        padding: "3px 6px",
        maxWidth: 180,
      }}
    >
      <option value="">📷 Doc preset…</option>
      {SCENE_PRESETS.map((p) => (
        <option key={p.id} value={p.id} title={p.description}>
          {p.label}
        </option>
      ))}
    </select>
  );
}
