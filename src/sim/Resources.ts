import * as THREE from "three";
import type { GridSpec } from "./grid";

/**
 * Create a Data3DTexture wrapping a Float32 (R32F) field of size Nx·Ny·Nz·channels.
 * Three.js will allocate the underlying GPUTexture on first render.
 */
export function makeData3DTexture(
  g: GridSpec,
  data: Float32Array,
  channels: 1 | 4,
): THREE.Data3DTexture {
  const tex = new THREE.Data3DTexture(data, g.Nx, g.Ny, g.Nz);
  tex.format = channels === 1 ? THREE.RedFormat : THREE.RGBAFormat;
  tex.type = THREE.FloatType;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Holds all GPU-resident simulation fields. Lazily expanded as solver
 * milestones come online — for M2 we only need a single velocity field.
 */
export interface SimResources {
  grid: GridSpec;
  velocity: THREE.Data3DTexture;
  /** Backing Float32Array for the velocity texture; same memory as tex.image.data. */
  velocityData: Float32Array;
  dispose(): void;
}

export function makeResources(
  grid: GridSpec,
  velocityData: Float32Array,
): SimResources {
  const velocity = makeData3DTexture(grid, velocityData, 4);
  return {
    grid,
    velocity,
    velocityData,
    dispose() {
      velocity.dispose();
    },
  };
}
