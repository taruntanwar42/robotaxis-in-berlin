// The single source of chart/map color truth. Semantic names only.
// Chart sets machine-validated (dataviz validator) on light #FFFFFF.

export const SURFACE = {
  page: "#ffffff",
  panel: "#f5f5f7",
  ink: "#1d1d1f",
  inkSecondary: "#6e6e73",
  inkFaint: "#86868b",
  hairline: "rgba(0,0,0,0.08)",
} as const;

// the identity hue, tone-mapped to three roles (Apple brand-on-white pattern)
export const GOLD_TINT = "#f5c518"; // fills under dark ink only (CTA, selection, corridor fill)
export const GOLD = "#ba8c0c"; // marks: chart series, cab dots
export const GOLD_TEXT = "#946e00"; // small text: eyebrows, labels
export const WARN = "#c4201d"; // warn-only (Tesla-red adjacent, small-mark legal)

// categorical: transport modes (validated on white — kept from the dark theme)
export const MODE: Record<string, string> = {
  walk: "#8b5cf6",
  bike: "#15a34a",
  pt: "#0e90d2",
  car: "#e04848",
  ride: "#d6409f",
};

// entities in fare/economics charts (validated)
export const ENTITY = {
  cybercab: GOLD,
  taxi: "#2e9e8f",
  bvg: "#0e90d2",
  car: "#e04848",
} as const;

export const BAR_NEUTRAL = "#c9cfda";
export const GRID_TEXT = "#86868b";

// map layers (light basemap)
export const MAP = {
  corridorLine: GOLD_TEXT,
  corridorFill: GOLD_TINT,
  cabOccupied: GOLD, // filled = passenger aboard
  cabIdleStroke: GOLD, // hollow = empty
  cabStroke: "#ffffff",
  riderFill: "#ffffff",
  riderRingStart: "#98a0ae", // calm grey
  riderRingMid: "#c77700", // amber
  riderRingEnd: WARN,
  traffic: "#8b93a1",
} as const;
