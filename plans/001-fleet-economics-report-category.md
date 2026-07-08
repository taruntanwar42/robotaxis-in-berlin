# Plan 001: Add a fleet-economics category to the shift report

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9fda5d4..HEAD -- src/App.tsx src/components/CybercabExperience.tsx docs/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `9fda5d4`, 2026-07-07

## Why this matters

The app is a portfolio piece for a Tesla Giga Berlin application. The maintainer
explicitly asked for this (decision log, 2026-07-05): *"if a private person
deploys a fleet... theyd be able to pay it off like this... i wanna have it...
should be a simple stats card or like minimal."* The shift report already
computes every physical input (energy kWh, fleet km, passenger km, rides
served); this plan adds the one category that turns "what happened" into
"would this pay off" — the question a technical reviewer actually asks.

## Current state

- `src/App.tsx` — `shiftReport` useMemo (search for `const shiftReport: ShiftReportCategory[] | null`)
  builds an array of 4 categories (`Service`, `Fleet`, `Energy`, `People`),
  each `{ title, rows: [{ label, value }] }`. Available locals inside that memo:
  `ridesServed`, `totalDemand`, `fleetKm` (km), `energyKwh`, `passengerKm`,
  `displayFleetSize`, plus formatting helpers `fmt(value, digits, unit)` and
  `fmtDur(seconds)`. Example of the existing shape:

  ```ts
  {
    title: "Energy",
    rows: [
      { label: "Used", value: fmt(energyKwh, 1, " kWh") },
      ...
    ],
  },
  ```

- `src/components/CybercabExperience.tsx` — renders `report.map((category) => ...)`
  generically in a 2-column grid (`.report-columns`). **A fifth category renders
  with zero component changes.** Section titles render via `<h3>{category.title}</h3>`.
- Design laws (from `docs/PRODUCT_DECISION_LOG.md`, binding):
  - Labels are 1–2 words. Clarity via separation, never longer labels.
  - **No disclaimer copy.** At most ONE elegant assumption line — the report
    already has a footnote pattern: see `report-footnote` in
    `CybercabExperience.tsx` (`¹ incl. repositioning and depot legs · 1%
    population sample, full city`). Extend that line or add a second `²`
    footnote; never add hedging text to rows.
- Constants already trusted in-repo (decision log, 2026-07-06 article entry):
  Cybercab EPA battery 47.6 kWh, 165 Wh/mi, target price "under $30k
  (unconfirmed)". Backend battery constants live in `hf-space/app/main.py`
  (`ROBOTAXI_BATTERY_CAPACITY_WH` etc.) — do not touch them; frontend-only work.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck + lint + build | `npm run check` | exit 0 |
| Visual QA (optional) | `npx vite preview` + open the app, run a shift at 180× | report shows the new category |

## Scope

**In scope** (the only files you should modify):
- `src/App.tsx` (the `shiftReport` memo only)
- `src/components/CybercabExperience.tsx` (only if the footnote line is extended)
- `docs/PRODUCT_DECISION_LOG.md` (append one entry recording the chosen constants and sources)

**Out of scope** (do NOT touch):
- `hf-space/app/**` — no backend change is needed; all inputs exist client-side.
- Replay files, recording scripts.
- Any new UI panel/tab — this is rows in the existing report, per the "simple
  stats card, never a blog" instruction.

## Git workflow

- Branch: work directly on `main` is this repo's convention (single maintainer).
- Commit style: conventional commits, e.g. `feat: fleet economics in shift report`.
  End the message with `Co-Authored-By:` only if your operator instructs it.
- Do NOT push or deploy — deploys are explicitly user-gated in this repo (`AGENTS.md`).

## Steps

### Step 1: Choose and record constants

Pick sourced values and write them as named constants at the top of `src/App.tsx`
next to the existing constants block (near `SHIFT_START_SEC`):

```ts
// Fleet economics reference constants (sources in PRODUCT_DECISION_LOG.md).
const ECON_FARE_EUR_PER_KM = 2.4   // Berlin taxi tariff band, €/occupied km
const ECON_ENERGY_EUR_PER_KWH = 0.3 // commercial depot electricity
const ECON_CYBERCAB_PRICE_EUR = 28_000 // logged target "<$30k", converted
```

Use your judgment on exact values but they must be defensible; record value +
source (URL or "decision-log article entry") in a new decision-log entry titled
`## <date> - Fleet Economics Constants (Plan 001)`.

**Verify**: `npm run check` → exit 0.

### Step 2: Add the category to the report

In the `shiftReport` memo in `src/App.tsx`, after the `People` category, append:

```ts
{
  title: "Economics",
  rows: [
    { label: "Revenue²", value: fmt(passengerKm !== undefined ? passengerKm * ECON_FARE_EUR_PER_KM : undefined, 0, " €") },
    { label: "Energy cost", value: fmt(energyKwh !== undefined ? energyKwh * ECON_ENERGY_EUR_PER_KWH : undefined, 2, " €") },
    { label: "Margin", value: ... revenue minus energy cost, 0, " €" },
    { label: "Per cab", value: ... margin / displayFleetSize, 2, " €" },
  ],
},
```

Rules: reuse `fmt`; guard every input for `undefined` (the helpers already
return "–"); 4–5 rows maximum; a payback row is allowed ONLY if it fits one
terse label (e.g. `Payback³` with the extrapolation stated in the footnote —
"at this hour's pace"), otherwise omit it.

**Verify**: `npm run check` → exit 0.

### Step 3: The one assumption line

Extend the existing footnote in `CybercabExperience.tsx` (class
`report-footnote`) with the superscript(s) used, e.g.
`² €2.40/km fare, €0.30/kWh` — one line, no hedging words ("estimate",
"approximately", "disclaimer" are all banned by the design law).

**Verify**: `npm run check` → exit 0. Optional visual: run a shift, confirm the
2-column grid still balances (5 categories = 3+2 layout is acceptable).

## Test plan

This repo has no JS unit-test harness (`npm test` does not exist — verified at
plan time). Verification = `npm run check` (oxlint + tsc + vite build) plus the
visual QA above. Do not introduce a test framework in this plan.

## Done criteria

- [ ] `npm run check` exits 0
- [ ] `Economics` category present in the `shiftReport` memo with 4–5 rows, all inputs undefined-guarded
- [ ] Exactly one new assumption line in the report footnote, no hedging copy anywhere
- [ ] Decision-log entry with constants + sources appended
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `shiftReport` memo no longer matches the shape excerpted above.
- `passengerKm` or `energyKwh` turn out not to be available in the memo's scope
  (they are at plan time — if gone, the data plumbing changed; report back).
- You feel the need to add more than one footnote sentence — that's a design-law
  conflict; stop and ask.

## Maintenance notes

- If fare/electricity constants are later disputed, they live in exactly one
  place (top of `App.tsx`) + one log entry.
- Reviewer should scrutinize: unit sanity (km vs mi, Wh vs kWh — this repo had
  a Wh/m constant, `102.5 Wh/km` effective; revenue uses *passenger* km, cost
  uses total energy already in kWh).
- Deferred: multi-hour/day extrapolation (violates the honest-hour framing
  unless carefully footnoted).
