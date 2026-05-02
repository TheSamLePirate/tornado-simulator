import type { SimParams } from "../sim/params";
import type { ScientificField, ViewMode } from "../state/store";

/**
 * Scene presets — one per illustration in `docs/tornado-explainer*.md`.
 *
 * Selecting a preset in the TopBar applies every store field listed below,
 * positions the OrbitControls camera via spherical (az, elev, dist), and
 * forces the solver to re-seed so the initial condition matches the preset's
 * params.
 *
 * The `id` matches the corresponding illustration filename (without `.png`)
 * so doc cross-referencing is one-to-one.
 */
export interface ScenePreset {
  id: string;
  label: string;
  description: string;

  params?: Partial<SimParams>;
  viewMode?: ViewMode;
  field?: ScientificField;

  sliceXZ?: number;
  sliceXY?: number;

  isoValue?: number;
  isoShellCount?: number;
  isoShellSpread?: number;

  showIso?: boolean;
  showGlyphs?: boolean;
  showStreamlines?: boolean;
  showContours?: boolean;
  contourCount?: number;
  showLIC?: boolean;
  licStrength?: number;
  magnitudeFadeAlpha?: boolean;
  fadeFloor?: number;
  showVortVolume?: boolean;
  vortVolumeDensity?: number;

  /** Camera placement on a sphere centered just above the ground. */
  cameraAz: number;
  cameraElev: number;
  cameraDist: number;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "vorticity-tube-iso",
    label: "Tube de vorticité (iso)",
    description:
      "Trois enveloppes imbriquées de |ω| — la signature 3D du tube en rotation.",
    viewMode: "scientific",
    field: "vorticity",
    showIso: true,
    isoShellCount: 3,
    isoShellSpread: 0.18,
    isoValue: 0.45,
    showStreamlines: false,
    magnitudeFadeAlpha: false,
    showLIC: false,
    cameraAz: 50,
    cameraElev: 28,
    cameraDist: 1.3,
  },
  {
    id: "vorticity-slice",
    label: "Coupe de |ω|",
    description:
      "Tube magenta + anneau au sol, sans iso — vue propre du profil radial de vorticité.",
    viewMode: "scientific",
    field: "vorticity",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 30,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "vtheta-top-down",
    label: "V_θ (vue du dessus)",
    description:
      "Vitesse tangentielle en plan horizontal — anneau du mur de l'œil.",
    viewMode: "scientific",
    field: "vtheta",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXY: 0.05,
    cameraAz: 0,
    cameraElev: 70,
    cameraDist: 1.0,
  },
  {
    id: "vradial-top-down",
    label: "V_r (vue du dessus)",
    description:
      "Vitesse radiale en plan horizontal — afflux convergent vers l'axe.",
    viewMode: "scientific",
    field: "vradial",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXY: 0.05,
    cameraAz: 0,
    cameraElev: 70,
    cameraDist: 1.0,
  },
  {
    id: "vz-default",
    label: "V_z par défaut",
    description:
      "Composante verticale du vent — colonne ascendante au cœur (S = 0.75).",
    viewMode: "scientific",
    field: "vz",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 35,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "pressure-deficit-slice",
    label: "Déficit de pression",
    description:
      "Coupe ΔP — colonne bleue cyclostrophique sur l'axe du tourbillon.",
    viewMode: "scientific",
    field: "pressure",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 35,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "cloud-side-view",
    label: "Funnel (nuage condensé)",
    description:
      "Coupe verticale du nuage de condensation — entonnoir descendant le long de l'axe.",
    viewMode: "scientific",
    field: "cloud",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    cameraAz: 0,
    cameraElev: 8,
    cameraDist: 1.4,
  },
  {
    id: "speed-LIC",
    label: "|V| + LIC",
    description:
      "Vitesse + grain LIC dans le sens du flux — anneau du mur de l'œil + œil sombre.",
    viewMode: "scientific",
    field: "speed",
    showIso: false,
    showStreamlines: false,
    showLIC: true,
    licStrength: 0.7,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 5,
    cameraElev: 12,
    cameraDist: 1.3,
  },
  {
    id: "two-cell-low-S",
    label: "V_z à S = 0.4 (unicellulaire)",
    description: "Faible swirl — courant ascendant unique sur l'axe.",
    viewMode: "scientific",
    field: "vz",
    params: { swirlRatio: 0.4 },
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 35,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "two-cell-high-S",
    label: "V_z à S = 0.85 (bicellulaire)",
    description:
      "Swirl élevé — courant ascendant intense, transition vers structure bicellulaire.",
    viewMode: "scientific",
    field: "vz",
    params: { swirlRatio: 0.85 },
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 35,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "temperature-cold-spot",
    label: "T' (refroidissement adiabatique)",
    description:
      "Coupe de l'écart de température — point froid bleu sur l'axe causé par le déficit de pression.",
    viewMode: "scientific",
    field: "temperature",
    showIso: false,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: true,
    fadeFloor: 0.05,
    sliceXZ: 0.5,
    sliceXY: 0.05,
    cameraAz: 35,
    cameraElev: 20,
    cameraDist: 1.4,
  },
  {
    id: "multi-vortex-high-S",
    label: "Multi-tourbillonnaire (S = 1.2)",
    description:
      "Éclatement tourbillonnaire — sous-tourbillons orbitant l'axe principal.",
    viewMode: "scientific",
    field: "vorticity",
    params: { swirlRatio: 1.2, Vmax: 100 },
    showIso: true,
    isoShellCount: 3,
    isoShellSpread: 0.15,
    isoValue: 0.4,
    showStreamlines: false,
    showLIC: false,
    magnitudeFadeAlpha: false,
    cameraAz: 40,
    cameraElev: 35,
    cameraDist: 1.2,
  },
];
