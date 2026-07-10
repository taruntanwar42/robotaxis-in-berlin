"""One measured day: the corridor fleet serves every car/ride trip 04:00-28:00.

Replaces the economics page's day *extrapolation* with a simulated day.
Reuses run_fleet_sweep's machinery with the window and demand overridden.
Honesty note carried into the output: the packaged background-traffic route
file only covers the 18:00-21:00 evening, so the rest of the day drives in
light traffic — fine for utilization/revenue, understates evening-style
congestion elsewhere.

Usage: python scripts/report/run_full_day.py --fleet 16 --sumo-seed 7
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import random
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_fleet_sweep as sweep  # noqa: E402
from constants import AUSTIN_ROBOTAXI, FX_USD_TO_EUR  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "data" / "report" / "economics-day-measured.json"

DAY_BEGIN = 4 * 3600  # 04:00
DAY_REQ_END = 28 * 3600  # 04:00 next day (MATSim clock)
DAY_END = DAY_REQ_END + 3600

ELECTRICITY_EUR_PER_KWH = 0.30
OVERHEAD_EUR_PER_CAB_DAY = 20.0  # assumption, same as build_economics.py


def fare_eur(km: float) -> float:
    return (AUSTIN_ROBOTAXI["base_fare_usd"] + AUSTIN_ROBOTAXI["per_km_usd"] * km) * FX_USD_TO_EUR


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fleet", type=int, default=16)
    parser.add_argument("--sumo-seed", type=int, default=7)
    parser.add_argument("--demand", type=Path, required=True)
    args = parser.parse_args()

    # override the sweep module's window + demand (functions read globals)
    sweep.DEMAND = args.demand
    sweep.BEGIN_SEC = DAY_BEGIN
    sweep.REQUEST_END_SEC = DAY_REQ_END
    sweep.END_SEC = DAY_END

    requests = sweep.load_requests()

    # A 24h shift exposes what 2h runs hide: a cab that drops off inside a
    # weakly-connected pocket is stranded for the rest of the day (the first
    # day run decayed to zero throughput by 14:00 from exactly this).
    # Restrict pickups AND dropoffs to the largest strongly connected
    # component of the taxi graph, as the Reinickendorf runner does.
    import run_reinickendorf_sweep as rdf
    import sumolib

    net = sumolib.net.readNet(str(sweep.NET))
    scc = rdf.taxi_scc_edges(net)
    before = len(requests)
    requests = [r for r in requests if r["pickupEdge"] in scc and r["dropoffEdge"] in scc]
    print(f"SCC filter: {before} -> {len(requests)} requests "
          f"({before - len(requests)} dropped as trap-pocket kerbs)")
    rng = random.Random(1000 + args.fleet)
    tmp = Path(tempfile.mkdtemp(prefix="fullday_"))
    taxi_routes = tmp / "taxi.rou.xml"
    tripinfo = tmp / "tripinfo.xml"
    sweep.build_route_file(args.fleet, requests, taxi_routes, rng)
    import subprocess

    proc = subprocess.run(
        ["sumo", *sweep.sumo_args(taxi_routes, tripinfo, args.sumo_seed)],
        capture_output=True,
        text=True,
        timeout=5400,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr[-3000:] + "\n")
        raise SystemExit("day run failed")

    metrics = sweep.parse_tripinfo(tripinfo, len(requests), args.fleet)

    # exact revenue + hourly utilization from per-ride tripinfo
    tree = ET.parse(tripinfo)
    revenue = 0.0
    hourly: dict[int, dict[str, float]] = {}
    waits: list[float] = []
    for pi in tree.getroot().iter("personinfo"):
        for ride in pi.iter("ride"):
            if float(ride.get("arrival", "-1")) < 0 or ride.get("vehicle") in ("NULL", ""):
                continue
            km = float(ride.get("routeLength", "0")) / 1000.0
            revenue += fare_eur(km)
            waits.append(float(ride.get("waitingTime", "0")))
            hour = int((float(ride.get("depart", "0"))) // 3600) % 28
            bucket = hourly.setdefault(hour, {"rides": 0, "km": 0.0})
            bucket["rides"] += 1
            bucket["km"] += km

    energy_cost = metrics["kwh"] * ELECTRICITY_EUR_PER_KWH
    rev_per_cab = revenue / args.fleet
    margin_per_cab = rev_per_cab - energy_cost / args.fleet - OVERHEAD_EUR_PER_CAB_DAY
    cab_price_eur = 30_000 * FX_USD_TO_EUR
    payback_days = cab_price_eur / margin_per_cab if margin_per_cab > 0 else None

    payload = {
        "meta": {
            "kind": "measured single-day SUMO run (not an extrapolation)",
            "fleet": args.fleet,
            "sumoSeed": args.sumo_seed,
            "window": "04:00-28:00 requests, one weekday",
            "demand": f"{len(requests)} car/ride trips in the corridor (1% twin)",
            "limitations": [
                "packaged background traffic covers only 18:00-21:00; the rest of the day runs in light traffic",
                "one seed, one synthetic weekday; no charging downtime modeled (48 kWh vs ~"
                + str(round(metrics["cabTotalKm"] / args.fleet))
                + " km/cab/day implies mid-day charging)",
                f"overhead {OVERHEAD_EUR_PER_CAB_DAY} EUR/cab/day and {ELECTRICITY_EUR_PER_KWH} EUR/kWh are assumptions",
            ],
        },
        "requests": metrics["requests"],
        "served": metrics["served"],
        "servedShare": metrics["servedShare"],
        "waitP50Min": round((sorted(waits)[len(waits) // 2] if waits else 0) / 60, 1),
        "cabTotalKm": metrics["cabTotalKm"],
        "kmPerCab": round(metrics["cabTotalKm"] / args.fleet, 1),
        "emptyShare": metrics["emptyShare"],
        "kwh": metrics["kwh"],
        "revenueEur": round(revenue, 0),
        "ridesPerCab": round(metrics["served"] / args.fleet, 1),
        "revenuePerCabEur": round(rev_per_cab, 0),
        "energyCostPerCabEur": round(energy_cost / args.fleet, 1),
        "overheadAssumptionEur": OVERHEAD_EUR_PER_CAB_DAY,
        "marginPerCabEur": round(margin_per_cab, 0),
        "paybackDays": round(payback_days, 0) if payback_days else None,
        "hourly": [
            {"hour": h, "rides": int(v["rides"]), "km": round(v["km"], 1)}
            for h, v in sorted(hourly.items())
        ],
    }
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in payload.items() if k != "hourly"}, indent=1))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
