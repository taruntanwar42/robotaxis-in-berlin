# Agent Guide

Use this file as the quick-start map for future agents working in this repo.

## Start Here

- Read `README.md` for the product overview and run commands.
- Read `docs/PRODUCT_DECISION_LOG.md` first for product intent — it preserves
  the user's raw wording and is the highest-trust document in the repo.
- Read `docs/ROBOTAXI_RUNTIME_CONTRACT.md` before changing backend frames,
  playback, or the frontend status pane.
- Read `docs/SCENARIO_CHARLOTTENBURG_MOABIT_TIERGARTEN.md` before touching
  scenario data or the SUMO package.
- Read `docs/DATA.md` before moving, regenerating, or interpreting data files.
- Read `docs/OPERATIONS.md` before changing deployment, Vite base paths,
  Hugging Face Space files, or GitHub Actions.

Trust order when documents disagree: `PRODUCT_DECISION_LOG.md` and
`ROBOTAXI_RUNTIME_CONTRACT.md` and the current code/cache behavior outrank
older docs (`ROBOTAXI_HANDOFF.md`, `ROBOTAXI_DRT_ARCHITECTURE.md`), which may
still carry early-prototype assumptions.

## Current Product (v1 watchable run)

- Single user-facing page: Berlin Cybercab simulation.
- Active scenario: `charlottenburg-moabit-tiergarten`
  (Charlottenburg + Moabit + Tiergarten corridor).
- Window `18:00-19:00`, assignment cutoff `18:50`, 10-minute request expiry.
- 5 cybercabs, fixed depot (edge `8036812#2`), staged in-corridor at start,
  depot return during a hidden post-close recovery window.
- Demand: MATSim Berlin 1% person trips, `car + ride` modes only, both trip
  ends inside the corridor. One person-trip = one request. No fake scaling.
- No charging/battery in v1 (internal battery state exists but is masked from
  the public contract).
- Public playback: packaged dense replay (1 frame per sim-second) streamed via
  `cache=auto`; the frontend paces frames at ~40x so a run takes ~110 seconds.
  No user-facing speed controls, pause, or scrubber ("all input is error").
- `reinickendorf-district` remains registered as a legacy scenario only; do
  not present it as the active product.

## Non-Negotiables

- Do not commit, push, or deploy unless the user explicitly asks.
- Log every product decision the user makes (including casual asides) in
  `docs/PRODUCT_DECISION_LOG.md`, preserving their raw wording.
- Inspect the current files first; prior chat history may be stale.
- Robotaxi movement must come from SUMO/TraCI vehicle state, not browser-side
  route interpolation. The frontend only paces and renders backend frames.
- Keep the single Cybercab experience page working; do not resurrect the old
  control-room dashboard into the default UI.
- Do not add depot-selection UI, speed sliders, or caveat-heavy copy to the
  product surface.

## Expected Checks

```powershell
npm run check
python scripts\check_robotaxi_contract.py
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860
python scripts\smoke_backend.py --base-url http://127.0.0.1:7860 --check-websocket
```

Regenerate the public replay after backend dispatch changes:

```powershell
python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7860
```

The repo has no `npm test` script at the time this guide was written.
