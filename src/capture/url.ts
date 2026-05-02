/**
 * URL-driven state injection for the simulator.
 *
 * Lets external tools (the Playwright capture script in particular) drive
 * the running app by encoding sim parameters, view config, and camera
 * orientation as query string params on the page URL.
 *
 * Every recognised key writes to the zustand store via the existing setter
 * paths — no new mutation surface is introduced.
 *
 * Capture-specific keys (capture, w, h, settle, dpr, cameraAz/Elev/Dist)
 * do NOT live in the store; they're exposed via the `captureConfig` export
 * so a small set of components can read them at mount time.
 */

import {
  useAppStore,
  type ScientificField,
  type ViewMode,
} from "../state/store";
import type { SimParams } from "../sim/params";

const FIELDS: readonly ScientificField[] = [
  "speed",
  "vtheta",
  "vradial",
  "vz",
  "pressure",
  "vorticity",
  "cloud",
];

const VIEW_MODES: readonly ViewMode[] = ["realistic", "scientific"];

interface CaptureConfig {
  capture: boolean;
  width: number;
  height: number;
  dpr: number;
  settleFrames: number;
  cameraAz: number | null;
  cameraElev: number | null;
  cameraDist: number | null;
}

const DEFAULT_CAPTURE: CaptureConfig = {
  capture: false,
  width: 1280,
  height: 720,
  dpr: 1,
  settleFrames: 240,
  cameraAz: null,
  cameraElev: null,
  cameraDist: null,
};

/** Computed once at module load so all readers see the same values. */
export const captureConfig: CaptureConfig = parseCaptureConfig();

function parseCaptureConfig(): CaptureConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CAPTURE };
  const q = new URLSearchParams(window.location.search);
  const num = (k: string): number | null => {
    const raw = q.get(k);
    if (raw === null) return null;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };
  return {
    capture: q.get("capture") === "1",
    width: num("w") ?? DEFAULT_CAPTURE.width,
    height: num("h") ?? DEFAULT_CAPTURE.height,
    dpr: num("dpr") ?? (q.get("capture") === "1" ? 2 : 1),
    settleFrames: num("settle") ?? DEFAULT_CAPTURE.settleFrames,
    cameraAz: num("cameraAz"),
    cameraElev: num("cameraElev"),
    cameraDist: num("cameraDist"),
  };
}

/** Apply all recognised store-bound URL params to the zustand store. */
export function applyUrlState(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  if (q.toString().length === 0) return;

  const num = (k: string): number | null => {
    const raw = q.get(k);
    if (raw === null) return null;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  };
  const bool = (k: string): boolean | null => {
    const raw = q.get(k);
    if (raw === null) return null;
    return raw === "1" || raw === "true" || raw === "on";
  };

  const store = useAppStore.getState();

  // ── SimParams patch ──
  const paramKeys: (keyof SimParams)[] = [
    "Rmax",
    "Vmax",
    "swirlRatio",
    "inflow",
    "z0",
    "T0",
    "P0",
    "RH",
    "Ustorm",
    "Vstorm",
    "tilt",
    "Cs",
    "vortConfine",
    "latentHeat",
  ];
  const patch: Partial<SimParams> = {};
  for (const k of paramKeys) {
    const v = num(k);
    if (v !== null) patch[k] = v;
  }
  if (Object.keys(patch).length > 0) store.setParams(patch);

  // ── View / field / pause ──
  const viewMode = q.get("viewMode");
  if (viewMode && (VIEW_MODES as readonly string[]).includes(viewMode)) {
    store.setViewMode(viewMode as ViewMode);
  }
  const field = q.get("field");
  if (field && (FIELDS as readonly string[]).includes(field)) {
    store.setField(field as ScientificField);
  }
  const paused = bool("paused");
  if (paused !== null) store.setPaused(paused);

  // ── Slice / iso ──
  const sxz = num("sliceXZ");
  if (sxz !== null) store.setSliceXZ(sxz);
  const sxy = num("sliceXY");
  if (sxy !== null) store.setSliceXY(sxy);
  const iso = num("isoValue");
  if (iso !== null) store.setIsoValue(iso);
  const shellCount = num("isoShellCount");
  if (shellCount !== null) store.setIsoShellCount(Math.round(shellCount));
  const shellSpread = num("isoShellSpread");
  if (shellSpread !== null) store.setIsoShellSpread(shellSpread);

  // ── Layer toggles + slider values ──
  const showIso = bool("showIso");
  if (showIso !== null) store.setShowIso(showIso);
  const showGlyphs = bool("showGlyphs");
  if (showGlyphs !== null) store.setShowGlyphs(showGlyphs);
  const showStreamlines = bool("showStreamlines");
  if (showStreamlines !== null) store.setShowStreamlines(showStreamlines);

  const showContours = bool("showContours");
  if (showContours !== null) store.setShowContours(showContours);
  const contourCount = num("contourCount");
  if (contourCount !== null) store.setContourCount(Math.round(contourCount));

  const showLIC = bool("showLIC");
  if (showLIC !== null) store.setShowLIC(showLIC);
  const licStrength = num("licStrength");
  if (licStrength !== null) store.setLicStrength(licStrength);

  const magFade = bool("magnitudeFadeAlpha");
  if (magFade !== null) store.setMagnitudeFadeAlpha(magFade);
  const fadeFloor = num("fadeFloor");
  if (fadeFloor !== null) store.setFadeFloor(fadeFloor);

  const showVortVolume = bool("showVortVolume");
  if (showVortVolume !== null) store.setShowVortVolume(showVortVolume);
  const vortDensity = num("vortVolumeDensity");
  if (vortDensity !== null) store.setVortVolumeDensity(vortDensity);

  // ── Re-seed solver with the patched params ──
  // Mirrors the ReseedButton in TopBar: force the next driver tick to
  // re-run makeInitVortex with the current (URL-patched) uniforms.
  if (Object.keys(patch).length > 0) {
    const refreshedStore = useAppStore.getState();
    (
      refreshedStore.solver as unknown as { hasInitialised: boolean }
    ).hasInitialised = false;
    refreshedStore.solver.syncParams(refreshedStore.params, 0);
  }
}
