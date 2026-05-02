import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAppStore } from "../state/store";
import { captureConfig } from "./url";

/**
 * Headless settle-and-signal component, mounted only when `?capture=1` is
 * present on the page URL.
 *
 * Counts solver-active frames after mount; once `settleFrames` have elapsed,
 * pauses the simulation and exposes:
 *   - `window.__simReady = true`            — Playwright's wait condition
 *   - `window.__sceneSnapshot()`            — async () => Blob (image/png)
 *   - `window.__sceneCanvas`                — direct ref for fallback paths
 *
 * The Playwright capture script polls for `__simReady` and then either
 * calls `__sceneSnapshot()` and reads back the Blob, or — more simply —
 * uses `page.locator('canvas').screenshot()` which captures device pixels.
 */
export function CaptureGate() {
  const { gl } = useThree();
  const setPaused = useAppStore((s) => s.setPaused);
  const elapsed = useRef(0);
  const signalled = useRef(false);

  useEffect(() => {
    // Expose canvas reference + snapshot function early so fallback paths
    // can grab the canvas even before settle completes.
    const canvas = (gl as unknown as { domElement: HTMLCanvasElement })
      .domElement;
    (window as unknown as Record<string, unknown>).__sceneCanvas = canvas;
    (window as unknown as Record<string, unknown>).__sceneSnapshot =
      async (): Promise<Blob | null> =>
        new Promise<Blob | null>((resolve) => {
          canvas.toBlob((blob) => resolve(blob), "image/png");
        });
    // Initialise ready flag so polling code can distinguish "not yet" from
    // "errored before mounting".
    (window as unknown as Record<string, unknown>).__simReady = false;
  }, [gl]);

  useFrame(() => {
    if (signalled.current) return;
    elapsed.current += 1;
    if (elapsed.current >= captureConfig.settleFrames) {
      signalled.current = true;
      // Pause first so the next frame doesn't perturb the snapshot, then
      // raise the ready flag a couple of RAFs later so any in-flight
      // compute work finishes before Playwright reads back.
      setPaused(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          (window as unknown as Record<string, unknown>).__simReady = true;
        });
      });
    }
  });

  return null;
}
