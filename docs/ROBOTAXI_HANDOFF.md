# Robotaxi Handoff

This document is for the next agent/thread. Read it before implementing.

## Current State

The current repo state is intentionally conservative after a rollback.

What exists now:

- A React/Vite MapLibre app with two sections:
  - Demand replay page.
  - SUMO live/base map page.
- A FastAPI backend in `hf-space/app/main.py`.
- A packaged Reinickendorf SUMO cutout in `hf-space/app/sumo/reinickendorf/`.
- A compact 06:00-07:00 scenario bundle in `public/data/six-seven-scenario.json`.
- Richer source data copied into `data/source/reinickendorf/`.

What may not exist now:

- Real robotaxi dispatch logic.
- Separate golden robotaxi vs black background vehicle rendering.
- Backend request-state metrics such as waiting, assigned, picked_up, served, and avg wait.

Do not assume those exist. Inspect current files.

## Product Direction

The user wants this to become a polished student-portfolio robotaxi control-room app.

Priority order:

1. Rebuild and verify a basic v0 with real SUMO-controlled robotaxis.
2. Extend into a premium version with Tegel/TXL depot, full-edge routing, charging, fleet management, and routing algorithm comparisons.
3. Later, build an ultra version with Charlottenburg, Mitte, full Berlin, and multiple depots if data supports it.

Keep the app impressive but not bloated. Favor features that are visually clear, technically honest, and explainable.

## V0 Acceptance Criteria

The basic v0 is not complete until all are true:

- The SUMO live page shows golden robotaxis whose positions come from SUMO/TraCI.
- Robotaxis serve about five selected requests.
- Background SUMO cars render separately as subdued black/small vehicles.
- The browser does not interpolate robotaxi routes.
- Backend emits honest dispatch metrics from simulation events:
  - `waiting`
  - `assigned`
  - `picked_up`
  - `served`
  - `avgWaitSec`
- First demand-replay page still works.
- Local checks pass:

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```

Rendered browser check should show:

- SUMO stream starts from the local backend.
- Robotaxi count becomes positive while active.
- Served count advances toward `5/5`.
- No relevant console errors.

## Recommended V0 Implementation Shape

Backend:

- Add a dispatch state machine inside `hf-space/app/main.py`.
- Use `reinickendorf-internal.rou.gz` or `data/source/reinickendorf/internal-trips.json` to map trip IDs to normal SUMO edge sequences.
- Select the first five routable requests from the 06:00-07:00 window.
- Use an in-cutout depot edge for v0 because TXL is outside the current network.
- Insert robotaxis with TraCI:
  - `connection.route.add(...)`
  - `connection.vehicle.add(...)`
  - `connection.vehicle.setColor(...)`
- Let SUMO advance robotaxi positions through `simulationStep`.
- Stream robotaxis separately from background vehicles.

Frontend:

- Split vehicle rendering into background traffic and robotaxis.
- Keep background cars black/subdued/small.
- Keep robotaxis golden and visually readable.
- Display backend metrics directly.

Avoid:

- `moveToXY` for per-frame animation.
- Frontend-only robotaxi motion.
- Counting background traffic as robotaxis.
- Treating skipped/unroutable candidate trips as failed served requests.

## Premium Version Notes

Tegel/TXL depot cannot be honest with only the current Reinickendorf SUMO cutout.

To implement Tegel:

1. Generate or acquire a larger SUMO network that includes TXL/Tegel and the current service area.
2. Verify routing from Tegel depot edge to selected pickup/dropoff edges.
3. Keep the route generation reproducible in scripts/docs.
4. Only then add UI controls for depot selection.

Premium features worth adding:

- Depot marker and fleet inventory.
- Request queue with states and wait times.
- Fleet utilization and empty-distance/deadheading.
- Simple routing strategy toggle:
  - FIFO
  - nearest idle taxi
  - balanced/charging-aware placeholder only after charging exists
- Charging model:
  - battery percentage
  - charger/depot stalls
  - charge/dispatch thresholds
- Scenario controls:
  - fleet size
  - request count/window
  - speed
  - background traffic on/off

Features to avoid until data exists:

- Full Berlin claims.
- Precise robotaxi replacement percentages.
- Real traffic demand claims beyond the BeST/SUMO synthetic scenario.

## Ultra Version Notes

Charlottenburg, Mitte, and full Berlin modes need actual SUMO networks/scenarios or a documented generation pipeline. Do not just draw new polygons on the existing Reinickendorf network.

If data becomes available, implement modes as scenario descriptors rather than hard-coded branches:

```text
scenario id
label
network path
route file path
service area polygon
default depot(s)
available request windows
known limitations
```

## Known Local Resources

SUMO install:

```text
C:\Program Files (x86)\Eclipse\Sumo\
```

Eclipse MOSAIC download:

```text
C:\Users\KitCat\Downloads\eclipse-mosaic-25.2\
```

MOSAIC includes example scenarios such as Tiergarten and Barnim, but they are not currently wired into this app.

## Do Not Commit Yet

The user explicitly asked not to commit yet. Keep changes local unless asked.
