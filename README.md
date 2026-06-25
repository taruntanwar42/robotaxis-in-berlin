# Robotaxi Control Room

Focused web prototype for viewing the official Reinickendorf district SUMO
traffic scenario on a MapLibre map.

## Current Scope

- One frontend page: Reinickendorf district microscopic SUMO replay.
- One backend scenario: `reinickendorf-district`.
- Window: `06:00-07:00`.
- Rendered layers: district boundary, SUMO lanes, traffic-light bars, and live
  background vehicles streamed through TraCI.
- Robotaxi dispatch UI/logic is intentionally removed for now and should be
  rebuilt from first principles later.

Removed/archived in git history:

- Static Section 1 demand replay.
- The small BeST technical Reinickendorf cutout.
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
GET /sumo/reinickendorf-district/summary
GET /sumo/reinickendorf-district/network
GET /sumo/reinickendorf-district/validate
WS  /ws/sumo/reinickendorf-district
```

## Data

The active packaged SUMO files live in:

```text
hf-space/app/sumo/reinickendorf-district/
```

The district cutout can be regenerated with:

```powershell
python scripts\build_reinickendorf_district_sumo.py
```

Read `docs/DATA.md` and `docs/OPERATIONS.md` before changing data generation,
backend packaging, or deployment.
