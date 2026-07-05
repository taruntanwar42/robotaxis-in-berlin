# Charlottenburg + Moabit + Tiergarten Scenario Handoff

> **Status (2026-07-05):** this document records how the corridor package was
> planned and built. Its `18:00-21:00` window describes the generated SUMO
> package, which is still valid; the **runtime** window was later narrowed to
> `18:00-19:00` (`64800-68400`) in the backend scenario registry, with a new
> `..._180000_190000_car_ride.json` demand extract. See
> `docs/ROBOTAXI_RUNTIME_CONTRACT.md` and `docs/PRODUCT_DECISION_LOG.md`
> (2026-07-04 pacing decisions) for the current contract.

This is the Scenario/Data plan for the Berlin Cybercab service zone. It
replaces the earlier Charlottenburg + Mitte + Moabit idea. Do not build around
Mitte.

## Scenario Key

- Key: `charlottenburg-moabit-tiergarten`
- Name: `Charlottenburg + Moabit + Tiergarten service zone`
- Product intent: a compact west-central Berlin corridor that is recognizable,
  inspectable, and traffic-isolated enough for a plausible first SUMO/Cybercab
  dispatch scenario.
- Shift window: `18:00-21:00`
- Initial fleet: `5` Cybercabs.
- Depot: fixed existing depot marker/story; do not expose depot choice as a
  user control.

## Current Data Availability

In this isolated worktree:

- Present: official Berlin district boundary source files for Reinickendorf.
- Present: generated planning artifacts for the new service zone under
  `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/`.
- Missing: legacy BeST cutout generator, MATSim demand extraction script, MATSim
  plan source files, and BeST upstream SUMO files.

Nearby local paths found by the planner:

- BeST SUMO: `C:\Users\KitCat\Desktop\Projects\EV Mobility Dashboard\data\raw\best-scenario\scenario\sumo`
- MATSim v6.4 1% plans: `C:\Users\KitCat\Desktop\robotaxi-control-room\data\source\matsim-berlin\berlin-v6.4-1pct.plans.xml.gz`
- Legacy reference scripts: `C:\Users\KitCat\Desktop\robotaxi-control-room\scripts\build_reinickendorf_best_cutout_sumo.py` and `build_matsim_person_demand.py`

## Boundary Recommendation

Use official Berlin ALKIS Ortsteile as the provenance boundary:

- `Charlottenburg`
- `Moabit`
- `Tiergarten`

Source:

- WFS: `https://gdi.berlin.de/services/wfs/alkis_ortsteile`
- Layer: `alkis_ortsteile:ortsteile`
- Source CRS: `EPSG:25833`
- Generated GeoJSON:
  `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.ortsteile.geojson`

For SUMO generation, also consider the generated corridor envelope:

- File:
  `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.corridor-envelope.geojson`
- Method: padded EPSG:25833 bounding rectangle around the three official
  Ortsteil polygons.
- Use: candidate edge-selection polygon when exact official boundaries produce a
  jagged or awkward cutout.
- Rule: if the envelope is used, label it as a simulation approximation, not an
  official neighborhood boundary.

## Generator Strategy

1. Fetch official Ortsteil polygons and write provenance manifest.
2. Pick official polygons or the simplified corridor envelope as the SUMO
   service polygon.
3. Parse BeST `berlin.net.xml` and select road edges whose lane or edge midpoint
   sits inside the service polygon.
4. Keep the existing depot location/story as the fixed fleet origin. Add
   connector edges from that depot into the service zone using `sumolib`
   shortest paths.
5. Generate initial staging positions for 5 cabs inside the service area before
   active service starts.
6. Run `netconvert --keep-edges.input-file` from the selected edge list.
7. Filter BeST `berlin.rou.gz` to strict-contained background routes inside the
   service edge set, excluding depot-connector-only edges from background
   traffic eligibility.
8. Extract MATSim person trips from v6.4 plans for `18:00-21:00`, origin and
   destination inside the official service boundary, with `car,ride` as initial
   Cybercab-candidate modes.

## Current Edge-List Result

Script:

```powershell
python scripts\build_charlottenburg_moabit_tiergarten_sumo.py --run-netconvert
```

Outputs are generated under ignored intermediate storage:

- `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.service-edges.txt`
- `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.active-edges.txt`
- `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.net.xml`
- `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.sumo-build-plan.json`

Before/after counts from the first corridor build:

- BeST source edge tags scanned: `231633`
- Source internal edge tags skipped: `159982`
- Road lane records considered: `84240`
- Selected service edges: `4025`
- Fixed depot connector edges added: `102`
- Active non-internal cutout edges: `4063`
- Generated network edge tags: `12648`
- Generated non-internal edge tags: `4063`
- Generated internal edge tags: `8585`
- Generated lanes: `17101`
- Generated junctions: `2848`
- Generated traffic-light logics: `309`
- Initial staging candidates: `5`

`netconvert` completed successfully. It emitted normal cutout warnings about
turnarounds, sharp turns, some unconnected lanes/edges, and unused traffic-light
states. Those need a SUMO validation/playback pass before packaging.

Guardrails now written into
`data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.sumo-build-plan.json`:

- `generatedNetCounts` records post-`netconvert` network counts.
- `packagingStatus` explicitly marks background routes, demand, runtime
  packaging, and backend registration as not done.
- Background route filtering must use `serviceEdges`, not `activeEdges`.
  `activeEdges` includes fixed depot connector links for tutorial/return
  movement, so using it for background routes would create connector-only
  boundary traffic.
- Depot connector route candidates include outbound/inbound edge counts and
  outbound/inbound path lengths in meters.
- Staging candidates are spread across `center`, `west`, `east`, `north`, and
  `south` target slots, not all taken from one local cluster.
- Staging validation currently reports all 5 staging edges as non-internal and
  passenger/taxi-capable, with a minimum nearest-neighbor spacing of `1331.8m`.

Current staging edge IDs:

- `217878976`
- `-4495200#0`
- `4377008#5`
- `203910771#0`
- `142629241`

These are candidates only. They still need visual/SUMO playback inspection
before becoming packaged service-start positions.

## Route Packaging Step

Script:

```powershell
python scripts\filter_charlottenburg_moabit_tiergarten_routes.py --dry-run --max-vehicles 100000
```

Dry-run result from the first bounded check:

- Source routes: `C:\Users\KitCat\Desktop\Projects\EV Mobility Dashboard\data\raw\best-scenario\scenario\sumo\berlin.rou.gz`
- Route filter edge set: `serviceEdges`
- `activeEdges` used: no
- Vehicles scanned: `100000`
- Vehicles kept: `2638`
- Vehicles rejected: `97362`
- Vehicles without route: `0`
- First kept depart: `0.00`
- Last kept depart in bounded sample: `24104.00`
- Packaging complete: no, because this was a dry-run sample.

Full route generation command when ready:

```powershell
python scripts\filter_charlottenburg_moabit_tiergarten_routes.py
```

Full-route result:

- Runtime: `22.213s`
- Output route file:
  `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.service-contained.rou.xml`
- Output metadata:
  `data/intermediate/sumo/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten.service-contained.routes.metadata.json`
- Route file size: `34944304` bytes
- Vehicles scanned: `2248884`
- Vehicles kept: `91357`
- Vehicles rejected: `2157527`
- Vehicles without route: `0`
- First kept depart: `0.00`
- Last kept depart: `86397.00`
- `activeEdgesNotUsed`: `true`
- Packaging complete for background routes: `true`

Lightweight route validation:

- XML header present: yes
- Root tag: `routes`
- XML parse: pass
- `vType` count: `1`
- Vehicle count: `91357`
- Route count: `91357`
- Max route edge count: `98`
- Routes with edges outside `serviceEdges`: `0`
- Routes with connector-only depot edges: `0`
- All background routes inside `serviceEdges`: yes
- No connector-only background routes: yes

Risk: full parsing reads the complete `399 MB` compressed BeST route source and
will write a potentially large XML route file. It is mechanically bounded by the
strict `serviceEdges` filter, but runtime and output size should be watched.

## MATSim Demand Extract

Script:

```powershell
python scripts\build_charlottenburg_moabit_tiergarten_matsim_demand.py
```

Source availability:

- Local MATSim source:
  `C:\Users\KitCat\Desktop\robotaxi-control-room\data\source\matsim-berlin\berlin-v6.4-1pct.plans.xml.gz`
- Source size: `108446324` bytes
- Sample: `1pct`
- Time window: `18:00:00-21:00:00`
- Area filter: generated simulation corridor envelope derived from official
  Charlottenburg, Moabit, and Tiergarten Ortsteile.
- Mode filter for the first Cybercab candidate extract: `car,ride`

Generated intermediate demand files:

- `data/intermediate/matsim/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.json`
- `data/intermediate/matsim/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.csv`
- `data/intermediate/matsim/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.metadata.json`
- `data/intermediate/matsim/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.rejects.json`
- `data/intermediate/matsim/charlottenburg-moabit-tiergarten/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_210000_car_ride.rejects.csv`

Full extract result:

- Runtime: `27.462s`
- Persons read: `52263`
- Trips extracted: `181463`
- Trips in `18:00-21:00` window: `20055`
- Trips missing coordinates: `16`
- Trips inside corridor, all modes: `951`
- Trips inside corridor after `car,ride` mode filter: `293`
- Candidate Cybercab trips: `293`
- Cybercab-capable trips: `293`
- Candidate mode counts: `car=236`, `ride=57`
- Excluded in-corridor modes before the mode filter: `walk=364`,
  `bike=159`, `pt=134`, `truck=1`
- Accepted runtime requests: `287`
- QA rejects: `6`
- Reject reasons: `pickup_service_edge_too_far=4`,
  `dropoff_service_edge_too_far=2`

Conservative link-id reachability against SUMO `serviceEdges`:

- Service edges loaded: `4025`
- Service-edge midpoints indexed: `4025`
- Kept trips with MATSim start link in `serviceEdges`: `146`
- Kept trips with MATSim end link in `serviceEdges`: `130`
- Kept trips with all MATSim route links in `serviceEdges`: `2`
- Kept trips fully reachable by this link-id check: `2`
- Kept trips with no MATSim network route links: `0`

Important interpretation: MATSim link IDs and the generated SUMO service-edge
IDs are not a complete backend routing contract. The low full-route reachability
count is expected for a strict raw link-id check and does not reject the demand
extract. Runtime requests use nearest SUMO service-edge assignments instead:
accepted rows include `pickupServiceEdge`, `dropoffServiceEdge`, and backend
validator aliases `pickupEdge`, `dropoffEdge`.

Nearest-edge assignment threshold:

- Maximum accepted pickup/dropoff distance: `250.0m`
- Accepted requests with pickup edge <= `250m`: `287`
- Accepted requests with dropoff edge <= `250m`: `287`
- Candidate pickup distance stats: min `6.3m`, p50 `47.9m`, p90 `121.9m`,
  p95 `154.1m`, max `312.8m`, mean `61.5m`
- Candidate dropoff distance stats: min `6.3m`, p50 `43.4m`, p90 `98.1m`,
  p95 `129.1m`, max `274.3m`, mean `54.4m`
- Accepted pickup distance stats: min `6.3m`, p50 `47.4m`, p90 `109.8m`,
  p95 `148.1m`, max `243.8m`, mean `58.4m`
- Accepted dropoff distance stats: min `6.3m`, p50 `43.2m`, p90 `95.7m`,
  p95 `123.5m`, max `225.8m`, mean `52.9m`

Bounded nearest-service-edge assignment check:

```powershell
python scripts\build_charlottenburg_moabit_tiergarten_matsim_demand.py --max-persons 1000 --output-dir data\intermediate\matsim\charlottenburg-moabit-tiergarten\dry-run
```

Result:

- Runtime: `6.464s`
- Persons read: `1000`
- Trips extracted: `3240`
- Trips in time window: `274`
- Trips inside corridor after mode filter: `0`
- Service-edge midpoints indexed from SUMO net: `4025`

Shape validation:

```powershell
@'
# read-only JSON shape validation against accepted/reject demand outputs
'@ | python -
```

Validation result: pass. The accepted JSON contains `287` requests, all with
`primaryMode in {car, ride}`, `departureSec` inside `64800-75600`, origin and
destination inside the corridor, `pickupServiceEdge`/`dropoffServiceEdge`
present, backend aliases `pickupEdge`/`dropoffEdge` matching, assigned edges in
the SUMO `serviceEdges` list, and pickup/dropoff distances <= `250m`. Reject
JSON contains `6` requests with non-empty reject reasons. No backend demand
validator script or endpoint exists in this checkout; no backend/controller file
was edited.

## Package Checklist

Ready:

- Official Ortsteil provenance GeoJSON.
- Clean corridor envelope GeoJSON.
- Service edge list.
- Active edge list with fixed depot connectors.
- Generated SUMO network in intermediate storage.
- Fixed 5-cab staging candidates with validation metadata.
- Bounded route-filter dry run proving the service-edge filter works.
- Full strict-contained background route file using `serviceEdges` only.
- Staged package directory under ignored intermediate storage.
- SUMO config for the `18:00-21:00` service window.
- One-second SUMO config/net/route load validation.
- Intermediate MATSim `1pct` `18:00-21:00` car/ride demand extract.
- Backend-ready demand rows with pickup/dropoff SUMO service-edge aliases.
- QA reject files for candidate trips that failed edge-assignment quality.

Still missing before runtime integration:

- Frontend map/network manifest or backend network endpoint wiring.
- Cybercab request/depot/staging runtime contract file consumed by the backend.
- Full SUMO/TraCI playback pass on the generated cutout and route file.
- Backend scenario registration in `hf-space/app/main.py`.
- Reviewed copy into `hf-space/app/sumo/charlottenburg-moabit-tiergarten/`.

## Staged SUMO Package

Script:

```powershell
python scripts\stage_charlottenburg_moabit_tiergarten_package.py
```

The script stages files only under ignored intermediate storage and refuses to
write directly into the live runtime directory:

```text
data/intermediate/sumo/charlottenburg-moabit-tiergarten/package-staging/charlottenburg-moabit-tiergarten/
```

Staged package contents:

- `charlottenburg-moabit-tiergarten.net.xml` (`12845599` bytes)
- `charlottenburg-moabit-tiergarten-contained.rou.xml` (`34944304` bytes)
- `charlottenburg-moabit-tiergarten.sumocfg` (`18:00-21:00`)
- `charlottenburg-moabit-tiergarten-1800-2100.sumocfg` (same config, explicit alias)
- `charlottenburg-moabit-tiergarten.geojson` (simulation corridor envelope)
- `charlottenburg-moabit-tiergarten.official-ortsteile.geojson` (official provenance)
- `charlottenburg-moabit-tiergarten.service-edges.txt`
- `charlottenburg-moabit-tiergarten.active-edges.txt`
- `charlottenburg-moabit-tiergarten.corridor.sumo-boundary.txt`
- `charlottenburg-moabit-tiergarten.sumo-build-plan.json`
- `charlottenburg-moabit-tiergarten.service-contained.routes.metadata.json`
- `charlottenburg-moabit-tiergarten.source-manifest.json`
- `metadata.json`
- `output/.gitkeep`

The staged `metadata.json` preserves the package guardrails:

- `liveRuntimeWritten`: `false`
- `initialFleetSize`: `5`
- Shift window: begin `64800`, end `75600`
- Background route filter edge set: `serviceEdges`
- `activeEdgesNotUsedForBackgroundRoutes`: `true`
- `activeEdges` remain for depot origin/return movement only.

Generated SUMO config:

```xml
<time>
    <begin value="64800.0"/>
    <end value="75600.0"/>
</time>
```

The config paths resolve inside the staged package:

- Net: `charlottenburg-moabit-tiergarten.net.xml`
- Routes: `charlottenburg-moabit-tiergarten-contained.rou.xml`

Lightweight SUMO validation command:

```powershell
Push-Location data\intermediate\sumo\charlottenburg-moabit-tiergarten\package-staging\charlottenburg-moabit-tiergarten
& "C:\Program Files (x86)\Eclipse\Sumo\bin\sumo.exe" -c "charlottenburg-moabit-tiergarten.sumocfg" --begin 64800 --end 64801 --no-step-log true --duration-log.disable true --quit-on-end true
Pop-Location
```

Validation result:

- SUMO binary: `C:\Program Files (x86)\Eclipse\Sumo\bin\sumo.exe`
- Exit code: `0`
- Runtime: about `2s`
- Loaded at `18:00:00`: `3` vehicles
- Inserted: `2`
- Collisions: `0`
- Teleports: `0`
- Person traffic loaded: `0`

SUMO emitted inherited cutout traffic-light warnings about actuated phases,
unsafe green phases, and unused states. There were no missing config, net, or
route errors. This validates package loading only; it is not a full shift,
robotaxi dispatch, or visual playback validation.

## Fleet And Depot Story

- The existing depot is a visual marker and fleet origin, not a user setting.
- During onboarding/tutorial playback, cabs may be shown driving from the depot
  in the background.
- At `18:00`, active service should start with all 5 cabs already staged inside
  the Charlottenburg + Moabit + Tiergarten service area.
- Depot-to-service staging should not be counted as customer service.
- After the `18:00-21:00` service window, cabs return to the fixed depot.

## Expected Outputs

- `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/*.geojson`
- `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/*.manifest.json`
- `data/intermediate/sumo/charlottenburg-moabit-tiergarten/`
- `hf-space/app/sumo/charlottenburg-moabit-tiergarten/`
- `data/processed/matsim/charlottenburg-moabit-tiergarten_person_trips_v6_4_1pct_180000_210000.*`

## Acceptance Checks

- Boundary artifact contains exactly Charlottenburg, Moabit, and Tiergarten.
- No Mitte service-area substitution.
- Corridor envelope is visually inspected against the coordination screenshots
  before it becomes a SUMO cutout input.
- SUMO network validates and has a connected depot-to-service-zone path.
- Scenario manifest fixes the fleet at 5 cabs and does not expose depot choice.
- Service playback starts with all 5 cabs staged in the service area.
- Return-to-depot path is feasible after the service window.
- Route filter reports total, kept, and rejected background vehicles.
- Route filter uses `serviceEdges`, not `activeEdges`.
- Demand metadata reports persons read, trips in window, trips inside area, and
  Cybercab-candidate trips.
- Runtime packaging is not considered complete until network, routes, demand,
  and backend scenario registration are all present.
- Generated net warnings are reviewed with a SUMO validation/playback pass
  before the cutout is copied into `hf-space/app/sumo/`.
- Backend smoke checks pass only after the scenario is intentionally wired into
  `hf-space/app/main.py`.

## Files Owned By Future Data Track

- `scripts/plan_charlottenburg_moabit_tiergarten_scenario.py`
- Future BeST/SUMO generator for `charlottenburg-moabit-tiergarten`
- Future MATSim demand extractor or parameterized replacement
- Generated service-zone source artifacts under
  `data/source/berlin-ortsteile/charlottenburg-moabit-tiergarten/`
- Generated intermediate/runtime scenario outputs listed above
