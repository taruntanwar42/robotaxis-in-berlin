# Robotaxi Control Room Operations

This project has two deployable pieces:

- GitHub Pages frontend: `https://ta-nwar.github.io/robotaxi-control-room/`
- Hugging Face Docker Space backend: `https://icybean-robotaxi-sumo-backend.hf.space`

## Local Development

Start the backend:

```powershell
npm run backend:dev
```

Start the frontend:

```powershell
npm run dev
```

The local frontend reads `.env.local`. For local backend testing:

```text
VITE_SCENARIO_API_URL=http://127.0.0.1:7860
```

Expected local checks:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7860/sumo/reinickendorf/summary
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
npm run check
```

## Hugging Face Deploy

Local deploy, if the local HF CLI is authenticated:

```powershell
npm run deploy:hf
```

GitHub deploy:

1. Add a GitHub repo secret named `HF_TOKEN`.
2. Open GitHub Actions.
3. Run `Deploy Hugging Face Space`.

Verify:

```powershell
python scripts\smoke_backend.py --base-url https://icybean-robotaxi-sumo-backend.hf.space
```

If the live frontend shows `HF Space needs redeploy`, the Pages site is running
new frontend code but the HF Space still has an older backend build.

## GitHub Pages Deploy

Pushes to `main` run `.github/workflows/pages.yml`.

The Vite production build uses:

```text
base=/robotaxi-control-room/
VITE_SCENARIO_API_URL=https://icybean-robotaxi-sumo-backend.hf.space
```

Verify:

```powershell
Invoke-WebRequest -UseBasicParsing https://ta-nwar.github.io/robotaxi-control-room/
```

## Data Included

The backend package includes the small Reinickendorf SUMO cutout:

```text
hf-space/app/sumo/reinickendorf/reinickendorf.net.xml
hf-space/app/sumo/reinickendorf/reinickendorf-internal.rou.gz
hf-space/app/sumo/reinickendorf/reinickendorf-internal.sumocfg
```

Generated SUMO output files under `hf-space/app/sumo/**/output/` are ignored.
Only `.gitkeep` is tracked there.
