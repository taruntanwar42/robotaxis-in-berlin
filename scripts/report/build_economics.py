"""Build public/data/report/economics.json — does the math work for Tesla?

Per-evening-hour operator economics for every fleet size in sweep.json,
a clearly-labeled full-day extrapolation for the story fleet (16), payback
on the $30,000 Cybercab, and a consumer-surplus comparison vs the Berlin
taxi tariff.

Simplifications, stated in meta:
- Mean fare per served ride is approximated by the fare at the median ride
  distance (rideKmP50). The fare is linear in km, so the exact mean fare
  needs the MEAN ride km; only the P50 is exported by the sweep. Ride-km
  distributions are right-skewed, so this slightly UNDERSTATES revenue.
- Day extrapolation assumes the 18:00-19:00 served-share, fare mix and
  fleet utilisation hold for every hour of the day, scaled by the corridor's
  hourly car+ride demand curve (the robotaxi demand pool in the sweep is
  car & car-passenger trips). This is an estimate, not a simulation.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "report"))

from constants import (  # noqa: E402
    AUSTIN_ROBOTAXI,
    CYBERCAB,
    FX_USD_TO_EUR,
    berlin_taxi_fare_eur,
    cybercab_fare_eur,
)

SWEEP = REPO / "public/data/report/sweep.json"
DEMAND = REPO / "public/data/report/demand.json"
OUT = REPO / "public/data/report/economics.json"

# --- assumptions not in constants.py (no source; marked "assumption") ------
ELECTRICITY_EUR_PER_KWH = 0.30  # public AC charging, same as costs.json
OVERHEAD_EUR_PER_CAB_DAY = 20.0  # maintenance + cleaning + insurance, assumption
STORY_FLEET = 16


def main() -> None:
    sweep = json.loads(SWEEP.read_text(encoding="utf-8"))
    demand = json.loads(DEMAND.read_text(encoding="utf-8"))

    cab_price_eur = CYBERCAB["target_price_usd"] * FX_USD_TO_EUR

    # Day factor: the sweep's demand pool is car + car-passenger ("ride")
    # trips, so scale by that segment's hourly curve, not all-mode trips.
    car_ride_by_hour = {
        h["hour"]: h["byMode"].get("car", 0) + h["byMode"].get("ride", 0)
        for h in demand["hourly"]
    }
    car_ride_day = sum(car_ride_by_hour.values())
    car_ride_18 = car_ride_by_hour[18]
    day_factor = car_ride_day / car_ride_18  # evening hour -> full day

    # All-mode alternative, recorded for transparency only.
    trips_by_hour = {h["hour"]: h["trips"] for h in demand["hourly"]}
    day_factor_all_modes = sum(trips_by_hour.values()) / trips_by_hour[18]

    per_fleet = []
    day_rows = {}  # fleet -> full day extrapolation (internal)
    for row in sweep["byFleet"]:
        fleet = row["fleet"]
        served = row["served"]["mean"]
        ride_km_p50 = row["rideKmP50"]["mean"]
        kwh = row["kwh"]["mean"]
        cab_km = row["cabTotalKm"]["mean"]

        fare = cybercab_fare_eur(ride_km_p50)
        revenue = served * fare
        energy_cost = kwh * ELECTRICITY_EUR_PER_KWH

        per_fleet.append(
            {
                "fleet": fleet,
                "servedMean": round(served, 1),
                "fareAtRideKmP50Eur": round(fare, 2),
                "revenueEur": round(revenue, 1),
                "energyCostEur": round(energy_cost, 2),
                "revenuePerCabEur": round(revenue / fleet, 1),
                "kmPerCab": round(cab_km / fleet, 1),
            }
        )

        # Day extrapolation (same served-share and fare mix all day).
        rev_cab_day = revenue / fleet * day_factor
        energy_cab_day = energy_cost / fleet * day_factor
        margin_cab_day = rev_cab_day - energy_cab_day - OVERHEAD_EUR_PER_CAB_DAY
        payback_years = (
            cab_price_eur / margin_cab_day / 365 if margin_cab_day > 0 else math.inf
        )
        day_rows[fleet] = {
            "fleet": fleet,
            "ridesPerCab": served / fleet * day_factor,
            "revenuePerCabEur": rev_cab_day,
            "energyCostPerCabEur": energy_cab_day,
            "marginPerCabEur": margin_cab_day,
            "paybackYears": payback_years,
        }

    story = day_rows[STORY_FLEET]
    story_row = next(r for r in sweep["byFleet"] if r["fleet"] == STORY_FLEET)

    # Fare sensitivity for the story fleet: revenue scales linearly with fare.
    def payback_at_fare_multiple(mult: float) -> dict:
        margin = (
            story["revenuePerCabEur"] * mult
            - story["energyCostPerCabEur"]
            - OVERHEAD_EUR_PER_CAB_DAY
        )
        years = cab_price_eur / margin / 365 if margin > 0 else None
        return {
            "fareMultiplier": mult,
            "marginPerCabEur": round(margin, 0),
            "paybackYears": round(years, 2) if years is not None else None,
        }

    best = min(day_rows.values(), key=lambda d: d["paybackYears"])
    worst = max(day_rows.values(), key=lambda d: d["paybackYears"])

    day = {
        "fleet": STORY_FLEET,
        "label": "estimate: evening hour scaled to a full day by the corridor's hourly car+ride demand curve; same served-share and fare mix assumed all day",
        "dayFactor": round(day_factor, 2),
        "ridesPerCab": round(story["ridesPerCab"], 0),
        "revenuePerCabEur": round(story["revenuePerCabEur"], 0),
        "energyCostPerCabEur": round(story["energyCostPerCabEur"], 1),
        "overheadAssumptionEur": OVERHEAD_EUR_PER_CAB_DAY,
        "marginPerCabEur": round(story["marginPerCabEur"], 0),
        "paybackYears": round(story["paybackYears"], 2),
        "paybackDays": round(story["paybackYears"] * 365, 0),
        "sensitivity": {
            "fareX05": payback_at_fare_multiple(0.5),
            "fareX15": payback_at_fare_multiple(1.5),
            "bestFleet": {
                "fleet": best["fleet"],
                "marginPerCabEur": round(best["marginPerCabEur"], 0),
                "paybackYears": round(best["paybackYears"], 2),
            },
            "worstFleet": {
                "fleet": worst["fleet"],
                "marginPerCabEur": round(worst["marginPerCabEur"], 0),
                "paybackYears": round(worst["paybackYears"], 2),
            },
        },
    }

    # Consumer surplus: what the evening's served rides cost at Austin
    # Cybercab fares vs the same trips in a Berlin taxi (both priced at the
    # median ride distance — same simplification as revenue).
    served = story_row["served"]["mean"]
    km_p50 = story_row["rideKmP50"]["mean"]
    cyber_total = served * cybercab_fare_eur(km_p50)
    taxi_total = served * berlin_taxi_fare_eur(km_p50)
    consumer_surplus = {
        "fleet": STORY_FLEET,
        "servedRides": round(served, 0),
        "medianRideKm": round(km_p50, 2),
        "cybercabFareEur": round(cybercab_fare_eur(km_p50), 2),
        "berlinTaxiFareEur": round(berlin_taxi_fare_eur(km_p50), 2),
        "cybercabTotalEur": round(cyber_total, 0),
        "berlinTaxiTotalEur": round(taxi_total, 0),
        "riderSavingsEur": round(taxi_total - cyber_total, 0),
        "riderSavingsShare": round(1 - cyber_total / taxi_total, 2),
        "note": "evening hour, 1% twin; multiply by 100 for reality; both totals priced at the median ride distance",
    }

    meta = {
        "question": "does the math work for Tesla at Austin fares in this corridor?",
        "window": sweep["meta"]["window"],
        "assumptions": {
            "austinFare": {
                "value": f"${AUSTIN_ROBOTAXI['base_fare_usd']:.2f} + ${AUSTIN_ROBOTAXI['per_mile_usd']:.2f}/mi",
                "status": "sourced",
                "source": AUSTIN_ROBOTAXI["sources"]["fares"],
            },
            "fxUsdToEur": {"value": FX_USD_TO_EUR, "status": "assumption"},
            "electricityEurPerKwh": {
                "value": ELECTRICITY_EUR_PER_KWH,
                "status": "assumption",
                "note": "public AC charging, same as costs.json",
            },
            "cybercabPriceUsd": {
                "value": CYBERCAB["target_price_usd"],
                "status": "sourced (target price)",
                "source": CYBERCAB["sources"]["specs"],
            },
            "cybercabPriceEur": {
                "value": round(cab_price_eur, 0),
                "status": "derived (target price x FX assumption)",
            },
            "overheadEurPerCabDay": {
                "value": OVERHEAD_EUR_PER_CAB_DAY,
                "status": "assumption",
                "note": "maintenance + cleaning + insurance, uncited",
            },
            "berlinTaxiTariff": {
                "value": "4.30 base + 2.80/2.60/2.10 per-km bands",
                "status": "sourced",
            },
            "fareAtMedianKm": {
                "status": "simplification",
                "note": "mean fare approximated by fare at rideKmP50; exact mean needs mean ride km, which the sweep does not export; skewed distances mean revenue is slightly understated",
            },
            "dayFactor": {
                "value": round(day_factor, 2),
                "status": "estimate",
                "note": f"daily car+ride trips ({car_ride_day}) / 18:00 car+ride trips ({car_ride_18}); all-mode alternative would be {round(day_factor_all_modes, 2)}",
            },
            "dayExtrapolation": {
                "status": "estimate",
                "note": "assumes the evening served-share, median ride length and utilisation hold all day; no overnight repositioning, charging downtime or off-peak dead time modelled",
            },
            "sampleScale": {
                "value": 100,
                "status": "sourced (1% MATSim twin)",
                "note": "per-cab economics are scale-free; fleet totals x100 for reality",
            },
        },
    }

    payload = {
        "meta": meta,
        "perFleet": per_fleet,
        "day": day,
        "consumerSurplus": consumer_surplus,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    # --- audit block --------------------------------------------------------
    f16 = next(p for p in per_fleet if p["fleet"] == STORY_FLEET)
    assert f16["revenueEur"] > 0, "fleet 16 evening revenue must be positive"
    assert math.isfinite(story["paybackYears"]), "fleet 16 payback must be finite"
    assert story["marginPerCabEur"] > 0, "fleet 16 day margin must be positive"

    print(f"wrote {OUT}")
    print("--- audit: evening hour, per fleet ---")
    for p in per_fleet:
        print(
            f"fleet {p['fleet']:>2}: served {p['servedMean']:>6}, fare@P50 "
            f"{p['fareAtRideKmP50Eur']:>5.2f} EUR, revenue {p['revenueEur']:>6.1f} EUR, "
            f"energy {p['energyCostEur']:>5.2f} EUR, rev/cab {p['revenuePerCabEur']:>5.1f} EUR, "
            f"km/cab {p['kmPerCab']:>5.1f}"
        )
    print(f"--- audit: day extrapolation, fleet {STORY_FLEET} (dayFactor {day['dayFactor']}) ---")
    print(
        f"rides/cab/day {day['ridesPerCab']:.0f} | revenue/cab/day {day['revenuePerCabEur']:.0f} EUR | "
        f"energy/cab/day {day['energyCostPerCabEur']:.1f} EUR | overhead {OVERHEAD_EUR_PER_CAB_DAY:.0f} EUR | "
        f"margin/cab/day {day['marginPerCabEur']:.0f} EUR"
    )
    print(
        f"payback: {day['paybackYears']} yr ({day['paybackDays']:.0f} days) on a "
        f"{cab_price_eur:.0f} EUR cab"
    )
    s = day["sensitivity"]
    print(
        f"sensitivity: fare x0.5 -> {s['fareX05']['paybackYears']} yr | "
        f"fare x1.5 -> {s['fareX15']['paybackYears']} yr | "
        f"best fleet {s['bestFleet']['fleet']} -> {s['bestFleet']['paybackYears']} yr | "
        f"worst fleet {s['worstFleet']['fleet']} -> {s['worstFleet']['paybackYears']} yr"
    )
    cs = consumer_surplus
    print(
        f"consumer surplus (evening hour): riders pay {cs['cybercabTotalEur']:.0f} EUR vs "
        f"{cs['berlinTaxiTotalEur']:.0f} EUR in a Berlin taxi -> {cs['riderSavingsEur']:.0f} EUR saved "
        f"({cs['riderSavingsShare']:.0%})"
    )


if __name__ == "__main__":
    main()
