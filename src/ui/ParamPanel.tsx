import { folder, Leva, useControls } from 'leva'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/store'
import { useCompactViewport } from './useMediaQuery'

/**
 * Live parameter panel via leva. Edits are pushed back to the zustand store
 * so the SolverDriver picks them up next frame.
 */
export function ParamPanel() {
  const params = useAppStore((s) => s.params)
  const setParams = useAppStore((s) => s.setParams)
  const compact = useCompactViewport()
  const [collapsed, setCollapsed] = useState(true)

  const theme = useMemo(() => {
    if (!compact) return undefined
    return {
      sizes: {
        rootWidth: collapsed ? '112px' : 'min(280px, calc(100vw - 16px))',
        titleBarHeight: collapsed ? '30px' : '36px',
      },
      fontSizes: {
        root: collapsed ? '10px' : '11px',
      },
      space: {
        md: collapsed ? '6px' : '10px',
      },
    }
  }, [collapsed, compact])

  const values = useControls(
    {
      Cœur: folder({
        Rmax: {
          value: params.Rmax,
          min: 50,
          max: 800,
          step: 5,
          label: 'Rmax (m)',
        },
        Vmax: {
          value: params.Vmax,
          min: 20,
          max: 130,
          step: 1,
          label: 'Vmax (m/s)',
        },
        swirlRatio: {
          value: params.swirlRatio,
          min: 0.05,
          max: 2.0,
          step: 0.01,
          label: 'Rotation S',
        },
      }),
      'Couche limite': folder({
        inflow: {
          value: params.inflow,
          min: 1,
          max: 40,
          step: 0.5,
          label: 'V_in (m/s)',
        },
        z0: {
          value: params.z0,
          min: 0.001,
          max: 1.0,
          step: 0.001,
          label: 'z₀ (m)',
        },
      }),
      Atmosphère: folder({
        T0: { value: params.T0, min: 263, max: 313, step: 0.5, label: 'T (K)' },
        P0: {
          value: params.P0,
          min: 90_000,
          max: 105_000,
          step: 100,
          label: 'P (Pa)',
        },
        RH: { value: params.RH, min: 0.1, max: 1.0, step: 0.01, label: 'RH' },
        latentHeat: {
          value: params.latentHeat,
          min: 0,
          max: 30,
          step: 0.5,
          label: 'Chaleur latente ×',
        },
      }),
      Mouvement: folder({
        Ustorm: { value: params.Ustorm, min: -30, max: 30, step: 0.5 },
        Vstorm: { value: params.Vstorm, min: -30, max: 30, step: 0.5 },
        tilt: {
          value: params.tilt,
          min: -0.5,
          max: 0.5,
          step: 0.01,
          label: 'inclinaison (rad)',
        },
      }),
      Solveur: folder(
        {
          Cs: { value: params.Cs, min: 0.05, max: 0.25, step: 0.005 },
          vortConfine: {
            value: params.vortConfine,
            min: 0,
            max: 0.5,
            step: 0.01,
            label: 'ε (conf. vort.)',
          },
        },
        { collapsed: true },
      ),
    },
    [],
  )

  useEffect(() => {
    setParams(values)
  }, [values, setParams])

  return (
    <Leva
      collapsed={{ collapsed, onChange: setCollapsed }}
      oneLineLabels
      theme={theme}
      titleBar={{ title: compact && collapsed ? 'Params' : 'Paramètres', drag: !compact }}
    />
  )
}
