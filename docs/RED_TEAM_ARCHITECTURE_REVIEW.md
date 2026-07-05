# Red-Team Architecture Review

Scope: review the `robotaxis-in-berlin` implementation plan against the current
main checkout, with special attention to product-contract drift, data semantics,
runtime correctness, and integration risk.

Sources reviewed:

- `C:\Users\KitCat\Desktop\robotaxi-control-room\docs\ROBOTAXIS_IN_BERLIN_IMPLEMENTATION_PLAN.md`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\docs\PRODUCT_DECISION_LOG.md`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\docs\ROBOTAXI_DRT_ARCHITECTURE.md`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\docs\DATA.md`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\docs\ROBOTAXI_HANDOFF.md`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\hf-space\app\main.py`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\src\App.tsx`
- `C:\Users\KitCat\Desktop\robotaxi-control-room\src\components\CybercabIntro.tsx`
- this isolated foundation worktree docs and extraction diff

## Blockers

1. **MATSim demand semantics are currently wrong for the locked product.**
   The plan locks Cybercab demand to MATSim `car + ride`, one person-trip per
   request, no fake scaling. Main currently points the backend at
   `reinickendorf_person_trips_1pct_180000_210000_all_modes.json`. That file has
   298 trips, but only 88 are `car + ride` candidates:
   `car=78`, `ride=10`, `pt=21`, `walk=141`, `bike=45`, `truck=3`. The backend
   loader iterates all trips and does not enforce `primaryMode in {"car",
   "ride"}`. This can silently turn walk/PT/bike/truck demand into Cybercab
   requests.

2. **Scenario geometry is still Reinickendorf, not the locked corridor.**
   The plan and decision log lock the target to a contiguous
   Charlottenburg + Moabit + Tiergarten service corridor/union polygon with
   official Berlin boundaries as provenance and a cleaned runtime corridor.
   Main runtime constants, packaged SUMO files, data docs, demand file names,
   and active scope still point to `reinickendorf-district`. There is no
   reviewed `charlottenburg-moabit-tiergarten` SUMO package, official-boundary
   provenance artifact, cleaned corridor artifact, or matching demand extract
   in the reviewed tree.

3. **The staged-start contract is not represented by the current runtime.**
   Product contract: tutorial may show cabs leaving depot, but actual service
   starts with five cabs already staged inside the service area. The current
   taxi route generation departs each Cybercab from the depot route at the
   service start. That makes the first operational minutes depot-egress
   behavior, not an already-staged service.

4. **Request expiry is inconsistent and probably not implemented as locked.**
   Product locks 10-minute expiry. The architecture doc still references the
   MATSim DRT `300s` max wait default. Main exposes `MATSIM_REFERENCE_MAX_WAIT_SEC
   = 300`, but the runtime expiration path checks `latestAssignableSec`, which
   is derived from ability to finish before service end, not `requestedAtSec +
   600`. Waiting requests can therefore remain conceptually open until service
   closure logic, while UI labels may imply normal wait metrics.

5. **Charging/battery behavior conflicts with v1.**
   Product locks "no charging/battery in v1." Main still has battery capacity,
   reserve thresholds, wireless charger IDs, charger counts, charging sessions,
   charging availability, charging UI rows, and final charging metrics. Even if
   useful for the richer prototype, these fields will mislead the initial app
   unless disabled or hidden behind a non-default debug mode.

6. **Frontend default still exposes control-room affordances.**
   The plan says the default app should not show diagnostics, speed controls,
   pause/reset, or engineering panels. Main has a user-facing speed slider,
   pause/reset buttons, a demand-source card, a fleet panel, and an engineering
   toggle. Some may be transitional, but Gate 4 should fail until the default
   surface is reduced to the intended intro/start/passive status flow.

## Medium Risks

1. **Current code no longer has `ROBOTAXI_FLEET_SIZE = 20`, but docs still drift.**
   Main backend now has `ROBOTAXI_FLEET_SIZE = 5`, which matches the latest
   product contract. However `ROBOTAXI_HANDOFF.md` still says twenty Cybercabs
   and twenty charging pads, and architecture docs still describe 20-cab
   charging assumptions. Future workers can easily revive the wrong fleet model
   from stale docs.

2. **`Mitte` remains in overlay styling.**
   Main frontend still special-cases a `mitte` cutout color in the BeST overlay
   layer. If this layer survives into the new corridor, it reinforces the old
   Charlottenburg/Mitte/Moabit direction instead of the locked
   Charlottenburg/Moabit/Tiergarten corridor.

3. **Sample expansion fields are dangerous near product metrics.**
   Main emits `sourceExpansionFactor` / `sampleExpansionFactor = 100`. The plan
   says use the current 1% extract as-is and do not fake-scale demand. Keeping
   expansion metadata is fine for provenance, but no default metric or UI should
   multiply demand or imply real-world totals without a separate modeled
   assumption.

4. **Bad mapping rejection policy needs denominator clarity.**
   The plan says bad SUMO edge mappings are rejected from runtime demand and
   retained only in QA/reject metadata, not shown as user-facing unserved demand.
   The older architecture doc says rejected requests must stay visible in
   metrics and not be silently removed from denominators. These are compatible
   only if there are separate denominators: source/candidate/accepted runtime
   requests for QA, and user-facing total demand based on accepted runtime
   demand.

5. **SUMO taxi-device dispatch may be acceptable, but needs proof.**
   Current main uses SUMO taxi reservations plus backend scoring and staging.
   That is better than a pure first-available queue, but acceptance should prove
   the assignment is ETA/route-feasible and not just whichever reservation SUMO
   returns first.

6. **21:00 policy may reject too early.**
   The product says stop new assignments at 21:00, finish active rides, then
   return to depot. Main has a 15-minute winddown constant and checks whether a
   request can complete plus return before end. That may be practical, but it is
   not the same as "assign until 21:00 if feasible to finish in a few minutes."

7. **Foundation extraction diff must not be applied blindly over main.**
   The isolated worktree extracted useful helper boundaries, but main has a
   much richer controller and frontend. Integration should re-derive helpers
   around the current code, not copy this worktree's simplified `App.tsx` or
   backend manifest over main.

## Acceptance Tests

### Scenario/Data

- Build a `charlottenburg-moabit-tiergarten` scenario package with official
  Ortsteile provenance and a documented cleaned corridor/union polygon.
- Assert accepted request origins and destinations are inside the cleaned
  corridor; retained extra boundary roads are documented and visually reviewed.
- Generate a demand file whose metadata has `includeModes=["car","ride"]`, and
  assert backend target demand equals `car + ride` candidates after mapping.
- Reject unmapped/unreachable requests with reason counts, but keep them out of
  default user-facing "total demand."
- Add a validator that fails if any accepted request has source mode outside
  `car` or `ride`.
- Add a validator that fails if any accepted request lacks reachable SUMO
  pickup/dropoff edges or pickup-to-dropoff route feasibility.
- Add a validator that fails if default metrics use the 1% sample expansion
  factor as a multiplier.

### Runtime

- First dispatch frame at 18:00 contains exactly five Cybercabs, all in the
  service corridor, not on depot connector edges.
- All Cybercab positions in frames are TraCI/SUMO vehicle state; no frontend
  route interpolation is used for authoritative movement.
- A request with no assignment by `requestedAtSec + 600` becomes `expired` with
  an explicit reason and does not remain open until service-end closure.
- No new request is assigned after 21:00. Active rides at 21:00 are allowed to
  finish, then all cabs route back to the fixed depot.
- In v1 mode, no cab enters `charging`, no battery/charging metric drives
  dispatch, and no charging UI appears in the default app.
- Dispatch smoke proves that each assigned request had feasible current ->
  pickup -> dropoff routing at assignment time.
- Final audit proves `ridesServed`, total accepted demand, expired/rejected
  counts, and `cabsReturned=5` from backend state.

### Frontend

- Default first screen is the tutorial over a dimmed map, with only the intended
  primary `Start simulation` action for the final flow.
- Default run screen has no visible speed slider, pause/reset controls,
  diagnostics, demand-source switches, or engineering text.
- The status pane shows live now, exactly five cab rows, and accumulated totals.
- The user-facing metric label is `Rides served`, and all values come from
  backend payloads. Missing metrics render as empty/unknown, not fake zeroes.
- Open request marker is a hollow black pulse; accepted/assigned marker is
  filled black; completed markers fade and do not imply unserved demand.
- Browser smoke captures intro, start, cab rows, request markers, and final
  results for desktop and mobile.

### Integration

- Reconcile docs before implementation merge: product plan, decision log,
  handoff, architecture, and data docs must all use the same v1 contract:
  five cabs, fixed depot, Charlottenburg/Moabit/Tiergarten corridor, no
  charging, 10-minute expiry, no fake scaling.
- Keep legacy Reinickendorf prototype either working under an explicit legacy
  scope or remove it from the default app path. Do not mix Reinickendorf data
  with new corridor UI copy.
- Re-derive helper boundaries from main's richer code instead of applying the
  simplified foundation worktree diff as-is.
