# Experience Brief — v10 "The Reveal"

Status: living intent document, written 2026-07-07 late session with the
maintainer. This is the highest-trust design document alongside
`PRODUCT_DECISION_LOG.md`. It records INTENT, deliberately not implementation —
the builder of each piece owns the how, with maximum degrees of freedom.

## Constitution (non-negotiable, in priority order)

1. **Minimalism, clarity, coherence, intentionality.** The only hard style
   rule. No pre-decided accent colors, no decoration quotas — every element
   justifies its existence or doesn't exist. (Maintainer: "they wont have to
   deslop anything if they dont make it in the first place.")
2. **All input is error.** Zero required interaction after Start. Optional
   interaction may reward. No modes a user can fall into and need to escape.
   There is **no selection in the fleet UI — only scroll**.
3. **Never waste attention.** No staring at things while waiting, no reading
   explanations for what's intuitive. "We are not building an obstacle course,
   but an artful experience, which is technically detailed because it's not a
   simulacrum but a real sim."
4. **Real simulation, always.** Every run is a live SUMO run on the backend.
   Caching may be added at the very end as an optional perf layer — never as a
   built-in shortcut. (libsumo measured ~62x realtime full-city; the engine
   outruns the playback.)
5. **Target user hardware: recent MacBook (M4-class), ~1 Gbps network.** Do
   not design down. A 500 KB library is not a cost worth a worse experience.

## The Entry (intent, not storyboard)

From a blank page, the world assembles itself and each element introduces
itself as it arrives — smoothly, wordlessly where possible, a few quiet words
where not. Nothing that appears is ever thrown away: **the intro's elements
ARE the app's permanent elements arriving.** No separate intro screen, no
cards to click through, skippable by nature.

Narrative order (the maintainer's): *This is Berlin* (the map materializes) →
*This is the Cybercab, the future of transportation* (the hero car presents
itself — and the hero IS the first fleet card, oversized; it takes its place
as nine siblings join, and the Cyberfleet list is born) → *your Cyberfleet
deploys* (they leave the depot for the city; fleet-size shown, not asked) →
*serving real Berliners* (synthetic 1% population; demand appears; service
begins; the time bar starts moving and explains itself by moving) → the hour
runs → *the answer* (results: engineering, people, energy, economics — how
this could change the world).

Story beats the entry carries (no extra reading): 1) what the Cybercab is
(specs at the hero moment), 2) that a real micro-simulation serves real
transportation demand (not a recording, not a deepfake), 3) later at results:
economics / environment / Model-Y-comparison ("cars replaced").

## The Cyberfleet card (the signature element)

One big, live card per cab (default fleet: 10, named `#01`–`#10`). No click,
no expand — everything at a glance, always: **the cab in its world** (own
view: the car, what it's doing, neighboring traffic, lights, active lane —
grown feature by feature), its state in one quiet word, and what an operator
would worry about (battery, rider, speed). The card is a window into that
cab's life. Aspirational reference: Tesla's in-car view — garage view and
driving view as camera moves over one state-aware scene, seamless.

**Own view, not the map as crutch** (decided 2026-07-07 after the chase
spike): the card's view is our own rendering surface fed by sim data (route,
neighbors, lanes), not a reused MapLibre chase cam.

### Chase-spike learnings (evidence, 2026-07-07, `?spike=chase` still in code)

- MapLibre pitch + fill-extrusion buildings + bearing-follow works mechanically
  (one layer + camera params) but underwhelms: extrusions read flat at follow
  zoom, the 2D sprite dies under pitch, no lanes/lights visible, and a
  hard-coupled camera shakes ("gives me a headache").
- Any future follow camera needs a **dead-band / soft-coupled rig** (position
  banding, look-ahead, damped bearing) — never rigidly locked to the vehicle.
- 3D building data IS available in our MapTiler style (vector `building`
  layer with heights); three.js can render inside MapLibre via custom layers
  if ever needed. Known options, not commitments.

## Layer 1 (the first complete pass, every piece beautiful)

Minimal feature set that delivers the WHOLE experience, load → results:

1. Real live sim each run (plus the two honesty fixes: cabs that never leave
   the depot; the dead pre-shift wait).
2. The assembling entry (minimal version of the narrative above).
3. The Cyberfleet as ten permanent cards (v1 card: identity, state word,
   at-a-glance stats; the in-card world-view is the first growth feature
   after L1, explored before built).
4. The hour, legible without input (time, demand being served, city alive).
5. Results that answer ("engineering, people, energy" — economics next).

Growth after L1, each feature preceded by its own quick design exploration:
in-card world view → entry artfulness → story data (economics, Model-Y
comparison — see `plans/001`, `plans/002`) → depot as a place → deployment
(`plans/003` spike; live-on-Space).

## Process rules (how we build this)

- Mid-sized steps; discuss → build → look at it → iterate. No mega-drops.
- Decide intent at this level; leave solutions to the builder of the piece.
- Big new features get a short exploration (options, data sources, feel)
  before code. Small/confident pieces: build directly.
- The current left pane and its contents are legacy to be replaced, not
  extended. (Its known sins: monolithic box, 40%+ dead whitespace, thin
  hover-hostile rows, gold-as-wallpaper, label noise.)
- Old UI survives until each replacement piece lands (the app must always run
  end to end).

## Anchors in the current code (for the builder's orientation)

- Frontend: `src/App.tsx` (map, playback pacing, follow cam, ops data refs),
  `src/components/CybercabExperience.tsx` (the legacy pane UI to be replaced),
  `src/App.css`.
- Backend: `hf-space/app/main.py` — scenario `berlin`, ws
  `/ws/sumo/berlin/playback?...&cache=live` = real run;
  fleet param `fleet=10|30|50`; libsumo default transport.
- Local run: backend `uvicorn app.main:app --app-dir hf-space --port 7861`,
  QA build `VITE_SCENARIO_API_URL=http://127.0.0.1:7861 npx vite build` +
  `npx vite preview`. QA needs a **visible** browser window (hidden tabs are
  timer-throttled).
- Verification: `npm run check`.
