# robotaxis-in-berlin

A Cybercab robotaxi fleet simulation for the whole of Berlin: real synthetic
demand (MATSim Open Berlin), microscopic street traffic (SUMO on the BeST
network), and a custom dispatch layer, watched from a live ops control room.

## Current Scope (v9 — Berlin city)

- One frontend page, split layout: left control-room pane (fleet grid,
  chase-cam cab view, demand/wait/fleet-state charts, event ticker, in-pane
  shift report), right full-Berlin map with a sim-speed strip (20/60/180x).
- Primary backend scenario: `berlin` — the full BeST Berlin network
  (71k edges, TU Berlin DCAITI, CC-BY 4.0) with a deterministic 1pct sample
  of its evening background traffic.
- Demand: city-wide MATSim Open Berlin v6.4 1pct person trips (TU Berlin VSP,
  CC-BY), 18:00–19:00, mode-weighted adoption seeds (~66–78 requests/evening).
  Every rider is a real synthetic Berliner with their real departure time.
- Fleet: 10 / 30 / 50 Cybercabs (user-selectable; same evening, same riders —
  a fleet-sizing experiment). EPA-real battery model (47.6 kWh, 165 Wh/mi).
- Story arc: 17:40 the fleet leaves the former Tegel airport depot in convoy,
  serves the evening rush, and every accepted rider is driven home before the
  shift closes (~19:30).
- Transport: **libsumo** (in-process SUMO, ~62x realtime city-wide);
  `ROBOTAXI_SUMO_TRANSPORT=traci` reverts to the socket transport.
- Public playback streams pre-recorded replays (Git LFS,
  `berlin_taxi_matsim_public.fleet{N}.seed{S}.jsonl.gz`, ~11–17 MB each);
  `cache=live` recomputes through SUMO for engineering runs.
- SUMO/libsumo remains the source of truth for vehicle positions, routing,
  and physics. The frontend only paces and renders backend frames.

Legacy scenarios kept for reference: `charlottenburg-moabit-tiergarten`
(the v1 corridor product), `reinickendorf-district` (prototype).

## Run

```powershell
npm install
python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861
npm run dev
```

The frontend needs a MapTiler style and backend URL in `.env.local`:

```text
VITE_MAPTILER_STYLE_URL=...
VITE_SCENARIO_API_URL=http://127.0.0.1:7861
```

For production/GitHub Pages, `VITE_SCENARIO_API_URL` points to the Hugging Face
Space backend.

## Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7861
```

## Backend Endpoints

```text
GET /health
GET /sumo/version
GET /sumo/berlin/summary
WS  /ws/sumo/berlin/playback?speed=50&demand=matsim&engine=taxi&detail=public&cache=auto&fleet=30
```

## Data

Packaged scenario files live in `hf-space/app/sumo/berlin/` (the 162 MB BeST
net and the thinned route file are git-ignored; rebuild with
`scripts/build_berlin_net_artifacts.py` and `scripts/build_berlin_routes.py`
from a local BeST download — github.com/mosaic-addons/best-scenario).

Regenerate replays from a running local backend:

```powershell
python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7861 --scope berlin --fleet 30 --seed 1
```

Read `docs/DATA.md` and `docs/OPERATIONS.md` before changing data generation,
backend packaging, or deployment. `docs/PRODUCT_DECISION_LOG.md` is the
highest-trust record of product intent.
