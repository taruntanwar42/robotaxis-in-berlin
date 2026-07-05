# Robotaxis In Berlin Implementation Plan

> **Status (2026-07-05): largely executed.** Gates 1-4 are built and the v1
> watchable run shipped. Two locked decisions changed after this plan was
> written: the service window is now `18:00-19:00` (not 18:00-21:00) and the
> 10-minute request expiry is implemented in the active taxi engine. Current
> truth lives in `docs/PRODUCT_DECISION_LOG.md` and
> `docs/ROBOTAXI_RUNTIME_CONTRACT.md`; this file remains as the build-gate
> record and red-team checklist.

This is the build plan for the simplified user-facing `robotaxis-in-berlin`
app. It separates product decisions, implementation lanes, and acceptance gates
so worker threads can build in parallel without drifting back into the old
control-room app.

## Target App

The app opens on a Berlin map with a concise three-card Cybercab intro. The user
starts one simulation. After that the experience is passive: the map shows
Cybercabs, request activity, and live status. A compact pane shows live request
counts, five cab rows, and accumulated totals. Final results come from backend
controller audit state.

No user-facing diagnostics, engineering controls, fake browser-side vehicle
motion, or fake metrics should appear in the default app.

## Locked Product Decisions

- Service area: Charlottenburg + Moabit + Tiergarten.
- Area provenance: official Berlin Ortsteile.
- Runtime area: documented cleaned practical corridor derived from the official
  areas. Small extra boundary roads are allowed for SUMO continuity when
  documented and visually reviewed.
- Demand source: MATSim/OBS person plans.
- Road network and background traffic source: BeST/SUMO.
- Robotaxi demand modes: MATSim `car` + `ride`.
- One MATSim person-trip equals one Cybercab request/person for v1.
- MATSim `ride` means car-passenger person trip, not reconstructed party size.
- Demand inclusion: origin and destination both inside the service corridor.
- Demand scaling: use the current 1% extract as-is; do not fake-scale demand.
- Bad SUMO edge mappings are rejected from runtime demand and retained only in
  QA/reject metadata.
- Fleet: 5 Cybercabs.
- Depot: fixed custom depot, not user-selectable.
- Service start: cabs are already staged at good in-corridor positions at
  18:00 for v1.
- Service window: 18:00-21:00.
- Dispatch: realistic practical optimizer, not a simple first-available queue.
- Request expiry: 10 minutes.
- Shift end: stop new assignments at 21:00, finish active rides, then return to
  depot.
- Charging/battery: ignored in v1.
- User-facing label: `Rides served`.
- User-facing results: rides served, total demand, cabs returned.
- User-facing failures: keep detailed reasons out of the default UI.

## Staged Build Gates

### Gate 1: Scenario And Demand

Acceptance:

- SUMO package for `charlottenburg-moabit-tiergarten` validates.
- MATSim demand is generated from the 1% plans extract.
- Every accepted runtime request has pickup/dropoff SUMO service edges.
- Rejected records are counted and retain reasons.
- No live copy into `hf-space/app/sumo` until backend validation passes.

Current known issue:

- The first full MATSim extract produced 293 `car + ride` candidate trips, but
  the full nearest-edge assignment rerun timed out. The data lane must optimize
  edge assignment after time/area/mode filtering.

### Gate 2: Runtime Controller

Acceptance:

- Exactly 5 backend-controlled SUMO/TraCI Cybercabs.
- Cabs start staged in the corridor at 18:00.
- Requests enter a backend queue by `departSec`.
- Requests expire after 10 minutes if not assigned.
- Dispatcher uses ETA/route-feasibility/wait-time scoring or matching.
- Vehicle movement comes only from SUMO/TraCI state.
- At 21:00, no new assignments; active rides complete; cabs return to depot.
- Audit state derives `ridesServed`, `cabsActive`, phases, and final results.

### Gate 3: Backend Contract

Acceptance:

- Websocket frames include current time, phase, live request counters, cab list,
  vehicle/request map objects, and run totals.
- Each cab includes raw state and display-ready fields:
  `id`, `state`, `label`, `speedKph`, `etaSec`, `target`, `stopReason`,
  `requestId`, `lon`, `lat`, `heading`.
- Request map objects support:
  open hollow marker, accepted filled marker, assigned cab/request link, fade on
  completion.
- Final payload includes rides served, total demand, cabs returned, and audit
  metadata.
- Frontend does not calculate authoritative metrics.

### Gate 4: Frontend Experience

Acceptance:

- Default app is the user-facing flow, not the old control-room dashboard.
- Intro has three concise cards matching the Cybercab Berlin story.
- One `Start simulation` action.
- Run surface has one compact pane:
  live now, five cab rows, accumulated totals.
- Request markers use the locked visual language:
  hollow black pulse for open, filled black for accepted.
- Results render only backend-provided metrics; missing values render as empty
  state, not fake zeroes.
- No visible diagnostics, speed controls, pause/reset controls, or engineering
  panels in default UI.

### Gate 5: Red Team And Packaging

Acceptance:

- Scenario/demand validators pass.
- Backend smoke passes with websocket.
- Frontend `npm run check` passes.
- Browser smoke confirms intro, start, run pane, cab rows, request markers, and
  final result state.
- Red-team checklist is complete.
- Deployment packaging does not silently ship intermediate or stale scenario
  files.

## Red Team Checklist

- Data/source: Are MATSim person trips, BeST routes, SUMO network, and official
  boundaries still conceptually separate?
- Geometry: Does the cleaned corridor visibly match the intended areas, and is
  any extra boundary road documented?
- Demand: Are bad edge mappings rejected from runtime demand rather than shown
  as unserved user-facing demand?
- Demand semantics: Does the app avoid claiming real parties/group rides?
- Runtime: Can every accepted request route pickup to dropoff in SUMO?
- Runtime: Are cab positions and movement sourced from TraCI, not frontend
  interpolation?
- Runtime: Does 21:00 behavior stop new pickups while finishing active rides?
- Metrics: Is `ridesServed` based on completed backend-controlled trips?
- UI: Does the default build avoid the old engineering dashboard?
- UI: Are missing metrics shown as empty/unknown instead of fake numbers?
- Regression: Does Reinickendorf legacy behavior remain either working or
  intentionally separated?

## Active Worker Lanes

- Data lane: finish Gate 1 nearest-edge demand assignment and report.
- Runtime/backend lane: prepare controller and contract implementation only
  after Gate 1 demand is validated.
- Frontend lane: integrate live contract after backend emits canonical frames.
- Red-team lane: inspect completed gates and challenge assumptions before final
  integration.
