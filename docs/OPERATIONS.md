# Robotaxi Control Room Operations

This project has two deployable pieces:

- GitHub Pages frontend: `https://taruntanwar42.github.io/robotaxis-in-berlin/`
- Hugging Face Docker Space backend:
  `https://icybean-robotaxi-sumo-backend.hf.space`

## Local Development

Start the backend:

```powershell
npm run backend:dev
```

Start the frontend:

```powershell
npm run dev
```

For local backend testing, `.env.local` should include:

```text
VITE_SCENARIO_API_URL=http://127.0.0.1:7860
```

Expected local checks:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/sumo/charlottenburg-moabit-tiergarten/summary
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/sumo/charlottenburg-moabit-tiergarten/network
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/sumo/charlottenburg-moabit-tiergarten/validate
python scripts\check_robotaxi_contract.py
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
npm run check
```

## Hugging Face Deploy

The Space Dockerfile is based on the official Eclipse SUMO container. Deploy
with:

```powershell
npm run deploy:hf
```

Or run the `Deploy Hugging Face Space` GitHub Action after adding the `HF_TOKEN`
repository secret.

Verify:

```powershell
python scripts\smoke_backend.py --base-url https://icybean-robotaxi-sumo-backend.hf.space --check-websocket
```

If the live frontend shows `HF Space needs redeploy`, the Pages frontend is
newer than the HF backend.

## GitHub Pages Deploy

Pushes to `main` run `.github/workflows/pages.yml`.

The Vite production build uses:

```text
base=/robotaxis-in-berlin/
VITE_SCENARIO_API_URL=https://icybean-robotaxi-sumo-backend.hf.space
```

Verify:

```powershell
Invoke-WebRequest -UseBasicParsing https://taruntanwar42.github.io/robotaxis-in-berlin/
```

## Data Included

The active backend package includes the corridor SUMO scenario, the v1 MATSim
demand extract, and the packaged public replay:

```text
hf-space/app/sumo/charlottenburg-moabit-tiergarten/          (net, routes, configs, boundary, metadata)
hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_car_ride.json
hf-space/app/data/matsim/..._car_ride.rejects.json
hf-space/app/data/matsim/..._car_ride.metadata.json
hf-space/app/data/replays/charlottenburg-moabit-tiergarten_taxi_matsim_public.jsonl.gz
```

The legacy `hf-space/app/sumo/reinickendorf-district/` package and its MATSim
extracts also ship, but only serve the legacy `reinickendorf-district` scope.

After changing backend dispatch behavior, regenerate the public replay before
deploying, or the Space will keep streaming the old cached run:

```powershell
python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7860
```

Generated SUMO output files under `hf-space/app/sumo/**/output/` are ignored.
Only `.gitkeep` is tracked there.
