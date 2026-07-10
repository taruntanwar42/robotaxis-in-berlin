# If Cybercabs came to Moabit

An **evidence brief**: one Berlin neighborhood (Charlottenburg – Moabit –
Tiergarten), one simulated weekday evening, and the question asked honestly —
*what would a Tesla Cybercab fleet actually change here?*

**Live:** https://taruntanwar42.github.io/robotaxis-in-berlin/

## What it is

A fully static scroll-through report. Every number on the page is either
cited (source chips) or measured in our own simulation pipeline:

- **Demand**: [MATSim Open Berlin v6.4](https://github.com/matsim-scenarios/matsim-berlin)
  (TU Berlin) — a synthetic population statistically faithful to Berlin;
  we use the 1 % sample and say so wherever it matters.
- **Traffic twin**: [SUMO](https://eclipse.dev/sumo/) 1.27 with the corridor
  street network, signals, and background traffic from the
  [BeST scenario](https://github.com/mosaic-addons/best-scenario)
  (CC-BY 4.0, Schrab et al. 2023).
- **The experiment**: every private-car trip of the 18:00–19:00 hour hails a
  Cybercab; 21 SUMO runs sweep fleet sizes 4–30 across 3 traffic seeds,
  dispatched by SUMO's built-in taxi device (greedyClosest).
- **The vehicle**: real Cybercab specs (EPA filings, production Feb 2026) and
  Tesla's real Austin tariff and service record.

Findings, in short: it out-prices the Berlin taxi at every distance, loses to
BVG beyond ~1.6 km, needs ~16 cabs (twin scale) for Austin-grade evening
service — and, unaimed, it *adds* vehicle-kilometers, because deadheading is
measured at 27–47 % and most of this neighborhood's trips never touched a
car to begin with. Six complete simulated days (fleets 12–40) then replace
the hourly extrapolation with the operator's-dial frontier: waits fall
92.7 → 3.5 min as payback stretches 39 → 139 days, with the elbow at ~20–24
cabs — below which each cab also drives more than one 48 kWh battery per
day. A parallel 21-run pooled sweep shows 2-seat pooling saves ≤5 % of
fleet-km — it does not rescue the traffic math.

## Repository layout

```
scripts/report/          offline pipeline (Python 3.11 + libsumo)
  constants.py           every sourced constant, with URLs
  build_demand_stats.py  full-day corridor demand -> demand.json
  build_costs.py         tariff curves -> costs.json
  run_fleet_sweep.py     SUMO fleet runs -> sweep.json / replay.json
public/data/report/      the four JSON artifacts the app reads
src/                     React 19 + TypeScript + MapLibre, no backend
docs/superpowers/        design spec + build plan for this rebuild
hf-space/                legacy live-SUMO backend (no longer referenced)
data/, scripts/*.py      original data pipeline (MATSim/SUMO preprocessing)
```

## Running it

```bash
npm install
npm run dev        # frontend at :5173 (static JSON already committed)
npm run check      # lint + typecheck + build
```

Regenerating the data needs SUMO 1.27 + the MATSim plans file (see
`scripts/report/*.py` headers); the committed artifacts are reproducible
from those scripts.

## Attribution

MATSim Open Berlin (TU Berlin) · BeST Berlin SUMO scenario — Schrab, K.,
Protzmann, R., Radusch, I. (2023), CC-BY 4.0 · Berlin ALKIS district
boundaries · Map tiles © MapTiler / OpenStreetMap contributors.
