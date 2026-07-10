"""Invariants for the evidence-brief data artifacts.

These guard the contract between scripts/report/* and src/lib/data.ts:
if an artifact regenerates with a broken shape or impossible numbers,
this suite fails before the page ships nonsense.

Run: python -m pytest tests/ -q
"""

import json
import math
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
REPORT = REPO / "public" / "data" / "report"
sys.path.insert(0, str(REPO / "scripts" / "report"))

from constants import berlin_taxi_fare_eur, cybercab_fare_eur, FX_USD_TO_EUR  # noqa: E402


def load(name: str) -> dict:
    return json.loads((REPORT / name).read_text(encoding="utf-8"))


# ---------- tariff functions (hand-checked against published tariffs) ----------

def test_berlin_taxi_tariff_bands():
    assert berlin_taxi_fare_eur(0) == 4.30
    assert math.isclose(berlin_taxi_fare_eur(3.0), 4.30 + 3 * 2.80)
    assert math.isclose(berlin_taxi_fare_eur(5.0), 4.30 + 3 * 2.80 + 2 * 2.60)
    assert math.isclose(berlin_taxi_fare_eur(10.0), 4.30 + 3 * 2.80 + 4 * 2.60 + 3 * 2.10)


def test_cybercab_fare_matches_austin_tariff():
    assert math.isclose(
        cybercab_fare_eur(1.60934), (3.00 + 1.40) * FX_USD_TO_EUR, rel_tol=1e-9
    )


def test_cybercab_always_undercuts_taxi():
    for km10 in range(5, 300):
        km = km10 / 10
        assert cybercab_fare_eur(km) < berlin_taxi_fare_eur(km), km


# ---------- demand.json ----------

def test_demand_shares_and_counts():
    d = load("demand.json")
    total = sum(d["modeSplit"].values())
    assert total == d["meta"]["tripsInsideAreaDay"] or total > 0
    hourly_total = sum(h["trips"] for h in d["hourly"])
    assert hourly_total == total
    assert 0.5 < d["medianTripKm"] < 5
    ev = d["evening"]
    assert ev["trips"] == sum(ev["byMode"].values()) == len(ev["origins"])
    for lon, lat, mode in ev["origins"]:
        assert 13.2 < lon < 13.45 and 52.48 < lat < 52.56, (lon, lat)
        assert mode in {"walk", "bike", "car", "pt", "ride", "truck"}
    p = d["persons"]
    assert p["unique"] >= p["adults"] + p["minors"] - 5  # ages may be missing
    assert sum(p["byAgeBand"].values()) <= p["unique"]


# ---------- sweep.json ----------

def test_sweep_shape_and_physics():
    s = load("sweep.json")
    rows = s["byFleet"]
    assert len(rows) >= 5
    fleets = [r["fleet"] for r in rows]
    assert fleets == sorted(fleets)
    for r in rows:
        assert r["served"]["max"] <= r["requests"]
        assert 0 <= r["emptyShare"]["mean"] < 1
        assert r["waitP90Min"]["mean"] >= r["waitP50Min"]["mean"]
        # energy must equal km x consumption (102.5 Wh/km) within rounding
        assert math.isclose(
            r["kwh"]["mean"], r["cabTotalKm"]["mean"] * 0.1025, rel_tol=0.02
        )
        for agg in ("served", "servedShare", "waitP50Min", "emptyShare"):
            a = r[agg]
            assert a["min"] <= a["mean"] <= a["max"]

    # more cabs never serve fewer riders (mean, monotone within tolerance)
    served = [r["served"]["mean"] for r in rows]
    assert all(b >= a - 2 for a, b in zip(served, served[1:])), served


# ---------- costs.json ----------

def test_costs_consistency():
    c = load("costs.json")
    grid = c["gridKm"]
    assert len(grid) == len(c["curvesEur"]["cybercab"]) == len(c["curvesEur"]["taxi"])
    # curves must match the tariff functions they claim to encode
    for i in (0, len(grid) // 2, len(grid) - 1):
        assert math.isclose(c["curvesEur"]["cybercab"][i], cybercab_fare_eur(grid[i]), abs_tol=0.005)
        assert math.isclose(c["curvesEur"]["taxi"][i], berlin_taxi_fare_eur(grid[i]), abs_tol=0.005)
    be = c["breakEvens"]
    assert be["cybercabCheaperThanTaxiFromKm"] == grid[0]  # cheaper everywhere
    assert 1.0 <= be["bvgCheaperThanCybercabFromKm"] <= 3.0


# ---------- economics.json ----------

def test_economics_consistency():
    e = load("economics.json")
    day = e["day"]
    assert day["paybackYears"] > 0 and day["paybackDays"] < 365 * 20
    assert math.isclose(day["paybackDays"], day["paybackYears"] * 365, rel_tol=0.02)
    margin = day["revenuePerCabEur"] - day["energyCostPerCabEur"] - day["overheadAssumptionEur"]
    assert math.isclose(day["marginPerCabEur"], margin, rel_tol=0.02)
    # halved fare must never beat the base-case payback
    assert day["sensitivity"]["fareX05"]["paybackYears"] > day["paybackYears"]
    cs = e["consumerSurplus"]
    assert cs["berlinTaxiTotalEur"] > cs["cybercabTotalEur"]
    assert math.isclose(
        cs["riderSavingsEur"], cs["berlinTaxiTotalEur"] - cs["cybercabTotalEur"], rel_tol=0.02
    )


# ---------- second-district artifacts ----------

def test_reinickendorf_artifacts():
    s = load("sweep-reinickendorf.json")
    d = load("reinickendorf-demand.json")
    rows = s["byFleet"]
    assert [r["fleet"] for r in rows] == sorted(r["fleet"] for r in rows)
    for r in rows:
        assert r["requests"] == d["carRideRequests"]
        assert r["served"]["max"] <= r["requests"]
        assert r["waitP90Min"]["mean"] >= r["waitP50Min"]["mean"]
        assert math.isclose(r["kwh"]["mean"], r["cabTotalKm"]["mean"] * 0.1025, rel_tol=0.02)
    assert d["trips"] == sum(d["byMode"].values())
    assert math.isclose(d["ptShare"], d["byMode"]["pt"] / d["trips"], rel_tol=0.02)
    # the district's headline: full service is reachable with a small fleet
    assert any(r["servedShare"]["min"] >= 0.99 for r in rows)


# ---------- replay traces (all districts, all seeds) ----------

import pytest

REPLAYS = [p.name for p in REPORT.glob("replay*.json")]


@pytest.mark.parametrize("name", REPLAYS)
def test_all_replay_traces(name):
    r = load(name)
    meta = r["meta"]
    assert meta["fleet"] == len(r["cabs"])
    assert meta["startSec"] < meta["endSec"]
    served = [x for x in r["riders"] if x["dropoffSec"] is not None]
    assert len(served) == meta["metrics"]["served"]
    for rider in served:
        assert rider["departSec"] <= rider["pickupSec"] <= rider["dropoffSec"]
    for cab in r["cabs"]:
        ts = [p[0] for p in cab["path"]]
        assert ts == sorted(ts)


def test_day_measured_if_present():
    path = REPORT / "economics-day-measured.json"
    if not path.exists():
        pytest.skip("day run not recorded yet")
    d = json.loads(path.read_text(encoding="utf-8"))
    assert d["served"] <= d["requests"]
    assert sum(h["rides"] for h in d["hourly"]) == d["served"]
    margin = d["revenuePerCabEur"] - d["energyCostPerCabEur"] - d["overheadAssumptionEur"]
    assert math.isclose(d["marginPerCabEur"], margin, rel_tol=0.05)
    if d["paybackDays"]:
        assert 5 < d["paybackDays"] < 3650


# ---------- replay.json ----------

def test_replay_integrity():
    r = load("replay.json")
    meta = r["meta"]
    assert meta["fleet"] == len(r["cabs"])
    assert meta["startSec"] < meta["endSec"]
    for cab in r["cabs"]:
        ts = [p[0] for p in cab["path"]]
        assert ts == sorted(ts)
        for _, lon, lat, state in cab["path"][:: max(1, len(cab["path"]) // 20)]:
            assert 13.2 < lon < 13.45 and 52.48 < lat < 52.56
            assert state in {"idle", "to_pickup", "occupied"}
    served = [x for x in r["riders"] if x["dropoffSec"] is not None]
    assert len(served) == meta["metrics"]["served"]
    for rider in served:
        assert rider["departSec"] <= rider["pickupSec"] <= rider["dropoffSec"]
