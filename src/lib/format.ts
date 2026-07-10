export const fmtInt = (n: number): string =>
  new Intl.NumberFormat("en-US").format(Math.round(n));

export const fmtEur = (n: number): string =>
  `€${n.toFixed(2)}`;

export const fmtPct = (share: number, digits = 0): string =>
  `${(share * 100).toFixed(digits)}%`;

export const fmtMin = (min: number): string =>
  min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`;

export const fmtClock = (sec: number): string => {
  const m = Math.floor(sec / 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Scale a 1%-twin count to the real world, honestly rounded. */
export const scaled = (twinCount: number, scale = 100): string => {
  const real = twinCount * scale;
  if (real >= 100_000) return `~${Math.round(real / 1000)},000`;
  if (real >= 10_000) return `~${(real / 1000).toFixed(0)},000`;
  return `~${fmtInt(real)}`;
};
