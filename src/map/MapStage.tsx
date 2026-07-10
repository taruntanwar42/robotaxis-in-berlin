import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Polygon } from "geojson";
import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import type { ReportData } from "../lib/data";
import { MODE_HEX } from "../lib/data";
import { replayStore } from "./replayStore";

type CameraSpec = {
  padFactor: number; // bbox inflation
  pitch: number;
  bearing: number;
  showOrigins: boolean;
  showReplay: boolean;
};

const CAMERAS: Record<string, CameraSpec> = {
  hero: { padFactor: 2.2, pitch: 48, bearing: -18, showOrigins: false, showReplay: false },
  place: { padFactor: 1.12, pitch: 0, bearing: 0, showOrigins: true, showReplay: false },
  today: { padFactor: 1.35, pitch: 0, bearing: 0, showOrigins: true, showReplay: false },
  vehicle: { padFactor: 2.0, pitch: 40, bearing: 12, showOrigins: false, showReplay: false },
  experiment: { padFactor: 1.12, pitch: 34, bearing: -14, showOrigins: false, showReplay: true },
  service: { padFactor: 1.5, pitch: 20, bearing: -14, showOrigins: false, showReplay: true },
  fare: { padFactor: 1.8, pitch: 10, bearing: 0, showOrigins: false, showReplay: false },
  business: { padFactor: 1.65, pitch: 18, bearing: -6, showOrigins: false, showReplay: false },
  access: { padFactor: 1.8, pitch: 10, bearing: 0, showOrigins: true, showReplay: false },
  catch: { padFactor: 1.6, pitch: 25, bearing: 8, showOrigins: false, showReplay: false },
  where: { padFactor: 5.5, pitch: 30, bearing: -20, showOrigins: false, showReplay: false },
  verdict: { padFactor: 1.4, pitch: 30, bearing: -10, showOrigins: false, showReplay: true },
  methods: { padFactor: 2.2, pitch: 0, bearing: 0, showOrigins: false, showReplay: false },
};

function bboxOf(fc: FeatureCollection): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const eat = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as [number, number];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    } else if (Array.isArray(c)) {
      c.forEach(eat);
    }
  };
  fc.features.forEach((f) => eat((f.geometry as Polygon).coordinates));
  return [minX, minY, maxX, maxY];
}

function inflate(b: [number, number, number, number], f: number): [[number, number], [number, number]] {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const hw = ((b[2] - b[0]) / 2) * f, hh = ((b[3] - b[1]) / 2) * f;
  return [[cx - hw, cy - hh], [cx + hw, cy + hh]];
}

/** Interpolated cab position at simSec. Path samples: [t, lon, lat, state]. */
function cabAt(path: [number, number, number, string][], t: number): [number, number, string] | null {
  if (!path.length || t < path[0][0] || t > path[path.length - 1][0]) return null;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid][0] <= t) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[hi];
  const span = b[0] - a[0] || 1;
  const k = (t - a[0]) / span;
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3]];
}

interface TrafficLayer {
  meta: { stepSec: number };
  tracks: { id: string; path: [number, number, number][] }[];
}

function trackAt(path: [number, number, number][], t: number): [number, number] | null {
  if (!path.length || t < path[0][0] || t > path[path.length - 1][0]) return null;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid][0] <= t) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[hi];
  const span = b[0] - a[0] || 1;
  // tracks are sparse (4 s); don't interpolate across gaps (vehicle left net)
  if (span > 12) return null;
  const k = (t - a[0]) / span;
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function MapStage({ report, section }: { report: ReportData; section: string }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const sectionRef = useRef(section);
  sectionRef.current = section;

  // create once
  useEffect(() => {
    const styleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL as string;
    const map = new maplibregl.Map({
      container: container.current!,
      style: styleUrl,
      center: [13.32, 52.52],
      zoom: 11.4,
      pitch: 48,
      bearing: -18,
      interactive: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on("load", () => {
      // debug handle for headless QA probes; harmless in production
      (window as unknown as Record<string, unknown>).__map = map;
      map.addSource("service-area", { type: "geojson", data: report.serviceArea });
      map.addLayer({
        id: "area-fill",
        type: "fill",
        source: "service-area",
        paint: { "fill-color": "#f5c518", "fill-opacity": 0.045 },
      });
      map.addLayer({
        id: "area-line",
        type: "line",
        source: "service-area",
        paint: { "line-color": "#f5c518", "line-opacity": 0.55, "line-width": 1.6 },
      });

      const originsFC: FeatureCollection = {
        type: "FeatureCollection",
        features: report.demand.evening.origins.map(([lon, lat, mode]) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: { mode },
        })),
      };
      map.addSource("origins", { type: "geojson", data: originsFC });
      map.addLayer({
        id: "origins",
        type: "circle",
        source: "origins",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2, 14, 3.6],
          "circle-color": [
            "match", ["get", "mode"],
            ...Object.entries(MODE_HEX).flatMap(([m, c]) => [m, c]),
            "#98a4ba",
          ] as unknown as DataDrivenPropertyValueSpecification<string>,
          "circle-opacity": 0.85,
          "circle-stroke-width": 0,
        },
      });

      map.addSource("traffic", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "traffic",
        type: "circle",
        source: "traffic",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.2, 15, 4.5],
          "circle-color": "#8494ad",
          "circle-opacity": 0.75,
        },
      });

      map.addSource("riders", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "riders",
        type: "circle",
        source: "riders",
        paint: {
          "circle-radius": 4,
          "circle-color": "#0d1220",
          "circle-stroke-color": "#e8ecf4",
          "circle-stroke-width": 1.6,
          "circle-opacity": 0.9,
        },
      });

      map.addSource("cabs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "cabs-glow",
        type: "circle",
        source: "cabs",
        paint: {
          "circle-radius": 11,
          "circle-color": "#f5c518",
          "circle-blur": 1,
          "circle-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "cabs",
        type: "circle",
        source: "cabs",
        paint: {
          "circle-radius": 5,
          "circle-color": ["match", ["get", "state"], "occupied", "#f5c518", "#c79310"],
          "circle-stroke-color": "#0d1220",
          "circle-stroke-width": 1.5,
        },
      });

      readyRef.current = true;
      applySection(section, false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySection(id: string, animate: boolean) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const cam = CAMERAS[id] ?? CAMERAS.hero;
    const bounds = inflate(bboxOf(report.serviceArea), cam.padFactor);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.fitBounds(bounds, {
      pitch: cam.pitch,
      bearing: cam.bearing,
      duration: animate && !reduce ? 2400 : 0,
      essential: false,
      padding: 20,
    });
    for (const [layer, on] of [
      ["origins", cam.showOrigins],
      ["cabs", cam.showReplay],
      ["cabs-glow", cam.showReplay],
      ["riders", cam.showReplay],
      ["traffic", cam.showReplay],
    ] as const) {
      if (map.getLayer(layer)) {
        map.setLayoutProperty(layer, "visibility", on ? "visible" : "none");
      }
    }
  }

  // camera per section
  useEffect(() => {
    applySection(section, true);
    // arriving at the experiment starts the show once
    if (section === "experiment") {
      const s = replayStore.get();
      if (!s.playing && s.timeSec <= report.replay.meta.startSec + 1) {
        replayStore.set({ playing: true });
      }
    } else if (replayStore.get().follow) {
      replayStore.set({ follow: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // ambient traffic: lazy, optional — the replay works without it
  const trafficRef = useRef<TrafficLayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/report/traffic.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TrafficLayer | null) => {
        if (!cancelled) trafficRef.current = data;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // replay: one rAF loop owned here, advancing the store and painting sources
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let followTarget: string | null = null;
    let wasFollowing = false;
    const { replay } = report;
    const endSec = replay.meta.endSec;

    const paint = () => {
      const map = mapRef.current;
      const { timeSec, follow } = replayStore.get();
      if (map && readyRef.current && (CAMERAS[sectionRef.current] ?? CAMERAS.hero).showReplay) {
        const cabFeatures = replay.cabs.flatMap((cab) => {
          const p = cabAt(cab.path, timeSec);
          return p
            ? [{
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [p[0], p[1]] },
                properties: { state: p[2], id: cab.id },
              }]
            : [];
        });
        (map.getSource("cabs") as maplibregl.GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: cabFeatures,
        });
        const riderFeatures = replay.riders.flatMap((r) => {
          const waiting = timeSec >= r.departSec && (r.pickupSec === null || timeSec < r.pickupSec);
          return waiting
            ? [{
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: r.o },
                properties: {},
              }]
            : [];
        });
        (map.getSource("riders") as maplibregl.GeoJSONSource | undefined)?.setData({
          type: "FeatureCollection",
          features: riderFeatures,
        });

        const traffic = trafficRef.current;
        if (traffic) {
          const trafficFeatures = traffic.tracks.flatMap((tr) => {
            const p = trackAt(tr.path, timeSec);
            return p
              ? [{
                  type: "Feature" as const,
                  geometry: { type: "Point" as const, coordinates: p },
                  properties: {},
                }]
              : [];
          });
          (map.getSource("traffic") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: trafficFeatures,
          });
        }

        // street-level ride-along: stay with a cab while it has a passenger,
        // hand off to the next working cab when it goes idle
        if (follow && sectionRef.current === "experiment") {
          const positions = new Map(
            cabFeatures.map((f) => [
              String(f.properties.id),
              { lonlat: f.geometry.coordinates as [number, number], state: String(f.properties.state) },
            ]),
          );
          const current = followTarget ? positions.get(followTarget) : undefined;
          if (!current || (current.state === "idle" && [...positions.values()].some((p) => p.state !== "idle"))) {
            const next =
              [...positions.entries()].find(([, p]) => p.state === "occupied") ??
              [...positions.entries()].find(([, p]) => p.state !== "idle") ??
              [...positions.entries()][0];
            followTarget = next ? next[0] : null;
          }
          const target = followTarget ? positions.get(followTarget) : undefined;
          if (target) {
            map.jumpTo({ center: target.lonlat, zoom: 15.6, pitch: 55, bearing: -14 });
          }
          wasFollowing = true;
        } else {
          followTarget = null;
          if (wasFollowing) {
            wasFollowing = false;
            applySection(sectionRef.current, true);
          }
        }
      }
      const now = performance.now();
      replayStore.tick((now - last) / 1000, endSec);
      last = now;
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [report]);

  // outer div holds the fixed positioning; maplibre owns the inner one
  return (
    <div className="map-stage" aria-hidden="true">
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
