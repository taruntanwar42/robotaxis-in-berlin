# Robotaxi Runtime Contract

This contract is the backend-facing shape for the simplified user app. It is
separate from the existing Reinickendorf SUMO traffic viewer.

## Product Scenario

The initial robotaxi product scenario is:

- Scope: `charlottenburg-moabit-tiergarten`
- Service area: Charlottenburg + Moabit + Tiergarten
- Window: `18:00-19:00` (`64800-68400`)
- Assignment cutoff: `18:50` (`67800`); already accepted trips may finish
- Request expiry: `600` seconds after announcement (`requestExpirySec`)
- Hidden recovery cap: up to fifteen minutes after service close for depot
  return; playback ends as soon as the fleet is parked at the depot
- Fleet size: `5`
- Depot: fixed by backend scenario config; no user selector
- Public playback pace: constant ~40x (1 sim-second frames scheduled every
  25 ms in the frontend); the full window plays in roughly 90 seconds

The active implementation uses the generated corridor SUMO package and MATSim
car/ride demand. It must not create browser-side fake cab movement; vehicle
positions come from SUMO/TraCI frames.

## REST

```text
GET /health
GET /sumo/{scope}/summary
GET /sumo/{scope}/network
GET /sumo/{scope}/validate
```

The frontend uses the SUMO summary/network endpoints to render the map shell
and the single `Start simulation` action. Live robotaxi state arrives over the
SUMO playback websocket.

```json
{
  "scope": "charlottenburg-moabit-tiergarten",
  "available": true,
  "canStart": true,
  "fleetSize": 5,
  "cabCount": 5,
  "requestExpirySec": 600,
  "window": { "startSec": 64800, "endSec": 68400, "label": "18:00-19:00" },
  "liveFrame": {
    "type": "status",
    "scope": "charlottenburg-moabit-tiergarten",
    "timeSec": 64800,
    "timeLabel": "18:00",
    "phase": "running",
    "cabsActive": 0,
    "ridesServed": 0,
    "requestCounts": {
      "scheduled": 0,
      "waiting": 0,
      "assigned": 0,
      "onboard": 0,
      "completed": 0
    },
    "cabRows": [
      {
        "id": "cybercab-01",
        "state": "staged",
        "label": "Cybercab 01",
        "speedKph": null,
        "etaSec": null,
        "target": null,
        "stopReason": "awaiting_validated_demand",
        "requestId": null,
        "lon": null,
        "lat": null,
        "heading": null
      }
    ],
    "mapVehicles": [],
    "mapRequests": [],
    "totals": {
      "totalDemand": 0,
      "ridesServed": 0,
      "expiredRequests": 0,
      "rejectedRequests": 0,
      "cabsReturned": 0
    },
    "finalAudit": null
  },
  "websocket": "/ws/sumo/charlottenburg-moabit-tiergarten/playback?speed=1000&demand=matsim&engine=taxi&detail=public&cache=auto",
  "startCommand": { "uiAction": "start simulation" }
}
```

The minimal status panel should consume these fields from `liveFrame`:

- `timeSec` / `timeLabel`
- `requestCounts` and metrics `openRequests`, `acceptedRequests`, and
  `availableCabs`
- `totals.ridesServed`, `totals.totalDemand`, and `totals.cabsReturned`
- `phase`

The live pane should include a compact request strip derived from `mapRequests`
and the live request counts: open requests are hollow black markers, accepted
requests are filled black markers, and completed requests are muted. The cab
table should consume `cabRows`. Map rendering should consume `mapVehicles` and
`mapRequests`; entries must come from backend/SUMO state and validated demand
only. `mapVehicles` and robotaxi positions are SUMO/TraCI state, not browser
interpolation.

Allowed phases are `unavailable`, `idle`, `running`, `winding_down`,
`returning_to_depot`, `complete`, and `error`.

## WebSocket

```text
WS /ws/sumo/{scope}/playback?speed={5|10|25|50|100|250|500|1000}&demand={matsim|sumo}&engine={taxi|custom}&detail={public|full}&cache={auto|live|cache}
```

Playback chunks contain one or more SUMO frames. Each frame carries the same
product contract fields at top level plus the full dispatch payload:

The primary UI intentionally has no playback speed controls; the watchable
pace (~40x) is a frontend frame-scheduling constant over 1-sim-second replay
frames. Engineering diagnostics may still request other websocket rates.
The public app requests `cache=auto`. When the packaged replay exists, the
backend streams that deterministic SUMO-derived replay instead of recomputing
the window plus depot recovery on every user click. The packaged replay is
recorded at `speed=50` (1 frame per sim-second) into
`hf-space/app/data/replays/charlottenburg-moabit-tiergarten_taxi_matsim_public.jsonl.gz`;
regenerate it with
`python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7860`.
Use `cache=live` for engineering checks that must recompute directly through
SUMO/TraCI; use `cache=cache` to fail fast if the packaged replay is missing.
Live runs use one-second SUMO/TraCI stepping; public detail reduces streamed
visual payload instead of changing simulation physics. Cab movement and status
still come from SUMO/TraCI state, not browser-side interpolation.
The active taxi runtime stops accepting unassigned requests ten minutes before
19:00, expires never-assigned requests ten minutes after announcement, lets
already accepted pickup/dropoff work finish, then keeps SUMO running only long
enough to audit depot recovery.
The public app requests `detail=public`, which sends every robotaxi plus a
bounded deterministic sample of background traffic. Engineering diagnostics may
request `detail=full`.

```json
{
  "type": "status",
  "timeSec": 64800,
  "timeLabel": "18:00",
  "phase": "running",
  "cabsActive": 0,
  "ridesServed": 0,
  "requestCounts": {
    "scheduled": 0,
    "waiting": 0,
    "assigned": 0,
    "onboard": 0,
    "completed": 0
  },
  "cabRows": [],
  "mapVehicles": [],
  "mapRequests": [],
  "totals": { "totalDemand": 0, "ridesServed": 0 },
  "finalAudit": null
}
```

Final results should be sent as:

```json
{
  "type": "done",
  "simSec": 75684,
  "serviceEndSimSec": 68400,
  "audit": {
    "simSec": 75684,
    "completed": 87,
    "openRequests": 0,
    "acceptedRequests": 0,
    "notServedRequests": 187,
    "fleetAtDepot": 5,
    "fleetSize": 5,
    "allFleetRecovered": true,
    "passed": true
  },
  "finalDispatch": {
    "robotaxis": [],
    "requests": [],
    "metrics": {
      "serviceWindowComplete": true,
      "openRequests": 0,
      "acceptedRequests": 0,
      "availableCabs": 0,
      "completed": 87,
      "targetRequests": 274,
      "fleetAtDepot": 5
    }
  }
}
```

If `totals.cabsReturned` / `audit.fleetAtDepot` is lower than the fleet size,
the UI must not claim the fleet has returned. It should phrase the result as
the cabs heading back until a longer winddown/audit proves depot recovery.

When the real controller is implemented, `cabsActive` and `ridesServed` must
come from backend/SUMO/TraCI state and audit data, not frontend counters.
`ridesServed` is only completed backend-controlled pickup/dropoff requests.
`cabsActive` is only backend/SUMO-controlled robotaxis in active runtime states.
`openRequests` means only `scheduled + waiting`; assigned and onboard requests
must be counted separately as `acceptedRequests` so the UI does not double-count
active work.

## Demand Gate

The corridor runtime demand file must validate before activation. Required trip
fields are request/trip id, departure time in the `18:00-19:00` service window,
explicit mode, origin/destination lon/lat, pickup/dropoff SUMO service edges,
and top-level source/provenance plus counts/reject metadata.

Accepted runtime modes are `car` and `ride` only. The backend validation must
read the trip fields (`mode`, `primaryMode`, equivalent aliases, or a `modes`
chain) and reject other modes. File names such as `car_ride` are not trusted as
the authority.
