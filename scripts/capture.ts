#!/usr/bin/env bun
/**
 * Tornado-simulator capture CLI.
 *
 * Drives the running app in a headless Chromium with WebGPU enabled,
 * sets parameters via URL query string, waits for the in-page settle gate
 * (`window.__simReady === true`), screenshots the canvas, and writes a PNG.
 *
 * Prerequisite: `bun dev` must be running on http://localhost:5173.
 * If the dev server isn't reachable, the script exits with a clear error.
 *
 * Single-shot example:
 *   bun scripts/capture.ts \
 *     --view scientific --field vorticity --show-iso \
 *     --vmax 95 --swirl 0.7 \
 *     --camera-az 35 --camera-elev 20 --camera-dist 1.4 \
 *     --w 1280 --h 720 --settle 240 \
 *     --out docs/illustrations/vorticity-iso.png
 *
 * Recipe example:
 *   bun scripts/capture.ts --recipe vorticity-tube-iso
 *   bun scripts/capture.ts --all
 */

import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { RECIPES, type Recipe, recipeQueryString } from "./capture-recipes";

interface CliArgs extends Record<string, string | boolean> {
  /** Resolved relative to repo root unless absolute. */
  out: string;
}

const DEV_URL = "http://localhost:5173";
const NAV_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 60_000;

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { out: "" };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith("--")) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      // boolean flag (e.g. --show-iso, --all)
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** Hyphenated CLI flags → camelCase URL param names matching url.ts. */
const CLI_TO_URL_KEY: Record<string, string> = {
  view: "viewMode",
  field: "field",
  vmax: "Vmax",
  rmax: "Rmax",
  swirl: "swirlRatio",
  inflow: "inflow",
  z0: "z0",
  t0: "T0",
  p0: "P0",
  rh: "RH",
  ustorm: "Ustorm",
  vstorm: "Vstorm",
  tilt: "tilt",
  cs: "Cs",
  "vort-confine": "vortConfine",
  "latent-heat": "latentHeat",
  "slice-xz": "sliceXZ",
  "slice-xy": "sliceXY",
  "iso-value": "isoValue",
  "iso-shell-count": "isoShellCount",
  "iso-shell-spread": "isoShellSpread",
  "show-iso": "showIso",
  "show-glyphs": "showGlyphs",
  "show-streamlines": "showStreamlines",
  "show-contours": "showContours",
  "contour-count": "contourCount",
  "show-lic": "showLIC",
  "lic-strength": "licStrength",
  "magnitude-fade-alpha": "magnitudeFadeAlpha",
  "fade-floor": "fadeFloor",
  "show-vort-volume": "showVortVolume",
  "vort-volume-density": "vortVolumeDensity",
  "camera-az": "cameraAz",
  "camera-elev": "cameraElev",
  "camera-dist": "cameraDist",
  paused: "paused",
  w: "w",
  h: "h",
  dpr: "dpr",
  settle: "settle",
};

function buildQueryFromCli(args: CliArgs): string {
  const q = new URLSearchParams();
  q.set("capture", "1");
  for (const [cliKey, urlKey] of Object.entries(CLI_TO_URL_KEY)) {
    const v = args[cliKey];
    if (v === undefined) continue;
    if (typeof v === "boolean") q.set(urlKey, v ? "1" : "0");
    else q.set(urlKey, v);
  }
  return q.toString();
}

async function ensureDevServerRunning(): Promise<void> {
  try {
    const r = await fetch(DEV_URL, { method: "HEAD" });
    if (!r.ok && r.status !== 200 && r.status !== 304) {
      throw new Error(`Dev server returned ${r.status}`);
    }
  } catch (err) {
    console.error(
      `\n❌ Dev server not reachable at ${DEV_URL}. Run \`bun dev\` first.\n   (${(err as Error).message})\n`,
    );
    process.exit(1);
  }
}

async function captureOne(
  browser: Browser,
  query: string,
  outPath: string,
  width: number,
  height: number,
): Promise<void> {
  const page: Page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });

  // Surface page errors to the console so failures are debuggable.
  page.on("pageerror", (err) => console.error(`[page error] ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.warn(`[page ${msg.type()}] ${msg.text()}`);
    }
  });

  const url = `${DEV_URL}/?${query}`;
  console.log(`→ ${url}`);
  await page.goto(url, {
    timeout: NAV_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });

  // Wait for the settle gate.
  await page.waitForFunction("window.__simReady === true", null, {
    timeout: SETTLE_TIMEOUT_MS,
    polling: 250,
  });

  // Try the in-page snapshot path first (Blob via canvas.toBlob). Falls
  // back to Playwright's element screenshot if anything goes wrong.
  const buf = await tryToBlobPath(page);
  if (buf) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
  } else {
    await mkdir(dirname(outPath), { recursive: true });
    await page.locator("canvas").screenshot({ path: outPath });
  }

  console.log(`✔ ${outPath}`);
  await page.close();
}

async function tryToBlobPath(page: Page): Promise<Uint8Array | null> {
  try {
    const dataUrl = await page.evaluate(async () => {
      const w = window as unknown as {
        __sceneSnapshot?: () => Promise<Blob | null>;
      };
      if (!w.__sceneSnapshot) return null;
      const blob = await w.__sceneSnapshot();
      if (!blob) return null;
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    });
    if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return null;
    const b64 = dataUrl.slice("data:image/png;base64,".length);
    return Uint8Array.from(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await ensureDevServerRunning();

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,UseSkiaRenderer",
      "--use-vulkan",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
    ],
  });

  try {
    if (args.all) {
      for (const recipe of RECIPES) {
        await captureFromRecipe(browser, recipe);
      }
    } else if (args.recipe) {
      const recipe = RECIPES.find((r) => r.name === args.recipe);
      if (!recipe) {
        console.error(
          `\n❌ Unknown recipe: ${args.recipe}\n   Available: ${RECIPES.map((r) => r.name).join(", ")}\n`,
        );
        process.exit(1);
      }
      await captureFromRecipe(browser, recipe);
    } else {
      if (!args.out) {
        console.error(
          "\n❌ Either --recipe <name>, --all, or --out <path> required.\n",
        );
        process.exit(1);
      }
      const query = buildQueryFromCli(args);
      const w = parseFloat(args.w as string) || 1280;
      const h = parseFloat(args.h as string) || 720;
      const outPath = resolve(process.cwd(), args.out as string);
      await captureOne(browser, query, outPath, w, h);
    }
  } finally {
    await browser.close();
  }
}

async function captureFromRecipe(browser: Browser, recipe: Recipe) {
  const query = recipeQueryString(recipe);
  const outPath = resolve(process.cwd(), recipe.out);
  const w = recipe.params.w ?? 1280;
  const h = recipe.params.h ?? 720;
  await captureOne(browser, query, outPath, w, h);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
