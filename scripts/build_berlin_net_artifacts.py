"""Build berlin (full-city) scenario artifacts from the BeST net in one pass.

Emits into hf-space/app/sumo/berlin/:
  - berlin.area.geojson        (net bbox as lon/lat polygon; demand area filter)
  - berlin.service-edges.txt   (all non-internal passenger-capable edge ids)
  - berlin.staging.json        (spread staging edges, depot-routable both ways,
                                corridor metadata.json staging.edges format)

Depot: same TXL-area edge as the corridor (8036812#2) — verified present.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "hf-space" / "app" / "sumo" / "berlin"
NET_PATH = Path(
    r"C:\Users\KitCat\Desktop\Projects\EV Mobility Dashboard\data\raw\best-scenario\scenario\sumo\berlin.net.xml"
)
DEPOT_EDGE_ID = "8036812#2"
GRID_COLS = 6
GRID_ROWS = 5
MIN_EDGE_LENGTH_M = 60.0
TARGET_STAGING = 20

SUMO_HOME = Path(os.environ.get("SUMO_HOME", r"C:\Program Files (x86)\Eclipse\Sumo"))
sys.path.insert(0, str(SUMO_HOME / "tools"))
import sumolib  # noqa: E402


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    print("loading net ...", flush=True)
    net = sumolib.net.readNet(str(NET_PATH), withInternal=False)
    print(f"net loaded in {time.perf_counter() - started:.0f}s", flush=True)

    depot = net.getEdge(DEPOT_EDGE_ID)
    print(f"depot edge {DEPOT_EDGE_ID}: OK length {depot.getLength():.0f}m", flush=True)

    service_edges = [
        e for e in net.getEdges() if e.allows("passenger") and not e.isSpecial()
    ]
    (OUTPUT_DIR / "berlin.service-edges.txt").write_text(
        "\n".join(e.getID() for e in service_edges) + "\n", encoding="utf-8"
    )
    print(f"service edges: {len(service_edges)}", flush=True)

    # Net bbox -> lon/lat polygon (demand-script area filter takes lon/lat rings).
    x_min, y_min, x_max, y_max = net.getBoundary()
    corners_ll = [
        net.convertXY2LonLat(x, y)
        for x, y in [(x_min, y_min), (x_max, y_min), (x_max, y_max), (x_min, y_max), (x_min, y_min)]
    ]
    area = {
        "type": "FeatureCollection",
        "name": "berlin-net-envelope",
        "features": [
            {
                "type": "Feature",
                "id": "berlin:net-envelope",
                "properties": {
                    "scenarioKey": "berlin",
                    "name": "Full BeST Berlin network envelope",
                    "source": "bbox of BeST berlin.net.xml (mosaic-addons/best-scenario)",
                },
                "geometry": {"type": "Polygon", "coordinates": [[list(c) for c in corners_ll]]},
            }
        ],
    }
    (OUTPUT_DIR / "berlin.area.geojson").write_text(json.dumps(area), encoding="utf-8")
    print("area geojson written", flush=True)

    # Staging: grid slots over the bbox; nearest passenger edge >= MIN length,
    # provably routable depot->edge and edge->depot.
    candidates = [e for e in service_edges if e.getLength() >= MIN_EDGE_LENGTH_M]
    chosen: list[dict] = []
    chosen_ids: set[str] = set()
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            slot_x = x_min + (x_max - x_min) * (col + 0.5) / GRID_COLS
            slot_y = y_min + (y_max - y_min) * (row + 0.5) / GRID_ROWS
            best = None
            best_dist = float("inf")
            for edge in candidates:
                if edge.getID() in chosen_ids:
                    continue
                ex, ey = edge.getShape()[len(edge.getShape()) // 2]
                d = (ex - slot_x) ** 2 + (ey - slot_y) ** 2
                if d < best_dist:
                    best_dist = d
                    best = edge
            if best is None or best_dist > (6000.0) ** 2:
                continue  # slot center in empty bbox corner (outside city)
            route_out = net.getShortestPath(depot, best, vClass="passenger")
            route_back = net.getShortestPath(best, depot, vClass="passenger")
            if route_out[0] is None or route_back[0] is None:
                continue
            mid = best.getShape()[len(best.getShape()) // 2]
            lon, lat = net.convertXY2LonLat(mid[0], mid[1])
            chosen.append(
                {
                    "edgeId": best.getID(),
                    "sumoX": round(mid[0], 2),
                    "sumoY": round(mid[1], 2),
                    "lon": round(lon, 6),
                    "lat": round(lat, 6),
                    "lengthM": round(best.getLength(), 2),
                    "modes": ["passenger"],
                    "targetSlot": f"r{row}c{col}",
                }
            )
            chosen_ids.add(best.getID())
            print(f"  slot r{row}c{col}: {best.getID()} ({lon:.4f},{lat:.4f})", flush=True)
            if len(chosen) >= TARGET_STAGING:
                break
        if len(chosen) >= TARGET_STAGING:
            break

    staging = {
        "rule": (
            f"Nearest passenger edge >= {MIN_EDGE_LENGTH_M}m to each populated "
            f"{GRID_COLS}x{GRID_ROWS} bbox grid slot; must route depot->edge and edge->depot."
        ),
        "depotEdge": DEPOT_EDGE_ID,
        "edges": chosen,
    }
    (OUTPUT_DIR / "berlin.staging.json").write_text(json.dumps(staging, indent=1), encoding="utf-8")
    print(f"staging edges: {len(chosen)}  runtime {time.perf_counter() - started:.0f}s", flush=True)


if __name__ == "__main__":
    main()
