import { useEffect, useState } from "react";
import { WebGPUUnavailable } from "./WebGPUUnavailable";
import { Scene } from "./scene/Scene";
import { TopBar } from "./ui/TopBar";
import { ParamPanel } from "./ui/ParamPanel";
import { HUD } from "./ui/HUD";
import { Colorbar } from "./ui/Colorbar";
import { captureConfig } from "./capture/url";

type Support = "checking" | "ok" | "missing";

export default function App() {
  const [support, setSupport] = useState<Support>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (typeof navigator === "undefined" || !("gpu" in navigator)) {
        if (!cancelled) setSupport("missing");
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No adapter");
        if (!cancelled) setSupport("ok");
      } catch {
        if (!cancelled) setSupport("missing");
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (support === "checking") return null;
  if (support === "missing") return <WebGPUUnavailable />;

  // Capture mode hides every UI overlay so the canvas fills the document
  // unobstructed. The Playwright capture script relies on this to land
  // a pixel-clean PNG of the scene only.
  if (captureConfig.capture) {
    return <Scene />;
  }

  return (
    <>
      <Scene />
      <TopBar />
      <HUD />
      <Colorbar />
      <ParamPanel />
    </>
  );
}
