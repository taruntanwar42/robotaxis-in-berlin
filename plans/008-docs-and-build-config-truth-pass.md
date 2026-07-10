# Plan 008: Truth pass — README describes v11, AGENTS.md drift fixed, MapTiler key untracked

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1d0df3d..HEAD -- README.md AGENTS.md .github/workflows/pages.yml .gitignore`
> On any drift, compare the "Current state" excerpts before proceeding;
> mismatch = STOP.

## Status

- **Priority**: P2 (cheap, high onboarding value)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs / security (credential hygiene)
- **Planned at**: commit `1d0df3d`, 2026-07-09

## Why this matters

`README.md` — the first document AGENTS.md sends every human and agent to —
still describes the retired v9 product: full-Berlin scope as primary,
fleet 10/30/50, playback-by-default, 20/60/180x speeds. The shipped product
(v11, per AGENTS.md and the decision log) is the opposite on every axis:
corridor scenario, fleet 5, LIVE by default, 15/30/90x. Actively-wrong docs
misdirect every onboarding. Second, `AGENTS.md` itself already drifted
within v11 (sim speeds). Third, `.env.production` is a **tracked file in a
public repo** containing a MapTiler API key — client-exposed by nature (it
ships in the Pages bundle), but committed-and-unrestricted means anyone can
lift it for their own quota; the fix is rotation + domain restriction +
build-time injection.

## Current state

- `README.md:7` — heading `## Current Scope (v9 — Berlin city)`; lines 7–33
  describe Berlin-as-product, "Fleet: 10 / 30 / 50 Cybercabs", "sim-speed
  strip (20/60/180x)", "Public playback streams pre-recorded replays", and
  list `charlottenburg-moabit-tiergarten` as a legacy scenario. Line 65
  shows the WS endpoint with scope `berlin`.
- The truth (verify each in code, all confirmed at planning time):
  - Default scenario: `PLAYBACK_SCOPE = "charlottenburg-moabit-tiergarten"` — `hf-space/app/main.py:55`
  - Speeds: `const SIM_SPEED_OPTIONS = [15, 30, 90]`, `DEFAULT_SIM_SPEED: SimSpeed = 30` — `src/App.tsx:62-64`
  - Fleet/arc/ship numbers: `AGENTS.md:22-47` (v11 section) and the
    2026-07-09 entries at the tail of `docs/PRODUCT_DECISION_LOG.md`
    (corridor live, fleet 5, seed11 = 21 requests, convoy 17:45,
    100% served / P50 ≈ 5.5–6 min, full arc ≈ 2:20 at default 30x).
- `AGENTS.md:28` — says "sim-speed strip (10/20/60x, default 20x)" — stale;
  the v11.2 decision-log entry and `src/App.tsx:62-64` say 15/30/90 default 30.
- `.env.production` — tracked (`git ls-files` lists it), 2 lines:
  `VITE_MAPTILER_STYLE_URL` containing a MapTiler key (credential — do NOT
  copy its value anywhere), and
  `VITE_SCENARIO_API_URL=https://icybean-robotaxi-sumo-backend.hf.space`.
- `.github/workflows/pages.yml` — the Build step is:

  ```yaml
      - name: Build
        run: npm run build
  ```

  It currently gets the env vars from the committed `.env.production`
  (Vite reads it in production mode).
- `.gitignore` — has `*.local` (so `.env.local` is ignored) but nothing for
  `.env.production`.
- Repo doc conventions: sentence-case headings, hard-wrapped ~80 cols,
  minimal marketing tone; `docs/PRODUCT_DECISION_LOG.md` is append-only and
  highest-trust — do not edit past entries.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Frontend gate | `npm run check` | exit 0 |
| Prod build locally | `npx vite build` | exit 0 (uses local `.env.production`) |
| Tracked-file check | `git ls-files .env.production` | empty after Step 3 |

## Scope

**In scope**:
- `README.md`, `AGENTS.md` (line 28 speed text + any v11 numbers you verify
  against code), `.gitignore`, `.github/workflows/pages.yml`,
  `.env.production` (untrack only — keep the local file on disk)

**Out of scope**:
- `docs/PRODUCT_DECISION_LOG.md` (append-only; you are not adding a decision)
- All other docs/ files (their staleness is declared by the trust-order note
  in AGENTS.md — by design)
- Rotating the MapTiler key (maintainer-only dashboard action — Step 4 is a
  checklist for the maintainer, not for you)
- Any source code

## Git workflow

- Branch: `advisor/008-docs-truth-pass`
- Commits: `docs: ...` for README/AGENTS, `chore: ...` for env/workflow
- Do NOT push (pushing to main auto-deploys Pages; deploys are user-gated).

## Steps

### Step 1: Rewrite README's scope section to v11

Replace the `## Current Scope (v9 — Berlin city)` section (README.md:7-33)
with a v11 section sourced from `AGENTS.md:22-47` + the verified code facts
above. Must state: single page, floating-card layout over a full-bleed
corridor map; scenario `charlottenburg-moabit-tiergarten` with full
background traffic and live signals; fleet 5; LIVE SUMO per visit with a
random seed (`?sumoseed=` pins, `?cache=cache` streams the recorded seed11
fallback); story arc (17:45 convoy → 18:00–19:00 service → riders driven
home); measured ship numbers (100% served, P50 ≈ 5.5–6 min); speeds
15/30/90x default 30x; libsumo transport. Move Berlin + reinickendorf to a
short "Secondary / legacy scenarios" paragraph (they stay registered — do
not present them as the product, per AGENTS.md:42-44). Update the endpoint
example (README.md:65) to scope `charlottenburg-moabit-tiergarten` and the
replay filename example to the corridor seed11 file. Keep the Run / Checks /
Data sections; verify their commands still match `package.json` and
`AGENTS.md` while there.

**Verify**: `grep -n "v9\|20/60/180\|10 / 30 / 50" README.md` → no matches;
`grep -n "fleet 5\|15/30/90" README.md` → at least one match each.

### Step 2: Fix AGENTS.md drift

`AGENTS.md:28`: "(10/20/60x, default 20x)" → "(15/30/90x, default 30x)".
Cross-check the rest of the v11 section against code while there; if you
find another drifted number, fix it ONLY if you can verify the true value
in code or the decision log tail — otherwise leave it and note it.

**Verify**: `grep -n "10/20/60" AGENTS.md` → no matches.

### Step 3: Untrack `.env.production`, inject env in CI

1. `git rm --cached .env.production` (file stays on disk for local prod
   builds — do NOT delete it).
2. Add `.env.production` to `.gitignore` (under the existing env section).
3. In `.github/workflows/pages.yml`, give the Build step the env vars from
   repository **variables** (they are not secrets in the bundle anyway, and
   variables keep them visible/editable):

   ```yaml
       - name: Build
         run: npm run build
         env:
           VITE_MAPTILER_STYLE_URL: ${{ vars.VITE_MAPTILER_STYLE_URL }}
           VITE_SCENARIO_API_URL: ${{ vars.VITE_SCENARIO_API_URL }}
   ```

**Verify**: `git ls-files .env.production` → empty; `npx vite build` → still
exit 0 locally (reads the on-disk file); `npm run check` → exit 0.

### Step 4: Maintainer checklist (report, don't execute)

Include verbatim in your completion report — these are dashboard actions
only the maintainer can do, and the deploy will fail without the first one:

- [ ] GitHub → repo Settings → Secrets and variables → Actions → Variables:
      create `VITE_MAPTILER_STYLE_URL` (new style URL with the NEW key) and
      `VITE_SCENARIO_API_URL` (`https://icybean-robotaxi-sumo-backend.hf.space`).
- [ ] MapTiler Cloud dashboard: create/rotate the API key and restrict it to
      the Pages origin (and any custom domain). The old key is burned (it
      lives in git history) — rotation, not deletion, is the fix.
- [ ] Next push to main: confirm the Pages deploy renders the map (a wrong
      variable shows as a blank basemap).

## Test plan

Docs plan — the gates are the greps above plus `npm run check`. No unit
tests apply.

## Done criteria

- [ ] `grep -n "v9 — Berlin city" README.md` → no matches
- [ ] `grep -n "10/20/60" AGENTS.md` → no matches
- [ ] `git ls-files .env.production` → empty; `.gitignore` covers it
- [ ] pages.yml Build step has both `VITE_` env vars from `${{ vars.* }}`
- [ ] `npm run check` exits 0
- [ ] Maintainer checklist included verbatim in the completion report
- [ ] No key value appears in any diff hunk you created (`git diff` review)

## STOP conditions

- README's Run/Checks commands no longer match `package.json` in a way you
  cannot verify (don't guess new commands — report).
- You find `.env.production` referenced by any script or workflow beyond
  Vite's implicit loading (grep `env.production` repo-wide first) — report
  before untracking.
- Anything would require pasting the key value somewhere — never do that.

## Maintenance notes

- AGENTS.md drift is structural (its own trust-order note admits it):
  whenever a decision-log entry changes a user-facing number, AGENTS.md's
  v-section should be updated in the same commit — worth adding to the
  review checklist.
- After the maintainer rotates the key, the old one keeps working until
  deleted in MapTiler — verify the deployed site uses the new one before
  deleting the old.
- Deferred: rewriting the older docs/ files (declared lower-trust by
  design); a `scripts/README.md` inventory (tracked as unplanned cleanup in
  plans/README.md).
