"""Offline fleet sweep on the Reinickendorf district SUMO twin.

Contrast experiment to the corridor sweep (`run_fleet_sweep.py`): same
engine (SUMO 1.27 built-in taxi device, greedyClosest dispatch, headless
`sumo` subprocess, tripinfo parsing), different Kiez. Reinickendorf is an
outer district with thin evening demand, so the request window is the full
18:00-21:00 evening (88 car/ride trips in the 1% twin) instead of the
corridor's single 18:00-19:00 hour (125 trips).

The packaged demand file has no pickupEdge/dropoffEdge, so requests are
nearest-edge matched with sumolib (convertLonLat2XY + getNeighboringEdges,
radius 60/120/250 m, taxi+passenger edges only, closest wins). Matching is
restricted to the largest strongly connected component of the taxi-permitted
lane-connection graph: the strict-contained cutout has trap edges (e.g.
'4706735#1', '1327638389') a cab can enter but never leave -- a dropoff
there deadlocks the taxi device for the rest of the evening (verified: the
fleet-2 runs flatlined at 19 served before this filter). Cabs stage at the
TXL/ADAC Cybercab depot edge from the packaged additional file.

Usage:
  python scripts/report/run_reinickendorf_sweep.py --fleet 4 --sumo-seed 7
  python scripts/report/run_reinickendorf_sweep.py --fleet 8 --sumo-seed 17 --out runs.json
"""

from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCEN = REPO / "hf-space" / "app" / "sumo" / "reinickendorf-district"
NET = SCEN / "reinickendorf-district.net.xml"
BACKGROUND = SCEN / "reinickendorf-district-contained.rou.xml"
DEPOT_ADD = SCEN / "txl-adac-cybercab-depot.add.xml"
DEMAND = (
    REPO
    / "hf-space/app/data/matsim/reinickendorf_person_trips_1pct_180000_210000_all_modes.json"
)

BEGIN_SEC = 64_800  # 18:00
REQUEST_END_SEC = 75_600  # 21:00 (3h window: district demand is thin)
END_SEC = 79_200  # 22:00 hard stop; +3600 padding for last dropoffs
WH_PER_KM = 102.5  # Cybercab EPA-derived efficiency (see constants.py)
SEATS = 2
HOLD_SEC = 30  # pickup/dropoff service hold, matches live-app behavior

# Depot edge from txl-adac-cybercab-depot.add.xml (parkingArea lane
# 8036812#2_0). The depot connector was purpose-built into the cutout
# (metadata.json depotConnector), so cabs staged here can route into the
# district. Add edges here if a sweep run reports 'no valid route from X'.
DEPOT_EDGE = "8036812#2"
UNROUTABLE_SPAWN_EDGES: set[str] = set()

MATCH_RADII_M = (60.0, 120.0, 250.0)


def load_net():
    import sumolib

    return sumolib.net.readNet(str(NET))


def taxi_scc_edges(net) -> set[str]:
    """Edge IDs in the largest SCC of the taxi lane-connection graph.

    Edge-level getOutgoing() is not enough: some connections are only
    permitted for other vClasses, leaving lane-level trap edges that look
    connected on paper. Tarjan (iterative) over ~1.8k edges, <1s.
    """
    edges = [e for e in net.getEdges() if e.allows("taxi")]
    ids = {e.getID() for e in edges}

    def succs(e) -> list[str]:
        out = []
        for nxt, conns in e.getOutgoing().items():
            if nxt.getID() not in ids:
                continue
            for c in conns:
                try:
                    if c.getFromLane().allows("taxi") and c.getToLane().allows("taxi"):
                        out.append(nxt.getID())
                        break
                except Exception:
                    out.append(nxt.getID())
                    break
        return out

    graph = {e.getID(): succs(e) for e in edges}
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    sccs: list[list[str]] = []
    counter = 0
    for root in graph:
        if root in index:
            continue
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        work = [(root, iter(graph[root]))]
        while work:
            v, it = work[-1]
            advanced = False
            for w in it:
                if w not in index:
                    index[w] = low[w] = counter
                    counter += 1
                    stack.append(w)
                    on_stack.add(w)
                    work.append((w, iter(graph[w])))
                    advanced = True
                    break
                if w in on_stack:
                    low[v] = min(low[v], index[w])
            if advanced:
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[v])
            if low[v] == index[v]:
                comp = []
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    comp.append(w)
                    if w == v:
                        break
                sccs.append(comp)
    return set(max(sccs, key=len))


def nearest_taxi_edge(net, lon: float, lat: float, allowed: set[str]) -> str | None:
    """Closest strongly-connected edge allowing taxi+passenger, <=250 m away."""
    x, y = net.convertLonLat2XY(lon, lat)
    for radius in MATCH_RADII_M:
        candidates = [
            (dist, edge)
            for edge, dist in net.getNeighboringEdges(x, y, radius)
            if edge.getID() in allowed
            and edge.allows("taxi")
            and edge.allows("passenger")
        ]
        if candidates:
            candidates.sort(key=lambda c: c[0])
            return candidates[0][1].getID()
    return None


def load_requests(net=None) -> tuple[list[dict], dict]:
    """Car/ride trips 18:00-21:00, nearest-edge matched onto the net.

    Returns (requests, matching_stats).
    """
    if net is None:
        net = load_net()
    allowed = taxi_scc_edges(net)
    data = json.loads(DEMAND.read_text(encoding="utf-8"))
    trips = [
        t
        for t in data["trips"]
        if t.get("primaryMode") in ("car", "ride")
        and BEGIN_SEC <= float(t["departureSec"]) < REQUEST_END_SEC
    ]
    trips.sort(key=lambda t: t["departureSec"])

    requests: list[dict] = []
    unmatched = 0
    same_edge = 0
    for t in trips:
        pickup = nearest_taxi_edge(net, t["originLon"], t["originLat"], allowed)
        dropoff = nearest_taxi_edge(net, t["destinationLon"], t["destinationLat"], allowed)
        if not pickup or not dropoff:
            unmatched += 1
            continue
        if pickup == dropoff:
            same_edge += 1
        req = dict(t)
        req["pickupEdge"] = pickup
        req["dropoffEdge"] = dropoff
        requests.append(req)
    stats = {
        "candidates": len(trips),
        "matched": len(requests),
        "unmatched": unmatched,
        "sameEdgePairs": same_edge,
    }
    return requests, stats


def fleet_spawn_edges(n: int, rng: random.Random) -> list[str]:
    # All cabs stage at the packaged TXL/ADAC depot edge; the cutout was
    # built with an explicit depot connector so this edge routes into the
    # district (unlike arbitrary demand pickup edges, which are not all
    # strongly connected as route starts -- the corridor taught us that).
    edges = [e for e in [DEPOT_EDGE] if e not in UNROUTABLE_SPAWN_EDGES]
    if not edges:
        raise SystemExit("no routable spawn edges configured")
    return [edges[i % len(edges)] for i in range(n)]


def build_route_file(fleet: int, requests: list[dict], out_path: Path, rng: random.Random) -> None:
    root = ET.Element("routes")
    vtype = ET.SubElement(
        root,
        "vType",
        id="CybercabRobotaxi",
        vClass="taxi",
        personCapacity=str(SEATS),
        length="4.2",
        width="1.85",
        color="255,193,7",
    )
    ET.SubElement(vtype, "param", key="has.taxi.device", value="true")
    ET.SubElement(vtype, "param", key="device.taxi.end", value=str(END_SEC))
    ET.SubElement(vtype, "param", key="device.taxi.pickUpDuration", value=str(HOLD_SEC))
    ET.SubElement(vtype, "param", key="device.taxi.dropOffDuration", value=str(HOLD_SEC))
    ET.SubElement(vtype, "param", key="device.taxi.parking", value="true")
    ET.SubElement(vtype, "param", key="parking.ignoreDest", value="1")

    for index, edge in enumerate(fleet_spawn_edges(fleet, rng)):
        vid = f"cybercab_{index + 1:02d}"
        ET.SubElement(root, "route", id=f"r_{vid}", edges=edge)
        ET.SubElement(
            root,
            "vehicle",
            id=vid,
            type="CybercabRobotaxi",
            route=f"r_{vid}",
            depart=str(BEGIN_SEC),
            departLane="best",
            departPos="random",
            departSpeed="0",
        )

    for i, req in enumerate(requests):
        person = ET.SubElement(
            root,
            "person",
            id=f"rider_{i + 1:04d}",
            depart=str(float(req["departureSec"])),
        )
        ET.SubElement(
            person,
            "ride",
            {"from": req["pickupEdge"], "to": req["dropoffEdge"], "lines": "taxi"},
        )

    ET.ElementTree(root).write(out_path, encoding="utf-8", xml_declaration=True)


def sumo_args(taxi_routes: Path, tripinfo: Path, seed: int, dispatch: str = "greedyClosest") -> list[str]:
    return [
        "-n", str(NET),
        "-r", f"{BACKGROUND},{taxi_routes}",
        "-a", str(DEPOT_ADD),
        "--begin", str(BEGIN_SEC),
        "--end", str(END_SEC),
        "--seed", str(seed),
        "--device.taxi.dispatch-algorithm", dispatch,
        "--device.taxi.idle-algorithm", "stop",
        # The strict-contained cutout has weakly-connected pockets; a cab
        # that drops off inside one can't route to some next pickup.
        # Without this flag SUMO quits the whole run on the first such
        # dispatch.
        "--ignore-route-errors", "true",
        "--tripinfo-output", str(tripinfo),
        "--tripinfo-output.write-unfinished", "true",
        "--no-internal-links", "false",
        "--ignore-junction-blocker", "20",
        "--time-to-teleport", "120",
        "--time-to-teleport.highways", "0",
        "--no-step-log", "true",
        "--no-warnings", "true",
        "--duration-log.statistics", "true",
    ]


def parse_tripinfo(tripinfo: Path, n_requests: int, fleet: int) -> dict:
    tree = ET.parse(tripinfo)
    waits: list[float] = []
    ride_secs: list[float] = []
    ride_kms: list[float] = []
    served = 0
    for pi in tree.getroot().iter("personinfo"):
        for ride in pi.iter("ride"):
            arrival = float(ride.get("arrival", "-1"))
            vehicle = ride.get("vehicle", "NULL")
            wait = float(ride.get("waitingTime", "-1"))
            if arrival >= 0 and vehicle not in ("NULL", ""):
                served += 1
                waits.append(wait)
                ride_secs.append(float(ride.get("duration", "0")))
                ride_kms.append(float(ride.get("routeLength", "0")) / 1000.0)

    total_km = 0.0
    occupied_km = 0.0
    cab_rides = []
    for ti in tree.getroot().iter("tripinfo"):
        if not str(ti.get("id", "")).startswith("cybercab_"):
            continue
        total_km += float(ti.get("routeLength", "0")) / 1000.0
        taxi = ti.find("taxi")
        if taxi is not None:
            occupied_km += float(taxi.get("occupiedDistance", "0")) / 1000.0
            cab_rides.append(int(taxi.get("customers", "0")))

    def pct(values: list[float], q: float) -> float | None:
        if not values:
            return None
        s = sorted(values)
        idx = min(len(s) - 1, max(0, round(q * (len(s) - 1))))
        return s[idx]

    return {
        "requests": n_requests,
        "served": served,
        "servedShare": round(served / n_requests, 4) if n_requests else None,
        "waitP50Sec": pct(waits, 0.5),
        "waitP90Sec": pct(waits, 0.9),
        "waitMeanSec": round(sum(waits) / len(waits), 1) if waits else None,
        "waitOver10MinShare": round(sum(1 for w in waits if w > 600) / len(waits), 4) if waits else None,
        "rideP50Sec": pct(ride_secs, 0.5),
        "rideKmP50": pct(ride_kms, 0.5),
        "cabTotalKm": round(total_km, 2),
        "cabOccupiedKm": round(occupied_km, 2),
        "cabEmptyKm": round(total_km - occupied_km, 2),
        "emptyShare": round((total_km - occupied_km) / total_km, 4) if total_km else None,
        "kwh": round(total_km * WH_PER_KM / 1000.0, 2),
        "ridesPerCabP50": pct([float(c) for c in cab_rides], 0.5),
    }


def run_headless(fleet: int, seed: int, dispatch: str = "greedyClosest") -> dict:
    requests, match_stats = load_requests()
    rng = random.Random(1000 + fleet)
    with tempfile.TemporaryDirectory(prefix="sweep_rdf_") as tmp:
        taxi_routes = Path(tmp) / "taxi.rou.xml"
        tripinfo = Path(tmp) / "tripinfo.xml"
        build_route_file(fleet, requests, taxi_routes, rng)
        cmd = ["sumo", *sumo_args(taxi_routes, tripinfo, seed, dispatch)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr[-3000:] + "\n")
            raise SystemExit(f"sumo failed (fleet={fleet} seed={seed})")
        metrics = parse_tripinfo(tripinfo, len(requests), fleet)
    metrics.update(
        {
            "fleet": fleet,
            "sumoSeed": seed,
            "dispatch": dispatch,
            "engine": f"sumo-taxi-{dispatch}",
            "edgeMatching": match_stats,
        }
    )
    return metrics


def run_trace(fleet: int, seed: int, trace_path: Path, step: int = 2, dispatch: str = "greedyClosest") -> dict:
    """Record per-2s cab positions for the map replay (same format as the
    corridor replay.json)."""
    import libsumo

    net = load_net()
    requests, _match_stats = load_requests(net)
    rng = random.Random(1000 + fleet)
    tmpdir = Path(tempfile.mkdtemp(prefix="trace_rdf_"))
    taxi_routes = tmpdir / "taxi.rou.xml"
    tripinfo = tmpdir / "tripinfo.xml"
    build_route_file(fleet, requests, taxi_routes, rng)
    libsumo.start(["sumo", *sumo_args(taxi_routes, tripinfo, seed, dispatch)])

    cab_paths: dict[str, list] = {}
    state_names = {0: "idle", 1: "to_pickup", 2: "occupied", 3: "occupied"}
    now = BEGIN_SEC
    while now < END_SEC:
        libsumo.simulationStep()
        now = int(libsumo.simulation.getTime())
        if libsumo.simulation.getMinExpectedNumber() == 0 and now > REQUEST_END_SEC:
            break
        if now % step:
            continue
        for vid in libsumo.vehicle.getIDList():
            if not vid.startswith("cybercab_"):
                continue
            x, y = libsumo.vehicle.getPosition(vid)
            lon, lat = net.convertXY2LonLat(x, y)
            try:
                raw_state = int(libsumo.vehicle.getParameter(vid, "device.taxi.state"))
            except Exception:
                raw_state = 0
            cab_paths.setdefault(vid, []).append(
                [now, round(lon, 5), round(lat, 5), state_names.get(raw_state, "idle")]
            )
    libsumo.close()

    metrics = parse_tripinfo(tripinfo, len(requests), fleet)
    metrics.update({"fleet": fleet, "sumoSeed": seed, "dispatch": dispatch, "engine": f"sumo-taxi-{dispatch}"})

    riders = []
    tree = ET.parse(tripinfo)
    by_id = {pi.get("id"): pi for pi in tree.getroot().iter("personinfo")}
    for i, req in enumerate(requests):
        pid = f"rider_{i + 1:04d}"
        pi = by_id.get(pid)
        depart = float(req["departureSec"])
        pickup = dropoff = None
        if pi is not None:
            ride = next(iter(pi.iter("ride")), None)
            if ride is not None and float(ride.get("arrival", "-1")) >= 0:
                pickup = depart + float(ride.get("waitingTime", "0"))
                dropoff = float(ride.get("arrival"))
        riders.append(
            {
                "id": f"r{i + 1}",
                "o": [round(req["originLon"], 5), round(req["originLat"], 5)],
                "d": [round(req["destinationLon"], 5), round(req["destinationLat"], 5)],
                "departSec": depart,
                "pickupSec": pickup,
                "dropoffSec": dropoff,
            }
        )

    trace = {
        "meta": {
            "fleet": fleet,
            "sumoSeed": seed,
            "startSec": BEGIN_SEC,
            "endSec": now,
            "stepSec": step,
            "district": "reinickendorf",
            "metrics": metrics,
        },
        "cabs": [{"id": vid, "path": path} for vid, path in sorted(cab_paths.items())],
        "riders": riders,
    }
    trace_path.parent.mkdir(parents=True, exist_ok=True)
    trace_path.write_text(json.dumps(trace, separators=(",", ":")), encoding="utf-8")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fleet", type=int, required=True)
    parser.add_argument("--sumo-seed", type=int, default=7)
    parser.add_argument("--dispatch", type=str, default="greedyClosest")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--trace", type=Path, default=None)
    args = parser.parse_args()

    if args.trace:
        metrics = run_trace(args.fleet, args.sumo_seed, args.trace, dispatch=args.dispatch)
    else:
        metrics = run_headless(args.fleet, args.sumo_seed, dispatch=args.dispatch)

    print(json.dumps(metrics, indent=2))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        existing = []
        if args.out.exists():
            existing = json.loads(args.out.read_text(encoding="utf-8"))
        existing = [
            m for m in existing
            if not (m["fleet"] == metrics["fleet"] and m["sumoSeed"] == metrics["sumoSeed"])
        ]
        existing.append(metrics)
        existing.sort(key=lambda m: (m["fleet"], m["sumoSeed"]))
        args.out.write_text(json.dumps(existing, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
