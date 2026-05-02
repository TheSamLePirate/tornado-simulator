/** Convert m/s to mph. */
export const msToMph = (v: number): number => v * 2.2369362921;

/** Convert Pa to hPa (millibars). */
export const paToHpa = (p: number): number => p * 0.01;

/** Convert Kelvin to Celsius. */
export const kToC = (T: number): number => T - 273.15;
