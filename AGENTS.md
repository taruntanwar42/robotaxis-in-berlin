# Agent Guide

Use this file as the quick-start map for future agents working in this repo.

## Start Here

- Read `README.md` for the product overview and run commands.
- Read `docs/PRODUCT_DECISION_LOG.md` first for product intent — it preserves
  the user's raw wording and is the highest-trust document in the repo.
- Read `docs/ROBOTAXI_RUNTIME_CONTRACT.md` before changing backend frames or
  playback (NOTE: its concrete numbers describe the v1 corridor product; the
  frame/WS shapes still hold).
- Read `docs/DATA.md` before moving, regenerating, or interpreting data files.
- Read `docs/OPERATIONS.md` before changing deployment, Vite base paths,
  Hugging Face Space files, or GitHub Actions.

Trust order when documents disagree: `PRODUCT_DECISION_LOG.md` and the current
code/cache behavior outrank older docs (`ROBOTAXI_HANDOFF.md`,
`ROBOTAXI_DRT_ARCHITECTURE.md`, `AGENTS.md` sections that drift), which may
carry early-prototype assumptions.

## Current Product (v9 — Berlin city control room, 2026-07-07)

- Single user-facing page, split layout: LEFT control-room pane (KPI strip,
  fleet grid with chase-cam cab card, demand/wait/fleet-state charts, event
  ticker, in-pane shift report), RIGHT full-Berlin map with a floating
  sim-speed strip (20/60/180x, default 60x).
- Active scenario: `berlin` — full BeST net (162 MB, git-ignored; rebuild
  inputs via `scripts/build_berlin_routes.py` + copy of the BeST net), 1pct
  background traffic sample, city-wide MATSim 1pct demand
  (~66–78 requests/seed), fleet selectable 10/30/50 (default 30).
- Story arc: 17:40 the fleet leaves the TXL depot in a staggered convoy
  (depot drive-in), 18:00–19:00 service window (assignment open to 19:00),
  accepted riders are driven home in a hidden recovery window to ~19:30.
- Public playback streams pre-recorded replays
  (`hf-space/app/data/replays/berlin_taxi_matsim_public.fleet{N}.seed{S}.jsonl.gz`,
  Git LFS). Regenerate:
  `python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7861 --scope berlin --fleet 60 --seed 15`
- Backend transport is **libsumo** (in-process SUMO; ~62x realtime for the
  city). `ROBOTAXI_SUMO_TRANSPORT=traci` reverts to the socket.
- `charlottenburg-moabit-tiergarten` (corridor) and `reinickendorf-district`
  remain registered as legacy scenarios; do not present them as the product.
- City-scale dispatch tuning lives in `hf-space/app/main.py` constants
  (pickup cap 900 s, staging leg cap 480 s, expiry 900 s via scenario entry)
  — see the 2026-07-07 decision-log entries for the physics behind them.

## Non-Negotiables

- Do not commit, push, or deploy unless the user explicitly asks.
- Log every product decision the user makes (including casual asides) in
  `docs/PRODUCT_DECISION_LOG.md`, preserving their raw wording.
- Inspect the current files first; prior chat history may be stale.
- Robotaxi movement must come from SUMO/TraCI/libsumo vehicle state, not
  browser-side route interpolation. The frontend only paces and renders
  backend frames.
- Minimalism: 1–2 word labels; clarity through separation, not longer labels;
  status and controls never share a row; no disclaimer copy.

## Expected Checks

```powershell
npm run check
python scripts\smoke_backend.py --base-url http://127.0.0.1:7861
```

Local dev: `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861`
(7860 is often squatted by stale servers), then a QA build via
`$env:VITE_SCENARIO_API_URL = "http://127.0.0.1:7861"; npx vite build; npx vite preview`.

