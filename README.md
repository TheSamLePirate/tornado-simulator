# Simulateur de tornade

> 🌪️ **Démo en direct** : <https://tornado-sim.puter.site/>

<p align="center">
  <video src="docs/tornade-plumes-paon.mp4" controls autoplay loop muted playsinline width="720">
    Votre navigateur ne supporte pas la balise vidéo HTML5 —
    <a href="docs/tornade-plumes-paon.mp4">télécharger la vidéo</a>.
  </video>
</p>

Simulateur de tornade scientifiquement crédible, entièrement dans le
navigateur, basé sur **Bun + Vite + React + TypeScript + Three.js
(WebGPURenderer)**.

Une vraie **simulation 3D LES (Large-Eddy Simulation)** des équations
de Navier–Stokes sur grille cartésienne, avec fermeture sous-maille
de Smagorinsky, modèle de paroi en loi log, et conditions limites
d'afflux tourbillonnant Dirichlet calibrées sur les paramètres
utilisateur (V_max, R_max, rapport de swirl S). Double visualisation :
un mode **réaliste** avec funnel volumétrique + débris au sol, et un
mode **scientifique** style post-processeur CFD (plans de coupe /
isosurfaces multi-enveloppes de vorticité / glyphes vectoriels /
streamlines / volumétrique de ω) pour chacun des sept champs
physiques.

---

## 🎓 Comprendre comment fonctionne une tornade

Le projet est livré avec **un dossier de vulgarisation illustré** qui
explique pas à pas la physique d'une tornade en utilisant les sorties
réelles du simulateur comme illustrations. Chaque figure est une vraie
capture du canvas WebGPU — pas un schéma de manuel.

📖 **Lire le dossier** :
- 🇫🇷 [Comment fonctionne une tornade — version française](docs/tornado-explainer.fr.md)
- 🇬🇧 [How a tornado works — English version](docs/tornado-explainer.md)

Le dossier couvre 10 sections : ce qu'est une tornade, la signature
en rotation, l'afflux et l'ascendance, le déficit de pression
cyclostrophique, la formation du nuage funnel visible, la
visualisation du flux par LIC, les régimes uni / bicellulaires, les
tornades multi-tourbillonnaires, les ingrédients atmosphériques
nécessaires, et comment lire le HUD du simulateur.

### 🎬 Voir chaque figure en direct via les presets

Chaque illustration de la doc a un **preset correspondant dans
l'application**. La marche à suivre :

1. Ouvrir <https://tornado-sim.puter.site/>
2. Lire la doc en parallèle
3. Pour chaque figure, repérer la ligne `▶ Preset app : « ... »` sous
   la légende
4. Dans l'app, dérouler le menu **« 📷 Doc preset… »** dans la barre
   du haut et choisir le preset correspondant
5. L'app applique automatiquement les bons paramètres (V_max, S, RH,
   etc.), bascule sur le bon champ scientifique, allume/éteint les bons
   calques de visualisation, place la caméra sur le bon angle, et
   re-seed le solveur depuis l'IC de Burgers–Rott
6. Après ~10 secondes de stabilisation, l'écran montre **la même chose
   que la figure**, mais en 3D, navigable à la souris (OrbitControls),
   et avec les vrais paramètres modifiables en direct dans le panneau
   Leva

C'est l'usage premier de cette app : un **support de vulgarisation
interactif** qui permet de manipuler une tornade au lieu de juste lire
sa description. Augmenter le rapport de swirl en direct et voir le
courant ascendant unique se transformer en un anneau au-dessus d'un
courant descendant central — c'est plus parlant que n'importe quel
schéma.

---

## Lancer l'app localement

```bash
bun install      # déjà fait si vous avez cloné avec les deps
bun dev          # http://localhost:5173
bun run build    # tsc -b && vite build
```

Nécessite WebGPU : Chrome / Edge ≥ 113, Safari (macOS Tahoe / iOS 26+),
Firefox ≥ 147. Un écran de fallback s'affiche sinon.

## Architecture

Le solveur tourne entièrement sur le GPU via TSL (Three Shading
Language) en compute kernels. Les pièces principales :

- **`src/sim/grid.ts`** — domaine 2 km × 2 km × 1,5 km, presets de
  résolution Low 64³ / Medium 96³ / High 128³ / Ultra 192³.
- **`src/sim/params.ts`** — paramètres en direct (Rmax, Vmax, S, V_in,
  z₀, T/P/RH, déplacement, inclinaison, Cs, confinement de vorticité,
  chaleur latente) + helpers atmosphériques (ρ, e_sat via
  August-Roche-Magnus, z_LCL).
- **`src/sim/Solver.ts`** — solveur LES complet : advection
  semi-lagrangienne RK2 (BFECC-friendly), divergence, Jacobi pression
  rouge-noir × 14, soustraction du gradient de pression, fermeture
  Smagorinsky-Lilly, confinement de vorticité, boucle de rétroaction
  par chaleur latente couplée à la condensation.
- **`src/sim/Particles.ts`** — système de particules de débris/poussière
  GPU avec sédimentation de Stokes et stries de motion blur.
- **`src/sim/Reductions.ts`** — réductions parallèles (max |V|, min ΔP,
  max |ω|) avec readback async pour la validation HUD.
- **`src/scene/`** — composition de scène, slices, isosurfaces,
  volumétriques, streamlines, glyphes.
- **`src/state/store.ts`** — store Zustand : viewMode, field, params,
  toggles de calques, valeurs de sliders, presets de scène.
- **`src/presets/scenePresets.ts`** — manifeste des presets de la doc
  (un par illustration, avec params + caméra).

## Statut

Tout est livré. Initialement organisé en 9 milestones (M1–M9) et un
chantier de polish "post-M9" pour les shaders scientifiques :

- [x] **M1–M3** — scaffold WebGPU, IC analytique, boucle solveur
  (advection / divergence / projection / BCs)
- [x] **M4** — fermeture LES Smagorinsky-Lilly + confinement de
  vorticité + sous-cycles CFL adaptatifs
- [x] **M5** — funnel volumétrique réaliste (condensation, Beer-Lambert,
  éclairage, ombre cone-tracée, bruit FBM swirling)
- [x] **M6** — système de particules de débris (sédimentation Stokes,
  stries de motion blur, anneau de poussière)
- [x] **M7** — vue scientifique complète (slice XZ + XY, multi-iso de
  vorticité, glyphes vectoriels, streamlines avec animation comet,
  contours, LIC, fade par magnitude, volumétrique ω, colorbar HTML)
- [x] **M8** — UI complète (TopBar, HUD avec badge EF, panneau Leva,
  re-seed)
- [x] **M9** — HUD de validation avec readback GPU (mesuré vs cible)

Plus, post-livraison : pipeline de capture PNG via Playwright +
chromium headless, presets reliés à la doc, doc bilingue.

## Pipeline de capture PNG

Capture programmatique du canvas WebGPU vivant — pour générer les
figures de la doc. Pilote l'app en cours d'exécution (pas de
screenshot OS, pas de chemin de rendu séparé) via Playwright +
chromium headless.

### Quick start

```bash
# Terminal 1 — serveur de dev
bun dev

# Terminal 2 — capturer un shot prédéfini
bun capture --recipe vorticity-tube-iso

# Ou lancer toutes les recettes vers docs/illustrations/
bun capture --all

# Ou tout en custom (reflète l'API URL)
bun capture \
  --view scientific --field vorticity --show-iso 1 \
  --vmax 100 --swirl 0.85 --rh 0.92 \
  --camera-az 35 --camera-elev 25 --camera-dist 1.4 \
  --w 1280 --h 720 --settle 240 \
  --out docs/illustrations/custom.png
```

### Comment ça marche

Quand l'app voit `?capture=1` dans son URL, elle :

1. Lit chaque paramètre de query string reconnu dans `src/capture/url.ts`
   et le pousse dans le store Zustand (ex. `?Vmax=120&swirlRatio=1.0`).
2. Cache toutes les overlays UI (TopBar, HUD, Colorbar, ParamPanel,
   Stats).
3. Force une taille de canvas fixe (`?w=…&h=…`, défaut 1280×720) et
   passe le `dpr` à 2 pour des sorties crisp.
4. Re-seed le solveur pour que l'IC corresponde aux paramètres URL.
5. Tourne `?settle=N` frames (défaut 240 ≈ 12 s de temps simulé), puis
   met l'app en pause et place le drapeau `window.__simReady = true`.

Le script Playwright dans `scripts/capture.ts` poll ce drapeau, puis
appelle soit `window.__sceneSnapshot()` (chemin préféré — PNG via
`canvas.toBlob`), soit `page.locator('canvas').screenshot()` en
secours.

### Recettes prédéfinies

`scripts/capture-recipes.ts` définit 9 shots nommés (`funnel-wide-side`,
`vorticity-tube-iso`, `pressure-deficit-slice`,
`two-cell-low-S` / `two-cell-high-S`, `lcl-low-rh` / `lcl-high-rh`,
`multi-vortex-high-S`, `speed-LIC`).

Pour ajouter un shot, ajoutez-le au tableau `RECIPES` de ce fichier.

## Stack technique

| Concern | Choix |
| --- | --- |
| Runtime | Bun |
| Bundler | Vite 8 |
| Renderer | three.js r0.184 `WebGPURenderer` (`three/webgpu`) |
| Compute / shaders | TSL (`three/tsl`) — graphes de nodes + WGSL brut au besoin |
| React glue | `@react-three/fiber` v9 + `@react-three/drei` |
| Post-processing | `@react-three/postprocessing` |
| Panneau de paramètres | Leva |
| State | Zustand |
| Lint / format | Biome |
| Tests | Vitest |
| Capture headless | Playwright (chromium) |

## Licence

(à préciser)
