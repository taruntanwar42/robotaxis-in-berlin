# robotaxis-in-berlin

Focused web prototype for simulating a small Cybercab-style robotaxi dispatch
scenario in Berlin's Charlottenburg, Moabit, and Tiergarten corridor.

## Current Scope

- One frontend page: Berlin Cybercab simulation.
- Primary backend scenario: `charlottenburg-moabit-tiergarten`.
- Window: `18:00-19:00`; public playback is a constant ~40x (~90 second run).
- Rendered layers: corridor boundary, depot marker, SUMO lanes,
  traffic-light bars, background vehicles, golden cybercabs, and request
  pickup/dropoff points.
- Demand source: packaged MATSim Berlin 1% person-demand extract, mapped to
  reachable SUMO pickup/dropoff stops at runtime.
- Fleet: 5 golden cybercabs staged from the fixed depot.
- Public playback: packaged SUMO-derived replay cache for fast user runs;
  `cache=live` remains available for engineering recomputation.
- SUMO/TraCI remains the source of truth for vehicle positions, routing, and
  traffic-light state. The frontend only renders backend frames.

Removed/archived in git history:

- Static Section 1 demand replay.
- The previous full official Reinickendorf district runtime network.
- Full Berlin runtime mode.
- Browser-side robotaxi/cybercab v0 logic.

## Run

```powershell
npm install
npm run backend:dev
npm run dev
```

The frontend needs a MapTiler style and backend URL in `.env.local`:

```text
VITE_MAPTILER_STYLE_URL=...
VITE_SCENARIO_API_URL=http://127.0.0.1:7860
```

For production/GitHub Pages, `VITE_SCENARIO_API_URL` points to the Hugging Face
Space backend.

## Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```

## Backend Endpoints

```text
GET /health
GET /sumo/version
GET /sumo/charlottenburg-moabit-tiergarten/summary
GET /sumo/charlottenburg-moabit-tiergarten/network
GET /sumo/charlottenburg-moabit-tiergarten/validate
WS  /ws/sumo/charlottenburg-moabit-tiergarten
WS  /ws/sumo/charlottenburg-moabit-tiergarten/playback?speed=1000&demand=matsim&engine=taxi&detail=public&cache=auto
```

## Data

The active packaged SUMO files live in:

```text
hf-space/app/sumo/charlottenburg-moabit-tiergarten/
```

The public replay cache can be regenerated from a running local backend with:

```powershell
python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7860
```

Read `docs/DATA.md`, `docs/ROBOTAXI_DRT_ARCHITECTURE.md`, and
`docs/OPERATIONS.md` before changing data generation, backend packaging, or
deployment.

Read `docs/ROBOTAXI_HANDOFF.md` before changing dispatch logic, request
sampling, the depot, or SUMO playback. Legacy `demand=sumo&replacement=...`
still exists as a comparison/debug path, but it is not the primary app model.
