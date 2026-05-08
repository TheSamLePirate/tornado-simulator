import { type ReactNode, useState } from 'react'
import { SCENE_PRESETS } from '../presets/scenePresets'
import { type ScientificField, useAppStore } from '../state/store'
import { useCompactViewport } from './useMediaQuery'

const FIELD_OPTIONS: Array<{ id: ScientificField; label: string; mobileLabel: string }> = [
  { id: 'speed', label: '|V|', mobileLabel: 'Vitesse |V|' },
  { id: 'vtheta', label: 'V_θ', mobileLabel: 'Rotation V_θ' },
  { id: 'vradial', label: 'V_r', mobileLabel: 'Afflux V_r' },
  { id: 'vz', label: 'V_z', mobileLabel: 'Ascendance V_z' },
  { id: 'pressure', label: 'ΔP', mobileLabel: 'Pression ΔP' },
  { id: 'vorticity', label: '|ω|', mobileLabel: 'Vorticité |ω|' },
  { id: 'cloud', label: 'nuage', mobileLabel: 'Eau nuageuse' },
  { id: 'temperature', label: "T'", mobileLabel: "Température T'" },
]

type ToggleKey =
  | 'showIso'
  | 'showGlyphs'
  | 'showStreamlines'
  | 'showContours'
  | 'showLIC'
  | 'magnitudeFadeAlpha'
  | 'showVortVolume'

const LAYER_OPTIONS: Array<{ key: ToggleKey; label: string }> = [
  { key: 'showIso', label: 'Iso' },
  { key: 'showGlyphs', label: 'Flèches' },
  { key: 'showStreamlines', label: 'Lignes' },
  { key: 'showContours', label: 'Contours' },
  { key: 'showLIC', label: 'LIC' },
  { key: 'magnitudeFadeAlpha', label: 'Fondu' },
  { key: 'showVortVolume', label: 'Vol-ω' },
]

const DOC_URL =
  'https://github.com/TheSamLePirate/tornado-simulator/blob/main/docs/tornado-explainer.fr.md'

function SliderControl({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  mobile = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  mobile?: boolean
}) {
  return (
    <label className={mobile ? 'mobile-slider' : 'topbar-slider'}>
      <span className={mobile ? 'mobile-slider__label' : 'topbar-slider__label'}>{label}</span>
      <input
        className={mobile ? 'mobile-slider__input' : 'topbar-slider__input'}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
      <span className={mobile ? 'mobile-slider__value' : 'topbar-slider__value'}>
        {value.toFixed(2)}
      </span>
    </label>
  )
}

export function TopBar() {
  return useCompactViewport() ? <MobileTopBar /> : <DesktopTopBar />
}

function DesktopTopBar() {
  const {
    viewMode,
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
  } = useAppStore()

  const togglers: Record<ToggleKey, (v: boolean) => void> = {
    showIso: setShowIso,
    showGlyphs: setShowGlyphs,
    showStreamlines: setShowStreamlines,
    showContours: setShowContours,
    showLIC: setShowLIC,
    magnitudeFadeAlpha: setMagnitudeFadeAlpha,
    showVortVolume: setShowVortVolume,
  }
  const toggleState: Record<ToggleKey, boolean> = {
    showIso,
    showGlyphs,
    showStreamlines,
    showContours,
    showLIC,
    magnitudeFadeAlpha,
    showVortVolume,
  }
  const activeFieldLabel = FIELD_OPTIONS.find((o) => o.id === field)?.label ?? ''

  return (
    <div className="panel topbar">
      <div className="topbar-main-row">
        {viewMode === 'scientific' && (
          <>
            <fieldset className="topbar-chip-group topbar-desktop-fields">
              <legend className="sr-only">Champ scientifique</legend>
              {FIELD_OPTIONS.map((o) => (
                <button
                  className="topbar-chip topbar-chip--field"
                  data-active={field === o.id}
                  key={o.id}
                  onClick={() => setField(o.id)}
                  type="button"
                >
                  {o.label}
                </button>
              ))}
            </fieldset>

            <div className="topbar-divider" />
            <LayerToggles togglers={togglers} toggleState={toggleState} variant="desktop" />
          </>
        )}

        <div className="topbar-actions">
          <button
            className="topbar-button topbar-button--pause"
            onClick={() => setPaused(!paused)}
            title={paused ? 'Reprendre' : 'Pause'}
            type="button"
          >
            {paused ? '▶ Reprendre' : '❚❚ Pause'}
          </button>
          <ReseedButton />
          <PresetSelector />
          <DocLink />
        </div>
      </div>

      {viewMode === 'scientific' && (
        <div className="topbar-detail">
          <div className="topbar-slider-row">
            <SliderControl label="XZ" value={sliceXZ} onChange={setSliceXZ} />
            <SliderControl label="XY" value={sliceXY} onChange={setSliceXY} />
            <SliderControl
              label={`${activeFieldLabel} ×`}
              value={fieldScale[field] ?? 1.0}
              onChange={(v) => setFieldScale(field, v)}
              min={0.1}
              max={3.0}
              step={0.05}
            />
            {showIso && (
              <>
                <SliderControl label="ω iso" value={isoValue} onChange={setIsoValue} />
                <SliderControl
                  label="coques"
                  value={isoShellCount}
                  onChange={(v) => setIsoShellCount(Math.round(v))}
                  min={1}
                  max={4}
                  step={1}
                />
                <SliderControl
                  label="écart"
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
                label="bandes"
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
                label="fondu"
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
        </div>
      )}
    </div>
  )
}

function MobileTopBar() {
  const [open, setOpen] = useState(false)
  const {
    viewMode,
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
  } = useAppStore()

  const togglers: Record<ToggleKey, (v: boolean) => void> = {
    showIso: setShowIso,
    showGlyphs: setShowGlyphs,
    showStreamlines: setShowStreamlines,
    showContours: setShowContours,
    showLIC: setShowLIC,
    magnitudeFadeAlpha: setMagnitudeFadeAlpha,
    showVortVolume: setShowVortVolume,
  }
  const toggleState: Record<ToggleKey, boolean> = {
    showIso,
    showGlyphs,
    showStreamlines,
    showContours,
    showLIC,
    magnitudeFadeAlpha,
    showVortVolume,
  }
  const activeFieldLabel = FIELD_OPTIONS.find((o) => o.id === field)?.label ?? ''
  const scientific = viewMode === 'scientific'

  return (
    <section className="panel mobile-panel" data-open={open} aria-label="Commandes du simulateur">
      <div className="mobile-panel__handle" aria-hidden />

      <div className="mobile-panel__summary">
        {scientific && (
          <label className="mobile-select-label mobile-select-label--field">
            <span>Champ</span>
            <select
              className="mobile-select"
              value={field}
              onChange={(e) => setField(e.target.value as ScientificField)}
            >
              {FIELD_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.mobileLabel}
                </option>
              ))}
            </select>
          </label>
        )}

        <PresetSelector mobile />

        <div className="mobile-panel__quick-actions">
          <ReseedButton mobile />
          <DocLink mobile />

          <button
            aria-controls="mobile-panel-body"
            aria-expanded={open}
            className="mobile-panel__toggle"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? 'Fermer' : 'Options'}
          </button>
        </div>
      </div>

      {open && (
        <div className="mobile-panel__body" id="mobile-panel-body">
          {scientific && (
            <>
              <MobileSection title="Couches">
                <LayerToggles togglers={togglers} toggleState={toggleState} variant="mobile" />
              </MobileSection>

              <MobileSection title="Coupes et contraste">
                <SliderControl label="XZ" value={sliceXZ} onChange={setSliceXZ} mobile />
                <SliderControl label="XY" value={sliceXY} onChange={setSliceXY} mobile />
                <SliderControl
                  label={`${activeFieldLabel} ×`}
                  value={fieldScale[field] ?? 1.0}
                  onChange={(v) => setFieldScale(field, v)}
                  min={0.1}
                  max={3.0}
                  step={0.05}
                  mobile
                />
              </MobileSection>

              {showIso && (
                <MobileSection title="Iso-surfaces">
                  <SliderControl label="ω iso" value={isoValue} onChange={setIsoValue} mobile />
                  <SliderControl
                    label="coques"
                    value={isoShellCount}
                    onChange={(v) => setIsoShellCount(Math.round(v))}
                    min={1}
                    max={4}
                    step={1}
                    mobile
                  />
                  <SliderControl
                    label="écart"
                    value={isoShellSpread}
                    onChange={setIsoShellSpread}
                    min={0}
                    max={0.4}
                    step={0.01}
                    mobile
                  />
                </MobileSection>
              )}

              {(showContours || showLIC || magnitudeFadeAlpha || showVortVolume) && (
                <MobileSection title="Réglages actifs">
                  {showContours && (
                    <SliderControl
                      label="bandes"
                      value={contourCount}
                      onChange={(v) => setContourCount(Math.round(v))}
                      min={3}
                      max={12}
                      step={1}
                      mobile
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
                      mobile
                    />
                  )}
                  {magnitudeFadeAlpha && (
                    <SliderControl
                      label="fondu"
                      value={fadeFloor}
                      onChange={setFadeFloor}
                      min={0}
                      max={0.3}
                      step={0.01}
                      mobile
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
                      mobile
                    />
                  )}
                </MobileSection>
              )}
            </>
          )}

          <MobileSection title="Scène">
            <div className="mobile-action-grid">
              <button className="mobile-action" onClick={() => setPaused(!paused)} type="button">
                {paused ? '▶ Reprendre' : '❚❚ Pause'}
              </button>
            </div>
          </MobileSection>
        </div>
      )}
    </section>
  )
}

function MobileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mobile-section">
      <h2>{title}</h2>
      <div className="mobile-section__content">{children}</div>
    </section>
  )
}

function LayerToggles({
  togglers,
  toggleState,
  variant,
}: {
  togglers: Record<ToggleKey, (v: boolean) => void>
  toggleState: Record<ToggleKey, boolean>
  variant: 'desktop' | 'mobile'
}) {
  return (
    <fieldset className={variant === 'mobile' ? 'mobile-chip-grid' : 'topbar-chip-group'}>
      <legend className="sr-only">Couches scientifiques</legend>
      {LAYER_OPTIONS.map((o) => {
        const active = toggleState[o.key]
        return (
          <button
            className={variant === 'mobile' ? 'mobile-chip' : 'topbar-chip topbar-chip--layer'}
            data-active={active}
            key={o.key}
            onClick={() => togglers[o.key](!active)}
            type="button"
          >
            <span aria-hidden>{active ? '●' : '○'}</span> {o.label}
          </button>
        )
      })}
    </fieldset>
  )
}

function DocLink({ mobile = false }: { mobile?: boolean }) {
  return (
    <a
      className={mobile ? 'mobile-action doc-link' : 'topbar-button doc-link'}
      href={DOC_URL}
      rel="noreferrer"
      target="_blank"
      title="Ouvrir la documentation"
    >
      📘 Doc
    </a>
  )
}

function ReseedButton({ mobile = false }: { mobile?: boolean }) {
  const solver = useAppStore((s) => s.solver)
  const params = useAppStore((s) => s.params)
  return (
    <button
      className={mobile ? 'mobile-action' : 'topbar-button topbar-reseed'}
      onClick={() => {
        // Mark as not initialised so SolverDriver re-runs makeInitVortex.
        ;(solver as unknown as { hasInitialised: boolean }).hasInitialised = false
        solver.syncParams(params, 0.0)
      }}
      title="Réinitialiser l’état initial Burgers-Rott avec les paramètres actuels"
      type="button"
    >
      ↻ Réinit.
    </button>
  )
}

/**
 * Dropdown that snaps the scene to one of the predefined presets used by
 * the doc illustrations. Each option matches a PNG in `docs/illustrations/`.
 */
function PresetSelector({ mobile = false }: { mobile?: boolean }) {
  const applyPreset = useAppStore((s) => s.applyPreset)
  const appliedPreset = useAppStore((s) => s.appliedPreset)
  return (
    <select
      className={
        mobile ? 'mobile-select mobile-preset-select' : 'topbar-select topbar-preset-select'
      }
      value={appliedPreset?.id ?? ''}
      onChange={(e) => {
        const id = e.target.value
        if (id) applyPreset(id)
      }}
      aria-label="Préréglage"
      title="Appliquer un préréglage d’illustration"
    >
      <option value="">📷 Préréglage…</option>
      {SCENE_PRESETS.map((p) => (
        <option key={p.id} value={p.id} title={p.description}>
          {p.label}
        </option>
      ))}
    </select>
  )
}
