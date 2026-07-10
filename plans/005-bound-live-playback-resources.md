# Plan 005: Bound the live playback path — admission control and queue backpressure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1d0df3d..HEAD -- hf-space/app/main.py`
> If `hf-space/app/main.py` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (007 gives extra safety but is not required)
- **Category**: security (availability / resource exhaustion)
- **Planned at**: commit `1d0df3d`, 2026-07-09

## Why this matters

The shipped product runs a live SUMO simulation per anonymous visitor over a
public WebSocket (Hugging Face Space, no auth — that part is by design).
Two implementation gaps make the live path easy to stall or OOM:

1. Every live connection parks a thread from asyncio's **default**
   `to_thread` executor on a global lock. The default pool has
   `min(32, cpu+4)` workers (~6 on a 2-vCPU Space). Six-ish simultaneous
   connections exhaust the pool; every later visitor hangs with no frames
   and no error — including cached-replay-only work that also uses the pool.
2. The per-connection `message_queue` is **unbounded** and the producer
   never waits for the socket. A slow (or deliberately slow) reader makes
   the backend buffer an entire run's frames in RAM.

After this plan: excess concurrent live requests are turned away instantly
with a `stopped` message (the deployed frontend already glides those viewers
onto the recorded replay), waiting producers stop occupying threads within
~0.2 s of being preempted, and a slow client can hold at most a fixed number
of queued chunks.

## Current state

All in `hf-space/app/main.py` (~5,960 lines, the whole backend).

- `main.py:77` — the global serializer for the single libsumo instance:

  ```python
  LIVE_RUN_LOCK = threading.Lock()
  ```

- `main.py:2052-2064` — per-connection setup inside the WS handler
  `sumo_district_playback`. Newest live connection preempts the previous one
  via a shared stop event (this preemption design is a recorded product
  decision — keep it):

  ```python
  stop_event = threading.Event()
  global _latest_live_stop_event
  if not use_cache:
      # Newest live connection wins the single simulator — but a cached
      # stream must never displace someone's live run (...)
      if _latest_live_stop_event is not None:
          _latest_live_stop_event.set()
      _latest_live_stop_event = stop_event
  message_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
  event_loop = asyncio.get_running_loop()
  ```

- `main.py:2125-2154` — the producer thread body and how it is scheduled.
  Note the blocking `with LIVE_RUN_LOCK:` (a preempted waiter cannot exit
  until it acquires the lock) and the `asyncio.to_thread` (default pool):

  ```python
  def run_live_producer() -> None:
      # Serialize on the single libsumo instance; if this connection was
      # preempted while waiting its turn, don't start the sim at all.
      with LIVE_RUN_LOCK:
          # Grace beat: connections abandoned within moments of opening (...)
          stop_event.wait(0.4)
          if stop_event.is_set():
              event_loop.call_soon_threadsafe(
                  message_queue.put_nowait, {"type": "stopped", "reason": "preempted"}
              )
              return
          producer(
              traci,
              command,
              ...
              message_queue,
              event_loop,
              stop_event,
          )

  worker_task = asyncio.create_task(asyncio.to_thread(run_live_producer))
  ```

- `main.py:5022-5024` (inside `produce_sumo_taxi_drt_playback_chunks`) and
  the identical helper at `main.py:5315-5317` (inside
  `produce_sumo_playback_chunks`) — the producer-side emit; `future.result()`
  returns immediately today because the queue is unbounded:

  ```python
  def emit(payload: dict[str, Any]) -> None:
      future = asyncio.run_coroutine_threadsafe(message_queue.put(payload), event_loop)
      future.result()
  ```

- Consumer loop: `main.py:2156-2175` — drains `message_queue` with a 1 s
  `wait_for` timeout, checks `worker_task.done()` to surface producer
  crashes. Producer exceptions propagate through `worker_task.exception()`
  and are re-raised at `main.py:2170`, landing in the handler's
  `except Exception` at `main.py:2404-2406` which sends a client error.

- Frontend contract (context only — the frontend is OUT of scope): on
  `{"type": "stopped", ...}` the deployed client calls its cache fallback and
  streams the recorded replay (`src/App.tsx:2479-2491`). A new
  `reason: "busy"` value therefore needs **no frontend change**.

- Repo conventions: plain typed functions, `dict[str, Any]` payloads,
  comments explain constraints not mechanics (see the excerpts above).
  Commit style: `fix: <lowercase summary>` (see `git log --oneline`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run backend | `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861` | serves; `GET /health` returns `"ok": true` |
| Smoke test | `python scripts\smoke_backend.py --base-url http://127.0.0.1:7861` | exit 0 |
| Syntax gate | `python -m py_compile hf-space/app/main.py` | exit 0, no output |

(Windows PowerShell repo; the backend venv already has `websockets` via
`uvicorn[standard]`.)

## Scope

**In scope** (the only files you should modify):
- `hf-space/app/main.py`

**Out of scope** (do NOT touch, even though they look related):
- `src/App.tsx` — the frontend already handles `stopped`; no change needed.
- The preemption design itself (`_latest_live_stop_event`) — recorded
  product decision; you are bounding it, not replacing it.
- `scripts/smoke_backend.py`, deployment files, any other backend function.
- Do NOT deploy to the Hugging Face Space (deploys are user-gated per
  `AGENTS.md`).

## Git workflow

- Branch: `advisor/005-bound-live-playback`
- Commit per step; message style `fix: ...` (e.g. `fix: bound live playback admission and queue`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an admission gate for live producers

Near `LIVE_RUN_LOCK` (`main.py:77`), add:

```python
# Live runs beyond this many concurrently-open live connections are turned
# away with {"type": "stopped", "reason": "busy"}; the frontend glides those
# viewers onto the recorded replay. Waiters park cheaply (see Step 2), so
# this bounds thread usage, not viewer count.
LIVE_MAX_CONCURRENT = 4
_live_active_count = 0
_live_count_lock = threading.Lock()
```

In the WS handler, right after the `use_cache` preemption block
(`main.py:2054-2061`), add the check — only for live connections
(`if not use_cache`): atomically read/increment `_live_active_count` under
`_live_count_lock`; if the count is already `>= LIVE_MAX_CONCURRENT`, send
`{"type": "stopped", "reason": "busy"}` via `send_playback_json` and
`return` without scheduling a worker. Decrement in the handler's existing
`finally` block (`main.py:2407` region) — guard the decrement so it only
runs if this connection incremented (a local `admitted = True` flag).

**Verify**: `python -m py_compile hf-space/app/main.py` → exit 0.

### Step 2: Make preempted waiters release their threads promptly

In `run_live_producer` (`main.py:2125`), replace the blocking
`with LIVE_RUN_LOCK:` with a poll-acquire that notices preemption while
waiting:

```python
def run_live_producer() -> None:
    # Serialize on the single libsumo instance, but never park blind: a
    # preempted waiter must release its thread instead of blocking in
    # acquire() until the current run winds down.
    while not LIVE_RUN_LOCK.acquire(timeout=0.2):
        if stop_event.is_set():
            event_loop.call_soon_threadsafe(
                message_queue.put_nowait, {"type": "stopped", "reason": "preempted"}
            )
            return
    try:
        stop_event.wait(0.4)   # grace beat — keep the existing comment
        if stop_event.is_set():
            event_loop.call_soon_threadsafe(
                message_queue.put_nowait, {"type": "stopped", "reason": "preempted"}
            )
            return
        producer(... unchanged ...)
    finally:
        LIVE_RUN_LOCK.release()
```

Keep the existing in-body comments' intent. The `try/finally` is mandatory —
the lock must be released on every exit path including producer exceptions.

**Verify**: `python -m py_compile hf-space/app/main.py` → exit 0. Then run
the backend and `python scripts\smoke_backend.py --base-url http://127.0.0.1:7861`
→ exit 0 (single-client behavior unchanged).

### Step 3: Bound the message queue and make emit stop-aware

1. `main.py:2062` — construct the queue with a cap:
   `asyncio.Queue(maxsize=64)` (64 chunk payloads ≈ a couple minutes of
   corridor playback; comment why).
2. Replace **both** `emit` helpers (`main.py:5022-5024` and
   `main.py:5315-5317`) with a stop-aware wait:

   ```python
   def emit(payload: dict[str, Any]) -> None:
       future = asyncio.run_coroutine_threadsafe(message_queue.put(payload), event_loop)
       while True:
           try:
               future.result(timeout=0.5)
               return
           except concurrent.futures.TimeoutError:
               if stop_event.is_set():
                   future.cancel()
                   raise RuntimeError("playback consumer gone; producer stopped")
   ```

   Add `import concurrent.futures` to the module imports (alphabetical,
   `main.py:1-19` block). Both producer functions already run inside
   `try/except Exception` blocks that emit an error payload
   (`main.py:5276`, `main.py:5480`) and then close traci in `finally` — the
   raised RuntimeError unwinds through those, which is the desired cleanup
   path. NOTE: after this change a producer whose consumer vanished dies via
   this exception; confirm the `finally: traci.switch/close` blocks at
   `main.py:5277-5281` and `main.py:5481-5485` still run (they will — read
   them to confirm shape).

**Verify**: run the backend, open the app locally (or run the smoke script)
→ a normal run completes; `python -m py_compile hf-space/app/main.py` → exit 0.

### Step 4: Concurrency check

With the backend running locally, run this bounded check (save under
`$env:TEMP`, not the repo; it opens 6 sockets against localhost only):

```python
import asyncio, json, websockets

URL = ("ws://127.0.0.1:7861/ws/sumo/charlottenburg-moabit-tiergarten/playback"
       "?speed=50&demand=matsim&engine=taxi&detail=public&cache=live&fleet=5")

async def probe(i):
    try:
        async with websockets.connect(URL, open_timeout=10) as ws:
            async with asyncio.timeout(15):
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("type") in {"stopped", "chunk", "error"}:
                        return i, msg.get("type"), msg.get("reason")
    except Exception as e:
        return i, "exc", type(e).__name__

async def main():
    print(await asyncio.gather(*(probe(i) for i in range(6))))

asyncio.run(main())
```

**Verify**: script exits within ~30 s. Expected: at most `LIVE_MAX_CONCURRENT`
connections report `chunk` or `stopped/preempted`; the overflow ones report
`stopped/busy`. NONE hang past the 15 s timeout. Afterwards `GET /health`
still returns `"ok": true` and a fresh single connection streams normally.

## Test plan

No pytest harness exists yet (plan 007 creates one). Verification for this
plan is the smoke script (single client), the Step 4 concurrency probe, and
one manual full run in the browser (`npm run dev` with
`VITE_SCENARIO_API_URL=http://127.0.0.1:7861` in `.env.local`) confirming a
live evening still plays to the report. If plan 007 has landed first, also
add a unit test asserting the admission counter turn-away payload shape.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `python -m py_compile hf-space/app/main.py` exits 0
- [ ] `python scripts\smoke_backend.py --base-url http://127.0.0.1:7861` exits 0
- [ ] Step 4 probe: no connection hangs; overflow connections get `stopped`
- [ ] `grep -n "asyncio.Queue()" hf-space/app/main.py` inside the playback
      handler returns no unbounded queue (the queue at ~2062 has `maxsize`)
- [ ] `git status` shows only `hf-space/app/main.py` (and `plans/README.md`) modified

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- The smoke script fails after Step 2 or Step 3 in a way a single retry
  doesn't explain — the lock-release or emit rewrite likely broke the
  single-client path; report rather than patching around it.
- You find another `emit`-style bridge (`run_coroutine_threadsafe` into
  `message_queue`) beyond the two listed — the plan missed a producer;
  report it.
- Making the queue bounded deadlocks run teardown (producer blocked in
  `emit` while the consumer already exited without setting `stop_event`) —
  that means a teardown path doesn't set `stop_event`; report which one.

## Maintenance notes

- `LIVE_MAX_CONCURRENT` and queue `maxsize=64` are guesses sized for a
  2-vCPU Space; revisit if the Space is upgraded or chunk payloads grow.
- If a "waiting room" UX is ever wanted instead of instant busy-fallback,
  it replaces Step 1's turn-away, not Step 2/3.
- Reviewer should scrutinize: the `finally` decrement pairing in Step 1 and
  the lock `try/finally` in Step 2 — a missed release bricks the live path
  for the process lifetime.
- Deliberately deferred: rate-limiting HTTP endpoints (plan 006), a
  dedicated producer executor (unnecessary once waiters self-release).
