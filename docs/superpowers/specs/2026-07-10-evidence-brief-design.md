# Design: "If Cybercabs Came to Moabit" — an evidence brief

**Date:** 2026-07-10 · **Mode:** autonomous rebuild authorized by maintainer
**Replaces:** v11.2 "corridor live" experience (watch-only show)

## 1. The problem with what exists (red-team findings)

The project set out to answer *"what impact could a Cybercab-like service
make in a small Berlin region?"* and drifted into building *"a fun thing to
watch."* Specific failures, each traced to an implicit decision made along
the way:

| # | Implicit decision | Why it's wrong |
|---|---|---|
| R1 | "Live SUMO per visit is the product" | Live-ness adds fragility (1 concurrent viewer, preemption UX, watchdogs) and zero analytic value — a viewer learns nothing from live they couldn't learn from a recording. The tech proved the concept; the product doesn't need it. |
| R2 | "Show 5 cabs serving 21 riders" | The corridor sees 461 trips in that hour *in a 1% sample* (~46,000 real). A 21-rider show can support no claim about impact. Sample size was chosen for watchability, not evidence. |
| R3 | "Stats are a report card at the end" | Impact was the entire point. It became an afterthought appendix to an animation. |
| R4 | "Demand = car+ride trips" | The most interesting impact questions live in the *other* modes: what happens if robotaaxis pull riders from BVG, bikes, walking (67% of Berlin trips)? The data has all modes; the app ignored them. |
| R5 | Demographics unused | MATSim persons carry age, income, car availability, license status. "Who does this actually help?" was never asked. |
| R6 | No baseline, no counterfactual | Impact = difference against status quo. The app never showed what these trips cost/take today (taxi, BVG, own car). |
| R7 | One fleet size, one seed, pinned | No parameter sweep → no "how many cabs does it take?" answer — the single most concrete question a reader has. |
| R8 | Only the sunny direction | Real Austin data (waits 10–15 min typical, 27% availability failures; fares raised twice in 2026) and the mode-shift risk (more car-km) never appear. Advocacy, not analysis. |

## 2. Purpose (the one sentence)

**Answer, honestly and quantitatively: "What would a fleet of Tesla
Cybercabs actually do for one Berlin neighborhood?"** — as a beautiful,
self-contained, scroll-through evidence brief that a curious reader
finishes in ~5 minutes and leaves with sourced, defensible numbers.

Audience: urbanism-curious public, tech readers, the maintainer's peers.
Success criteria: (a) every number on screen traceable to a named source or
a described simulation; (b) the reader can state 3 concrete findings
afterwards; (c) the "against" case is presented as rigorously as the "for"
case; (d) zero runtime backend — the page cannot break.

## 3. Approaches considered

- **A. Static evidence brief (scrollytelling + explorer).** All simulation
  offline (SUMO sweep), all data baked to JSON, one persistent map canvas,
  replay animation from a recorded trace. Robust, infinitely concurrent,
  fast. *Chosen.*
- **B. "Honest control room"** — keep live SUMO, add analytics. Rejected:
  R1 fragility remains; a parameter sweep cannot run live (each data point
  = minutes); concurrency stays ~1.
- **C. Q&A explorer** (question cards, no narrative). Rejected as primary
  form — loses the narrative arc that makes the evidence land; its
  question-first framing survives as the section structure of A.

## 4. The brief — section by section

One continuous scroll. A single MapLibre canvas lives behind sections 2, 5
and camera-flies per section. Charts are inline SVG (dataviz-skill rules).

1. **Hero.** Title: *"If Cybercabs came to Moabit"*. Subtitle: "One
   simulated Berlin evening, measured honestly." Dark map backdrop, corridor
   glowing. Cybercab GLB hero render (existing asset) if budget allows.
2. **The place.** Corridor outline (Charlottenburg + Moabit + Tiergarten,
   official ALKIS Ortsteile + 250 m pad). Trip-origin dots fade in.
   Copy: "Between 18:00 and 19:00 on an ordinary weekday, ~46,000 trips
   touch this area. We work with its 1-in-100 digital twin: 461 simulated
   people from the MATSim Open Berlin model."
3. **How it moves today.** Mode split bar (pt 80 / walk 178 / car 104 /
   bike 74 / ride 25 → shares), trip-distance histogram (median ~2 km),
   full-day demand curve by hour (new full-day extract). Insight callout:
   most trips are short and already car-free.
4. **The vehicle.** Real Cybercab card: 2 seats, no controls, ~48 kWh,
   real-world ~470 km range, 165 Wh/mi, first unit built Feb 2026,
   target ~$30k. Austin service reality: $3.00 + $1.40/mi (Mar 2026),
   typical waits 10–15 min, availability failures 27% in a Reuters audit.
   All sourced.
5. **The experiment.** "We gave the neighborhood its own fleet" — SUMO
   twin explainer (real streets, signals, evening traffic from BeST).
   Replay animation: one recorded evening, cabs picking up MATSim riders;
   play/scrub. This is the craft carried over from v11 — one section, not
   the whole app.
6. **Finding — service.** Fleet sweep chart: median/p90 wait + % served
   vs fleet size (3–30 cabs in the 1% twin). Callout: the fleet size where
   waits beat Austin's real service and the corridor's ~10-min taxi
   baseline. Scale note: ×100 for reality, density economics favor the
   full-scale fleet — stated, not hidden.
7. **Finding — the fare.** Cost per trip across the corridor's actual
   trip-length distribution: Cybercab (Austin tariff → EUR) vs Berlin taxi
   tariff 2026 (€4.30 + €2.80/2.60/2.10 bands) vs BVG €4.00 single
   (Deutschlandticket footnote) vs private-car full cost (~€0.40/km) and
   marginal cost. Break-even lines. Finding: robotaxi undercuts taxi ~everywhere,
   beats the *fully-costed* private car, loses to BVG-with-Abo and to the
   marginal cost of a car you already own.
8. **Finding — who gains.** From person attributes of corridor travelers:
   % with no car available, % without license, seniors; their trips today
   are walk/PT. For them the Cybercab is a mobility gain; for BVG it's a
   competitor. Small demographic tiles.
9. **The catch.** Scenario toggle rendered as small multiples, not a toy:
   (a) *Replaces car trips only* → vehicle-km change incl. measured
   deadhead share from the sweep; (b) *Pulls from all modes
   proportionally* (Austin-like) → vehicle-km increase. Two-seat limit.
   What the sim can't see: induced demand, night/edge cases, kerb chaos.
   Verdict copy is explicit that (b) is the empirically likelier world.
10. **Verdict + explorer.** 3–4 takeaway cards with the key numbers, then
    "run the numbers yourself": fleet-size selector + adoption scenario →
    outcome tiles (wait, served, cab-km split, kWh, cost/trip) read from
    the precomputed sweep grid. No backend.
11. **Method & sources.** Lineage diagram (MATSim v6.4 → corridor extract →
    SUMO/BeST twin → sweep), every constant with its source link, license
    attributions (BeST CC-BY citation, MATSim, ALKIS), limitations list.
    GitHub link.

## 5. Architecture

**Offline pipeline** (`scripts/report/`, Python, run locally, outputs
committed):
- `01_extract_demand.py` — wraps existing `build_matsim_person_demand.py`
  for the corridor, full day (04:00–28:00 MATSim time), all modes →
  `data/intermediate/report/corridor_day_trips.csv`.
- `02_demand_stats.py` — aggregations → `public/data/report/demand.json`
  (hourly curve, mode split, distance histogram, purposes, demographics).
- `03_fleet_sweep.py` — libsumo runs on the packaged corridor scenario
  (net + BeST background + signals), 17:55–19:00, fleet ∈ {3,5,8,12,20,30}
  × 3 demand seeds, greedy dispatch reusing `robotaxi_runtime` scoring;
  per-run metrics (waits p50/p90, served %, occupied/deadhead km, kWh at
  165 Wh/mi) → `public/data/report/sweep.json`; plus one full trace
  (chosen story fleet) → `public/data/report/replay.json` (compact frames).
- `04_costs.py` — tariff tables + trip-length distribution → cost curves →
  `public/data/report/costs.json`. All constants in one sourced dict.

**Frontend** (`src/`, rewritten): React + TS + Vite + MapLibre (kept),
scroll sections with IntersectionObserver, one map instance, SVG charts,
replay renderer on a map layer. No three.js unless hero budget allows
(GLB is 1.6 MB — acceptable; decide at polish time). Static deploy via
existing GitHub Pages workflow.

**Retired:** live WebSocket path, HF Space backend dependency (Space left
running but unreferenced), 5k-line App.tsx.

## 6. Honesty rules (design constitution)

1. Every displayed number has a visible source: either "(sim)" → methods
   section, or a citation chip.
2. The 1%-twin scale is stated wherever fleet/demand numbers appear.
3. The negative scenario gets equal visual weight to the positive one.
4. Austin's real service data is the reality check, not our sim.
5. No invented precision: round honestly, show ranges across seeds.

## 7. Verification

- Pipeline: each script prints an audit block; sweep sanity checks
  (served% monotone-ish in fleet size, waits decreasing, energy ≈ km ×
  0.103 kWh).
- Frontend: `npm run check` (lint + build); Chrome walkthrough of the full
  scroll at desktop + mobile widths; replay plays; explorer switches.
- Deploy: Pages build green; live URL smoke.

## 8. Risks / fallbacks

- **SUMO sweep too slow locally** → reduce to 4 fleet sizes × 2 seeds;
  the chart needs ≥4 points.
- **Full-day extract slow** (plans parse ~110 MB gz) → it already ran for
  3-hour windows in ~minutes; if slow, fall back to 17:00–22:00 evening
  curve and say so.
- **Time runs out** → section order of implementation is by value:
  3,6,7 (charts+data) > 2,5 (map+replay) > 4,8,9 > hero polish > 3D.
