// Typed loaders for the report artifacts produced by scripts/report/*.

import type { FeatureCollection } from "geojson";

export type Agg = { mean: number; min: number; max: number };

export interface DemandData {
  meta: {
    sample: string;
    sampleScale: number;
    source: string;
    areaName: string;
    personsRead: number;
    tripsInsideAreaDay: number;
  };
  hourly: { hour: number; trips: number; byMode: Record<string, number> }[];
  modeSplit: Record<string, number>;
  purposes: Record<string, number>;
  distanceHistogramKm: { binWidthKm: number; bins: number[]; overflowFromKm: number };
  medianTripKm: number;
  medianTripKmByMode: Record<string, number>;
  persons: {
    unique: number;
    adults: number;
    seniors65: number;
    minors: number;
    medianAge: number;
    byAgeBand: Record<string, number>;
  };
  evening: {
    windowLabel: string;
    trips: number;
    byMode: Record<string, number>;
    origins: [number, number, string][];
  };
}

export interface CostsData {
  gridKm: number[];
  curvesEur: Record<"cybercab" | "taxi" | "bvgSingle" | "carFull" | "carMarginal", number[]>;
  breakEvens: {
    cybercabCheaperThanTaxiFromKm: number | null;
    bvgCheaperThanCybercabFromKm: number | null;
    carMarginalCheaperThanCybercabFromKm: number | null;
  };
  priceTable: {
    km: number;
    cybercabEur: number;
    taxiEur: number;
    bvgEur: number;
    carFullEur: number;
    carMarginalEur: number;
  }[];
  energyCostPerKmEur: number;
  assumptions: Record<string, string | number>;
  sources: Record<string, unknown>;
}

export interface SweepRow {
  fleet: number;
  requests: number;
  seeds: number[];
  served: Agg;
  servedShare: Agg;
  waitP50Min: Agg;
  waitP90Min: Agg;
  waitOver10MinShare: Agg;
  emptyShare: Agg;
  cabTotalKm: Agg;
  kwh: Agg;
  rideKmP50: Agg;
  rideP50Min: Agg;
}

export interface SweepData {
  meta: { engine: string; window: string; demand: string; seedsPerFleet: number };
  byFleet: SweepRow[];
}

export interface ReplayData {
  meta: {
    fleet: number;
    sumoSeed: number;
    startSec: number;
    endSec: number;
    stepSec: number;
    metrics: Record<string, number | string | null>;
  };
  cabs: { id: string; path: [number, number, number, string][] }[];
  riders: {
    id: string;
    o: [number, number];
    d: [number, number];
    departSec: number;
    pickupSec: number | null;
    dropoffSec: number | null;
  }[];
}

export interface EconomicsData {
  meta: Record<string, unknown>;
  perFleet: {
    fleet: number;
    revenueEur: number;
    energyCostEur: number;
    revenuePerCabEur: number;
    kmPerCab: number;
  }[];
  day: {
    fleet: number;
    label: string;
    dayFactor: number;
    ridesPerCab: number;
    revenuePerCabEur: number;
    energyCostPerCabEur: number;
    overheadAssumptionEur: number;
    marginPerCabEur: number;
    paybackYears: number;
    paybackDays: number;
    sensitivity: Record<string, { marginPerCabEur: number; paybackYears: number; fleet?: number; fareMultiplier?: number }>;
  };
  consumerSurplus: {
    fleet: number;
    servedRides: number;
    medianRideKm: number;
    cybercabFareEur: number;
    berlinTaxiFareEur: number;
    cybercabTotalEur: number;
    berlinTaxiTotalEur: number;
    riderSavingsEur: number;
    riderSavingsShare: number;
    note: string;
  };
}

export interface DayMeasured {
  meta: { kind: string; fleet: number; window: string; demand: string; limitations: string[] };
  requests: number;
  served: number;
  servedShare: number;
  waitP50Min: number;
  cabTotalKm: number;
  kmPerCab: number;
  emptyShare: number;
  kwh: number;
  revenueEur: number;
  ridesPerCab: number;
  revenuePerCabEur: number;
  energyCostPerCabEur: number;
  overheadAssumptionEur: number;
  marginPerCabEur: number;
  paybackDays: number | null;
  hourly: { hour: number; rides: number; km: number }[];
}

export interface DayFrontier {
  meta: { kind: string; note: string };
  byFleet: {
    fleet: number;
    servedShare: number;
    waitP50Min: number;
    ridesPerCab: number;
    kmPerCab: number;
    emptyShare: number;
    revenuePerCabEur: number;
    marginPerCabEur: number;
    paybackDays: number | null;
  }[];
}

export interface ReinickendorfDemand {
  meta: { areaName: string; window: string; sample: string };
  trips: number;
  byMode: Record<string, number>;
  carRideRequests: number;
  ptShare: number;
  notes: string[];
}

export interface ReportData {
  demand: DemandData;
  costs: CostsData;
  sweep: SweepData;
  replay: ReplayData;
  economics: EconomicsData;
  serviceArea: FeatureCollection;
  /** Second-district comparison; null until its pipeline has run. */
  sweepReinickendorf: SweepData | null;
  reinickendorfDemand: ReinickendorfDemand | null;
  replayReinickendorf: ReplayData | null;
  reinickendorfArea: FeatureCollection | null;
  dayMeasured: DayMeasured | null;
  dayMeasuredEveningFleet: DayMeasured | null;
  dayFrontier: DayFrontier | null;
}

const base = import.meta.env.BASE_URL;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function getOptional<T>(path: string): Promise<T | null> {
  try {
    return await get<T>(path);
  } catch {
    return null;
  }
}

export async function loadReport(): Promise<ReportData> {
  // a different recorded evening each visit (all fleet 16, different SUMO seeds)
  const replayPool = [
    "data/report/replay.json",
    "data/report/replay-seed7.json",
    "data/report/replay-seed17.json",
  ];
  const replayPick = replayPool[Math.floor(Math.random() * replayPool.length)];
  const [demand, costs, sweep, replayMaybe, economics, serviceArea, sweepReinickendorf, reinickendorfDemand, replayReinickendorf, reinickendorfArea, dayMeasured, dayMeasuredEveningFleet, dayFrontier] =
    await Promise.all([
      get<DemandData>("data/report/demand.json"),
      get<CostsData>("data/report/costs.json"),
      get<SweepData>("data/report/sweep.json"),
      getOptional<ReplayData>(replayPick),
      get<EconomicsData>("data/report/economics.json"),
      get<FeatureCollection>("data/service-area.geojson"),
      getOptional<SweepData>("data/report/sweep-reinickendorf.json"),
      getOptional<ReinickendorfDemand>("data/report/reinickendorf-demand.json"),
      getOptional<ReplayData>("data/report/replay-reinickendorf.json"),
      getOptional<FeatureCollection>("data/reinickendorf-area.geojson"),
      getOptional<DayMeasured>("data/report/economics-day-measured.json"),
      getOptional<DayMeasured>("data/report/economics-day-measured-f16.json"),
      getOptional<DayFrontier>("data/report/day-frontier.json"),
    ]);
  const replay = replayMaybe ?? (await get<ReplayData>("data/report/replay.json"));
  return { demand, costs, sweep, replay, economics, serviceArea, sweepReinickendorf, reinickendorfDemand, replayReinickendorf, reinickendorfArea, dayMeasured, dayMeasuredEveningFleet, dayFrontier };
}

export const MODE_COLOR: Record<string, string> = {
  walk: "var(--c-walk)",
  bike: "var(--c-bike)",
  pt: "var(--c-pt)",
  car: "var(--c-car)",
  ride: "var(--c-ride)",
};

export const MODE_HEX: Record<string, string> = {
  walk: "#8b5cf6",
  bike: "#15a34a",
  pt: "#0e90d2",
  car: "#e04848",
  ride: "#d6409f",
};

export const MODE_LABEL: Record<string, string> = {
  walk: "Walk",
  bike: "Bike",
  pt: "Public transit",
  car: "Car",
  ride: "Car passenger",
};

export const MODE_ORDER = ["walk", "bike", "car", "pt", "ride"];
