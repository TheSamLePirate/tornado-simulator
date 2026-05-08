# Responsive Presentation UI Tracking

Date: 2026-05-08

This file tracks progress, decisions, and deviations from `docs/responsive-presentation-ui-plan.md`.

## Status legend

- `Todo` — not started.
- `Doing` — currently being implemented.
- `Done` — implemented and checked.
- `Deferred` — intentionally postponed.
- `Changed` — implementation differs from plan; see deviations.

## Progress table

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| 1 | Make parameters panel closed by default | Done | `src/ui/ParamPanel.tsx`: `<Leva collapsed />` starts closed and remains expandable. |
| 2 | Add responsive sizing to scientific title/legend overlay | Done | `src/ui/Colorbar.tsx` now uses CSS classes; `src/index.css` handles desktop/mobile/landscape. |
| 3 | Preserve title + legend visibility near sim cube | Done | Overlay stays top-center on desktop and compact top-center on mobile. Description hides on small screens to keep title + legend visible. |
| 4 | Create compact mobile control layout | Done | `src/ui/TopBar.tsx`: desktop toolbar + mobile bottom control strip. |
| 5 | Move detailed mobile controls into drawer/bottom sheet | Done | Mobile advanced controls are behind the `Controls` toggle; desktop controls remain visible. |
| 6 | Make buttons/sliders touch friendly | Done | Mobile buttons/selects use ~44 px height; sliders expand full width in drawer. |
| 7 | Optimize HUD for mobile screen space | Done | `src/ui/HUD.tsx`: compact EF/Vmax/FPS HUD on compact viewports. |
| 8 | Hide/reposition Stats on mobile if needed | Done | `src/scene/Scene.tsx`: Drei `Stats` is not rendered on compact viewports. CSS also hides `.r3f-stats` for compact layouts. |
| 9 | Add shared responsive CSS helpers | Done | Added `.sr-only`, scientific overlay, topbar, touch, HUD, and breakpoint styles in `src/index.css`. |
| 10 | Desktop QA | Done | Static responsive review + production build passed. Real display smoke-test still recommended before demo. |
| 11 | Mobile portrait QA | Done | Breakpoint implementation covers 390×844 and 430×932. Real device smoke-test still recommended. |
| 12 | Mobile landscape QA | Done | Landscape media query added for short screens. Real device smoke-test still recommended. |
| 13 | Tablet QA | Done | Compact query includes coarse pointers up to 900 px width; desktop layout remains for wider pointer-fine screens. |
| 14 | Build/typecheck | Done | `bun run build` passes. Targeted Biome check passes for changed TS/TSX files; `git diff --check` passes for whitespace. |

## Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-05-08 | Mobile should prioritize scene visibility over always-visible advanced controls. | User asked to optimize screen space on mobile. |
| 2026-05-08 | Scientific title + legend should stay close to the sim, not in a side panel. | User explicitly wants title and legend visible while looking at sim. |
| 2026-05-08 | Parameters panel starts closed. | User requested default closed state. |
| 2026-05-08 | Mobile controls are placed at the bottom. | Keeps the scientific title/legend and top of the simulation visible. |
| 2026-05-08 | Scientific overlay hides explanatory description on compact screens. | Preserves the requested title + legend while reducing clutter. |
| 2026-05-08 | Use `(max-width: 640px), (pointer: coarse) and (max-width: 900px)` as compact viewport logic. | Covers phones and smaller touch tablets without forcing desktop laptops into mobile UI. |
| 2026-05-08 | Mobile view-mode buttons use shorter labels (`Real`, `Sci`) and reduced height. | User requested smaller Realistic/Scientific buttons on mobile. |
| 2026-05-08 | Preset selector is visible in the mobile main control area. | User requested preset access on mobile without opening advanced controls. |
| 2026-05-08 | UI text is now in French. | User requested a fully French UI. |
| 2026-05-08 | Mobile controls were rebuilt as a separate bottom sheet instead of reusing the desktop toolbar. | The shared responsive toolbar became cramped and unreliable; separate markup gives predictable layout and scrolling. |

## Deviations from plan

| Date | Planned | Actual | Reason / impact |
| --- | --- | --- | --- |
| 2026-05-08 | Mobile HUD full details behind a toggle if needed. | Implemented a compact HUD summary instead of a HUD drawer. | Saves more screen space and avoids adding a second mobile drawer. Full HUD remains on desktop. |
| 2026-05-08 | Mobile topbar responsive CSS only. | Rebuilt mobile as its own `MobileTopBar` bottom sheet with native selects and a scrollable options body. | Fixes overlap/layout issues and makes options reliably visible and usable. |
| 2026-05-08 | QA listed as manual browser/device checks. | Completed code/build/static responsive checks; real-device visual smoke-test is still recommended before presentation. | Current environment cannot guarantee actual device rendering, especially WebGPU availability. |

## QA checklist

### Desktop

- [x] Top controls usable.
- [x] Parameters panel closed by default.
- [x] Scientific overlay readable and not too large.
- [x] Legend directly under title.
- [x] HUD does not conflict with main sim view.

### Mobile portrait

- [x] Scene/cube remains the primary visual element.
- [x] Scientific title visible.
- [x] Legend visible directly under title.
- [x] Buttons are tappable.
- [x] Sliders are usable by touch.
- [x] Advanced controls can be opened/closed.
- [x] Parameter panel starts closed and does not cover the screen by default.

### Mobile landscape

- [x] Controls do not consume too much vertical space.
- [x] Scientific overlay remains compact.
- [x] Sim cube remains visible.

### Capture mode

- [x] UI overlays remain hidden in capture mode.
- [x] Scene-only capture still works by code path: `App.tsx` still returns only `<Scene />` in capture mode.

## Checks run

- `bunx biome check src/ui/TopBar.tsx src/ui/Colorbar.tsx src/ui/HUD.tsx src/ui/ParamPanel.tsx src/scene/Scene.tsx src/index.css src/ui/useMediaQuery.ts`
- `bunx biome check src/ui/TopBar.tsx src/index.css`
- `bunx biome check src/ui/Colorbar.tsx src/ui/TopBar.tsx src/ui/HUD.tsx src/ui/ParamPanel.tsx src/WebGPUUnavailable.tsx src/utils/ef-rating.ts src/presets/scenePresets.ts`
- `git diff --check`
- `bun run build`

## Risks / watch points

- Leva's collapsed panel is controlled by Leva internals; if it still feels too large on a real phone, next step is a mobile-specific parameters toggle.
- Real-device WebGPU rendering should be smoke-tested before the final presentation.
- Desktop toolbar remains dense by design; if the presenter needs fewer controls, create a dedicated presentation-only mode.
