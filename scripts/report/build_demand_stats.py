"""Aggregate the full-day corridor trip extract into public/data/report/demand.json."""

from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC = (
    REPO
    / "data/intermediate/report/simulation-friendly_corridor_envelope_person_trips_1pct_000000_300000_all_modes.csv"
)
META = SRC.with_name(SRC.stem + ".metadata.json")
OUT = REPO / "public/data/report/demand.json"

EVENING_START = 64_800  # 18:00
EVENING_END = 68_400  # 19:00

ACTIVITY_GROUPS = {
    "home": "home",
    "work": "work",
    "work_business": "work",
    "edu_higher": "education",
    "edu_primary": "education",
    "edu_secondary": "education",
    "edu_kiga": "education",
    "edu_other": "education",
    "shop_daily": "shopping",
    "shop_other": "shopping",
    "leisure": "leisure",
    "dining": "leisure",
    "outside_recreation": "leisure",
    "personal_business": "errands",
    "transport": "errands",
    "other": "errands",
}


def main() -> None:
    rows = list(csv.DictReader(SRC.open(encoding="utf-8")))
    meta = json.loads(META.read_text(encoding="utf-8"))

    hourly: dict[int, Counter] = defaultdict(Counter)
    mode_split: Counter = Counter()
    purposes: Counter = Counter()
    distances_km: list[float] = []
    dist_by_mode: dict[str, list[float]] = defaultdict(list)
    persons: dict[str, dict] = {}
    evening_rows = []

    # People only: commercialPersonTraffic/goodsTraffic agents are not residents.
    rows = [r for r in rows if r["subpopulation"] == "person"]

    for r in rows:
        mode = r["primaryMode"]
        depart = float(r["departureSec"])
        hour = int(depart // 3600) % 30
        hourly[hour][mode] += 1
        mode_split[mode] += 1
        purposes[ACTIVITY_GROUPS.get(r["destinationActivity"].rsplit("_", 1)[0], "errands")] += 1
        km = float(r["distanceM"]) / 1000.0 if r["distanceM"] else 0.0
        if 0 < km < 60:
            distances_km.append(km)
            dist_by_mode[mode].append(km)
        pid = r["personId"]
        if pid not in persons:
            persons[pid] = {
                "age": int(r["age"]) if r["age"] else None,
                "carAvail": r["carAvail"],
                "hasLicense": r["hasLicense"],
                "income": float(r["income"]) if r["income"] else None,
            }
        if EVENING_START <= depart < EVENING_END:
            evening_rows.append(r)

    # distance histogram: 500 m bins to 10 km, then overflow
    bins = [0.0] * 21
    for km in distances_km:
        idx = min(20, int(km / 0.5))
        bins[idx] += 1

    ages = [p["age"] for p in persons.values() if p["age"] is not None]
    adults = [p for p in persons.values() if (p["age"] or 0) >= 18]
    # NOTE: this plans file carries carAvail=always / hasLicense=yes for every
    # adult — the attribute is uninformative here, so the app must NOT claim
    # car-availability numbers from it. Age structure is the honest signal.
    seniors = sum(1 for a in ages if a >= 65)
    minors = sum(1 for a in ages if a < 18)
    age_bands = Counter(
        ("<18" if a < 18 else "18-29" if a < 30 else "30-44" if a < 45 else "45-64" if a < 65 else "65-79" if a < 80 else "80+")
        for a in ages
    )

    evening_origins = [
        [round(float(r["originLon"]), 5), round(float(r["originLat"]), 5), r["primaryMode"]]
        for r in evening_rows
        if r["originLon"] and r["originLat"]
    ]

    payload = {
        "meta": {
            "sample": meta["sample"],
            "sampleScale": 100,
            "source": meta["sourceUrl"],
            "areaName": "Charlottenburg + Moabit + Tiergarten corridor",
            "personsRead": meta["personsRead"],
            "tripsInsideAreaDay": len(rows),
        },
        "hourly": [
            {
                "hour": h,
                "trips": sum(hourly[h].values()),
                "byMode": dict(hourly[h]),
            }
            for h in sorted(hourly)
        ],
        "modeSplit": dict(mode_split),
        "purposes": dict(purposes),
        "distanceHistogramKm": {
            "binWidthKm": 0.5,
            "bins": bins,
            "overflowFromKm": 10.0,
        },
        "medianTripKm": round(statistics.median(distances_km), 2),
        "medianTripKmByMode": {
            m: round(statistics.median(v), 2) for m, v in dist_by_mode.items() if len(v) >= 20
        },
        "persons": {
            "unique": len(persons),
            "adults": len(adults),
            "seniors65": seniors,
            "minors": minors,
            "medianAge": statistics.median(ages) if ages else None,
            "byAgeBand": dict(age_bands),
        },
        "evening": {
            "windowLabel": "18:00-19:00",
            "trips": len(evening_rows),
            "byMode": dict(Counter(r["primaryMode"] for r in evening_rows)),
            "origins": evening_origins,
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    shares = {m: c / len(rows) for m, c in mode_split.items()}
    assert abs(sum(shares.values()) - 1.0) < 0.01
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} kB)")
    print("day trips:", len(rows), "| evening trips:", len(evening_rows))
    print("mode split:", {m: round(s, 3) for m, s in sorted(shares.items(), key=lambda kv: -kv[1])})
    print("median trip km:", payload["medianTripKm"], "| persons:", payload["persons"])


if __name__ == "__main__":
    main()
