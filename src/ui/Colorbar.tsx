import { type ScientificField, useAppStore } from '../state/store'

/** Colormap CSS gradients approximating the TSL polynomial colormaps. */
const CMAP_CSS: Record<string, string> = {
  viridis: 'linear-gradient(to right, #440154, #31688e, #21918c, #5ec962, #fde725)',
  magma: 'linear-gradient(to right, #000004, #3b0f70, #8c2981, #de4968, #fcfdbf)',
  plasma: 'linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #f0f921)',
  rdbu: 'linear-gradient(to right, #2166ac, #67a9cf, #f7f7f7, #ef8a62, #b2182b)',
}

interface FieldMeta {
  /** Presentation title shown above the simulation cube. */
  title: string
  /** Short scientific symbol used beside the unit. */
  name: string
  unit: string
  cmap: string
  range: (vMax: number, rMax: number) => [number, number]
  /** Plain-language one-liner for non-expert viewers. */
  whatWeSee: string
  /** Color legend helper text. */
  legend: string
}

const FIELDS: Record<ScientificField, FieldMeta> = {
  speed: {
    title: 'Vitesse du vent',
    name: '|V|',
    unit: 'm/s',
    cmap: 'viridis',
    range: (v) => [0, v],
    whatWeSee:
      'L’air le plus rapide se concentre dans le cœur du vortex et dans l’afflux près du sol.',
    legend: 'Sombre = air calme · Jaune = vent le plus fort',
  },
  vtheta: {
    title: 'Vitesse de rotation',
    name: 'V_θ',
    unit: 'm/s',
    cmap: 'rdbu',
    range: (v) => [-v / 2, v / 2],
    whatWeSee:
      'Les vents qui tournent autour de la tornade ; les couleurs opposées indiquent des sens de rotation opposés.',
    legend: 'Bleu = horaire · Blanc = faible · Rouge = antihoraire',
  },
  vradial: {
    title: 'Afflux et reflux',
    name: 'V_r',
    unit: 'm/s',
    cmap: 'rdbu',
    range: (v) => [-v / 4, v / 4],
    whatWeSee:
      'L’air près du sol converge vers le cœur, puis est redirigé vers le haut dans la tornade.',
    legend: 'Bleu = flux entrant · Blanc = neutre · Rouge = flux sortant',
  },
  vz: {
    title: 'Courants ascendants et descendants',
    name: 'V_z',
    unit: 'm/s',
    cmap: 'rdbu',
    range: (v) => [-v * 0.4, v * 0.4],
    whatWeSee:
      'L’air qui monte forme le courant ascendant principal ; les zones bleues montrent l’air qui descend.',
    legend: 'Bleu = courant descendant · Blanc = neutre · Rouge = courant ascendant',
  },
  pressure: {
    title: 'Chute de pression',
    name: 'ΔP',
    unit: 'm²/s²',
    cmap: 'rdbu',
    range: (v) => [-(v * v) / 4, (v * v) / 4],
    whatWeSee:
      'Le centre de basse pression qui attire l’air vers l’intérieur et resserre le vortex.',
    legend: 'Bleu = pression plus basse · Blanc = ambiant · Rouge = pression plus haute',
  },
  vorticity: {
    title: 'Intensité de rotation',
    name: '|ω|',
    unit: 's⁻¹',
    cmap: 'magma',
    range: (v, r) => [0, (v / Math.max(r, 1)) * 4],
    whatWeSee:
      'Les zones où l’écoulement tourne le plus fort : tube principal et petites structures tournantes.',
    legend: 'Sombre = rotation faible · Clair = rotation intense',
  },
  cloud: {
    title: 'Eau nuageuse visible',
    name: 'ρ_c',
    unit: 'kg/m³',
    cmap: 'plasma',
    range: () => [0, 5e-4],
    whatWeSee:
      'Les endroits où l’air humide se condense en entonnoir nuageux lorsque la pression baisse.',
    legend: 'Sombre = air clair · Jaune = nuage plus dense',
  },
  temperature: {
    title: 'Anomalie de température',
    name: "T'",
    unit: 'K',
    cmap: 'rdbu',
    range: () => [-10, 10],
    whatWeSee:
      'L’air plus froid apparaît dans le cœur de basse pression ; les couleurs chaudes signalent l’air au-dessus du profil de référence.',
    legend: 'Bleu = plus froid · Blanc = référence · Rouge = plus chaud',
  },
}

function fmtVal(v: number): string {
  const a = Math.abs(v)
  if (a >= 1000) return v.toFixed(0)
  if (a >= 1) return v.toFixed(1)
  if (a >= 0.01) return v.toFixed(3)
  return v.toExponential(1)
}

/**
 * Presentation-focused scientific overlay. It sits above the simulation cube
 * so viewers can identify the active field and read the color legend without
 * looking away from the main scene.
 */
export function Colorbar() {
  const viewMode = useAppStore((s) => s.viewMode)
  const field = useAppStore((s) => s.field)
  const params = useAppStore((s) => s.params)
  const fieldScale = useAppStore((s) => s.fieldScale)

  if (viewMode !== 'scientific') return null

  const meta = FIELDS[field]
  const scale = fieldScale[field] ?? 1.0
  const [loBase, hiBase] = meta.range(params.Vmax, params.Rmax)
  const lo = loBase * scale
  const hi = hiBase * scale
  const gradient = CMAP_CSS[meta.cmap] ?? CMAP_CSS.viridis

  return (
    <section className="panel scientific-overlay" aria-label={`Vue scientifique : ${meta.title}`}>
      <div className="scientific-overlay__title">
        {meta.title}
        <span className="mono scientific-overlay__symbol">{meta.name}</span>
      </div>

      <div className="scientific-overlay__legend-row">
        <LegendValue value={lo} />
        <div className="scientific-overlay__gradient" style={{ background: gradient }}>
          <div className="mono scientific-overlay__unit">{meta.unit}</div>
        </div>
        <LegendValue value={hi} />
      </div>

      <div className="scientific-overlay__legend-text">{meta.legend}</div>
      <div className="scientific-overlay__description">{meta.whatWeSee}</div>
    </section>
  )
}

function LegendValue({ value }: { value: number }) {
  return <span className="mono scientific-overlay__value">{fmtVal(value)}</span>
}
