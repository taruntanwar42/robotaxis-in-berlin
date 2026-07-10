# Plan 007: Establish a verification baseline — pytest + ruff for the backend, a checks CI job

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1d0df3d..HEAD -- hf-space/app/main.py package.json .github/workflows/`
> If `hf-space/app/main.py` changed, re-locate the four target functions by
> name (they may have moved lines); on a signature mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: LOW (adds checks; changes no runtime code)
- **Depends on**: none. Lands best BEFORE any backend refactor; plans 005/006 touch `main.py`, so coordinate line numbers if executed after them.
- **Category**: tests / dx
- **Planned at**: commit `1d0df3d`, 2026-07-09

## Why this matters

The repo has **zero automated tests** in either language, and the only gates
are `npm run check` (frontend lint + typecheck + build) and a smoke script
that needs a live backend. Meanwhile the two highest-churn files are a
5,962-line `hf-space/app/main.py` (the dispatch logic the product exists
for) and a 4,992-line `src/App.tsx`. Nothing catches a Python syntax error,
type regression, or a silently-changed request-parsing rule before deploy —
the decision log records exactly such a bug shipping
(`parse_fleet_size` silently rejected fleet 5, so a "fleet 5" smoke actually
ran 10 cabs; entry 2026-07-09). This plan creates the pytest + ruff floor
and a CI job, which also unblocks any future refactor of the god files.

## Current state

- No test files exist: `git ls-files | grep -iE "test|spec|conftest"`
  returns nothing. `package.json` has no `test` script.
- `package.json:10` — `"check": "npm run lint && npm run build"` (oxlint,
  then `tsc -b && vite build`). This passes green today.
- `.github/workflows/pages.yml` — builds and deploys the frontend on push
  to main. `.github/workflows/deploy-hf-space.yml` — manual
  (`workflow_dispatch`) Space deploy. Neither runs any Python check.
- `hf-space/requirements.txt` — `fastapi==0.125.0`, `uvicorn[standard]==0.38.0`,
  `libsumo==1.27.1`. There is no dev/tooling requirements file.
- `hf-space/app/main.py` imports cleanly without SUMO installed: `traci` /
  `libsumo` / `sumolib` are lazy, function-level imports
  (`main.py:489`, `main.py:508`, `main.py:1412`). Module import needs only
  `fastapi`.
- Target functions for characterization tests (all in `hf-space/app/main.py`):
  - `parse_fleet_size(websocket)` — `main.py:324` — reads
    `websocket.query_params`; per the decision log valid sizes are
    {3..8} ∪ {10..60-ish}; returns `int | None`.
  - `parse_demand_file(websocket)` — `main.py:344` — reduces the raw value
    to `Path(raw).name` and requires existence inside `MATSIM_DEMAND_DIR`
    (path-traversal guard: a `..`-laden input must NOT escape).
  - `playback_step_and_stride(playback_rate)` — `main.py:358` — pure
    function returning `tuple[float, int]`.
  - Scenario registry: `get_sumo_scenario(None)` returns the corridor
    scenario (`PLAYBACK_SCOPE = "charlottenburg-moabit-tiergarten"`,
    `main.py:55`); `packaged_sumo_files(selected)` (`main.py:566`) maps
    file-role → exists-bool.
- Committed demand fixture (real data, in-repo):
  `hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_seed11.json`
  — the shipped seed11 demand (21 corridor requests per the decision log).
- `.oxlintrc.json` enables plugins `react`, `typescript`, `oxc` with two
  explicit rules; oxlint's default `correctness` category is also active.
- Conventions: Python is std-lib + FastAPI style, 4-space, typed
  signatures. Commit style `feat:`/`fix:`/`chore:` lowercase.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install dev tools | `pip install -r requirements-dev.txt` | exit 0 |
| Run tests | `python -m pytest hf-space/tests -q` | all pass |
| Ruff lint | `python -m ruff check hf-space/app scripts` | exit 0 after Step 4 |
| Frontend gate | `npm run check` | exit 0 |
| Full gate (new) | `npm run check:all` | exit 0 |

## Scope

**In scope**:
- `requirements-dev.txt` (create, repo root)
- `hf-space/tests/` (create: `__init__.py` not needed; `test_*.py` files)
- `pyproject.toml` (create, repo root — ruff + pytest config only)
- `package.json` (add `check:all` script only — do not touch existing scripts)
- `.github/workflows/checks.yml` (create)
- `AGENTS.md` — update the "Expected Checks" section only
- `plans/README.md` (status row)

**Out of scope**:
- ANY change to `hf-space/app/main.py` or other runtime code. If a test
  reveals a bug, record it as a finding in your report — do not fix it here;
  characterization tests pin CURRENT behavior.
- `hf-space/requirements.txt` (runtime deps unchanged; dev tools live in
  `requirements-dev.txt` so the Space image stays lean).
- TypeScript strict mode (separate candidate, deliberately not here).

## Git workflow

- Branch: `advisor/007-verification-baseline`
- Commit per step; style `feat: ...` / `chore: ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Dev requirements + config

Create `requirements-dev.txt`:

```
pytest==8.*
ruff==0.14.*
httpx==0.28.*
```

(`httpx` powers FastAPI's `TestClient`.) Create `pyproject.toml`:

```toml
[tool.pytest.ini_options]
testpaths = ["hf-space/tests"]
pythonpath = ["hf-space"]

[tool.ruff]
line-length = 120
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "W", "B", "UP"]
ignore = ["E501"]
```

**Verify**: `pip install -r requirements-dev.txt` → exit 0;
`python -c "import app.main"` from a shell with `PYTHONPATH=hf-space`
(PowerShell: `$env:PYTHONPATH='hf-space'; python -c "import app.main"`) → exit 0.

### Step 2: Characterization tests — parsing and playback math

Create `hf-space/tests/test_parsing.py`. Use a minimal stub for the
websocket (only `query_params` is read):

```python
from types import SimpleNamespace
from app import main

def ws(**params):
    return SimpleNamespace(query_params=params)
```

Write tests that PIN CURRENT BEHAVIOR (run the function first, assert what
it actually returns — do not assert what you think it should return):

1. `parse_fleet_size`: accepted values (e.g. 5, 30) return the int;
   out-of-range (e.g. 2, 9, 999) and junk (`"abc"`, missing) return the
   documented fallback — observe and pin it, including the exact boundary
   set. Add a comment: "pins the fleet-option contract; the 2026-07-09
   decision log records a shipped bug when this silently changed."
2. `parse_demand_file`: a valid committed filename resolves inside
   `MATSIM_DEMAND_DIR`; a name with path separators / `..` segments must
   not resolve outside it (assert result is `None` or stays under the dir —
   pin whichever holds); a nonexistent file → pin behavior.
3. `playback_step_and_stride`: pin the `(step, stride)` tuple for each
   playback rate the frontend uses (grep `src/App.tsx` for `speed=50` — 50
   is the shipped rate) plus the boundary rates in the function.

**Verify**: `python -m pytest hf-space/tests -q` → all pass.

### Step 3: Characterization tests — scenario registry and demand data

Create `hf-space/tests/test_scenario_registry.py`:

1. `get_sumo_scenario(None)["key"] == "charlottenburg-moabit-tiergarten"`
   (the shipped default; AGENTS.md calls this the product).
2. For the corridor scenario, every path in `packaged_sumo_files(selected)`
   is `True` (the packaged files are committed and must stay so).
3. The shipped fallback replay exists:
   `hf-space/app/data/replays/charlottenburg-moabit-tiergarten_taxi_matsim_public.seed11.jsonl.gz`
   (guards the `?cache=cache` path and live-preemption fallback). NOTE: this
   file is Git LFS — if it is a 133-byte pointer file in your checkout, run
   `git lfs pull` first; if LFS is unavailable, assert existence only, not size.
4. Load the seed11 demand JSON directly (`json.load`) and pin its shape:
   top-level structure, request count, and the fields the dispatch layer
   reads (inspect the file once, then assert). Do NOT call
   `load_matsim_person_demand_requests` if it needs sumolib/net parsing —
   check its body first (`main.py:1174`); if it imports `sumolib` or parses
   the net, skip it here and note that in the test file docstring.
5. `GET /health` via `fastapi.testclient.TestClient(main.app)` → 200 and
   the response has `ok`, `service`, `scope` keys (values depend on SUMO
   being installed — assert keys, not `ok`'s value).

**Verify**: `python -m pytest hf-space/tests -q` → all pass (expect ~10–15 tests).

### Step 4: Ruff burn-down to zero *without touching runtime code*

Run `python -m ruff check hf-space/app scripts`. If it reports violations
in runtime code, do NOT edit the code: narrow the config instead (add
per-file-ignores or drop a rule class from `select`) until it exits 0, and
list the dropped rules in your report as follow-up debt. The gate must be
green AND honest — a rule that would require code changes is out of scope
here.

**Verify**: `python -m ruff check hf-space/app scripts` → exit 0.

### Step 5: Wire the gates

1. `package.json`: add
   `"check:all": "npm run check && python -m ruff check hf-space/app scripts && python -m pytest hf-space/tests -q"`.
2. Create `.github/workflows/checks.yml`: trigger `on: [push, pull_request]`;
   two jobs:
   - `frontend`: setup-node 24 (copy the pages.yml setup), `npm ci`,
     `npm run check`.
   - `backend`: setup-python 3.11, `pip install -r hf-space/requirements.txt -r requirements-dev.txt`,
     `python -m ruff check hf-space/app scripts`,
     `python -m pytest hf-space/tests -q`.
   If `pip install libsumo` fails in CI (large manylinux wheel, should
   work), fall back to installing only
   `fastapi httpx pytest ruff "uvicorn[standard]"` — the tests were designed
   to run without SUMO — and add a comment in the workflow saying so.
3. Update `AGENTS.md` "Expected Checks" to list `npm run check:all` (keep
   the smoke-script line).

**Verify**: `npm run check:all` → exit 0 locally. CI verification happens on
next push (do not push yourself).

## Test plan

This plan IS the test plan. Expected end state: ~10–15 pytest tests across
two files, all green without SUMO installed; ruff green; one new CI
workflow. Structural pattern for future tests: these files.

## Done criteria

- [ ] `python -m pytest hf-space/tests -q` → all pass, ≥10 tests
- [ ] `python -m ruff check hf-space/app scripts` → exit 0
- [ ] `npm run check:all` → exit 0
- [ ] `git diff --name-only` touches ONLY: `requirements-dev.txt`,
      `pyproject.toml`, `hf-space/tests/*`, `package.json`,
      `.github/workflows/checks.yml`, `AGENTS.md`, `plans/README.md`
- [ ] No modification to `hf-space/app/*.py` (`git diff --stat hf-space/app` empty)

## STOP conditions

- `import app.main` fails in your environment — report the ImportError
  (the plan's premise is that module import is SUMO-free).
- A characterization test reveals behavior so surprising it looks like an
  active bug (e.g. `parse_demand_file` escaping `MATSIM_DEMAND_DIR`) —
  pin nothing, report the finding immediately.
- `TestClient(main.app)` hangs or errors at import/startup — report; do not
  add startup shims to runtime code.
- Ruff cannot reach exit 0 without either code edits or gutting `select`
  below `["E", "F"]` — report the violation list instead.

## Maintenance notes

- Plans 005/006 edit `main.py` error/queue paths — if they land after this,
  their steps should re-run `npm run check:all` as their gate.
- The pinned-behavior tests are characterization: when product behavior
  changes deliberately (e.g. new fleet options), updating the test IS the
  changelog — reviewers should ask for the matching decision-log entry.
- Follow-up debt (not this plan): TypeScript `strict` in
  `tsconfig.app.json`; extracting pure dispatch logic from `main.py` into a
  testable module (blocked on this baseline landing first).
