import { msToMph } from "./units";

/**
 * Enhanced Fujita scale tier based on a 3-second gust speed.
 * (Wind Science and Engineering Center 2006)
 *
 * EF0  65–85 mph (29–38 m/s)
 * EF1  86–110 mph (38–49 m/s)
 * EF2  111–135 mph (50–60 m/s)
 * EF3  136–165 mph (61–74 m/s)
 * EF4  166–200 mph (75–89 m/s)
 * EF5  >200 mph (>89 m/s)
 */
export type EFTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface EFRating {
  tier: EFTier;
  label: string;
}

const LABELS: Record<EFTier, string> = {
  0: "Weak",
  1: "Weak",
  2: "Strong",
  3: "Strong",
  4: "Violent",
  5: "Violent",
};

export const EF_COLORS: Record<EFTier, string> = {
  0: "#74d69b",
  1: "#c8e054",
  2: "#f5c542",
  3: "#f59342",
  4: "#f55c42",
  5: "#c81c2f",
};

/** Map peak wind (m/s) to EF tier per WSEC 2006. */
export function efFromVmax(vmaxMs: number): EFRating {
  const mph = msToMph(vmaxMs);
  let tier: EFTier = 0;
  if (mph < 65) tier = 0;
  else if (mph <= 85) tier = 0;
  else if (mph <= 110) tier = 1;
  else if (mph <= 135) tier = 2;
  else if (mph <= 165) tier = 3;
  else if (mph <= 200) tier = 4;
  else tier = 5;
  return { tier, label: LABELS[tier] };
}
