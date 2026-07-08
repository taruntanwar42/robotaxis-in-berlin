# Plan 003: SPIKE — live custom-run mode on the Hugging Face Space (libsumo)

> **Executor instructions**: This is a **design/spike plan** — the deliverable
> is a working local prototype behind a flag plus a written design note, NOT a
> deployed feature. Follow steps in order; honor every STOP condition. When
> done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9fda5d4..HEAD -- hf-space/app/main.py hf-space/Dockerfile hf-space/requirements.txt scripts/deploy_hf_space.py`
> On drift, compare "Current state" excerpts before proceeding; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: L (spike bounded to ~a day; full feature is future work)
- **Risk**: MED — live compute in front of a viewer; must never degrade the cached default
- **Depends on**: none (001/002 independent)
- **Category**: direction (design/spike)
- **Planned at**: commit `9fda5d4`, 2026-07-07

## Why this matters

The maintainer's words (2026-07-07): *"it wouldnt really be a simulation then,
would it? just a recording"* and *"the sim should start running as soon as the
page is loaded... when the user clicks run simulation, the backend is already
way ahead."* The measured foundation exists: with libsumo the whole-city
scenario steps at ~62× realtime with full dispatch polling (recording one hour
≈ 1.2 min wall). The public app today streams pre-recorded replays; the
`cache=live` path already recomputes through SUMO locally. What's unknown is
whether live runs are viable and safe on the production host (HF Space, 2 vCPU
/ 16 GB), and what UX guards they need. This spike answers that with evidence.

## Current state

- `hf-space/app/main.py`:
  - `ensure_traci_import()` — returns **libsumo** by default (shimmed:
    `constants`/`getConnection`/label-stripping `start`); env
    `ROBOTAXI_SUMO_TRANSPORT=traci` reverts. libsumo = one simulation per
    process — two concurrent live runs in one worker is impossible.
  - WebSocket `/ws/sumo/{scope}/playback` accepts
    `cache={auto|live|cache}`, `fleet={10|30|50}`, `demandfile=<name>`;
    `cache=auto` streams a cached replay when present
    (`public_replay_cache_path`), else records live.
  - Berlin scenario entry (`SUMO_SCENARIOS["berlin"]`) points at
    `hf-space/app/sumo/berlin/berlin.net.xml` and
    `berlin-background-1pct.rou.xml` — **both git-ignored** (see `.gitignore`:
    `hf-space/app/sumo/berlin/berlin.net.xml`, `*.rou.xml`). They exist locally
    only; the deployed Space has the sumocfg/metadata but NOT the 162 MB net or
    the 16 MB route file. Live berlin runs on the Space fail today at SUMO
    start.
  - Timing facts (benchmarked at plan time, local machine): net load ~8–13 s;
    1 h window + drive-in ≈ 5,400–8,400 frames; recording ≈ 2–4 min wall
    including demand mapping. Local machine ≈ HF Space CPU (maintainer
    reports HF ~30% faster).
- `hf-space/Dockerfile` — `FROM ghcr.io/eclipse-sumo/sumo:main`, pip installs
  `requirements.txt` (already contains `libsumo==1.27.1`).
- `scripts/deploy_hf_space.py` — uploads the `hf-space/` tree to Space
  `icybean/robotaxi-sumo-backend`. Read it before assuming what gets shipped.
- Frontend: `src/App.tsx` builds the ws URL with `cache=auto` and
  `fleet=${fleetChoiceRef.current}`; an `isPreparing` state already renders a
  spinner in the Start button (`CybercabExperience.tsx`).
- Decided tradeoffs to respect (decision log): default Start must stay
  instant-and-cached ("caching sounds really wise"); recruiter path must be
  un-breakable; deploys are user-gated.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Backend | `python -m uvicorn app.main:app --app-dir hf-space --host 127.0.0.1 --port 7861` | `/health` ok |
| Live run (bypasses cache) | `python scripts/build_public_replay_cache.py --base-url http://127.0.0.1:7861 --scope berlin --fleet 30 --seed 1 --output <tmp path>` | completes; wall time = your live-run measurement |
| Frontend check | `npm run check` | exit 0 |
| Backend syntax | `python -c "import ast; ast.parse(open('hf-space/app/main.py', encoding='utf-8').read())"` | no output |

## Scope

**In scope**:
- `hf-space/app/main.py` — a global asyncio lock/semaphore around live SUMO
  runs + a `busy` error frame; optional `livecustom` guard flag.
- A new design note `plans/003-notes.md` (the spike's written deliverable).
- Local prototype only. NO deploy, NO Space upload, NO git-LFS additions in
  this spike.

**Out of scope (hard)**:
- Deploying anything (user-gated).
- Frontend custom-run UI beyond what exists (design it in the note; build later).
- Changing the cached default path's behavior in any way.
- Committing `berlin.net.xml` — decide *how* it would ship (LFS vs. Space
  upload script vs. runtime download) in the note; do not do it.

## Git workflow

- Work on `main`; conventional commits (`feat:`/`docs:`); no push.

## Steps

### Step 1: Measure the true live-run envelope locally

With the backend running, execute the live-run command 2× (cold + warm) and
record: wall time to first chunk, total wall time, peak RSS of the backend
process. This is the "preparing…" duration a user would experience.

**Verify**: numbers recorded in `plans/003-notes.md` §Measurements.

### Step 2: Concurrency guard

In `main.py`, add a module-level `asyncio.Lock` (or `Semaphore(1)`) acquired
non-blockingly by the live-run path only (cached streaming must NOT take the
lock). If busy: emit `{"type": "error", "message": "Simulator busy — one live
run at a time. The cached evening starts instantly."}` and close. Cached path
untouched.

**Verify**: `python -c "import ast; ..."` clean; two simultaneous live-run
invocations → second receives the busy error, first completes normally.

### Step 3: Buffer-ahead check

Confirm the existing stream already outruns playback: at 62× sim speed vs. 60×
playback the margin is thin. Measure: during a live run, log time-to-frame-N
for N = 60s of playback at 60×. If sim falls behind playback pace at any point,
record by how much — the design note must then specify a start-delay buffer
(e.g. hold playback until X frames are buffered; the frontend already buffers
via `playbackTimelineRef`).

**Verify**: measurement + verdict written into the note.

### Step 4: Write the design note (`plans/003-notes.md`)

Must cover, with the measurements from steps 1–3:
1. Asset shipping decision for the Space: git-LFS in repo vs.
   `deploy_hf_space.py` uploading the net/route files vs. runtime download
   from the BeST source (~420 MB zip; likely unacceptable) — recommend one,
   with Space storage math.
2. UX contract: default Start = cache (unchanged); "Custom evening" control =
   live, with the measured preparing-time honestly displayed; busy fallback →
   offer the cached run. Respect "all input is error" — custom mode is
   optional depth, never required.
3. Failure ladder: live start fails → automatic cache fallback → error card.
4. Warm-pool idea from the maintainer (pre-start sim on page load) — feasibility
   given the one-sim-per-process constraint and idle-CPU cost on the Space;
   recommend for/against with one paragraph.
5. What DIR-04 ("enter an address, go places") would additionally need — one
   paragraph, no design.

**Verify**: note exists, every section present, all numbers filled in.

## Test plan

Spike: measurements + the busy-lock behavior test in Step 2 are the tests.
No new frameworks.

## Done criteria

- [ ] `plans/003-notes.md` exists with Measurements, Shipping, UX, Failure
      ladder, Warm-pool verdict, DIR-04 addendum — all with real numbers
- [ ] Live-run concurrency lock in `main.py`; busy path returns the error frame;
      cached path provably untouched (`git diff` shows no cached-path edits)
- [ ] `npm run check` exit 0; backend ast-parse clean
- [ ] Nothing deployed; no ignored asset committed (`git status` clean of them)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Live run on this machine takes > 8 min wall or > 6 GB RSS — the Space
  assumption collapses; write that finding and stop.
- The lock cannot be added without touching the cached streaming path.
- You are tempted to deploy "just to test on the real Space" — that is
  user-gated; stop and ask.

## Maintenance notes

- The lock is prerequisite infrastructure for ANY future live feature
  (DIR-04 summon mode included).
- Reviewer: verify the busy message text passes the no-disclaimer design law
  (it states a fact and an alternative, no apology).
- Follow-up (separate plan, post-spike): ship assets per the note's decision,
  build the "Custom evening" UI, deploy — each user-gated.
