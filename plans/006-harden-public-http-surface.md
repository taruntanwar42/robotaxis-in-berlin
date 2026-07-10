# Plan 006: Harden the public HTTP surface — cached version probe, quiet errors, pinned non-root image

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1d0df3d..HEAD -- hf-space/app/main.py hf-space/Dockerfile`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (independent of 005; both touch `main.py`, so execute serially, 005 first)
- **Category**: security
- **Planned at**: commit `1d0df3d`, 2026-07-09

## Why this matters

The backend is a public, unauthenticated Hugging Face Space (by design — it
serves an anonymous demo). Four cheap hardening gaps remain:

1. Every `GET /health`, `GET /sumo/version`, and `GET /sumo/{scope}/summary`
   forks a `sumo --version` subprocess — a free CPU/PID burner for anyone
   polling, and pure waste (the answer never changes for a process lifetime).
2. `GET /sumo/{scope}/validate` runs a real SUMO simulation (up to 60 s,
   synchronously on Starlette's threadpool) per anonymous hit and returns
   the raw command line, stdout, and stderr — container paths and internals.
3. WebSocket and HTTP error paths return `str(error)` — raw exception text —
   to the browser.
4. The Dockerfile builds `FROM ghcr.io/eclipse-sumo/sumo:main` (a moving
   tag, so the sim engine can silently change under the product) and runs
   the service as root.

## Current state

- `hf-space/app/main.py:521-544` — `sumo_version()` runs
  `subprocess.run([sumo_binary, "--version"], ...)` on every call. Called
  from `/health` (`main.py:549`), `/sumo/version` (`main.py:562-563`), and
  the summary payload (`main.py:1793`). The module already imports
  `lru_cache` (`main.py:18`) and uses it elsewhere.
- `hf-space/app/main.py:1873-1888` — `/sumo/{scope}/validate` (sync `def`
  endpoint) runs SUMO with `timeout=60` and returns:

  ```python
  return {
      "ok": result.returncode == 0,
      "returnCode": result.returncode,
      "command": command,
      "stdout": result.stdout[-4000:],
      "stderr": result.stderr[-4000:],
  }
  ```

- Client-facing raw exception text (these five sites only — the
  `robotaxi["error"]`/`request["error"]` assignments elsewhere are
  per-entity dispatch state, out of scope):
  - `main.py:1822` — `/sumo/{scope}/network` → `{"available": False, "error": str(error)}`
  - `main.py:2191` — WS playback handler → `{"type": "error", "message": str(error)}`
  - `main.py:2406` — WS playback handler outer except → same shape
  - `main.py:5276` — `produce_sumo_taxi_drt_playback_chunks` except → `emit({"type": "error", "message": str(error)})`
  - `main.py:5480` — `produce_sumo_playback_chunks` except → same shape
- The module has no logging setup; it uses `print(...)` nowhere on these
  paths — errors are currently *only* visible to the client.
- `hf-space/Dockerfile` (23 lines, excerpt):

  ```dockerfile
  FROM ghcr.io/eclipse-sumo/sumo:main
  ...
  COPY app ./app
  EXPOSE 7860
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
  ```

  No `USER` directive. Live runs write inside the app tree: scenario
  `output/` dirs (route files, e.g. `main.py:1497-1510`) — the non-root user
  must own `/app`.
- `hf-space/requirements.txt` pins `libsumo==1.27.1` — the image's SUMO
  version should match the 1.27.x line.
- `GET /sumo/{scope}/network` (`main.py:1808-1836`) serializes a large
  static GeoJSON per request with no cache headers (compute is `lru_cache`d,
  serialization is not).
- Frontend contract: on `{"type": "error"}` the client shows
  `payload.message ?? "Playback unavailable."` (`src/App.tsx:2494-2499`) —
  a generic message string is fully compatible.
- Conventions: typed helpers returning `dict[str, Any]`; comments state
  constraints; commit style `fix: <lowercase summary>`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Syntax gate | `python -m py_compile hf-space/app/main.py` | exit 0 |
| Run backend | `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861` | `GET /health` → `"ok": true` |
| Smoke test | `python scripts\smoke_backend.py --base-url http://127.0.0.1:7861` | exit 0 |
| Docker build (only if Docker available) | `docker build -t robotaxi-backend-test hf-space` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `hf-space/app/main.py`
- `hf-space/Dockerfile`

**Out of scope**:
- Frontend files, `scripts/`, `requirements.txt` version bumps.
- Adding auth or rate-limiting middleware (the public-demo posture is by
  design; plan 005 handles WS concurrency).
- Do NOT deploy to the Space (user-gated per `AGENTS.md`).

## Git workflow

- Branch: `advisor/006-harden-public-surface`
- Commit per step; style `fix: ...`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Set up a module logger and cache `sumo_version()`

Add near the imports: `import logging` and
`logger = logging.getLogger("robotaxi.backend")` (uvicorn propagates it).

Cache the version probe — result is process-static:

```python
@lru_cache(maxsize=1)
def _sumo_version_cached() -> ...   # move the current body here

def sumo_version() -> dict[str, Any]:
    return dict(_sumo_version_cached())
```

Return a shallow copy so callers embedding it in responses can't mutate the
cached dict. Exception: if the binary was NOT found
(`available: False`), do not cache — call `_sumo_version_cached.cache_clear()`
before returning, so a Space that starts before SUMO is on PATH can recover.

**Verify**: backend up → hit `GET /health` twice; second response identical;
`python -m py_compile hf-space/app/main.py` → exit 0.

### Step 2: Quiet the `/validate` response

In `main.py:1882-1888`, log the full detail server-side and slim the body:

```python
logger.info("validate %s rc=%s stderr=%s", selected["key"], result.returncode, result.stderr[-2000:])
return {"ok": result.returncode == 0, "returnCode": result.returncode}
```

Drop `command`, `stdout`, `stderr` from the response. (The route stays —
it's used for operator diagnostics — but no longer leaks paths.)

**Verify**: `curl http://127.0.0.1:7861/sumo/charlottenburg-moabit-tiergarten/validate`
→ JSON with only `ok` and `returnCode` keys.

### Step 3: Generic client errors, detailed server logs

At each of the five sites (1822, 2191, 2406, 5276, 5480):
`logger.exception("<where>: playback failed")` (inside the except block,
so the traceback is captured), and replace the client payload message with
a stable generic string, e.g.:

- `main.py:1822` → `{"available": False, "error": "network unavailable"}`
- WS/producer sites → `{"type": "error", "message": "Simulation failed."}`

Keep payload shapes identical (`type`/`message`, `available`/`error`) — the
frontend switch depends on `type`, not the text.

**Verify**: `python -m py_compile hf-space/app/main.py` → exit 0;
`grep -n '"message": str(error)' hf-space/app/main.py` → no matches;
smoke script → exit 0.

### Step 4: Cache headers on the static network payload

`/sumo/{scope}/network` (`main.py:1808`) returns a dict; switch to
`fastapi.responses.JSONResponse` with
`headers={"Cache-Control": "public, max-age=86400"}` (the network is fixed
per packaged scenario). Import `JSONResponse` from `fastapi.responses`.

**Verify**: `curl -sI` equivalent (`curl -s -D - -o NUL http://127.0.0.1:7861/sumo/charlottenburg-moabit-tiergarten/network`)
→ response headers include `cache-control: public, max-age=86400`.

### Step 5: Pin the base image and drop root

1. List available tags: `gh api /orgs/eclipse-sumo/packages/container/sumo/versions --paginate --jq '.[].metadata.container.tags[]' 2>$null | head -30`
   (or check https://github.com/eclipse-sumo/sumo/pkgs/container/sumo).
   Pick the release tag matching the 1.27.x line pinned in
   `requirements.txt` (e.g. a `v1_27_*` tag). If no such tag exists, pin the
   current `:main` **by digest** (`docker pull ghcr.io/eclipse-sumo/sumo:main`
   then `docker inspect --format='{{index .RepoDigests 0}}' ...`) and note
   the SUMO version it contains in a comment.
2. Add a non-root user after the `COPY app ./app` line:

   ```dockerfile
   RUN useradd --create-home --uid 1000 appuser \
       && chown -R appuser:appuser /app
   USER appuser
   ```

   UID 1000 matches Hugging Face Spaces' documented convention. `/app` must
   be writable — live runs write scenario `output/` files under it.

**Verify**: if Docker is available locally: `docker build -t robotaxi-backend-test hf-space`
→ exit 0, and `docker run --rm robotaxi-backend-test id -u` → `1000`.
If Docker is NOT available, mark Step 5 "built untested — verify on next
Space deploy" in your report and in the plans/README.md status note.

## Test plan

Smoke script after each step (`scripts/smoke_backend.py` hits /health,
summary, and a playback socket). If plan 007's pytest harness exists, add:
a test that `sumo_version()` returns a copy (mutating the result doesn't
change a second call), and a test that the five error sites' payload shapes
still carry `type: "error"` (grep-level assertion is acceptable).

## Done criteria

- [ ] `python -m py_compile hf-space/app/main.py` exits 0
- [ ] `python scripts\smoke_backend.py --base-url http://127.0.0.1:7861` exits 0
- [ ] `grep -n '"stdout": result.stdout' hf-space/app/main.py` → no matches
- [ ] `grep -n '"message": str(error)' hf-space/app/main.py` → no matches
- [ ] `grep -n "FROM ghcr.io/eclipse-sumo/sumo:main$" hf-space/Dockerfile` → no matches (pinned tag or digest)
- [ ] `grep -n "^USER " hf-space/Dockerfile` → one match
- [ ] `git status` shows only the two in-scope files (plus `plans/README.md`)

## STOP conditions

- Drift check fails or excerpts don't match.
- `/health` starts failing after Step 1 — the cache-clear-on-miss logic is
  wrong for this environment; report.
- You cannot determine a SUMO image tag compatible with `libsumo==1.27.1` —
  report the available tags instead of guessing.
- The non-root build fails at runtime with a permission error on a path
  outside `/app` — report the path; do not chmod system directories.

## Maintenance notes

- When `libsumo` is bumped in `requirements.txt`, the Dockerfile pin must be
  bumped in the same commit — add that to the review checklist.
- The `/validate` response slimming means operators must read Space logs for
  details; if that proves painful, add an env-gated verbose mode rather than
  re-exposing stderr publicly.
- Deferred deliberately: rate limiting (plan 005 bounds the expensive path),
  deleting the dead `build_sumo_frame` chain at `main.py:5869-5941` (safe
  quick delete, tracked in plans/README.md as unplanned cleanup).
