# Tornado Simulator

Scientifically defensible browser-based tornado simulator built on
**Bun + Vite + React + TypeScript + Three.js (WebGPURenderer)**.

> **Status:** M1 + M2 of 9 milestones complete. The app boots, detects
> WebGPU, seeds an analytical Burgers–Rott vortex on a 96 × 96 × 72
> grid, and renders a vertical XZ slice + a near-ground horizontal slab
> of velocity magnitude using a viridis colormap via TSL. The full LES
> solver, volumetric render, debris, scientific view, UI panel, and
> validation HUD are not yet wired in — see *Milestones* below.

## Run

```bash
bun install      # already done if you cloned with deps
bun dev          # http://localhost:5173
bun run build    # tsc -b && vite build
```

Requires WebGPU: Chrome / Edge ≥ 113, Safari (macOS Tahoe / iOS 26+),
Firefox ≥ 147. The app shows a friendly fallback otherwise.

## Architecture

The full design lives in
`~/.claude/plans/create-a-super-accurate-glimmering-swan.md`. Key pieces
already wired:

- **`src/sim/grid.ts`** — 2 km × 2 km × 1.5 km domain, resolution
  presets Low 64³ / Medium 96³ / High 128³ / Ultra 192³.
- **`src/sim/params.ts`** — live parameters (Rmax, Vmax, swirl ratio,
  inflow, z₀, T/P/RH, storm motion, tilt, Cs, vorticity confinement) +
  atmospheric helpers (ρ, e_sat via August-Roche-Magnus, z_LCL).
- **`src/sim/BurgersRott.ts`** — analytical seeder. Tangential profile
  `v_θ(r) = Vmax · (Rmax/r) · (1 − e^(−α r²/Rmax²)) / (1 − e^(−α))`
  with α ≈ 1.25643 (root of `(2α + 1) = e^α`), so the maximum sits
  exactly at r = Rmax. Vertical stretching `w = 2az` and radial inflow
  `v_r = −ar` close the divergence-free axisymmetric flow. 1% white
  noise breaks symmetry to allow multi-vortex/helical instabilities to
  develop once the LES is running.
- **`src/sim/Resources.ts`** — `Data3DTexture` allocator (Float32 RGBA).
  Will grow to manage all ping-pong textures once the solver lands.
- **`src/scene/SimSlice.tsx`** — TSL slice renderer using `texture3D` +
  the viridis colormap.
- **`src/state/simulator-context.tsx`** — provides GPU resources +
  params to the scene tree.

## Milestones

- [x] **M1** — scaffold + WebGPU detection + r3f Canvas
- [x] **M2** — solver skeleton + analytical IC + slice viz
- [x] **M3** — solver loop: GPU IC kernel, semi-Lagrangian advection,
  divergence, Jacobi pressure (×20), gradient subtract, lateral
  swirl-inflow Dirichlet (sponge) + ground no-slip BCs.
- [ ] **M4** — Smagorinsky LES closure + multigrid V-cycle + vorticity
  confinement + adaptive CFL substepping (BFECC)
- [x] **M5** — realistic volumetric ray-march funnel: condensation
  derived field (Magnus + dry-adiabatic), Beer-Lambert extinction,
  density-gradient lighting, sun + ambient, height tint, transparent
  composite. Toggleable with scientific view.
- [ ] **M6** — debris particle system (wall-shear emission, Stokes drag)
- [ ] **M7** — scientific view: slice already wired (M2). Still need
  isosurface, vector glyphs, full 7-field selector + colormap LUTs +
  HTML colorbar.
- [x] **M8** — Top-bar (view toggle, scientific field selector, pause,
  re-seed). Leva params panel (Core / Boundary / Atmosphere / Motion /
  Solver). HUD with EF badge, Vmax in m/s & mph, R_max, swirl, V_in,
  z₀, T, RH.
- [ ] **M9** — validation HUD (cyclostrophic balance, two-cell
  indicator, mass conservation) + perf tuning

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Bun |
| Bundler | Vite 8 |
| Renderer | three.js r0.184 `WebGPURenderer` (`three/webgpu`) |
| Compute / shaders | TSL (`three/tsl`) — node graphs + raw WGSL when needed |
| React glue | `@react-three/fiber` v9 + `@react-three/drei` |
| Postprocessing | `@react-three/postprocessing` (M5+) |
| UI panels | leva (M8) |
| State | zustand (M8) |
| Lint/format | biome |
| Tests | vitest (M9 sanity checks) |
