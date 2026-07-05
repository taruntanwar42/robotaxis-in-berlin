# Robotaxi Backend Runtime QA

This is the integration checklist for moving the staged
`charlottenburg-moabit-tiergarten` SUMO package into the backend runtime.

## Approval Boundary

Do not copy a staged package into `hf-space/app/sumo/` until it has passed
shape checks and has been reviewed as the intended service corridor. The live
runtime package path is expected to be:

```text
hf-space/app/sumo/charlottenburg-moabit-tiergarten/
```

Expected files:

```text
charlottenburg-moabit-tiergarten.net.xml
charlottenburg-moabit-tiergarten-contained.rou.xml
charlottenburg-moabit-tiergarten.sumocfg
charlottenburg-moabit-tiergarten.geojson
```

The backend scenario registry already points at those names, but the scenario
must remain unavailable until the package is copied and the robotaxi controller
is wired.

## Pre-Copy Package Check

Run this against the staged intermediate directory:

```powershell
python scripts\check_sumo_package_shape.py `
  --package-dir data\intermediate\sumo\charlottenburg-moabit-tiergarten\package-staging `
  --scope charlottenburg-moabit-tiergarten `
  --expected-start-sec 64800 `
  --expected-end-sec 75600 `
  --json
```

This does not modify runtime files. It verifies:

- expected package filenames exist
- `.sumocfg` references packaged net/route/additional files
- SUMO net parses and has non-internal edges/lanes
- SUMO net includes projection metadata
- route file parses and contains demand elements
- boundary GeoJSON parses as a Feature or FeatureCollection
- optional SUMO config begin/end values do not conflict with `18:00-21:00`

## External Staging Validation

The Scenario/Data worker's staged package was validated from:

```text
C:\Users\KitCat\.codex\worktrees\528f\robotaxi-control-room\data\intermediate\sumo\charlottenburg-moabit-tiergarten\package-staging
```

Command:

```powershell
python scripts\check_sumo_package_shape.py `
  --package-dir "C:\Users\KitCat\.codex\worktrees\528f\robotaxi-control-room\data\intermediate\sumo\charlottenburg-moabit-tiergarten\package-staging" `
  --scope charlottenburg-moabit-tiergarten `
  --expected-start-sec 64800 `
  --expected-end-sec 75600 `
  --json
```

Result:

- Status: `ok`
- Resolved package directory:
  `...\package-staging\charlottenburg-moabit-tiergarten`
- SUMO config: `begin=64800.0`, `end=75600.0`
- Net: `4063` edges, `6246` lanes, `378` traffic lights
- Routes: `91357` vehicles
- Boundary: GeoJSON FeatureCollection with `1` feature
- Warnings: none
- Errors: none

The outer `package-staging` directory is a staging wrapper. For runtime copy,
copy the inner `charlottenburg-moabit-tiergarten` package contents into the
live backend package directory; do not create
`hf-space/app/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten/`.

## Backend Switches After Package Approval

Once the staged package is approved and copied into `hf-space/app/sumo`, the
minimal backend changes are:

1. Keep the registry path/names in `SUMO_SCENARIOS` aligned with the copied
   files.
2. Set `status` for `charlottenburg-moabit-tiergarten` from `pending-data` to
   `ready` only after `/sumo/{scope}/validate` passes.
3. Validate the staged robotaxi demand JSON with
   `scripts\check_robotaxi_demand_shape.py`.
4. Set the fixed `depotEdge` to an edge that exists in the approved network.
5. Wire the backend robotaxi controller to insert/control exactly 5 SUMO taxi
   vehicles for this scope.
6. Only after the real controller emits backend-derived status and audit data,
   set `robotaxiRuntimeStatus` to `ready` and `ROBOTAXI_CONTROLLER_READY` to
   true.

Do not make the frontend synthesize vehicle motion or ride counters.

## Demand Ingestion Gate

MATSim demand extraction is a separate activation gate from the SUMO package
shape. The backend should not start the robotaxi runtime until the staged demand
file has pickup/dropoff SUMO edge candidates that validate against the approved
service edge set.

Required top-level fields:

- `scope` or `scenario`: `charlottenburg-moabit-tiergarten`
- `metadata.scenarioKey` is accepted for staged MATSim extractor outputs
- `window.startSec`: `64800`
- `window.endSec`: `75600`
- `metadata.timeWindow.startSec` / `metadata.timeWindow.endSec` are accepted
- `source`, `provenance`, or `metadata`: source scenario/run details
- `counts`: at least total/candidate and accepted trip counts
- extractor `metadata` with `candidateTrips`, `acceptedRuntimeRequests`, and
  `rejectedRuntimeRequests` is accepted as the counts source
- `trips`, `requests`, `demand`, or `candidates`: accepted trip rows
- `rejects`, `rejected`, or `unreachable`: recommended for auditability when
  any candidates are filtered out

Required per-trip fields:

- `id`, `tripId`, or `requestId`
- `departSec`, `departureSec`, `departTime`, `departureTime`, or `timeSec`
- `mode`, `primaryMode`, `mainMode`, `transportMode`, or a `modes` chain
- `origin`/`from`/`originCoord` with lon/lat, or `originLon`/`originLat`
- `destination`/`to`/`destinationCoord` with lon/lat, or
  `destinationLon`/`destinationLat`
- `pickupEdge`, `pickupServiceEdge`, `pickupSumoEdge`, `fromEdge`, or
  `originEdge`
- `dropoffEdge`, `dropoffServiceEdge`, `dropoffSumoEdge`, `toEdge`, or
  `destinationEdge`

Validation command once the demand file exists:

```powershell
python scripts\check_robotaxi_demand_shape.py `
  --demand-file data\intermediate\sumo\charlottenburg-moabit-tiergarten\demand\robotaxi-demand.json `
  --scope charlottenburg-moabit-tiergarten `
  --expected-start-sec 64800 `
  --expected-end-sec 75600 `
  --service-edges-file data\intermediate\sumo\charlottenburg-moabit-tiergarten\package-staging\charlottenburg-moabit-tiergarten\charlottenburg-moabit-tiergarten.service-edges.txt `
  --rejects-file data\intermediate\matsim\charlottenburg-moabit-tiergarten\charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.rejects.json `
  --json
```

Default allowed demand modes are `car` and `ride`. Other MATSim modes should
stay out of the user-facing Cybercab story unless the product explicitly
changes the scope. Mode enforcement is based on trip fields such as
`primaryMode`; it must not rely only on file names.

## End-To-End QA Checklist

1. Package discovery
   - `python scripts\check_sumo_package_shape.py --package-dir <staged-dir>`
   - Confirm the copied runtime package appears under
     `hf-space/app/sumo/charlottenburg-moabit-tiergarten/`.
   - Confirm `/sumo/scenarios` reports package files as present.

2. SUMO config load
   - `python -m py_compile hf-space\app\main.py scripts\smoke_backend.py scripts\check_robotaxi_contract.py scripts\check_sumo_package_shape.py`
   - Start backend locally.
   - `GET /sumo/charlottenburg-moabit-tiergarten/summary`
   - `GET /sumo/charlottenburg-moabit-tiergarten/network`
   - `GET /sumo/charlottenburg-moabit-tiergarten/validate`

3. Demand ingestion
   - Run `python scripts\check_robotaxi_demand_shape.py --demand-file <staged-demand.json>`.
   - Confirm every accepted trip has `pickupEdge` and `dropoffEdge`.
   - Confirm edge candidates validate against the approved service edge set.
   - Confirm rejects/unreachable counts are present when candidates are dropped.

4. Taxi controller start
   - `GET /robotaxi/charlottenburg-moabit-tiergarten/contract` returns
     `fleetSize: 5`, `canStart: true`, and `phase: idle`.
   - `WS /ws/robotaxi/charlottenburg-moabit-tiergarten` accepts
     `{ "command": "start" }`.
   - First running status frame reports `phase: running` and `cabsActive <= 5`.

5. Websocket status frames
   - Every status frame includes only the user-facing fields:
     `timeSec`, `timeLabel`, `cabsActive`, `ridesServed`, `phase`.
   - `timeSec` stays within `64800-75600`.
   - `cabsActive` comes from SUMO/TraCI taxi state, not frontend counters.
   - `ridesServed` comes from backend assignment/completion state.

6. Final audit metrics
   - Done payload includes final results for the same status fields.
   - Final `phase` is `complete` or `error`.
   - Final `ridesServed` is the count of demand requests whose pickup and
     dropoff were completed by backend-controlled robotaxis.
   - Final `ridesServed` matches backend trip-completion audit data.
   - No browser-derived metric replaces backend audit truth.

## Product Assumptions To Keep Visible

- The fixed depot must be represented by one real edge in the approved SUMO
  network.
- "Cabs active" means backend/SUMO-controlled robotaxi vehicles currently in
  service, not background traffic vehicles.
- "Rides served" means completed robotaxi passenger trips. Background SUMO
  vehicles do not count.
- Non-car/non-ride MATSim modes are excluded from the default Cybercab demand
  story until product direction says otherwise.
- The backend may show unavailable status before data/controller readiness, but
  the user-facing build should hide engineering diagnostics.
