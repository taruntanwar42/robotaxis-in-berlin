# Product Vision Onion — Robotaxis in Berlin

Status: living document. Created 2026-07-05 from the onion-v2 brainstorm.
Read `PRODUCT_DECISION_LOG.md` for the raw wording behind every decision here.
Treat everything as best-guess direction, not contract — the 2026-07-05
meta-mandate: question decisions proactively, propose better, stop midway
rather than bulldoze slop.

## Purpose

The app is a portfolio piece: a beautiful, short, Tesla-specific show of
skills. The viewer is a recruiter (Tesla Giga Berlin future-talents team), one
click away from the CV, 30-60 seconds of attention, bright office. The app —
not the repo — is the whole presentation surface.

Design principles that cut across every layer:

- **All input is error.** Zero required interaction after Start; optional
  interaction may reward.
- **No disclaimer slop.** At most one elegant assumption line per estimate.
  Trust the reader.
- **Every element justifies itself.** Tesla-light / Uber-map / shadcn /
  Apple-minimal. Light mode, bright-office viewing. English.
- **20/80 onion.** Each layer independently shippable; the app is complete at
  the end of every layer.

## Layer 1 — The Watchable Shift *(shipped from 2026-07-05)*

What the viewer experiences:

1. **Open.** Bright light map of west Berlin, framed on the service area —
   the real curved union of the Charlottenburg, Moabit, and Tiergarten
   district boundaries (gold hairline outline, world outside gently dimmed).
   Depot mark near Tegel. One centered cover card: title, one sentence, one
   gold **Start the shift** button — the only input in the app. The backend
   wakes silently while the card is on screen.
2. **Run (~2 min).** Five golden Cybercabs glide smoothly (per-animation-frame
   interpolation between replay frames). Ride requests appear as a golden
   radiating pulse → hollow blinking circle → filled when a cab commits →
   gone at pickup. Thin top HUD: sim clock 18:00→19:00 + rides-served counter.
   Nothing else. No controls.
3. **Shift report.** One clean card, neutral ops grid: rides served (of total
   requests), people moved, median wait, fleet distance, empty driving share.
   "Watch again." No estimates in this layer.

Engineering shape: frontend-only; zero backend/pipeline changes. Zone asset =
`public/data/service-area.geojson` built by `scripts/build_service_area_geojson.py`
from the official Ortsteile polygons. Playback still streams over the HF Space
websocket. Report numbers come from the done-payload audit plus a client-side
accumulator (median wait). Background traffic, lanes, and signal layers exist
but ship hidden (DEV toggles remain).

## Layer 2 — Depth & Context *(next)*

End state: the same app, but it rewards curiosity and explains itself without
words.

- **Zoom reward:** zooming in fades in the micro-simulation — background
  traffic (already in the replay frames, ≤350 vehicles), road-width lane
  ribbons (meter-true widths instead of tram-line hairlines), tidy signal
  stop-bars. The "sumo-gui but beautiful" moment.
- **One scripted camera push-in** mid-run onto a pickup (the golden pulse is
  grounded in the real car: Cybercab pulses its lightbars at pickup), then
  back to wide. Zero input.
- **Demand constellation:** the evening's full demand twinkles once across the
  zone at start (demand JSON copied into the frontend bundle; no backend
  change).
- **Sourced metrics pass:** CO2-avoided and car-trips-replaced estimates,
  people/occupancy story (1-vs-2 rider trips if the OBS data supports it),
  Cybercab-vs-Model-Y line — each with a sourced constant and a written
  methodology note. Cybercab reference constants (48 kWh pack, 165 Wh/mi,
  2-seater, ~300 mi range) are logged in the decision log.

Engineering shape: still frontend-only.

## Layer 3 — The Fleet Business *(later; pipeline + sim changes)*

End state: the app answers "would this actually work?"

- **Battery truth:** state of charge per cab, charge-before-ride behavior,
  depot charging (the legacy TXL/ADAC depot XML already models a wireless
  charging station — port it). Reference behaviors from the Cybercab First
  Responders Guide (idle roaming, pull-over on fault, ODD).
- **Rollout prologue:** cabs leave the Tegel depot and take the highway into
  the corridor — "reporting for duty."
- **District-true network cut:** re-cut SUMO network with the Ortsteile union
  (+ padding) instead of the bbox; regenerate demand + replay; redeploy.
- **Fleet economics card (parking lot, decide later):** minimal payback/
  revenue stats card with sourced assumptions. A stats card, never a blog.

## Deferred / parking lot

3D Cybercab monitor panel (Tesla in-car-UI vibe) · zoomed-out marker strategy
· German translation pass (~30 min, optional) · tutorial/cover imagery from
screenshots of the finished app (always the LAST task of a layer) · fleet
economics (see Layer 3).
