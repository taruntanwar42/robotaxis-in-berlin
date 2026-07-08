# Plan 002: Spatial outcome layer — served vs. unserved requests on the map at shift end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9fda5d4..HEAD -- src/App.tsx src/components/CybercabExperience.tsx src/App.css`
> On any in-scope drift, compare "Current state" excerpts to live code first;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (results-phase-only additive layer)
- **Depends on**: none (001 independent)
- **Category**: direction
- **Planned at**: commit `9fda5d4`, 2026-07-07

## Why this matters

The v9 control room has temporal analytics (demand curve, wait histogram,
fleet-state timeline) but the map itself never shows aggregate data — the
maintainer's logged direction (2026-07-05): *"'zones' or 'flows'... demand
zones or sth, and maybe showing traffic instead of many cards."* At shift end
the camera already eases back to the whole city and the report opens — the map
behind it is idle. Painting every request there, colored by outcome, shows the
run's spatial story in one glance (this fleet serves the center; outer-district
requests expire). It is the single strongest "a data person built this" signal
available for a day of work.

## Current state

- `src/App.tsx` holds a request registry ref:
  `playbackRequestRegistryRef` (a `Map<string, ...>` of every request seen this
  run, merged from streamed `mapRequests` markers and `requestEvents`). Marker
  objects carry: `id`, `status` (`waiting|assigned|onboard|completed|expired|rejected`),
  `lon`, `lat`, sometimes `dropoffLon`/`dropoffLat`, `requestedAtSec`,
  `closedAtSec`. **Verify the exact fields in Step 1 before building.**
- Map sources/layers are added in the big `map.on("load", ...)` block in
  `src/App.tsx` (search `map.addSource("robotaxi-requests"`). Convention: a
  GeoJSON source + one or more `circle`/`symbol` layers with data-driven
  `filter`s; sources updated via
  `source(map, "<id>")?.setData(featureCollection)`.
- Run end: `finalizePlaybackRun` callback in `src/App.tsx` (search
  `// The report reads over the whole city`) — it already resets the follow
  cam, clears tooltips, and eases the camera to `activeScenarioBounds`. This is
  the natural hook to populate the outcome layer.
- Rerun/reset: `resetPlaybackHydrationState` (search that name) clears refs for
  a fresh run — the outcome layer must be cleared there too.
- Palette conventions (from today's dataviz pass): served = gold `#c99700`,
  failed/expired = the muted red family already used for feed rows
  (`tone-missed`, `#9a4b3b`); text/labels never colored, identity always
  backed by a legend line.
- Design laws: zero required input ("all input is error") — the layer appears
  automatically at results, no toggle. Legend entries are 1–2 words.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck + lint + build | `npm run check` | exit 0 |
| Backend for visual QA | `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861` | `/health` returns ok |
| QA build against local backend | PowerShell: `$env:VITE_SCENARIO_API_URL = "http://127.0.0.1:7861"; npx vite build; npx vite preview` | app serves; note the actual preview port |

## Scope

**In scope**:
- `src/App.tsx` (new source/layer registration, populate on finalize, clear on reset)
- `src/components/CybercabExperience.tsx` (legend: add the two outcome entries, shown only in results phase)
- `src/App.css` (only if a legend swatch class is needed)

**Out of scope**:
- `hf-space/app/**` — all data is already client-side.
- The live-run map visuals (pulses, riders, routes) — untouched; the outcome
  layer exists only in the `results` phase.
- Heatmap/hexbin libraries — no new dependencies; plain circle layer.

## Git workflow

- Work on `main` (single-maintainer repo convention); conventional commit, e.g.
  `feat: spatial outcome layer at shift end`.
- Do NOT push or deploy (user-gated per `AGENTS.md`).

## Steps

### Step 1: Verify the registry fields

Add a temporary `console.log` after run end (or inspect in DevTools) printing
one registry entry. Confirm each entry has numeric `lon`/`lat` and a final
`status`. Remove the log before committing.

**Verify**: entry shape confirmed; note which statuses appear
(`completed` and `expired` must; `rejected` may).

### Step 2: Register source + layer

In the `map.on("load", ...)` block, after the existing request layers:

```ts
map.addSource("shift-outcomes", { type: "geojson", data: emptyFeatureCollection() })
map.addLayer({
  id: "shift-outcomes",
  type: "circle",
  source: "shift-outcomes",
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.2, 13, 6],
    "circle-color": ["match", ["get", "outcome"], "served", "#c99700", "#9a4b3b"],
    "circle-opacity": 0.8,
    "circle-stroke-width": 1,
    "circle-stroke-color": "rgba(255,255,255,0.85)",
  },
})
```

**Verify**: `npm run check` → exit 0.

### Step 3: Populate at finalize, clear at reset

In `finalizePlaybackRun`, build a FeatureCollection from
`playbackRequestRegistryRef.current.values()`: one point per request with
`lon`/`lat`, property `outcome: "served" | "missed"` (`completed` → served;
`expired`/`rejected` → missed; skip anything else). `setData` it into
`shift-outcomes`. In `resetPlaybackHydrationState`, `setData` an empty
collection.

**Verify**: `npm run check` → exit 0; visual QA — run a shift at 180×, at the
report the city shows gold + muted-red dots; hit "Run again" and confirm the
dots vanish during the new run.

### Step 4: Legend

In `CybercabExperience.tsx` the map legend (`.map-legend`) renders during
`running`. Make the legend also render in `results` phase but with exactly two
entries: `Served` (gold swatch) and `Unserved` (red swatch). Simplest shape:
conditional list content on `phase`.

**Verify**: `npm run check` → exit 0; visual — legend swaps at results.

## Test plan

No JS test harness exists in this repo (verified at plan time) — verification
is `npm run check` plus the scripted visual QA above. Do not add a framework.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] At results phase the map shows one dot per finished request, gold/red by outcome, over the whole-city view
- [ ] Dots clear on rerun; live-run visuals unchanged
- [ ] Legend shows exactly `Served` / `Unserved` in results phase
- [ ] No temporary logging left; no files outside scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Registry entries lack usable `lon`/`lat` (data plumbing changed since
  `9fda5d4`) — report; do not invent coordinates.
- Adding the layer visibly degrades live-run frame pacing (it must not — it is
  results-only; if you find yourself updating it per-frame you have drifted
  from the plan).
- The legend change requires restructuring `CybercabExperience` props — stop;
  that is out of proportion.

## Maintenance notes

- Future "demand heatmap" work (hexbin/kernel density) should replace this
  layer's rendering, not add a second source — keep the id `shift-outcomes`.
- Reviewer: check colorblind-safety was preserved (gold vs muted red passed a
  CVD check ≥ 12 ΔE in today's dataviz validation for adjacent hues; the white
  stroke keeps dots legible on both map tones).
- Deferred: clicking a dot to see the rider's story (needs hover plumbing like
  the existing `request-riders` layer; nice v2).
