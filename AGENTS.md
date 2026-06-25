# Agent Guide

Use this file as the quick-start map for future agents working in this repo.

## Start Here

- Read `README.md` for the product overview and run commands.
- Read `docs/ROBOTAXI_HANDOFF.md` before changing robotaxi dispatch, SUMO, or map behavior.
- Read `docs/DATA.md` before moving, regenerating, or interpreting data files.
- Read `docs/OPERATIONS.md` before changing deployment, Vite base paths, Hugging Face Space files, or GitHub Actions.

## Non-Negotiables

- Do not commit, push, or deploy unless the user explicitly asks.
- Inspect the current files first. Prior chat history may be stale because some robotaxi changes were rolled back.
- Robotaxi movement must come from SUMO/TraCI vehicle state, not browser-side route interpolation.
- Keep the existing first demand-replay page working while building the SUMO live/dispatch page.
- Treat `public/data/six-seven-scenario.json` as an app-facing generated bundle.
- Treat `data/source/reinickendorf/*` and `hf-space/app/sumo/reinickendorf/*` as the reproducible source/runtime inputs.
- Be honest about scope: the current packaged SUMO network is the BeST Reinickendorf technical cutout. Tegel/TXL, Charlottenburg, Mitte, and full Berlin require additional network/data generation.

## Expected Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```

The repo has no `npm test` script at the time this guide was written.
