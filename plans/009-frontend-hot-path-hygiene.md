# Plan 009: Frontend hot-path hygiene — gate dev diagnostics, single-hydrate frames, drop dead state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1d0df3d..HEAD -- src/App.tsx`
> If `src/App.tsx` changed since this plan was written, compare every
> "Current state" excerpt against the live code; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (touches the frame-render path of the shipped experience)
- **Depends on**: none
- **Category**: perf / bug / tech-debt
- **Planned at**: commit `1d0df3d`, 2026-07-09

## Why this matters

Four verified issues in `src/App.tsx` (4,992 lines — the whole frontend):

1. A `requestAnimationFrame` FPS sampler and a 1 s interval both call
   `setDiagnostics(...)` unconditionally — so the **production** build
   re-renders the entire App every second (even on the idle cover) and the
   rAF loop never lets the tab idle, for diagnostics that only render in a
   dev-only panel.
2. Every applied frame is hydrated **twice**; the second pass overwrites the
   stored canonical cab route with the trimmed remainder and resets the
   progress cursor each frame — defeating the monotonic route-trim design
   and treating applied vs. catch-up-skipped frames inconsistently.
3. The `riderByCab` prop is rebuilt inline in JSX on every render, handing
   the child a new object identity each time.
4. A cluster of write-only refs (ops timeline, battery history, a playback
   "speed" ref the socket never reads) burns per-frame work and memory for
   data nothing consumes, and a dev slider silently does nothing.

## Current state

All in `src/App.tsx`. Verified excerpts:

- `src/App.tsx:70-71` — the dev gate (module const, always false in prod):

  ```ts
  const showEngineeringDiagnostics =
    import.meta.env.DEV && import.meta.env.VITE_SHOW_ENGINEERING_DIAGNOSTICS === "true"
  ```

- `src/App.tsx:1890-1912` — ungated rAF FPS sampler: `sampleRenderFps`
  re-schedules itself every frame and calls
  `setDiagnostics((current) => ({ ...current, renderFps: nextRenderFps }))`
  once per second. `src/App.tsx:1914-1924` — ungated 1 s `setInterval`
  calling `setDiagnostics(... dataFps ...)`. A third `setDiagnostics` runs
  per `transportProfile` message at `src/App.tsx:2502-2504`.
- `src/App.tsx:2279-2297` — `applyPlaybackFrame` calls
  `absorbPlaybackFrame(frame)` then `syncPlaybackFrameSources(frame)`.
  `absorbPlaybackFrame` (2201-2277) is idempotent via an `__absorbed` mark
  and calls `hydratePlaybackFrame(frame)` at 2208.
  `syncPlaybackFrameSources` (2171-2196) calls `hydratePlaybackFrame(frame)`
  AGAIN at 2173 — the double hydrate.
- `src/App.tsx:2106-2135` — inside `hydratePlaybackFrame`, per vehicle:

  ```ts
  if (vehicle.routeCoordinates && vehicle.routeCoordinates.length > 1) {
    cabRoutes.set(vehicle.id, vehicle.routeCoordinates)
    routeProgress.set(vehicle.id, 0)
  } else if (isActive) {
    // ...advance cursor along stored route, then:
    vehicle.routeCoordinates =
      remaining.length > 1 ? [[vehicle.lon, vehicle.lat], ...remaining.slice(1)] : null
  }
  ```

  First hydrate (no fresh route from backend): mutates
  `vehicle.routeCoordinates` to the remainder. Second hydrate then takes the
  FIRST branch — stores that remainder as the canonical route and resets
  progress to 0. That is the bug.
- `syncPlaybackFrameSources` has exactly two callers:
  `applyPlaybackFrame` (2282, frame always absorbed first) and
  `finalizePlaybackRun` (2318) with `finalFrame = { ...currentFrame, simSec, dispatch: payload.finalDispatch }`
  — a spread whose `vehicles` array is the already-hydrated
  `latestSumoFrameRef.current.vehicles`. So in BOTH call sites the frame's
  vehicles are already hydrated; removing the hydrate call from sync is
  safe for both.
- `src/App.tsx:4301-4316` — `riderByCab={Object.fromEntries((latestRobotaxiRequestsRef.current ?? []).filter(...).map(...))}`
  computed inline in JSX. Pattern to match: `waitsSnapshot` at
  `src/App.tsx:2837` is a `useMemo` keyed on `opsSampleTick`.
- Write-only state (grep-verified at planning time; re-verify each):
  - `opsTimelineRef` (decl 1806) — written at 2161 (reset), 2251-2257
    (push); never read.
  - `cabBatteryHistoryRef` (decl 1803) — written 2160, 2217-2221; never read.
  - `requestedCumRef` (decl 1807) — written 2162, 2229; read ONLY at 2253
    inside the dead `opsTimelineRef.push` block.
  - `expiredCumRef` (decl 1809) — written 2164, 2232; read ONLY at 2255
    (same dead block). CAUTION: the report's "Gave up waiting" row must NOT
    depend on it — verify the report reads expired counts from another
    source (grep `expired` in the report/shiftReport code) before deleting.
  - `requestedIdsRef` (decl 1808) — only gates the `requestedCumRef`
    increment (2227-2229).
  - `playbackModeRef` (decl 1829) — written at 1883; never read (the socket
    URL hardcodes `speed=50`, `src/App.tsx:2355` — that is frame density
    and is correct; pacing is client-side via `simSpeed`).
  - `playbackFetchInFlightRef` (decl 1823) — assigned at 2363, 2515, 2536,
    2626, 2978; never read.
- `completedWaitsRef` and `cabRideCountsRef` ARE consumed (report/fleet
  rows) — do not touch them.
- Conventions: function components + hooks in one file; comments explain
  the constraint (see 2198-2200, 2144-2153); `npm run check` must stay green.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Gate | `npm run check` | exit 0 (oxlint + tsc + vite build) |
| Dev run | `npm run dev` (backend on 7861 + `.env.local` pointing at it) | app plays a live evening |
| Grep aid | `grep -n "<symbol>" src/App.tsx` | per-step expectations below |

## Scope

**In scope**: `src/App.tsx` only.

**Out of scope**:
- `src/components/CybercabExperience.tsx` (its `sortedWaits` memo-key smell
  is recorded as a non-planned finding — leave it).
- The per-rAF FeatureCollection rebuild in `renderInterpolatedVehicles`
  (~3154) and `interpolatedVehicleCollection` (~874) — optimization needs
  profiling first; explicitly NOT this plan.
- The frame-pacing engine, director camera, WebSocket lifecycle.
- Backend files.

## Git workflow

- Branch: `advisor/009-frontend-hot-path-hygiene`
- One commit per step below; style `fix:`/`perf:`/`chore:` lowercase.
- Do NOT push or deploy.

## Steps

### Step 1: Gate the diagnostics loops (perf)

In the effect at 1890-1912 and the effect at 1914-1924, add as first line:

```ts
if (!showEngineeringDiagnostics) return
```

(A conditional early return before any subscription is fine — the hook
itself still runs unconditionally, so rules-of-hooks are satisfied; the
module-const gate never changes within a session.) Also wrap the
`setDiagnostics` call at 2502-2504 (`transportProfile` handler) in the same
guard — keep the `return` that follows it unconditional so message handling
is unchanged.

**Verify**: `npm run check` → exit 0. In a prod-mode run
(`npx vite build; npx vite preview`), React DevTools or a
`console.count` temporarily added locally would show no 1 Hz re-renders on
the cover — if you cannot run a browser, the grep gate below suffices:
`grep -n "showEngineeringDiagnostics" src/App.tsx` → ≥3 new guard sites.

### Step 2: Hydrate exactly once per frame (bug)

Delete the `hydratePlaybackFrame(frame)` call at `src/App.tsx:2173` (first
line of `syncPlaybackFrameSources`) and remove `hydratePlaybackFrame` from
that hook's dependency array (2195). Add a one-line comment in its place:

```ts
// Frames arrive here already hydrated (absorbPlaybackFrame, or the final
// frame reusing already-hydrated vehicles) — hydrating twice re-stored the
// trimmed remainder as the canonical cab route every frame.
```

**Verify**: `npm run check` → exit 0. Then a live watch (see Test plan):
during a ride-along, the colored path line ahead of the followed cab must
stay attached to the cab and shrink smoothly as it drives — no flicker, no
path suddenly starting behind/ahead of the cab, and the line still clears
on drop-off.

### Step 3: Memoize `riderByCab` (perf)

Hoist the inline `Object.fromEntries(...)` (4301-4316) into a `useMemo`
above the JSX, keyed on `[sumoFrame]` (the applied-frame state — it changes
identity exactly once per applied frame, after
`latestRobotaxiRequestsRef.current` is updated in the same apply path).
Pass the memoized value as the prop. Keep the exact mapping logic.

**Verify**: `npm run check` → exit 0;
`grep -n "riderByCab={Object.fromEntries" src/App.tsx` → no matches.

### Step 4: Delete the write-only state (tech-debt)

For EACH symbol below, first re-run
`grep -n "<symbol>" src/App.tsx` and confirm the only occurrences are the
ones listed in "Current state" (decl, resets, writes, reads-inside-deleted-
blocks). If ANY other read appears, leave that symbol in place and note it.

1. Remove the `opsTimelineRef.push` block (2244-2258) and the
   `sampleBattery` history block (2209, 2217-2221) — then delete
   `opsTimelineRef`, `cabBatteryHistoryRef`, `requestedCumRef`,
   `requestedIdsRef`, `expiredCumRef` declarations and their reset lines in
   `resetPlaybackHydrationState` (2158-2164 region), and the now-unused
   `OpsSample` type if one exists (grep it). PRECONDITION for
   `expiredCumRef`: confirm the shift report's "Gave up waiting" value
   comes from somewhere else (grep `expired` across src/ — expect a
   `finalDispatch`/report source); if it reads `expiredCumRef`, STOP.
   Keep the request-event loop's OTHER branches (completed→waits,
   completed→cabRideCounts) — they feed the report.
2. Delete `playbackFetchInFlightRef` (decl 1823 + the five assignments at
   2363, 2515, 2536, 2626, 2978).
3. Delete `playbackModeRef` (decl 1829 + write effect 1883-1884). Then grep
   `playbackMode` (state) and `playbackModes` (const, line 72): if the state
   is now only set by the dev-panel slider and read nowhere, remove the
   slider control and the consts too (dev-only UI that does nothing);
   if `playbackMode` has any real read left, keep the state and slider and
   note it. `defaultPlaybackMode`/`PlaybackMode` type go with the consts.

**Verify** after each sub-step: `npm run check` → exit 0 (the
`noUnusedLocals` compiler flag will catch leftovers). Final greps:
`grep -cn "opsTimelineRef\|cabBatteryHistoryRef\|playbackFetchInFlightRef\|playbackModeRef" src/App.tsx` → 0.

## Test plan

No test harness exists for the frontend (see plan 007's maintenance notes).
Behavioral gate = one full live evening watched locally:

1. Backend: `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861`
2. `npm run dev` (`.env.local` → `VITE_SCENARIO_API_URL=http://127.0.0.1:7861`)
3. Watch cover → convoy → director ride-along → report → "Run a new evening".
   Checklist: path lines track cabs (Step 2), report shows served/median/
   rides-per-cab numbers (Step 4 must not have broken report inputs),
   rerun works (reset path touches the deleted refs' reset lines).

If you cannot drive a browser, say so in the report and mark the plan
DONE-pending-manual-QA in the index — do not silently skip the watch.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `grep -n "hydratePlaybackFrame" src/App.tsx` shows the definition, the
      call in `absorbPlaybackFrame`, and NO call in `syncPlaybackFrameSources`
- [ ] `grep -c "setDiagnostics" src/App.tsx` — every remaining call site is
      behind `showEngineeringDiagnostics`
- [ ] Zero matches: `opsTimelineRef`, `cabBatteryHistoryRef`,
      `playbackFetchInFlightRef`, `playbackModeRef`
- [ ] Live-watch checklist done (or explicitly reported as pending)
- [ ] `git status`: only `src/App.tsx` (+ `plans/README.md`) modified

## STOP conditions

- Any "Current state" excerpt doesn't match (drift).
- A grep in Step 4 finds a READ of a supposedly write-only ref outside the
  blocks being deleted — leave that symbol, report it.
- The report's "Gave up waiting" or request totals change in the live watch
  after Step 4 — a deleted ref fed the report through a path the plan
  missed; revert Step 4 and report.
- After Step 2 the ride path visibly detaches from the cab or freezes —
  revert Step 2 and report (the finalFrame path assumption failed).

## Maintenance notes

- Step 2 makes `hydratePlaybackFrame` single-entry; if a new caller of
  `syncPlaybackFrameSources` is ever added with a raw (never-absorbed)
  frame, it must call `absorbPlaybackFrame` first — the comment added in
  Step 2 is the guard.
- If an ops-timeline chart is ever wanted (the deleted accumulator was
  probably built for one), rebuild it consumer-first.
- Deferred out of this plan: per-rAF FeatureCollection reuse (profile at
  90x first — see plans/README.md), TypeScript `strict`, the
  `sortedWaits` memo key in `CybercabExperience.tsx`.
