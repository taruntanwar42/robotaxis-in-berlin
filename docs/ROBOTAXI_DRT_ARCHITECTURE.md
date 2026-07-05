# Robotaxi / DRT Architecture

> **Status (2026-07-05): methodology reference with stale specifics.** The
> layer contract below (MATSim demand vs. DRT reference config vs. SUMO
> execution vs. backend controller) still holds. But concrete numbers and
> scenario names in this document describe the earlier Reinickendorf
> prototype (20 cabs, charging, 300s reference wait, 18:00-21:00). The shipped
> v1 product is `charlottenburg-moabit-tiergarten`, 5 cabs, 18:00-19:00,
> 10-minute expiry, no charging. When this document and
> `docs/ROBOTAXI_RUNTIME_CONTRACT.md` or `docs/PRODUCT_DECISION_LOG.md`
> disagree, those win.

This document defines the robotaxi model layers before changing dispatch
logic. It exists to prevent mixing four different model layers into one
ambiguous "simulation".

## Layer Contract

### MATSim Person Plans: Demand Source

MATSim Berlin selected plans provide person-level daily activity chains. They
are the source for request time, origin activity, destination activity, person
attributes, and candidate request coordinates.

They are not vehicle execution. They are not robotaxi trips. In MATSim Berlin,
`ride` means private car passenger, not taxi, DRT, or Cybercab.

Current extractor:

```text
scripts/build_matsim_person_demand.py
```

Current BeST-cutout outputs:

```text
data/processed/matsim/reinickendorf_person_trips_1pct_060000_070000_car_ride.json
data/processed/matsim/reinickendorf_person_trips_1pct_060000_070000_all_modes.json
data/processed/matsim/reinickendorf_person_trips_1pct_180000_210000_all_modes.json
data/processed/matsim/reinickendorf_person_trips_1pct_000000_360000_car_ride.json
```

The active `1pct` 18:00-21:00 BeST-cutout all-mode extract is larger than the
original one-hour smoke file:

```text
18:00-21:00 all modes: 298 sampled person trips
06:00-07:00 all modes: 20 sampled person trips
```

This is useful as plumbing and methodology evidence, but not enough by itself
for robust app-level statistics. Larger samples, a wider time window, or
explicit expansion weights are required before making broad claims.

### MATSim DRT Config: Reference Behavior

MATSim Berlin's DRT config is a reference model and parameter source. It is not
directly executed by this app.

Primary config:

```text
https://raw.githubusercontent.com/matsim-scenarios/matsim-berlin/release/v6/input/v6.4/berlin-v6.4.drt-config.xml
```

Parameters to mirror or compare against:

```text
mode = drt
operationalScheme = serviceAreaBased
idleVehiclesReturnToDepots = false
maxWaitTime = 300 seconds
maxTravelTime = 1.7 * estimated_drt_travel_time + 120 seconds
stopDuration = 60 seconds
maxWalkDistance = 2000 meters
useModeFilteredSubnetwork = true
optimizer search = ExtensiveInsertionSearch
zonal system = square grid, 1000 m cells
dvrp networkModes = drt
travelTimeMatrix cellSize = 1000 m
```

The most important behavioral reference is:

```text
idleVehiclesReturnToDepots = false
```

Completed robotaxis should not automatically return to the depot. They should
remain available near demand unless battery, service, end-of-shift, or explicit
staging policy sends them elsewhere.

### SUMO / TraCI: Movement Execution

SUMO owns:

- vehicle movement
- road network execution
- traffic-light state
- lane-level motion
- route feasibility through `simulation.findRoute`
- live vehicle positions

The app must not fake robotaxi motion on the browser side. If a Cybercab moves,
that movement must come from SUMO vehicle state through TraCI.

### Backend Controller: Dispatch Brain

The backend owns:

- request queue
- service-area acceptance
- coordinate-to-SUMO stop mapping
- vehicle assignment
- vehicle state machine
- charging and staging policy
- metrics and event logs

The frontend is display only. It can choose scenario settings before a run, but
it must not mutate vehicle movement or invent dispatch state during playback.

## Demand Adapter Contract

The adapter from MATSim person demand to SUMO serviceable requests is the
methodological core.

Do not join MATSim links to SUMO edges by id. They do not match the active BeST
SUMO cutout. Use coordinates and a reachability check.

Pipeline:

```text
MATSim selected person plans
-> person trips
-> scenario time window
-> service-area coordinate filter
-> one person request per MATSim person trip
-> nearest reachable SUMO pickup/dropoff stops
-> SUMO route feasibility checks
-> accepted request queue
```

Acceptance rule:

```text
accept only if:
  pickup coordinate is inside service area
  dropoff coordinate is inside service area
  pickup maps to a reachable SUMO pickup edge/position
  dropoff maps to a reachable SUMO dropoff edge/position
  current or depot vehicle can route to pickup
  pickup can route to dropoff
  trip satisfies capacity and battery constraints
  expected pickup wait and trip delay satisfy configured bounds
```

Rejected requests must stay visible in metrics with a reason. Do not silently
remove them from denominators.

Required rejection reasons:

```text
out_of_area
missing_coordinates
no_pickup_edge
no_dropoff_edge
unreachable_pickup
unreachable_dropoff
over_capacity
low_battery
wait_timeout
end_of_window
controller_error
```

## Spatial Contract

The active app service area is the BeST Reinickendorf technical cutout plus the
explicit TXL/ADAC depot connector in the SUMO network.

For demand eligibility, the service area is the BeST cutout. The depot corridor
is operational infrastructure, not general passenger demand territory.

Current MATSim extractor performs origin/destination filtering against the
BeST cutout. It does not prove the full MATSim route stays inside the cutout.
The runtime acceptance adapter must therefore prove SUMO serviceability by
mapping pickup/dropoff to the active SUMO network and checking routes.

## Request Lifecycle

Requests are not prescripted robotaxi trips. They appear during the SUMO run and
are handled by the controller.

States:

```text
scheduled
waiting
accepted
assigned
en_route_pickup
onboard
completed
rejected
expired
failed
```

State meanings:

- `scheduled`: demand exists but request time has not arrived.
- `waiting`: request time has arrived and the request is waiting for assignment.
- `accepted`: request passed service-area, battery, and route checks.
- `assigned`: a robotaxi has been selected.
- `en_route_pickup`: assigned robotaxi is driving empty to pickup.
- `onboard`: passenger has been picked up and robotaxi is driving to dropoff.
- `completed`: passenger reached dropoff.
- `rejected`: request failed an acceptance rule before assignment.
- `expired`: request waited beyond the configured max wait.
- `failed`: controller or SUMO execution failed after assignment.

Current MATSim DRT reference max wait is `300s`. A first bounded app version
should use this as the default request expiry threshold unless explicitly
configured otherwise.

## Vehicle State Machine

Robotaxis are controller-driven SUMO vehicles. They do not have fixed trips.

States:

```text
idle_at_depot
idle_staged
en_route_pickup
with_passenger
parking_local
returning_to_depot
charging
service_hold
failed
```

Allowed transitions:

```text
idle_at_depot -> en_route_pickup
idle_at_depot -> charging
idle_at_depot -> idle_staged

idle_staged -> en_route_pickup
idle_staged -> parking_local
idle_staged -> returning_to_depot

en_route_pickup -> with_passenger
en_route_pickup -> failed

with_passenger -> service_hold
with_passenger -> failed

service_hold -> idle_staged
service_hold -> returning_to_depot
service_hold -> charging

parking_local -> en_route_pickup
parking_local -> idle_staged
parking_local -> returning_to_depot

returning_to_depot -> charging
returning_to_depot -> idle_at_depot

charging -> idle_at_depot
charging -> en_route_pickup
```

Depot return rule:

```text
do not return after every ride
return only if:
  battery is below reserve threshold
  no useful staging/parking option exists
  end of operating window is near
  service_hold requires depot
  explicit scenario policy asks for depot return
```

This matches the MATSim DRT reference direction and Tesla-like behavior: while
waiting for new rides, vehicles roam, stage, park, or charge depending on state.

## Dispatch Policy

First bounded policy:

1. At each simulated second, release due `scheduled` requests.
2. Map and validate any unmapped requests before assignment.
3. Expire waiting requests whose wait exceeds `maxWaitTime`.
4. For each available robotaxi, choose the nearest feasible request by SUMO
   route distance or travel time.
5. Feasibility requires capacity, battery reserve, route availability, and
   expected wait under the configured max wait.
6. If no request is available, keep the vehicle staged near its current
   dropoff/local area unless charging/end-of-window logic applies.

Future policy:

- look ahead 5-10 simulated minutes
- bucket demand into simple zones
- stage idle vehicles near future demand
- compare nearest-vehicle against insertion/search heuristics inspired by
  MATSim's `ExtensiveInsertionSearch`

No ML is required for the student project.

## Charging And Parking

Charging is a real fleet constraint, not only UI decoration.

Current app constants:

```text
20 Cybercabs
20 depot pads
150 kW per pad
75 kWh battery capacity
68 kWh initial charge
12 kWh minimum reserve
18 kWh return reserve
fixed controller estimate: 0.145 Wh / m
```

Implementation rules:

- assignment must estimate energy for current position -> pickup -> dropoff
- vehicle must retain minimum reserve after service
- vehicle should return to depot or charging when below return reserve
- charging state should block assignment unless charge is above ready threshold
- charging sessions should be counted

The fixed Wh/m energy model is a controller-side estimate. It is not a
validated SUMO EV physics model unless separately proven.

Parking/staging:

- local parking/staging is allowed after dropoff
- staging should not require browser-side movement
- staging moves should be issued through TraCI routes/stops
- if no legal local stop exists, the vehicle may remain stopped on the
  dropoff edge for the bounded prototype, clearly labeled as a simplification

## Metrics Contract

Report both demand funnel and fleet performance.

Demand funnel:

```text
sourceRequests
insideServiceArea
mappedToPickupDropoff
acceptedRequests
rejectedRequests by reason
expiredRequests
assignedRequests
servedRequests
servedPassengers
```

Service quality:

```text
wait p50 / p90 / p95 / max
pickup wait SLA breach count
trip travel time
estimated detour if pooling is added
completion rate over all source requests
completion rate over accepted requests
```

Fleet:

```text
vehicle-km
empty-km
occupied-km
deadheading percent
passenger-km
fleet utilization by state
charging sessions
average / minimum state of charge
depot charger utilization
energy kWh
energy per passenger-km
```

Counterfactual:

```text
counterfactualCarTripsRemoved
```

This metric is valid only when a request is explicitly linked to a background
SUMO car trip that is removed. MATSim person demand does not automatically
remove a SUMO vehicle unless a separate replacement mapping is defined.

## Implementation Sequence

1. Keep current SUMO trip replacement mode as the legacy baseline.
2. Add a MATSim demand loader that reads processed person-trip JSON.
3. Add coordinate-to-SUMO stop mapping with reachability checks.
4. Create request records with explicit rejection reasons.
5. Replace automatic pickup -> dropoff -> depot behavior with the state machine
   above.
6. Add charging-aware assignment and local staging after completed trips.
7. Add denominator-safe metrics.
8. Update smoke tests to prove:
   - no fallback demand
   - mapped stops are reachable
   - accepted requests have valid SUMO routes
   - rejected requests retain reasons
   - completed ride does not automatically depot-return
   - metric denominators are internally consistent
