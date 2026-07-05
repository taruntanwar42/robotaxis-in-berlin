# Robotaxi Handoff

This repo is the **`robotaxis-in-berlin` Cybercab simulation**. SUMO remains
the source of truth for road physics, traffic-light state, and vehicle
positions; the browser only paces and renders frames produced by the backend.

> Historical note: earlier prototypes ran a Reinickendorf district scenario
> with 20 cabs and depot charging. That scenario remains registered as
> `reinickendorf-district` for legacy/debug use only. If any doc or comment
> describes Reinickendorf, 20 cabs, or charging as the product, it is stale —
> trust `docs/PRODUCT_DECISION_LOG.md` and
> `docs/ROBOTAXI_RUNTIME_CONTRACT.md` instead.

## Current Live App

- Single MapLibre page with a three-card intro and one `Start simulation`
  action.
- Active SUMO scope: `charlottenburg-moabit-tiergarten`.
- Window: `18:00-19:00`; assignment cutoff `18:50`; 10-minute request expiry;
  hidden depot-recovery tail (up to 15 minutes sim time, ends early once the
  fleet is parked).
- Five golden cybercabs staged at spread in-corridor edges at 18:00.
- Frontend renders: corridor boundary, depot marker, SUMO lanes,
  traffic-light bars, dimmed background traffic, glowing cybercabs, and
  request pickup/dropoff markers (hollow black pulse = open, filled = accepted,
  grey fade = expired).
- Compact status pane: live counts, five cab rows (state, speed, ETA, task,
  stop reason), accumulated totals, final results from the backend audit.

## Dispatch Model

- MATSim person plans provide upstream demand
  (`hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_car_ride.json`),
  `car + ride` modes only, both trip ends inside the corridor.
- SUMO/TraCI executes vehicle movement, routing, lanes, and traffic lights.
- The backend controller (`engine=taxi`) uses SUMO taxi-device reservations
  plus its own scoring: nearest-feasible cab by cached route travel time, a
  ride-completion-by-close feasibility gate, 10-minute expiry for unassigned
  requests, and a depot-return routine with a lane-level parking stop
  (the corridor package has no depot parking area).
- Cab ETA (`etaSec`) and stop reasons (`red_light`, `waiting_for_pickup`,
  `dropping_off`, `stopped`) are derived from TraCI each frame.
- Battery state exists internally but v1 masks charging: a charging cab is
  reported as `idle_at_depot` in the public contract.

## Playback

- Public runs stream the packaged replay
  (`hf-space/app/data/replays/charlottenburg-moabit-tiergarten_taxi_matsim_public.jsonl.gz`,
  1 frame per sim-second, recorded at `speed=50`) via `cache=auto`.
- The frontend paces frames at ~40x (`playbackFrameIntervalMs`); a full run
  plays in roughly 110 seconds. A `setInterval` fallback keeps sim time
  advancing when the browser suspends `requestAnimationFrame`.
- The backend `done` payload is deferred client-side until the frame timeline
  drains, so results always match the final frame.
- `cache=live` recomputes through SUMO/TraCI for engineering checks.

## Important Caveats

- This is an early dispatch model, not a calibrated Tesla fleet simulation.
- MATSim Berlin does not provide ride party sizes; each extracted row is one
  person request (`partySize = 1` is schema shape, not observed data).
- MATSim demand is person-trip demand, not a robotaxi adoption model. Treat
  it as a bounded scenario input.
- Browser-side vehicle interpolation is intentionally avoided.
- In `demand=matsim` mode, background SUMO vehicles are not removed because
  MATSim person requests do not have one-to-one BeST vehicle ids.
- The Sketchfab Cybercab model is not bundled; the golden sprite is original.

## Files To Know

- Frontend app: `src/App.tsx`; experience pane:
  `src/components/CybercabExperience.tsx`; styling: `src/App.css`
- SUMO/FastAPI backend: `hf-space/app/main.py`
- Runtime contract: `docs/ROBOTAXI_RUNTIME_CONTRACT.md`
- Scenario/data handoff: `docs/SCENARIO_CHARLOTTENBURG_MOABIT_TIERGARTEN.md`
- Demand extract script:
  `scripts/build_charlottenburg_moabit_tiergarten_matsim_demand.py`
- Replay cache script: `scripts/build_public_replay_cache.py`
- Backend smoke check: `scripts/smoke_backend.py`
- Contract shape check: `scripts/check_robotaxi_contract.py`

## Required Checks

```powershell
npm run check
python scripts\check_robotaxi_contract.py
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```

The websocket smoke check validates that playback starts, emits dispatch
metadata, and does not fall back to fabricated demand.
