"""Sample robotaxi demand seed variants from the all-modes MATSim trip pool.

Each seed is a Bernoulli draw over the corridor's evening trips: every trip
adopts the robotaxi with a probability that depends on its current mode
(car/ride most likely to switch, walk least). Every sampled request stays a
real MATSim synthetic Berliner with their real departure time and coordinates;
seeds differ only in which residents chose the service that evening.
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_KEY = "charlottenburg-moabit-tiergarten"
DEFAULT_POOL = (
    PROJECT_ROOT
    / "data"
    / "intermediate"
    / "matsim"
    / SCENARIO_KEY
    / f"{SCENARIO_KEY}_person_trips_1pct_64800_68400_all_modes.json"
)
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "hf-space" / "app" / "data" / "matsim"

# Mode-switch propensity toward a cheap door-to-door robotaxi. Calibrated so a
# 10-cab fleet (~46 rides/h capacity at observed cycle times) serves most but
# not all demand: ~52 requests/hour expected.
ADOPTION_BY_MODE = {
    "car": 0.25,
    "ride": 0.25,
    "pt": 0.12,
    "bike": 0.06,
    "walk": 0.035,
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pool", type=Path, default=DEFAULT_POOL)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, nargs="+", default=[1, 2, 3])
    parser.add_argument("--scenario-key", default=SCENARIO_KEY)
    parser.add_argument(
        "--adoption-scale",
        type=float,
        default=1.0,
        help="Multiplier on ADOPTION_BY_MODE (city-wide pools need lower per-trip adoption).",
    )
    args = parser.parse_args()

    with args.pool.open("r", encoding="utf-8") as handle:
        pool = json.load(handle)
    trips = pool.get("trips", [])
    if not trips:
        raise SystemExit(f"no trips in pool: {args.pool}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    adoption = {
        mode: rate * args.adoption_scale for mode, rate in ADOPTION_BY_MODE.items()
    }
    expected = sum(adoption.get(str(t.get("primaryMode")).lower(), 0.0) for t in trips)
    print(f"pool: {len(trips)} trips, expected requests/seed ~{expected:.1f}")

    for seed in args.seeds:
        rng = random.Random(f"{args.scenario_key}-demand-seed-{seed}")
        sampled = [
            trip
            for trip in trips
            if rng.random() < adoption.get(str(trip.get("primaryMode")).lower(), 0.0)
        ]
        mode_counts = Counter(str(t.get("primaryMode")).lower() for t in sampled)
        payload = {
            "metadata": {
                **pool.get("metadata", {}),
                "demandSeed": seed,
                "samplingMethod": "bernoulli-mode-adoption",
                "adoptionByMode": adoption,
                "adoptionScale": args.adoption_scale,
                "sampledTrips": len(sampled),
                "sampledModeCounts": dict(mode_counts),
                "poolFile": str(args.pool),
                "poolTrips": len(trips),
            },
            "trips": sampled,
        }
        output_path = args.output_dir / (
            f"{args.scenario_key}_person_trips_1pct_180000_190000_seed{seed}.json"
        )
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        print(f"seed {seed}: {len(sampled)} requests {dict(mode_counts)} -> {output_path}")


if __name__ == "__main__":
    main()
