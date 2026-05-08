/**
 * Enhanced Fujita scale tier based on a 3-second gust speed.
 * (Wind Science and Engineering Center 2006)
 *
 * The official scale is defined in mph (US standard). Metric equivalents
 * shown for reference — internal thresholds use m/s directly.
 *
 * EF0  29–38 m/s   (105–137 km/h)
 * EF1  38–49 m/s   (138–177 km/h)
 * EF2  50–60 m/s   (178–217 km/h)
 * EF3  61–74 m/s   (218–266 km/h)
 * EF4  75–89 m/s   (267–322 km/h)
 * EF5  >89 m/s     (>322 km/h)
 */
export type EFTier = 0 | 1 | 2 | 3 | 4 | 5;

export interface EFRating {
  tier: EFTier;
  label: string;
}

const LABELS: Record<EFTier, string> = {
  0: "Faible",
  1: "Faible",
  2: "Forte",
  3: "Forte",
  4: "Violente",
  5: "Violente",
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
  let tier: EFTier = 0;
  if (vmaxMs <= 38) tier = 0;
  else if (vmaxMs <= 49) tier = 1;
  else if (vmaxMs <= 60) tier = 2;
  else if (vmaxMs <= 74) tier = 3;
  else if (vmaxMs <= 89) tier = 4;
  else tier = 5;
  return { tier, label: LABELS[tier] };
}
