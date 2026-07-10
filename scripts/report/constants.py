"""Sourced constants for the evidence brief.

Every number the app displays that is not computed from MATSim/SUMO comes
from this file, with its source. Retrieved 2026-07-10 unless noted.
"""

FX_USD_TO_EUR = 0.92  # working assumption, stated in the methods section

CYBERCAB = {
    "seats": 2,
    "battery_kwh": 48.0,
    "wh_per_km": 102.5,  # 165 Wh/mi EPA-derived efficiency
    "range_km_realworld": 471.0,  # ~293 mi estimated window-sticker range
    "target_price_usd": 30_000,
    "first_production": "2026-02",
    "controls": "no steering wheel or pedals",
    "sources": {
        "specs": "https://insideevs.com/news/798790/tesla-cybercab-specs/",
        "production": "https://en.wikipedia.org/wiki/Tesla_Cybercab",
        "efficiency": "https://www.teslarati.com/tesla-cybercab-specs-revealed-range-curb-weight-range-rating/",
    },
}

AUSTIN_ROBOTAXI = {
    "base_fare_usd": 3.00,
    "per_mile_usd": 1.40,
    "per_km_usd": 1.40 / 1.60934,
    "effective_date": "2026-03-12",
    "typical_wait_min": [10, 15],
    # Reuters audit, April 2026: >15 min waits about half the time,
    # >=25 min on more than a quarter of checks, no car available in 27%.
    "audit_wait_over_15min_share": 0.5,
    "audit_no_car_share": 0.27,
    "sources": {
        "fares": "https://teslanorth.com/2026/03/07/tesla-robotaxi-prices-jump-in-austin-here-is-the-new-cost-for-a-5-mile-trip/",
        "waits": "https://gvwire.com/2026/05/13/teslas-robotaxi-rollout-features-texas-sized-wait-times/",
        "coverage": "https://cleantechnica.com/2026/06/03/tesla-expands-unsupervised-robotaxi-service-to-whole-austin-metro-area/",
    },
}

BERLIN_TAXI = {
    "base_eur": 4.30,
    "bands_eur_per_km": [(0.0, 3.0, 2.80), (3.0, 7.0, 2.60), (7.0, None, 2.10)],
    "short_trip_eur": 6.00,  # Kurzstrecke <=2 km, street hail only
    "waiting_eur_per_hour": 39.0,
    "source": "https://www.berlin.de/en/public-transportation/1756978-2913840-taxi-phone-numbers-fares-rules.en.html",
}

BVG = {
    "single_ab_eur": 4.00,  # Einzelfahrausweis AB since 2026-01-01
    "short_trip_eur": 2.80,  # Kurzstrecke
    "deutschlandticket_eur_month": 58.0,
    "source": "https://www.bvg.de/en/subscriptions-and-tickets/all-tickets",
}

PRIVATE_CAR = {
    # ADAC-style full cost (depreciation, insurance, tax, maintenance, fuel)
    # for a compact car at typical urban mileage; marginal = fuel/energy only.
    "full_cost_eur_per_km": 0.40,
    "marginal_cost_eur_per_km": 0.12,
    "source": "https://allaboutberlin.com/guides/car-cost-of-ownership-germany",
}

BERLIN_CONTEXT = {
    "cars_per_1000_de": 590,  # Germany 2024 peak; Berlin lowest of the Länder
    "parking_sqm_per_car": 12.0,
    "residential_parking_permit_eur_2yr": 20.40,
    "sources": {
        "car_density": "https://www.dbresearch.com/PROD/IE-PROD/PROD0000000000529231/More_and_older_cars_in_Germany.xhtml",
        "parking_fees": "https://urban-mobility-observatory.transport.ec.europa.eu/news-events/news/berlin-will-increase-parking-fees-2023-2022-09-27_en",
    },
}

SAMPLE_SCALE = 100  # 1pct MATSim sample -> reality multiplier, stated in-app


def cybercab_fare_eur(distance_km: float) -> float:
    return (
        AUSTIN_ROBOTAXI["base_fare_usd"]
        + AUSTIN_ROBOTAXI["per_km_usd"] * distance_km
    ) * FX_USD_TO_EUR


def berlin_taxi_fare_eur(distance_km: float) -> float:
    total = BERLIN_TAXI["base_eur"]
    for start, end, rate in BERLIN_TAXI["bands_eur_per_km"]:
        if distance_km <= start:
            break
        span_end = distance_km if end is None else min(distance_km, end)
        total += (span_end - start) * rate
    return total
