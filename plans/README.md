# Implementation Plans

**2026-07-10: superseded wholesale.** The maintainer deliberately reset the
product and the app was rebuilt from the source data as a static evidence
brief ("If Cybercabs came to Moabit"). Plans 001–009 below targeted the
retired v11 live-backend architecture (FastAPI/WebSocket Space, live SUMO
per visit, 5-cab corridor show) and no longer apply:

- 005/006 (bound live playback, harden HTTP surface): moot — there is no
  runtime backend anymore; the app is static JSON on GitHub Pages.
- 007 (pytest/ruff CI): still a good idea in spirit; would now target
  `scripts/report/*` instead of `hf-space/app/main.py`.
- 008 (docs truth pass): superseded by the rebuild's README/spec.
- 009 (frontend hot-path hygiene): moot — `src/` was rewritten (~2k lines,
  no god files).
- 001–004: already superseded before the reset.

Current documentation lives in:
- `docs/superpowers/specs/2026-07-10-evidence-brief-design.md` (the spec,
  incl. the red-team findings that motivated the reset)
- `docs/superpowers/plans/2026-07-10-evidence-brief-build.md` (the build plan)
- `README.md`

The old plan files are kept for history.
