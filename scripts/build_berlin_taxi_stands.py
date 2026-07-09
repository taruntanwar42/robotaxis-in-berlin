"""Build demand-weighted Cybercab taxi stands for the berlin scenario.

The original stands mirrored the 6x5 spawn grid — uniform over 890 km² while
demand clusters in the inner city. Measured effect (fleet-60 recordings,
2026-07-08): the nearest IDLE cab averaged 5.7 km from a new request, and the
median wait was pickup-drive-bound at ~15 min. Idle taxis drive to stands
(device.taxi idle-algorithm taxistand), so stand placement IS idle-supply
placement: this generator puts stands where riders actually appear.

Method: quantize the full 18-19h MATSim trip pool's pickup points into cells,
take the densest cells as stand sites, then add coverage sites for populated
outer grid slots that ended up far from every demand stand (a rare periphery
request should not face a 20-minute pickup because no cab ever idles nearby).
Stand edges must be taxi-capable service edges (berlin.service-edges.txt),
passenger lanes >= 60 m; depot->stand routability is spot-checked via sumolib.

Output preserves the existing file's depot parkingArea + charging station.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import sumolib


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BERLIN_DIR = PROJECT_ROOT / "hf-space" / "app" / "sumo" / "berlin"
DEFAULT_POOL = (
    PROJECT_ROOT
    / "data"
    / "intermediate"
    / "matsim"
    / "berlin"
    / "charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_all_modes.json"
)

DEPOT_EDGE = "8036812#2"
DEPOT_HEADER = (
    '    <parkingArea id="cybercab_depot" lane="8036812#2_0" startPos="118.0" '
    'endPos="132.0" roadsideCapacity="60" onRoad="false" friendlyPos="true"/>\n'
    '    <chargingStation id="cybercab_depot_charging" lane="8036812#2_0" '
    'startPos="118.0" endPos="132.0" power="150000" totalPower="9000000" '
    'efficiency="0.95" chargeDelay="0" chargeInTransit="false" '
    'parkingArea="cybercab_depot"/>\n'
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--net", type=Path, default=BERLIN_DIR / "berlin.net.xml")
    parser.add_argument("--pool", type=Path, default=DEFAULT_POOL)
    parser.add_argument(
        "--service-edges", type=Path, default=BERLIN_DIR / "berlin.service-edges.txt"
    )
    parser.add_argument(
        "--output", type=Path, default=BERLIN_DIR / "berlin-taxi-stands.add.xml"
    )
    # ~24 stands total: the taxistand rerouter's cost scales with
    # (trigger edges x alternatives) — 47 stands measured ~3-4 sim-s/s vs
    # ~15-20 at 24, and live mode needs the speed. 24 demand-weighted stands
    # still cut nearest-stand P50 from 3.49 km (uniform 20) to 2.09 km.
    parser.add_argument("--demand-stands", type=int, default=14)
    parser.add_argument("--cell-m", type=float, default=750.0)
    parser.add_argument("--coverage-km", type=float, default=6.0)
    parser.add_argument("--capacity", type=int, default=8)
    args = parser.parse_args()

    service_edges = {
        line.strip() for line in args.service_edges.read_text().splitlines() if line.strip()
    }
    with args.pool.open("r", encoding="utf-8") as handle:
        trips = json.load(handle)["trips"]
    print(f"pool: {len(trips)} trips")

    print("parsing net (~1-2 min)...")
    net = sumolib.net.readNet(str(args.net))

    pickups: list[tuple[float, float]] = []
    for trip in trips:
        lon, lat = trip.get("originLon"), trip.get("originLat")
        if lon is None or lat is None:
            continue
        pickups.append(net.convertLonLat2XY(lon, lat))
    print(f"pickups with coordinates: {len(pickups)}")

    cell = args.cell_m
    cell_counts: Counter[tuple[int, int]] = Counter()
    cell_points: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for x, y in pickups:
        key = (int(x // cell), int(y // cell))
        cell_counts[key] += 1
        cell_points[key].append((x, y))

    def cell_center(key: tuple[int, int]) -> tuple[float, float]:
        points = cell_points[key]
        return (
            sum(p[0] for p in points) / len(points),
            sum(p[1] for p in points) / len(points),
        )

    sites: list[tuple[float, float, str]] = []  # x, y, why
    for key, count in cell_counts.most_common(args.demand_stands):
        x, y = cell_center(key)
        sites.append((x, y, f"demand cell ({count} pickups)"))

    # Coverage: populated outer 6x5 grid slots (the old uniform layout) whose
    # demand is far from every chosen stand still get one stand each.
    xs = [p[0] for p in pickups]
    ys = [p[1] for p in pickups]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    slot_points: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for x, y in pickups:
        col = min(5, int((x - min_x) / max(1.0, max_x - min_x) * 6))
        row = min(4, int((y - min_y) / max(1.0, max_y - min_y) * 5))
        slot_points[(row, col)].append((x, y))
    coverage_limit_sq = (args.coverage_km * 1000.0) ** 2
    for slot, points in sorted(slot_points.items(), key=lambda kv: -len(kv[1])):
        if len(points) < 5:
            continue
        cx = sum(p[0] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        nearest_sq = min(
            (cx - sx) ** 2 + (cy - sy) ** 2 for sx, sy, _ in sites
        )
        if nearest_sq > coverage_limit_sq:
            sites.append((cx, cy, f"coverage slot r{slot[0]}c{slot[1]} ({len(points)} pickups)"))

    print(f"sites: {len(sites)}")

    depot_edge = net.getEdge(DEPOT_EDGE)
    chosen: list[tuple[str, str]] = []  # (edgeId, why)
    used_edges = {DEPOT_EDGE}
    for x, y, why in sites:
        candidates = net.getNeighboringEdges(x, y, r=600.0)
        candidates.sort(key=lambda pair: pair[1])
        picked = None
        for edge, _dist in candidates:
            edge_id = edge.getID()
            if edge_id in used_edges or edge_id not in service_edges:
                continue
            if not edge.allows("passenger") or edge.getLength() < 62.0:
                continue
            lane = edge.getLanes()[0]
            if not lane.allows("passenger"):
                continue
            picked = edge_id
            break
        if picked is None:
            print(f"  ! no edge for site: {why}")
            continue
        used_edges.add(picked)
        chosen.append((picked, why))

    # Spot-check routability from the depot to the busiest stand and back.
    probe = net.getEdge(chosen[0][0])
    there = net.getShortestPath(depot_edge, probe, vClass="passenger")[0]
    back = net.getShortestPath(probe, depot_edge, vClass="passenger")[0]
    if there is None or back is None:
        raise SystemExit(f"routability probe failed for stand edge {chosen[0][0]}")
    print(f"routability probe OK (depot <-> {chosen[0][0]})")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        '<additional xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/additional_file.xsd">\n',
        "    <!-- Cybercab taxi stands, demand-weighted: idle taxis drive\n"
        "         themselves to these stands (device.taxi idle-algorithm\n"
        "         taxistand), so stand placement IS idle-supply placement.\n"
        f"         Sites = densest {args.cell_m:.0f} m pickup cells of the full\n"
        "         18-19h MATSim pool + coverage for populated outer slots.\n"
        "         Generated by scripts/build_berlin_taxi_stands.py. -->\n",
        DEPOT_HEADER,
    ]
    for index, (edge_id, why) in enumerate(chosen):
        end_pos = 60.0
        lines.append(
            f'    <parkingArea id="cybercab_stand_{index:02d}" lane="{edge_id}_0" '
            f'startPos="15.0" endPos="{end_pos:.1f}" roadsideCapacity="{args.capacity}" '
            f'onRoad="false" friendlyPos="true"/> <!-- {why} -->\n'
        )
    # The taxi device's taxistand idle algorithm reads its stand list from
    # this rerouter (vehicles carry device.taxi.stands-rerouter with this id).
    rerouter_edges = " ".join([DEPOT_EDGE, *(edge_id for edge_id, _ in chosen)])
    lines.append(
        f'    <rerouter id="txl_adac_cybercab_taxi_stands" edges="{rerouter_edges}" '
        'vTypes="CybercabRobotaxi">\n'
        '        <interval begin="0" end="86400">\n'
    )
    for index in range(len(chosen)):
        lines.append(f'            <parkingAreaReroute id="cybercab_stand_{index:02d}"/>\n')
    lines.append("        </interval>\n    </rerouter>\n</additional>\n")
    args.output.write_text("".join(lines), encoding="utf-8")
    print(f"wrote {len(chosen)} stands -> {args.output}")


if __name__ == "__main__":
    main()
