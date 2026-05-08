# Responsive Presentation UI Plan

Date: 2026-05-08

## Goal

Make the simulator comfortable for both desktop presentation and mobile/touch use, while keeping the scientific title + legend visible near the simulation cube.

## Success criteria

- Desktop keeps rich controls available without hiding the simulation.
- Mobile prioritizes the simulation view and keeps overlays compact.
- Parameters panel is closed by default.
- Touch targets are easy to tap: minimum ~44 px height/width where practical.
- Scientific title + legend remains visible while looking at the sim.
- Controls do not overlap the most important cube area on narrow screens.
- No regression in capture mode: capture still hides UI overlays.

## Target breakpoints

- **Mobile:** `< 640px` width or coarse pointer.
- **Tablet / small laptop:** `640px–1024px`.
- **Desktop:** `> 1024px`.

## Implementation plan

### Phase 1 — Parameters panel default state

1. Update `src/ui/ParamPanel.tsx` so Leva starts collapsed by default.
2. Confirm this applies on desktop and mobile.
3. Keep all parameter controls accessible after expanding.

### Phase 2 — Responsive scientific presentation overlay

1. Move presentation overlay styling from inline-only assumptions toward responsive sizing.
2. Mobile behavior:
   - Reduce title card width to `calc(100vw - 16px)`.
   - Reduce padding and text size slightly.
   - Keep the legend directly under the title.
   - Avoid covering the cube center as much as possible.
3. Desktop behavior:
   - Keep the current top-centered presentation card.
   - Preserve readable title and larger legend.

### Phase 3 — Mobile control layout

1. Convert the current top control bar into a compact mobile layout.
2. Mobile default:
   - Show a small top/bottom control strip with view mode, active field, pause, and a “Controls” toggle.
   - Move detailed scientific controls into a collapsible drawer/bottom sheet.
   - Keep field switching touch-friendly.
3. Desktop default:
   - Keep existing full top toolbar layout or improve spacing without hiding controls.

### Phase 4 — Touch friendliness

1. Increase mobile button/input hit area to at least ~44 px.
2. Ensure range sliders are large enough to drag with a finger.
3. Avoid tiny scientific field buttons on mobile by using wrapping chips or a select/dropdown.
4. Verify controls work with `pointer: coarse` devices.

### Phase 5 — HUD and stats space optimization

1. On mobile, collapse or hide verbose HUD details by default.
2. Provide a compact HUD summary, e.g. EF rating + Vmax + FPS.
3. Move full validation diagnostics behind a details toggle if needed.
4. Hide or reposition `Stats` on mobile if it occupies important screen space.

### Phase 6 — Visual QA

Test manually in browser devtools and real/touch-like sizes:

- 390 × 844 portrait mobile.
- 430 × 932 portrait mobile.
- 844 × 390 landscape mobile.
- 768 × 1024 tablet.
- 1366 × 768 laptop.
- 1920 × 1080 desktop / presentation.

For each size, verify:

- Sim cube remains visible.
- Scientific title and legend are visible.
- Main actions are tappable.
- Parameter panel starts closed.
- No critical UI overlap.

## Proposed files to change

- `src/ui/ParamPanel.tsx`
- `src/ui/Colorbar.tsx`
- `src/ui/TopBar.tsx`
- `src/ui/HUD.tsx`
- `src/index.css`
- Possibly `src/scene/Scene.tsx` for mobile `Stats` behavior.

## Open questions

No blocking question for the first pass. If you want a stronger presentation mode later, decide whether mobile should prefer:

1. **More scene / fewer controls** by default, or
2. **Always-visible controls** even if the scene is smaller.

My recommended default is option 1: more scene, controls in a touch-friendly drawer.
