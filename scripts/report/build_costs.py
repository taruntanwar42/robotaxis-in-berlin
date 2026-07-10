"""Build public/data/report/costs.json — fare/cost curves per trip distance.

All tariffs from scripts/report/constants.py (sourced). Curves sampled at
100 m resolution from 0.5-10 km for the chart; break-evens solved on the
same grid.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "report"))

from constants import (  # noqa: E402
    AUSTIN_ROBOTAXI,
    BERLIN_TAXI,
    BVG,
    CYBERCAB,
    FX_USD_TO_EUR,
    PRIVATE_CAR,
    berlin_taxi_fare_eur,
    cybercab_fare_eur,
)

OUT = REPO / "public/data/report/costs.json"


def main() -> None:
    grid = [round(0.5 + i * 0.1, 1) for i in range(96)]  # 0.5 .. 10.0 km

    curves = {
        "cybercab": [round(cybercab_fare_eur(km), 3) for km in grid],
        "taxi": [round(berlin_taxi_fare_eur(km), 3) for km in grid],
        "bvgSingle": [BVG["single_ab_eur"] for _ in grid],
        "carFull": [round(km * PRIVATE_CAR["full_cost_eur_per_km"], 3) for km in grid],
        "carMarginal": [round(km * PRIVATE_CAR["marginal_cost_eur_per_km"], 3) for km in grid],
    }

    def crossover(a: str, b: str) -> float | None:
        """First distance where curve a becomes cheaper than curve b."""
        for km, va, vb in zip(grid, curves[a], curves[b]):
            if va < vb:
                return km
        return None

    sample_kms = [1.2, 2.0, 3.5, 5.0, 8.0]
    price_table = [
        {
            "km": km,
            "cybercabEur": round(cybercab_fare_eur(km), 2),
            "taxiEur": round(berlin_taxi_fare_eur(km), 2),
            "bvgEur": BVG["single_ab_eur"],
            "carFullEur": round(km * PRIVATE_CAR["full_cost_eur_per_km"], 2),
            "carMarginalEur": round(km * PRIVATE_CAR["marginal_cost_eur_per_km"], 2),
        }
        for km in sample_kms
    ]

    payload = {
        "gridKm": grid,
        "curvesEur": curves,
        "breakEvens": {
            "cybercabCheaperThanTaxiFromKm": crossover("cybercab", "taxi"),
            "bvgCheaperThanCybercabFromKm": crossover("bvgSingle", "cybercab"),
            "carMarginalCheaperThanCybercabFromKm": crossover("carMarginal", "cybercab"),
        },
        "priceTable": price_table,
        "energyCostPerKmEur": round(CYBERCAB["wh_per_km"] / 1000 * 0.30, 4),  # 30 ct/kWh charging
        "assumptions": {
            "fxUsdToEur": FX_USD_TO_EUR,
            "cybercabFare": f"Austin tariff 2026-03: ${AUSTIN_ROBOTAXI['base_fare_usd']:.2f} + ${AUSTIN_ROBOTAXI['per_mile_usd']:.2f}/mi, converted at {FX_USD_TO_EUR} EUR/USD",
            "taxi": "Berlin Taxitarif 2026: 4.30 base + 2.80/2.60/2.10 per km bands",
            "bvg": "BVG Einzelfahrausweis AB 4.00 EUR (2026); Deutschlandticket holders pay ~0 marginal",
            "car": "Full cost 0.40 EUR/km (ADAC-style compact); marginal fuel-only 0.12 EUR/km",
            "electricity": "0.30 EUR/kWh public AC charging assumption",
        },
        "sources": {
            "austin": AUSTIN_ROBOTAXI["sources"],
            "taxi": BERLIN_TAXI["source"],
            "bvg": BVG["source"],
            "car": PRIVATE_CAR["source"],
            "cybercab": CYBERCAB["sources"],
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    t3 = berlin_taxi_fare_eur(3.0)
    assert abs(t3 - (4.30 + 3 * 2.80)) < 1e-6, t3
    c3 = cybercab_fare_eur(3.0)
    assert abs(c3 - (3.00 + 1.40 / 1.60934 * 3.0) * FX_USD_TO_EUR) < 1e-6, c3
    print(f"wrote {OUT}")
    print("taxi 3km:", round(t3, 2), "| cybercab 3km:", round(c3, 2))
    print("breakEvens:", payload["breakEvens"])
    print("price table:", json.dumps(price_table[0]))


if __name__ == "__main__":
    main()
