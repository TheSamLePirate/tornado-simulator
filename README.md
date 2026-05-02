# Tornado Simulator

> 🌪️ **Live demo**: <https://tornade-simulation.puter.site/>

Scientifically defensible browser-based tornado simulator built on
**Bun + Vite + React + TypeScript + Three.js (WebGPURenderer)**.

A real **3D LES (Large-Eddy Simulation)** of the Navier–Stokes
equations on a Cartesian grid, with subgrid Smagorinsky closure,
log-law wall model, and Dirichlet swirling-inflow boundary conditions
calibrated to user parameters (V_max, R_max, swirl ratio S). Dual
visualization: a **realistic** volumetric funnel + ground debris, and a
**scientific** CFD-post-processor view (slice planes / multi-iso
vorticity shells / vector glyphs / streamlines / volumetric ω) for any
of seven physical fields.

📖 Vulgarisation explainer: [English](docs/tornado-explainer.md) ·
[Français](docs/tornado-explainer.fr.md)

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

## Capture pipeline

Programmatic PNG capture of the live WebGPU scene — for generating
documentation figures. Drives the running app (no OS screenshots,
no separate render path) via Playwright + headless Chromium.

### Quick start

```bash
# Terminal 1 — dev server
bun dev

# Terminal 2 — capture a single shot
bun capture --recipe vorticity-tube-iso

# Or run all 9 predefined shots into docs/illustrations/
bun capture --all

# Or fully custom (mirrors the URL-param API)
bun capture \
  --view scientific --field vorticity --show-iso \
  --vmax 100 --swirl 0.85 --rh 0.92 \
  --camera-az 35 --camera-elev 25 --camera-dist 1.4 \
  --w 1280 --h 720 --settle 240 \
  --out docs/illustrations/custom.png
```

### How it works

When the app sees `?capture=1` on its URL it:

1. Reads every other recognised query param from `src/capture/url.ts` and
   pushes them into the zustand store (e.g. `?Vmax=120&swirlRatio=1.0`).
2. Hides every UI overlay (TopBar, HUD, Colorbar, ParamPanel, Stats).
3. Forces a fixed canvas size (`?w=…&h=…`, default 1280×720) and bumps
   `dpr` to 2 for crisp output.
4. Re-seeds the solver so the Burgers-Rott IC matches the URL params.
5. Runs `?settle=N` solver frames (default 240 ≈ 12 s sim time at the
   built-in `timeScale=15`), then auto-pauses and sets
   `window.__simReady = true`.

The Playwright script in `scripts/capture.ts` polls for that flag, then
either calls `window.__sceneSnapshot()` (preferred — `canvas.toBlob` PNG)
or falls back to `page.locator('canvas').screenshot()`.

### URL parameter reference

All `SimParams` keys are accepted verbatim: `Vmax`, `Rmax`, `swirlRatio`,
`inflow`, `z0`, `T0`, `P0`, `RH`, `Ustorm`, `Vstorm`, `tilt`, `Cs`,
`vortConfine`, `latentHeat`.

View / scientific knobs: `viewMode`, `field`, `paused`, `sliceXZ`,
`sliceXY`, `isoValue`, `isoShellCount`, `isoShellSpread`, `showIso`,
`showGlyphs`, `showStreamlines`, `showContours`, `contourCount`,
`showLIC`, `licStrength`, `magnitudeFadeAlpha`, `fadeFloor`,
`showVortVolume`, `vortVolumeDensity`.

Camera (spherical): `cameraAz` (°), `cameraElev` (°), `cameraDist`
(× max box dim). Boolean flags accept `1` / `true` / `on`.

### Recipes

`scripts/capture-recipes.ts` defines 9 named shots covering the most
useful illustrations: `funnel-wide-side`, `vorticity-tube-iso`,
`pressure-deficit-slice`, `two-cell-low-S` / `two-cell-high-S`,
`lcl-low-rh` / `lcl-high-rh`, `multi-vortex-high-S`, `speed-LIC`.

Add a new shot by appending to that file's `RECIPES` array.

### Intended workflow with an AI assistant

1. Ask Claude to write a tornado-physics primer / vulgarisation doc.
2. Claude drafts prose and identifies ~6–10 illustrative figures.
3. For each figure, Claude runs `bun capture --recipe …` (or a custom
   `bun capture --view … --vmax … --out …`).
4. Claude reads each PNG (multimodal) and embeds it as
   `![](docs/illustrations/foo.png)` in the markdown doc.

The PNGs are real WebGPU output, so any future shader work or simulator
upgrade is reflected automatically — no separate render path to maintain.

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
