"""Record a sampled ambient-traffic layer for the replay map.

Runs the same corridor evening as the replay trace (same fleet, same seed,
same demand) via libsumo and records the positions of a fixed sample of
background vehicles (non-Cybercab) every STEP seconds. The frontend draws
them as dim dots so the "cabs move through real evening traffic" claim is
visible, not asserted.

Output: public/data/report/traffic.json
  {meta: {sampleSize, stepSec, startSec, endSec, fleet, sumoSeed},
   tracks: [{id, path: [[t, lon, lat], ...]}]}

Usage: python scripts/report/record_traffic_layer.py --fleet 16 --sumo-seed 27
"""

from __future__ import annotations

import argparse
import json
import random
import tempfile
from pathlib import Path

import libsumo
import sumolib

STEP = 4
SAMPLE = 120


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fleet", type=int, default=16)
    parser.add_argument("--sumo-seed", type=int, default=27)
    parser.add_argument("--district", choices=["corridor", "reinickendorf"], default="corridor")
    args = parser.parse_args()

    if args.district == "reinickendorf":
        import run_reinickendorf_sweep as sweep
        requests, _stats = sweep.load_requests()
        out = sweep.REPO / "public" / "data" / "report" / "traffic-reinickendorf.json"
    else:
        import run_fleet_sweep as sweep
        requests = sweep.load_requests()
        out = sweep.REPO / "public" / "data" / "report" / "traffic.json"
    rng = random.Random(1000 + args.fleet)
    net = sumolib.net.readNet(str(sweep.NET))
    tmp = Path(tempfile.mkdtemp(prefix="traffic_"))
    routes = tmp / "taxi.rou.xml"
    tripinfo = tmp / "ti.xml"
    sweep.build_route_file(args.fleet, requests, routes, rng)
    libsumo.start(["sumo", *sweep.sumo_args(routes, tripinfo, args.sumo_seed)])

    sample_rng = random.Random(42)
    chosen: dict[str, list] = {}
    rejected: set[str] = set()
    now = sweep.BEGIN_SEC
    while now < sweep.END_SEC:
        libsumo.simulationStep()
        now = int(libsumo.simulation.getTime())
        if now > sweep.REQUEST_END_SEC + 600:
            break  # ambient layer only needs the request window plus a tail
        if now % STEP:
            continue
        active = set()
        for vid in libsumo.vehicle.getIDList():
            if vid.startswith("cybercab_"):
                continue
            active.add(vid)
            if vid not in chosen and vid not in rejected:
                # reservoir-ish: keep sampling until the pool is full, then
                # replace departed tracks so the layer stays alive all hour
                live = sum(1 for v in chosen if v in active)
                if live < SAMPLE and sample_rng.random() < 0.25:
                    chosen[vid] = []
                else:
                    rejected.add(vid)
            if vid in chosen:
                x, y = libsumo.vehicle.getPosition(vid)
                lon, lat = net.convertXY2LonLat(x, y)
                chosen[vid].append([now, round(lon, 5), round(lat, 5)])
    libsumo.close()

    tracks = [
        {"id": f"bg{i}", "path": path}
        for i, (vid, path) in enumerate(sorted(chosen.items()))
        if len(path) >= 3
    ]
    payload = {
        "meta": {
            "sampleSize": len(tracks),
            "stepSec": STEP,
            "startSec": sweep.BEGIN_SEC,
            "endSec": now,
            "fleet": args.fleet,
            "sumoSeed": args.sumo_seed,
            "note": "random sample of background vehicles from the same run family; ambience, not analysis",
        },
        "tracks": tracks,
    }
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(f"wrote {out} — {len(tracks)} tracks, {size_kb:.0f} kB")
    assert size_kb < 4000, "traffic layer too heavy for a lazy asset"


if __name__ == "__main__":
    main()
