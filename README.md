# Robotaxi Control Room

Standalone web prototype for replaying the BeST/SUMO Reinickendorf internal-trip
window as a map-first robotaxi control-room surface.

## Current Scenario

- Scenario: `Six-Seven Morning Ramp`
- Window: `06:00-07:00`
- Source demand: 701 `in/in` trips from the BeST Reinickendorf technical cutout
- Map: MapLibre GL with a local `VITE_MAPTILER_STYLE_URL`
- Status: demand replay only; robotaxi dispatch, wait time, and deadheading are
  planned next

The app bundle lives at:

```text
public/data/six-seven-scenario.json
```

It is generated from the EV Mobility Dashboard workspace:

```text
C:\Users\KitCat\Desktop\EV Mobility Dashboard\data\intermediate\robotaxi-sim\reinickendorf
```

## Run

```powershell
npm install
npm run dev
```

For the local SUMO backend:

```powershell
npm run backend:dev
```

The local MapTiler style URL is read from `.env.local`:

```text
VITE_MAPTILER_STYLE_URL=...
```

`.env.local` is ignored by git through `*.local`.

The scenario source is local-first. By default the app reads:

```text
public/data/six-seven-scenario.json
```

To test against a local backend instead, run the backend and add this to
`.env.local`:

```text
VITE_SCENARIO_API_URL=http://127.0.0.1:7860
```

If that backend is unavailable, the frontend falls back to the local bundle and
shows that state in the replay header.

## Regenerate Scenario Data

From this project:

```powershell
python scripts\export_six_seven_scenario.py
```

The exporter filters internal trips to `[21600, 25200)`, keeps the SUMO edge
route geometries needed by those trips, and writes a compact app-facing JSON
bundle. The service area is the BeST technical cutout, not the official Berlin
Bezirk boundary.

## Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
```

## Hugging Face SUMO Backend

The `hf-space/` folder is a Docker Space scaffold for a small SUMO backend. It
uses the official Eclipse SUMO container, exposes a FastAPI API, serves the current
six-seven scenario bundle, includes a simple WebSocket replay endpoint, and
streams the packaged Reinickendorf SUMO cutout over TraCI.

Deploy it with a local Hugging Face token:

```powershell
pip install huggingface_hub
$env:HF_TOKEN = Read-Host "HF token"
python scripts\deploy_hf_space.py --repo-id YOUR_USERNAME/robotaxi-sumo-backend
```

Or add a GitHub repository secret named `HF_TOKEN` and run the
`Deploy Hugging Face Space` workflow manually. That uploads the same `hf-space/`
folder to:

```text
https://huggingface.co/spaces/icybean/robotaxi-sumo-backend
```

See `docs/OPERATIONS.md` for the full local/HF/GitHub Pages runbook.

Run the backend locally from this project:

```powershell
pip install -r hf-space\requirements.txt
python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7860
```

Do not paste Hugging Face tokens into chat, docs, commits, or shell history. The
script reads `HF_TOKEN` from the environment and uploads `hf-space/` as a Docker
Space.

Backend endpoints after deploy:

```text
GET /health
GET /sumo/version
GET /sumo/reinickendorf/summary
GET /scenario/summary
GET /scenario
WS  /ws/replay
WS  /ws/sumo/reinickendorf
```

The GitHub Pages production build points to:

```text
https://icybean-robotaxi-sumo-backend.hf.space
```
