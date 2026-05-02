import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useAppStore } from "../state/store";
import { DOMAIN_LX, DOMAIN_LY, DOMAIN_LZ } from "../sim/grid";

const WORLD_SCALE = 0.001;
const Wx = DOMAIN_LX * WORLD_SCALE;
const Wy = DOMAIN_LY * WORLD_SCALE;
const Wz = DOMAIN_LZ * WORLD_SCALE;

/**
 * Mounted inside the R3F Canvas. Watches the zustand store for a newly-
 * applied scene preset; when one fires, repositions the OrbitControls
 * camera via the preset's spherical (az, elev, dist) and forces the
 * solver to re-seed so the IC matches the preset params.
 *
 * Reacts on `presetPulse` (a monotonically-increasing counter) so the
 * SAME preset can be re-applied — useful when the user has manually
 * orbited away and wants to snap back.
 */
export function PresetCameraDriver() {
  const presetPulse = useAppStore((s) => s.presetPulse);
  const appliedPreset = useAppStore((s) => s.appliedPreset);
  const solver = useAppStore((s) => s.solver);
  const params = useAppStore((s) => s.params);
  const { camera, controls } = useThree() as unknown as {
    camera: { position: { set: (x: number, y: number, z: number) => void } };
    controls: {
      target: { set: (x: number, y: number, z: number) => void };
      update?: () => void;
    } | null;
  };

  useEffect(() => {
    if (!appliedPreset) return;
    const az = (appliedPreset.cameraAz * Math.PI) / 180;
    const el = (appliedPreset.cameraElev * Math.PI) / 180;
    const r = Math.max(Wx, Wy, Wz) * appliedPreset.cameraDist;
    camera.position.set(
      r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el) + Wz * 0.4,
      r * Math.cos(el) * Math.cos(az),
    );
    controls?.target.set(0, Wz * 0.4, 0);
    controls?.update?.();

    // Re-seed the solver so the next driver tick re-runs the Burgers-Rott IC
    // with the preset's params.
    (solver as unknown as { hasInitialised: boolean }).hasInitialised = false;
    solver.syncParams(params, 0);
    // Note: we intentionally DO NOT clear appliedPreset — keeping it set
    // means users can see in the UI which preset is currently active.
    // It only changes when applyPreset is called again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPulse]);

  return null;
}
