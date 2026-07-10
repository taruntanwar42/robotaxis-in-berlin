# Evidence Brief Rebuild — Implementation Plan

> Executor: this session (autonomous, budget-bound). Deviation from
> writing-plans defaults, recorded: tasks carry interfaces + verification,
> not duplicated implementation code — the executor writes code once, in
> the files. Spec: `docs/superpowers/specs/2026-07-10-evidence-brief-design.md`.

**Goal:** Static scrollytelling evidence brief answering "what would a
Cybercab fleet do for the Charlottenburg–Moabit–Tiergarten corridor?",
fed by an offline MATSim/SUMO pipeline.

**Architecture:** Python pipeline (`scripts/report/`) produces four JSON
artifacts in `public/data/report/`; React+TS+Vite+MapLibre frontend
(rewritten `src/`) renders the brief; GitHub Pages workflow deploys.

**Tech stack:** Python 3.11 + libsumo 1.27 (local), React 19, MapLibre 5,
inline SVG charts (dataviz skill), no runtime backend.

## Global constraints

- Every displayed number sourced (citation chip) or "(sim)" → methods.
- 1%-twin scale stated wherever fleet/demand numbers appear.
- BeST CC-BY attribution + MATSim + ALKIS credits in methods section.
- No live backend calls anywhere in `src/`.
- `npm run check` green before deploy; Chrome walkthrough desktop+mobile.

## Critical path note

Task 4's full sweep runs ~background while frontend tasks proceed.
Order: T1→T2→T3→T4(smoke)→launch full sweep→T5..T13→T14.

---

### Task 1: Pipeline scaffold + sourced constants
**Files:** Create `scripts/report/constants.py`, `scripts/report/__init__.py`.
**Produces:** `CYBERCAB` (seats, battery_kwh, wh_per_km=102.5, price_usd),
`AUSTIN_FARE` (base_usd=3.00, per_mile_usd=1.40, usd_to_eur), `BERLIN_TAXI`
(base=4.30, band rates), `BVG` (single=4.00, short=2.80, dticket_month=58),
`PRIVATE_CAR` (full_eur_per_km≈0.40, marginal≈0.12), each with `source` URL
+ retrieved date. **Verify:** `python -c "from scripts.report.constants import *"`.

### Task 2: Full-day corridor demand extract
**Files:** run `scripts/build_matsim_person_demand.py` (existing) with
corridor envelope geojson, `--start 04:00:00 --end 28:00:00`, all modes,
1pct → output under `data/intermediate/report/`.
**Verify:** metadata JSON audit: tripsInsideAreaAllModes ≳ 4,000 (day ≫
the 461/hour); demographics fields present in CSV.

### Task 3: Demand stats artifact
**Files:** Create `scripts/report/build_demand_stats.py`.
**Consumes:** T2 CSV. **Produces:** `public/data/report/demand.json`:
`{hourly: [{hour, trips, byMode}], modeSplit, distanceHistogram (500m bins
≤10km + overflow), medianKm, purposes, persons: {unique, noCarAvail,
noLicense, seniors65, adults, byAgeBand}, eveningWindow: {trips, byMode},
meta: {sample, source, areaName}}`.
**Verify:** shares sum to 1±0.01; counts match metadata audit; spot-check
3 rows by hand.

### Task 4: Fleet sweep runner (libsumo)
**Files:** Create `scripts/report/run_fleet_sweep.py` (self-contained
dispatch sim on packaged corridor scenario at
`hf-space/app/sumo/charlottenburg-moabit-tiergarten/`; greedy nearest-ETA
assignment adapted from `hf-space/app/robotaxi_runtime.py` scoring; taxi
device or explicit stop control — pick whichever the packaged net supports
with least code; riders from demand seeds
`hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_seed{1,11,12}.json`).
**Produces:** per run `{fleet, seed, requests, served, expired, waitP50Sec,
waitP90Sec, rideP50Sec, occupiedKm, emptyKm, kwh, cabKmPerRide}` appended
to `public/data/report/sweep.json`; `--trace` flag dumps per-second cab
positions+states → `public/data/report/replay.json` (see T5 format).
**Steps:** (a) smoke: fleet=5 seed11 headless, assert served≥15/21 in <5
min wall; (b) launch full sweep fleet ∈ {3,5,8,12,20,30} × seeds {1,11,12}
in background. **Verify:** monotone trends across fleet sizes; energy ≈
totalKm × 0.1025.

### Task 5: Replay trace
**Format:** `replay.json`: `{meta: {fleet, seed, startSec, endSec}, stepSec,
cabs: [{id, path: [[lon,lat,state], …]}], requests: [{id, o:[lon,lat],
d:[lon,lat], departSec, pickupSec, dropoffSec}]}` — quantize coords 5dp,
1 frame / 2 sim-sec; target <1.5 MB gz.
**Verify:** JSON loads; frame count ≈ window/stepSec; positions inside
corridor bbox.

### Task 6: Costs artifact
**Files:** Create `scripts/report/build_costs.py`.
**Consumes:** constants + T3 distance histogram. **Produces:**
`public/data/report/costs.json`: per-km cost curves 0.5–10 km for
cybercab/taxi/bvg/car_full/car_marginal, break-even distances, corridor
median-trip price table, per-evening fleet economics (energy cost, revenue
at Austin fare for served demand from sweep).
**Verify:** hand-check taxi 3 km = 4.30+2.80×3 = €12.70; cybercab 3 km ≈
(3.00+1.40×1.864)×fx.

### Task 7: Frontend scaffold + design system
**Files:** rewrite `src/main.tsx`, `src/App.tsx` (thin), create
`src/brief/` (sections), `src/lib/` (data loading, format), `src/styles/`.
Delete old `src/components/CybercabExperience.tsx`, `src/App.css` (git rm).
**Load frontend-design skill first.** Lock: typography, dark map-forward
palette, citation-chip component, section shell with IntersectionObserver
(`useActiveSection`). **Verify:** `npm run check` green; skeleton scrolls.

### Task 8: Map canvas + sections Hero/Place
Persistent MapLibre instance (existing MapTiler style), camera keyed to
active section; corridor polygon glow; origin dots from demand.json
evening trips (client-side jitterless: use originLon/Lat baked into
demand.json as `eveningOrigins: [[lon,lat],…]` — extend T3 if missed).
**Verify:** Chrome: hero → place flight, dots render.

### Task 9: Demand charts (dataviz skill)
Mode split, distance histogram, hourly curve as inline SVG components in
`src/brief/charts/`. **Verify:** values match demand.json; axes labeled;
mobile width OK.

### Task 10: Vehicle + service finding sections
Cybercab spec card (sourced chips); Austin reality strip; sweep chart
(wait p50/p90 + served% vs fleet) from sweep.json with seed range bands.
**Verify:** numbers match sweep.json.

### Task 11: Fare finding section
Cost curves chart + break-even callouts from costs.json; median-trip price
table. **Verify:** matches T6 hand-checks.

### Task 12: Who-gains + catch + verdict/explorer
Demographic tiles (demand.json.persons); mode-shift small multiples
(computed client-side from demand.json + sweep deadhead share, formula in
methods); explorer: fleet selector + adoption scenario → tiles from
sweep.json grid. **Verify:** explorer values = sweep.json entries exactly.

### Task 13: Methods & sources + honesty pass
Lineage diagram (SVG/HTML), constants table with links, licenses, limits.
Sweep whole page against Global Constraints (chips everywhere, scale
notes). **Verify:** checklist pass, `npm run check`.

### Task 14: Verify + deploy
Chrome full walkthrough desktop (1440) + mobile (390); fix; commit; push
to main (Pages auto-deploys); smoke live URL; update README.md (recreate,
honest, short); final commit. Old HF Space left untouched.

---

## Completion record (2026-07-10, same session)

All 14 tasks done; deployed at commit `9ae750b`
(https://taruntanwar42.github.io/robotaxis-in-berlin/). Deviations:

- T4 needed three staging fixes discovered by running: service edges and
  demand pickup edges are not all strongly connected as route starts →
  cabs stage at packaged taxi stands (minus `-4609230#0`) and runs pass
  `--ignore-route-errors` (a cab that drops off inside a weakly-connected
  pocket must not kill the run).
- Dispatch upgraded greedy → greedyClosest after A/B (79 vs 57 served,
  fleet 8): a competent-operator baseline.
- Sweep result: fleet 16 (twin) = knee — 122/125 served, 8.8 min median
  wait; empty share rises 27%→47% with fleet size (powers "the catch").
- MapTiler style switched to `dataviz-dark` (old custom style was light).
- MapLibre overrides container positioning → map wrapped in outer fixed div.
- IntersectionObserver replaced with geometry-on-scroll (missed
  programmatic jumps).
- Replay clock clamps dt (hidden-tab rAF backlog).
- Added post-plan: ride-along camera (restores the v11 standout, opt-in).
- Not done: 3D GLB hero (cut deliberately), fresh og.png (needs a visible
  browser window), mobile visual QA (CSS is responsive by construction;
  verify when a visible window is available).
