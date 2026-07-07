"""Benchmark TraCI polling overhead on the full-Berlin BeST network.

Standalone: mirrors the per-step polling pattern of the app backend
(hf-space/app/main.py public-detail frame builder) without importing app code.
Measures per-step cost buckets so we can project the effective real-time
factor of a full-Berlin recording/live run.

Usage (PowerShell):
  python scripts/benchmark_berlin_traci.py --cap 180
  python scripts/benchmark_berlin_traci.py --cap 1000 --end 65400
"""

from __future__ import annotations

import argparse
import hashlib
import os
import statistics
import sys
import time
from pathlib import Path

DEFAULT_SRC = Path(
    r"C:\Users\KitCat\Desktop\Projects\EV Mobility Dashboard\data\raw\best-scenario\scenario\sumo"
)
DEFAULT_SUMO_HOME = Path(r"C:\Program Files (x86)\Eclipse\Sumo")
ROBOTAXI_ID_PREFIX = "cybercab-"


def find_sumo_home() -> Path:
    env = os.environ.get("SUMO_HOME")
    if env and Path(env).exists():
        return Path(env)
    return DEFAULT_SUMO_HOME


def stable_sample_key(value: str) -> int:
    # Copied from hf-space/app/main.py:237 — deterministic background sample.
    return int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:8], 16)


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(pct / 100 * (len(ordered) - 1))))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--net", type=Path, default=DEFAULT_SRC / "berlin.net.xml")
    parser.add_argument("--routes", type=Path, default=DEFAULT_SRC / "berlin.rou.gz")
    parser.add_argument("--begin", type=int, default=64_800)
    parser.add_argument("--end", type=int, default=65_400)
    parser.add_argument("--cap", type=int, default=180, help="background vehicle cap")
    parser.add_argument("--report-every", type=int, default=60)
    parser.add_argument("--transport", choices=["traci", "libsumo"], default="traci")
    args = parser.parse_args()

    sumo_home = find_sumo_home()
    tools = sumo_home / "tools"
    if str(tools) not in sys.path:
        sys.path.insert(0, str(tools))
    if args.transport == "libsumo":
        import libsumo as traci  # noqa: E402
        import libsumo as tc  # noqa: E402  # constants live on the module itself
    else:
        import traci  # noqa: E402
        import traci.constants as tc  # noqa: E402

    sumo_binary = str(sumo_home / "bin" / "sumo.exe")
    cmd = [
        sumo_binary,
        "-n", str(args.net),
        "-r", str(args.routes),
        "--begin", str(args.begin),
        "--end", str(args.end),
        "--step-length", "1",
        "--route-steps", "200",
        "--time-to-teleport", "120",
        "--no-step-log", "true",
        "--no-warnings", "true",
        "--duration-log.disable", "true",
    ]

    load_started = time.perf_counter()
    traci.start(cmd)
    load_seconds = time.perf_counter() - load_started
    print(f"traci.start (net+route head load): {load_seconds:.1f}s")

    tl_ids = traci.trafficlight.getIDList()
    for tl_id in tl_ids:
        traci.trafficlight.subscribe(tl_id, [tc.TL_RED_YELLOW_GREEN_STATE])
    print(f"traffic lights subscribed: {len(tl_ids)}")

    subscription_vars = [
        tc.VAR_POSITION,
        tc.VAR_ANGLE,
        tc.VAR_SPEED,
        tc.VAR_LANE_ID,
        tc.VAR_ROAD_ID,
    ]
    subscribed: set[str] = set()
    buckets: dict[str, list[float]] = {
        "step": [], "getIDList": [], "sortCap": [], "subscribe": [], "results": [], "tl": [],
    }
    concurrent_counts: list[int] = []

    sim_sec = args.begin
    wall_started = time.perf_counter()
    while sim_sec < args.end:
        t0 = time.perf_counter()
        traci.simulationStep()
        t1 = time.perf_counter()
        all_ids = set(traci.vehicle.getIDList())
        t2 = time.perf_counter()
        robotaxi_ids = {v for v in all_ids if v.startswith(ROBOTAXI_ID_PREFIX)}
        background_ids = sorted(
            (v for v in all_ids if v not in robotaxi_ids), key=stable_sample_key
        )[: args.cap]
        wanted = robotaxi_ids.union(background_ids)
        t3 = time.perf_counter()
        for vehicle_id in wanted - subscribed:
            traci.vehicle.subscribe(vehicle_id, subscription_vars)
        subscribed.intersection_update(wanted)
        subscribed.update(wanted)
        t4 = time.perf_counter()
        results = traci.vehicle.getAllSubscriptionResults()
        touched = 0
        for vehicle_id in wanted:
            data = results.get(vehicle_id)
            if data and data.get(tc.VAR_POSITION) is not None:
                touched += 1
        t5 = time.perf_counter()
        traci.trafficlight.getAllSubscriptionResults()
        t6 = time.perf_counter()

        buckets["step"].append((t1 - t0) * 1000)
        buckets["getIDList"].append((t2 - t1) * 1000)
        buckets["sortCap"].append((t3 - t2) * 1000)
        buckets["subscribe"].append((t4 - t3) * 1000)
        buckets["results"].append((t5 - t4) * 1000)
        buckets["tl"].append((t6 - t5) * 1000)
        concurrent_counts.append(len(all_ids))

        sim_sec += 1
        if (sim_sec - args.begin) % args.report_every == 0:
            elapsed = time.perf_counter() - wall_started
            done = sim_sec - args.begin
            print(
                f"  sim {done}s / wall {elapsed:.1f}s / RTF {done / elapsed:.1f}x"
                f" / concurrent {len(all_ids)} / sampled {touched}"
            )

    traci.close()
    total_wall = time.perf_counter() - wall_started
    steps = args.end - args.begin
    per_step_total = sum(sum(v) for v in buckets.values()) / steps

    print()
    print(f"steps: {steps}  wall(stepping): {total_wall:.1f}s  RTF: {steps / total_wall:.1f}x")
    print(f"concurrent vehicles: min {min(concurrent_counts)}"
          f"  median {int(statistics.median(concurrent_counts))}  max {max(concurrent_counts)}")
    print(f"{'bucket':<10} {'mean ms':>9} {'p95 ms':>9} {'share':>7}")
    for name, values in buckets.items():
        mean_ms = statistics.fmean(values)
        print(f"{name:<10} {mean_ms:>9.2f} {percentile(values, 95):>9.2f}"
              f" {mean_ms / per_step_total:>6.1%}")
    projected_wall_1h = per_step_total / 1000 * 4200 + load_seconds
    print(f"per-step total: {per_step_total:.2f} ms")
    print(f"projected 1h-window wall (4200 steps + load): {projected_wall_1h / 60:.1f} min"
          f"  => effective RTF {4200 / projected_wall_1h:.1f}x")


if __name__ == "__main__":
    main()
