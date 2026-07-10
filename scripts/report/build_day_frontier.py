"""Aggregate full-day runs into the operator's-dial frontier.

Collects every day artifact (fleet 12..40, one seed, SCC-filtered demand)
into public/data/report/day-frontier.json: one row per fleet size with the
service/economics trade-off the deep brief charts as a connected scatter.

Usage: python scripts/report/build_day_frontier.py <extra-run.json> [...]
       (the two committed day artifacts are always included)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
REPORT = REPO / "public" / "data" / "report"
OUT = REPORT / "day-frontier.json"

ALWAYS = [
    REPORT / "economics-day-measured-f16.json",
    REPORT / "economics-day-measured.json",  # fleet 30 headline
]


def row(d: dict) -> dict:
    return {
        "fleet": d["meta"]["fleet"],
        "servedShare": d["servedShare"],
        "waitP50Min": d["waitP50Min"],
        "ridesPerCab": d["ridesPerCab"],
        "kmPerCab": d["kmPerCab"],
        "emptyShare": d["emptyShare"],
        "revenuePerCabEur": d["revenuePerCabEur"],
        "marginPerCabEur": d["marginPerCabEur"],
        "paybackDays": d["paybackDays"],
    }


def main() -> None:
    paths = ALWAYS + [Path(p) for p in sys.argv[1:]]
    by_fleet: dict[int, list[dict]] = {}
    for p in paths:
        d = json.loads(p.read_text(encoding="utf-8"))
        by_fleet.setdefault(d["meta"]["fleet"], []).append(row(d))
    rows = []
    for fleet, runs in sorted(by_fleet.items()):
        base = dict(runs[0])
        if len(runs) > 1:
            waits = [r["waitP50Min"] for r in runs]
            pays = [r["paybackDays"] for r in runs]
            base["seeds"] = len(runs)
            base["waitP50MinRange"] = [min(waits), max(waits)]
            base["paybackDaysRange"] = [min(pays), max(pays)]
            base["waitP50Min"] = round(sum(waits) / len(waits), 1)
            base["paybackDays"] = round(sum(pays) / len(pays), 0)
        rows.append(base)
    fleets = [r["fleet"] for r in rows]
    assert len(set(fleets)) == len(fleets), f"duplicate fleets: {fleets}"

    payload = {
        "meta": {
            "kind": "measured full-day runs, one weekday, seed 7, SCC-filtered demand (1,828 requests)",
            "note": "each point is one complete 04:00-28:00 SUMO simulation; assumptions as in economics-day-measured.json",
        },
        "byFleet": rows,
    }
    OUT.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"{'fleet':>6} {'wait':>6} {'payback':>8} {'served':>7} {'margin':>8}")
    for r in rows:
        print(f"{r['fleet']:>6} {r['waitP50Min']:>6} {r['paybackDays']:>8} {r['servedShare']:>7} {r['marginPerCabEur']:>8}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
