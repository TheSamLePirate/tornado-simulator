/** Convert m/s to km/h. */
export const msToKmh = (v: number): number => v * 3.6;

/** Convert Pa to hPa (millibars). */
export const paToHpa = (p: number): number => p * 0.01;

/** Convert Kelvin to Celsius. */
export const kToC = (T: number): number => T - 273.15;
