import { create } from "zustand";
import { DEFAULT_PARAMS, type SimParams } from "../sim/params";
import { makeGrid, type GridSpec, type QualityPreset } from "../sim/grid";
import { Solver } from "../sim/Solver";
import { Particles } from "../sim/Particles";

export type ViewMode = "realistic" | "scientific";
export type ScientificField =
  | "speed"
  | "vtheta"
  | "vradial"
  | "vz"
  | "pressure"
  | "vorticity"
  | "cloud";

interface AppState {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  field: ScientificField;
  setField: (f: ScientificField) => void;

  preset: QualityPreset;
  setPreset: (p: QualityPreset) => void;

  paused: boolean;
  setPaused: (p: boolean) => void;

  params: SimParams;
  setParams: (patch: Partial<SimParams>) => void;
  resetParams: () => void;

  grid: GridSpec;
  solver: Solver;
  particles: Particles;

  // Scientific view controls
  sliceXZ: number;
  sliceXY: number;
  setSliceXZ: (v: number) => void;
  setSliceXY: (v: number) => void;
  isoValue: number;
  setIsoValue: (v: number) => void;
  showIso: boolean;
  setShowIso: (v: boolean) => void;
  showGlyphs: boolean;
  setShowGlyphs: (v: boolean) => void;
  showStreamlines: boolean;
  setShowStreamlines: (v: boolean) => void;

  /**
   * Per-field colormap-range multiplier. Lower = colors saturate sooner =
   * more contrast for subtle features. 1.0 reproduces the auto-scaled default.
   */
  fieldScale: Record<ScientificField, number>;
  setFieldScale: (f: ScientificField, v: number) => void;

  // Slice overlays
  showContours: boolean;
  setShowContours: (v: boolean) => void;
  contourCount: number;
  setContourCount: (v: number) => void;

  showLIC: boolean;
  setShowLIC: (v: boolean) => void;
  licStrength: number;
  setLicStrength: (v: number) => void;

  magnitudeFadeAlpha: boolean;
  setMagnitudeFadeAlpha: (v: boolean) => void;
  fadeFloor: number;
  setFadeFloor: (v: number) => void;

  // Multi-iso shells
  isoShellCount: number;
  setIsoShellCount: (v: number) => void;
  isoShellSpread: number;
  setIsoShellSpread: (v: number) => void;

  // Vorticity volume render
  showVortVolume: boolean;
  setShowVortVolume: (v: boolean) => void;
  vortVolumeDensity: number;
  setVortVolumeDensity: (v: number) => void;
}

const initialPreset: QualityPreset = "medium";
const initialGrid = makeGrid(initialPreset);
const initialSolver = new Solver(initialGrid);
const initialParticles = new Particles(initialGrid, initialSolver.velocity[0]);

export const useAppStore = create<AppState>((set) => ({
  viewMode: "scientific",
  setViewMode: (m) => set({ viewMode: m }),
  field: "vorticity",
  setField: (f) => set({ field: f }),
  preset: initialPreset,
  setPreset: (p) => set({ preset: p }),
  paused: false,
  setPaused: (paused) => set({ paused }),
  params: DEFAULT_PARAMS,
  setParams: (patch) => set((s) => ({ params: { ...s.params, ...patch } })),
  resetParams: () => set({ params: DEFAULT_PARAMS }),
  grid: initialGrid,
  solver: initialSolver,
  particles: initialParticles,

  sliceXZ: 0.5,
  sliceXY: 0.05,
  setSliceXZ: (v) => set({ sliceXZ: v }),
  setSliceXY: (v) => set({ sliceXY: v }),
  isoValue: 0.45,
  setIsoValue: (v) => set({ isoValue: v }),
  showIso: true,
  setShowIso: (v) => set({ showIso: v }),
  showGlyphs: false,
  setShowGlyphs: (v) => set({ showGlyphs: v }),
  showStreamlines: true,
  setShowStreamlines: (v) => set({ showStreamlines: v }),

  fieldScale: {
    speed: 0.8,
    vtheta: 0.7,
    vradial: 0.5,
    vz: 0.5,
    pressure: 0.4,
    vorticity: 0.45,
    cloud: 0.6,
  },
  setFieldScale: (f, v) =>
    set((s) => ({ fieldScale: { ...s.fieldScale, [f]: v } })),

  showContours: false,
  setShowContours: (v) => set({ showContours: v }),
  contourCount: 6,
  setContourCount: (v) => set({ contourCount: v }),

  showLIC: true,
  setShowLIC: (v) => set({ showLIC: v }),
  licStrength: 0.55,
  setLicStrength: (v) => set({ licStrength: v }),

  magnitudeFadeAlpha: true,
  setMagnitudeFadeAlpha: (v) => set({ magnitudeFadeAlpha: v }),
  fadeFloor: 0.05,
  setFadeFloor: (v) => set({ fadeFloor: v }),

  isoShellCount: 3,
  setIsoShellCount: (v) => set({ isoShellCount: v }),
  isoShellSpread: 0.18,
  setIsoShellSpread: (v) => set({ isoShellSpread: v }),

  showVortVolume: false,
  setShowVortVolume: (v) => set({ showVortVolume: v }),
  vortVolumeDensity: 0.4,
  setVortVolumeDensity: (v) => set({ vortVolumeDensity: v }),
}));
