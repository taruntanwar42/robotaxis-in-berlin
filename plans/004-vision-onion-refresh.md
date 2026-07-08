# Plan 004: Bring PRODUCT_VISION_ONION.md back in sync with the shipped product

> **Executor instructions**: Docs-only plan. Follow steps in order; honor STOP
> conditions; update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 9fda5d4..HEAD -- docs/PRODUCT_VISION_ONION.md docs/PRODUCT_DECISION_LOG.md AGENTS.md README.md`
> On drift, re-read the live docs before editing; contradictions = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs (direction hygiene)
- **Planned at**: commit `9fda5d4`, 2026-07-07

## Why this matters

`docs/PRODUCT_VISION_ONION.md` is the roadmap document, but the product lapped
it: it still describes the corridor cover-card app as the shipped state
(Layer 1), while the shipped product is the v9 whole-Berlin control room; its
Layer-3 "rollout prologue" (depot drive-in) shipped on 2026-07-07; its
"district-true network cut" was obsoleted by the whole-city pivot. A roadmap
that contradicts the product actively misleads the next agent or contributor.
Per this repo's trust order (`AGENTS.md`): the decision log and current code
outrank stale docs — this plan makes the onion trustworthy again instead.

## Current state

- `docs/PRODUCT_VISION_ONION.md` — 97 lines. Structure: Purpose → design
  principles → Layer 1 "The Watchable Shift (shipped)" → Layer 2 "Depth &
  Context (next)" → Layer 3 "The Fleet Business (later)" → Deferred/parking lot.
  Specific drift:
  - `:27–51` Layer 1 describes: corridor zone (Ortsteile union), 5 cabs, cover
    card, no controls, ~40× fixed pace. **All superseded** by v9: whole-city
    `berlin` scenario, 30-cab default with 10/30/50 selector, split
    control-room layout, 20/60/180× speed strip, depot drive-in opening.
  - `:59–61` Layer 2 "zoom reward" (lanes/signals on zoom) — corridor-era;
    the city scenario ships **without** micro network layers by decision
    (`src/App.tsx`: `hasMicroNetworkLayers = districtScope !== "berlin"`).
  - `:80–83` "Battery truth" — partially shipped (EPA battery model, charging
    sessions, low-battery returns run in the berlin scenario today).
  - `:84–85` "Rollout prologue" — **shipped 2026-07-07** (17:40 depot convoy).
  - `:86–87` "District-true network cut" — obsoleted by the city pivot.
- Ground truth to align with: `README.md` "Current Scope (v9…)" section,
  `AGENTS.md` "Current Product (v9…)" section, and the 2026-07-07 entries at
  the end of `docs/PRODUCT_DECISION_LOG.md` (v8 mandate, benchmark results,
  definitive tuning, v9.1). Read all three before writing.
- Direction findings from the 2026-07-07 advisor audit, available as concrete
  next-layer material: `plans/001-*` (fleet economics), `plans/002-*` (spatial
  outcome layer), `plans/003-*` (live-mode spike); plus parked items already
  in the log: summon mode ("enter addresses and go places"), German pass, 3D
  monitor panel.
- Convention: the onion doc keeps the user's meta-mandate framing (best-guess
  direction, not contract) and cites the decision log for raw wording. Keep
  the header block's spirit intact.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Nothing builds from docs | `git diff --stat` after editing | only `docs/PRODUCT_VISION_ONION.md` changed |

## Scope

**In scope**: `docs/PRODUCT_VISION_ONION.md` only.

**Out of scope**: `PRODUCT_DECISION_LOG.md` (append-only historical record —
never rewrite), `README.md`, `AGENTS.md` (already current), any source file.

## Git workflow

- `main`; commit `docs: vision onion refreshed to v9 reality`; no push.

## Steps

### Step 1: Rewrite the layer structure

Keep: Purpose, design principles (unchanged — they all still hold), the
living-document header. Replace the layers:

- **Layer 1 — The Watchable Shift** *(shipped 2026-07-05, superseded)*: 2–3
  lines acknowledging it as the corridor-era milestone; point to git history.
- **Layer 2 — The City Control Room** *(shipped 2026-07-07)*: whole-Berlin
  BeST net at 1 pct, 10/30/50 fleet matrix of recorded evenings, depot
  drive-in, split control-room UI with live charts, in-pane report with the
  fleet-sizing comparison row, libsumo backend. Cite the decision-log entries
  by date instead of restating detail.
- **Layer 3 — The Analytical Evening** *(next)*: fleet economics category
  (plans/001) and spatial outcome layer (plans/002).
- **Layer 4 — The Living Simulator** *(later)*: live custom runs on the Space
  (plans/003 spike decides feasibility), then summon mode as its dependent.
- **Deferred/parking lot**: German pass, 3D monitor panel, cover imagery,
  standalone time-window selector (rejected as standalone — subsumed by live
  mode; note that).

### Step 2: Consistency sweep

Every claim in the new text must be checkable against README/AGENTS/log; no
number or feature named that isn't in one of them.

**Verify**: `git diff --stat` → exactly one file changed; read the final doc
once end-to-end for internal contradictions.

## Test plan

Docs only — the verification is the consistency sweep above.

## Done criteria

- [ ] Onion describes v9 as shipped state; no corridor-era claims remain as "current"
- [ ] Next layers reference plans/001–003 explicitly
- [ ] Rejected/parked items listed with one-line reasons
- [ ] Only `docs/PRODUCT_VISION_ONION.md` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- README/AGENTS contradict each other about the shipped state — surface the
  contradiction instead of picking a side.
- You feel the need to edit the decision log — it is append-only; stop.

## Maintenance notes

- Whenever a plan from `plans/` lands, the onion's layer status is the second
  place to update (index first).
- Reviewer: check no invented features crept in — the onion records decided
  direction, not brainstorms.
