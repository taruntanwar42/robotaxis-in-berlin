"""Offline fleet sweep on the corridor SUMO twin.

One run = one evening (18:00-19:00 request window, cabs may finish rides
until 21:00) with N Cybercabs serving every car/ride trip in the corridor
hour, dispatched by SUMO's built-in taxi device (greedy). Headless `sumo`
subprocess per run; metrics parsed from tripinfo output. `--trace` runs
via libsumo instead and records per-2s cab positions for the map replay.

Usage:
  python scripts/report/run_fleet_sweep.py --fleet 8 --sumo-seed 7
  python scripts/report/run_fleet_sweep.py --fleet 10 --sumo-seed 7 --trace public/data/report/replay.json
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
SCEN = REPO / "hf-space" / "app" / "sumo" / "charlottenburg-moabit-tiergarten"
NET = SCEN / "charlottenburg-moabit-tiergarten.net.xml"
BACKGROUND = SCEN / "charlottenburg-moabit-tiergarten-contained.rou.xml"
STANDS = SCEN / "charlottenburg-moabit-tiergarten-taxi-stands.add.xml"
DEMAND = (
    REPO
    / "hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_car_ride.json"
)
SERVICE_EDGES = SCEN / "charlottenburg-moabit-tiergarten.service-edges.txt"

BEGIN_SEC = 64_800  # 18:00
REQUEST_END_SEC = 68_400  # 19:00
END_SEC = 72_000  # 20:00 hard stop; rides finish long before
WH_PER_KM = 102.5  # Cybercab EPA-derived efficiency (see constants.py)
SEATS = 2
HOLD_SEC = 30  # pickup/dropoff service hold, matches live-app behavior


def load_requests() -> list[dict]:
    data = json.loads(DEMAND.read_text(encoding="utf-8"))
    trips = [
        t
        for t in data["trips"]
        if t.get("pickupEdge") and t.get("dropoffEdge")
    ]
    trips.sort(key=lambda t: t["departureSec"])
    return trips


def fleet_spawn_edges(n: int, rng: random.Random) -> list[str]:
    edges = [
        line.strip()
        for line in SERVICE_EDGES.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    # deterministic spread: shuffle once, take n distinct edges
    rng.shuffle(edges)
    return edges[:n]


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


def sumo_args(taxi_routes: Path, tripinfo: Path, seed: int) -> list[str]:
    return [
        "-n", str(NET),
        "-r", f"{BACKGROUND},{taxi_routes}",
        "-a", str(STANDS),
        "--begin", str(BEGIN_SEC),
        "--end", str(END_SEC),
        "--seed", str(seed),
        "--device.taxi.dispatch-algorithm", "greedyClosest",
        "--device.taxi.idle-algorithm", "stop",
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
                # ride `duration` is in-vehicle time; `waitingTime` precedes boarding
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


def run_headless(fleet: int, seed: int) -> dict:
    requests = load_requests()
    rng = random.Random(1000 + fleet)
    with tempfile.TemporaryDirectory(prefix="sweep_") as tmp:
        taxi_routes = Path(tmp) / "taxi.rou.xml"
        tripinfo = Path(tmp) / "tripinfo.xml"
        build_route_file(fleet, requests, taxi_routes, rng)
        cmd = ["sumo", *sumo_args(taxi_routes, tripinfo, seed)]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0:
            sys.stderr.write(proc.stderr[-3000:] + "\n")
            raise SystemExit(f"sumo failed (fleet={fleet} seed={seed})")
        metrics = parse_tripinfo(tripinfo, len(requests), fleet)
    metrics.update({"fleet": fleet, "sumoSeed": seed, "engine": "sumo-taxi-greedyClosest"})
    return metrics


def run_trace(fleet: int, seed: int, trace_path: Path, step: int = 2) -> dict:
    import libsumo
    import sumolib

    requests = load_requests()
    rng = random.Random(1000 + fleet)
    net = sumolib.net.readNet(str(NET))
    tmpdir = tempfile.mkdtemp(prefix="trace_")
    taxi_routes = Path(tmpdir) / "taxi.rou.xml"
    tripinfo = Path(tmpdir) / "tripinfo.xml"
    build_route_file(fleet, requests, taxi_routes, rng)
    libsumo.start(["sumo", *sumo_args(taxi_routes, tripinfo, seed)])

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
    metrics.update({"fleet": fleet, "sumoSeed": seed, "engine": "sumo-taxi-greedyClosest"})

    # pickup/dropoff timing per rider from tripinfo for request markers
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
                wait = float(ride.get("waitingTime", "0"))
                pickup = depart + wait
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
    parser.add_argument("--trace", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    if args.trace:
        metrics = run_trace(args.fleet, args.sumo_seed, args.trace)
    else:
        metrics = run_headless(args.fleet, args.sumo_seed)

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
