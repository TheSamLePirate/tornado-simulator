export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface GridSpec {
  /** number of cells in each direction */
  Nx: number;
  Ny: number;
  Nz: number;
  /** cell size in meters */
  dx: number;
  dy: number;
  dz: number;
  /** domain extent in meters */
  Lx: number;
  Ly: number;
  Lz: number;
}

const PRESETS: Record<QualityPreset, [number, number, number]> = {
  low: [64, 64, 48],
  medium: [96, 96, 72],
  high: [128, 128, 96],
  ultra: [192, 192, 144],
};

export const DOMAIN_LX = 2000; // m
export const DOMAIN_LY = 2000; // m
export const DOMAIN_LZ = 1500; // m
export const DOMAIN_R = 1000; // m, lateral inflow cylinder radius

export function makeGrid(preset: QualityPreset = "medium"): GridSpec {
  const [Nx, Ny, Nz] = PRESETS[preset];
  return {
    Nx,
    Ny,
    Nz,
    dx: DOMAIN_LX / Nx,
    dy: DOMAIN_LY / Ny,
    dz: DOMAIN_LZ / Nz,
    Lx: DOMAIN_LX,
    Ly: DOMAIN_LY,
    Lz: DOMAIN_LZ,
  };
}

/** index 3D into linear (x fastest) */
export function idx3(g: GridSpec, i: number, j: number, k: number): number {
  return i + g.Nx * (j + g.Ny * k);
}

/** world coordinates of cell center, with origin at domain center on x,y and ground on z */
export function cellCenter(
  g: GridSpec,
  i: number,
  j: number,
  k: number,
): { x: number; y: number; z: number } {
  return {
    x: (i + 0.5) * g.dx - g.Lx / 2,
    y: (j + 0.5) * g.dy - g.Ly / 2,
    z: (k + 0.5) * g.dz,
  };
}
