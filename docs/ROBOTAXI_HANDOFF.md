# Robotaxi Handoff

This repo is currently **not** a robotaxi dispatch app. It is a lean SUMO
district traffic viewer that we intentionally reset before rebuilding the
robotaxi model.

## Current Live App

- Single MapLibre page.
- Single SUMO scope: `reinickendorf-district`.
- Backend streams normal SUMO traffic through TraCI.
- Frontend renders:
  - official district boundary
  - SUMO lanes/internal lanes
  - SUMO traffic-light bars
  - background vehicles
- No static demand replay page.
- No small cutout mode.
- No full Berlin mode.
- No robotaxi/cybercab dispatch UI, metrics, depot, charging, or routing logic.

## Why This Reset Happened

The previous prototype had useful experiments but too much live complexity:
multiple map pages, stale static JSON replay data, small/full scope switches,
and provisional robotaxi logic. Those pieces made it hard to reason about the
actual SUMO district layer. They were removed from the active app and remain
recoverable through git history.

## Next Robotaxi Work

When robotaxis are rebuilt, do it as a new model rather than reviving the old
v0 code. Recommended order:

1. Define the service area and request source.
2. Choose a depot that exists inside the active SUMO network.
3. Define fleet size and request selection.
4. Implement TraCI-controlled vehicle insertion and routing in the backend.
5. Emit honest backend state/metrics.
6. Add frontend UI only after the backend state model is clear.

Avoid:

- Browser-interpolated vehicle motion.
- Frontend-only robotaxi routes.
- Claims about full Berlin or robotaxi replacement percentages without a
  documented data model.
- Reintroducing the deleted static replay page as a hidden dependency.

## Required Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```
