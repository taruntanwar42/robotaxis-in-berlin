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

## Current Product (v11 — Cybercab · Berlin, corridor live, 2026-07-09)

- Single user-facing page, split layout: LEFT control-room pane (topline
  served/median-wait, five living cab rows with inline ride-along controls,
  "Tonight" event feed, in-pane shift report), RIGHT corridor map with lane
  and signal micro-layers, an auto-director chase camera (default on), an
  Overview chip and a sim-speed strip (10/20/60x, default 20x).
- Active scenario: `charlottenburg-moabit-tiergarten` — corridor net with
  full background traffic + 378 live traffic lights, **fleet 5**, demand
  seed11 (21 corridor requests, 0.5 adoption over the 451-trip pool).
- Default playback is LIVE: every visit runs SUMO on the spot with a random
  seed (`?sumoseed=` pins it; `?cache=cache` streams the recorded fallback
  `charlottenburg-moabit-tiergarten_taxi_matsim_public.seed11.jsonl.gz`).
- Story arc: 17:45 the fleet leaves the TXL depot in a staggered convoy and
  stages at 8 demand-weighted stands (capacity 2) before the first 18:00
  rider; 18:00–19:00 service (no assignment cutoff); accepted riders are
  driven home inside a 900 s recovery window. Measured ship numbers:
  100% served, P50 wait ~5.5–6 min across random seeds.
- Backend transport is **libsumo** (in-process SUMO; corridor runs ~50x
  realtime). `ROBOTAXI_SUMO_TRANSPORT=traci` reverts to the socket.
- `berlin` (full BeST city, fleet 60, replay-first) and
  `reinickendorf-district` remain registered as secondary/legacy scenarios;
  do not present them as the product.
- Dispatch tuning lives in `hf-space/app/main.py` scenario entries and
  constants — see the 2026-07-09 decision-log entries for the measured
  physics (convoy lead time, stand capacity, fleet-vs-demand cliff).

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

