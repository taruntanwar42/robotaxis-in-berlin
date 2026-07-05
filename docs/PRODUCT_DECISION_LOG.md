# Product Decision Log

This log captures user product direction for `robotaxis-in-berlin`.

Keep the user's raw language where possible. Product decisions can appear inside
brainstorming, critique, or casual feedback, not only in formal requirements.

## 2026-07-03 - Initial App Concept

Raw user language:

> the webapp loads on a map in the background, and a big message/ui window in the foreground, with the background map a bit dimmed at first. the window serves as a quick tutorial.

> it shows three pictures, explains to the user what the app is about - quickly readable 3 cards

> 1. message: Tesla Cybercabs are coming to berlin! Users in charlottenburg, mitte and moabit can hail a ride! picture: shows the active area highlighted in blue in a card pic.

> 2. message: Your Cybercab fleet is currently making it's way from the cybercab depot to serve rides between 6-9pm picture: shows golden cybercabs driving away from depot, on the highway, toward the zone, on a map, zoomed in image.

> 3. message: They will react realistically to berlin traffic and try to serve as much ride demand as they can before the shift ends. You will see how they performed at the end of the service window. Picture: shows a cybercab stopping at a red light/crossing, and some normal cars/ berlin traffic in a zoomed-in illustration

Extracted decision:

- First screen is a dimmed map with one large foreground tutorial window.
- Tutorial is three quick visual cards.
- The app should feel like a user-facing simulation/game, not an engineering dashboard.

Implementation note:

- Current minimal intro in `src/components/CybercabIntro.tsx` follows this shape.
- Final card imagery should be replaced with better generated or map-derived visuals near the end.

## 2026-07-03 - Correct Service Zones

Raw user language:

> sorry, the zones i want are charlottenburg, moabit and tiergarten- official berlin kieze

> they are neighboring zones and together they form sort of a nice rectangular-ish polygon. they're important zones in the city and the polygon they form is kinda nicely/perfectly isolated in terms of traffic, and visually too

Extracted decision:

- Service corridor is Charlottenburg + Moabit + Tiergarten.
- Do not treat Mitte as part of the service area.
- Use official Berlin boundaries as provenance, but shape the runtime around a clean, contiguous west-central service corridor.

Implementation note:

- Product copy should not say Mitte unless it is purely neighboring map context.
- Scenario/Data uses official Ortsteile provenance plus a simplified corridor derivative.

## 2026-07-03 - Depot And Fleet Contract

Raw user language:

> let's keep it where it is - it's just a visual marker and the cars will just start driving from it in the background when the user is on the tut window - they will be in the simulation area before it starts and will go back to the depot after time ends

> already there - and let's start with .. 5 cabs? to keep it simpler

> not depot choice for sure

Extracted decision:

- Depot is fixed and not user-selectable.
- Tutorial can show cabs leaving the depot.
- Actual service starts with cabs already in the service area.
- After service ends, cabs return to depot.
- Initial app uses 5 cabs.

Implementation note:

- `ROBOTAXI_FLEET_SIZE` should remain aligned with 5 for the initial app.
- Do not add depot-selection UI.

## 2026-07-03 - UI Tone: Minimal, No Slop

Raw user language:

> the thing we made is kinda sloppy. like, too much text/ too much 'honest caveats' in the ui - adding much more elements that were required.

> the threads also didnt know the exact words i used when i described the 3 cards bc they diverge a bit

> wow, thanks, the landing cards looks really great (not the images, bc we dont have em yet - we'll add them at the end when the rest of the app is built i guess, but the minimalism and no slop, very great.)

Extracted decision:

- Keep user-facing UI minimal.
- Avoid caveat-heavy copy.
- Do not expose implementation scaffolding or backend-contract disclaimers in the product UI.
- Preserve the original three-card story instead of expanding it into extra lifecycle/status blocks.
- Visual placeholders are acceptable for now; final images come later.

Implementation note:

- Do not reintroduce "Scaffold status", "backend contract", or similar caveat copy.
- Keep engineering diagnostics secondary or hidden.

## 2026-07-03 - Future Control Philosophy

Raw user language:

> maybe it's a good idea to just give the user all the controls they need right on this screen?

> remove all the ui from the current app

> at the end maybe this screen will have some parameters

> no 'look around' button - just start simulation

> actually, i think that's also wrong, i mean i do follow the philosophy of 'all input is error', so, i think we should at the end just let the sim start

> then maybe just have a small panel on the left for controlling the sim (also should avoid if we can)

> some kind of status or some ui panel would be great - before the results show up at the end, but this is all for later

Extracted decision:

- Direction is toward removing the old app UI/control-room panels from the primary experience.
- The intro screen may eventually contain the few required parameters, but the preferred direction is minimal input.
- Avoid a "look around" action in the final flow.
- Consider auto-starting the simulation after intro/on load.
- If controls are needed, keep them small and secondary, likely on the left.
- Add a simple status/progress panel before final results, but defer exact design.

Implementation note:

- Current `Look around` button is transitional and should not survive the final flow.
- Next UI milestone should make the old right-side control panel non-primary or remove it from the default user experience.

## Ongoing Logging Rule

Raw user language:

> it's gonna evolve as i brainstorm

> create a new log entry and write all the stuff i said (i think it would be best if you used my exact language, even if it's not standardized/coherent- just extract the lines where i make product decisions and log them

> my input could also be in feedback or like, you may not expect it - so always watch out when i tell you sth about the app, maybe theres a product decision in there

Extracted decision:

- Treat casual feedback and brainstorming as possible product input.
- Add a new entry here when the user makes a meaningful product decision.
- Preserve raw language first, then extract the decision and implementation note.

## 2026-07-03 - Build Loop And Decision Surfacing

Raw user language:

> ok so keep going , set yourself goal and keep building.

> display the questions you need answered/decisions you need made/ideas we should brainstorm together, and keep building in the background

Extracted decision:

- Keep implementation moving without waiting on every product uncertainty.
- Maintain a visible list of product questions, decisions needed, and brainstorm topics.
- Continue logging product direction while building.

Implementation note:

- Use product questions as non-blocking guardrails unless a decision would materially change code.
- The next implementation direction is the simplified user-facing simulation flow, not more old control-room UI polish.

## 2026-07-03 - Bottom-Up Build Gates

Raw user language:

> i think we should start from the bottommost layer, and like go in chunks/stages for the q-a, so aspirationally the previous stage would be finished implementing as we brainstorm the next one and before we start implementing it.

> what are the inputs - like, before we do anything to the app, what data is this app based on?

> ok i think i gave you enough info now. enough qa. please build the full app. use threads/subagents, write down implementation first, use redteaming, etc. keep iterating and please set a really really ambitious goal.

Extracted decision:

- Build bottom-up in gates: input data, scenario build, demand, runtime/controller, backend contract, frontend experience, QA/packaging.
- Write implementation intent before further broad coding.
- Use worker threads for implementation lanes and red-team the pipeline before treating it as complete.

Implementation note:

- See `docs/ROBOTAXIS_IN_BERLIN_IMPLEMENTATION_PLAN.md`.

## 2026-07-03 - Demand Semantics

Raw user language:

> can't some trips have 2 passengers? like, does the obs data only have 1 person - 1 trip?

> a for now, later maybe use the other ones from matsim itself, not fake-scaling ourselves

> lets just do option a for now - i think we'll have enough rides - but i think we should basically already 'clean' this data, so it doesnt show up as 'unserved demand' or sth in our app

> 1 person-trip = one Cybercab request/person in v1 ... yes

Extracted decision:

- V1 treats one MATSim/OBS person-trip as one Cybercab request/person.
- Use `car + ride` modes for Cybercab demand.
- `ride` is a car-passenger person trip, not reconstructed group/party size.
- Use the current 1% extract as-is; do not fake-scale demand.
- Origin and destination must both be inside the service corridor.
- Bad SUMO edge matches are rejected from runtime demand and kept in QA/reject metadata, not shown as user-facing unserved demand.

Implementation note:

- Do not claim true shared-party reconstruction unless the source structure is later verified and implemented.
- Later results can discuss replaced car trips, CO2, parking, or traffic estimates only with explicit assumptions.

## 2026-07-03 - Runtime And Contract Direction

Raw user language:

> a for now for simplicity, anything else would be added later

> c - i want it to me more realistic, like, yeah, like the way they would do it irl.

> b. 10 mins.

> yep, they finish up in a few minutes

> rides served

> we need to know what the cab is doing, exactly, like the speed, if its stopped, why its stopped, if its going to the passenger, waiting for them, just roaming around, parked or yk whatever whatever

> live panel at top, list of 5 cabss with their status in the middle, total accrued until that point at bottom - these three panels in one ui window/pane

> requests appear as blinking hollow black circles - they become black holes (filled ) if accepted by cybercab

> both

Extracted decision:

- At 18:00, the five Cybercabs start staged at useful service-area positions.
- Dispatch should be realistic/optimized where practical, not a trivial first-available queue.
- Request expiry is 10 minutes.
- At 21:00, stop assigning new rides, finish active rides, then return to depot.
- Ignore charging/battery in v1.
- User-facing metric label is `Rides served`.
- Default user UI can show a compact simulation pane with live counts, five cab rows, and accumulated totals.
- Cab rows should include both human labels and live details such as speed, ETA, stop reason, target, and request context.
- Request markers should appear as blinking hollow black circles when open and filled black circles once accepted.

Implementation note:

- Backend contract should emit raw fields and display-ready labels. Frontend must not infer authoritative metrics or invent vehicle motion.

## 2026-07-04 - Playback Pacing And Experimental Status

Raw user language:

> actually a), but i think we could cut the duration from 3 hours down to sth more sensible -- resulting in sth more like c.

> or maybe we could do so that it plays at 10x or so at first and then speeds up automatically after observer has had a few secs to look at it -- maybe with 10x, 100x, 1000x buttons or sth like this, idk. (i guess it would speed up automatically but then the buttons would glow or sth and like, show a tiny message about speedup -- this is a risky approach, bc i believe in the philosophy of 'all input is error', but maybe this is the best way for our app?)

> -- maybe accompanied by a scrubber/timeline at the bottom of the screen

> (pls treat the current ui and actually the whole app as tentative/just experimental explorations, far far away from a polished product)

Extracted decision:

- Target run length is roughly the watchable-but-short range (between option A ~2-3 min and option C ~30-60s).
- Candidate mechanisms, not yet locked: shorter simulated window; or auto-ramping playback speed starting near 10x then speeding up after the observer has a few seconds to look, with 10x/100x/1000x buttons that glow plus a tiny speedup message.
- A bottom scrubber/timeline is a candidate companion control.
- User acknowledges speed buttons strain the "all input is error" philosophy but may be the right tradeoff here.
- Treat the entire current UI/app as tentative experimental exploration, not a polished product to preserve.

Implementation note:

- Pacing is a frontend frame-scheduling concern over the existing replay; no SUMO recompute needed for speed changes.
- Do not lock the pacing mechanism until the design discussion resolves window length vs auto-ramp vs manual speeds.

## 2026-07-04 - Locked: One-Hour Window At Constant Watchable Speed

Raw user language:

> a

(Choosing: shorten window to 1 hour, e.g. 18:00-19:00, constant ~40x, ~90 second run, uniformly watchable, zero controls.)

Extracted decision:

- Service window shrinks from 18:00-21:00 to a one-hour window (18:00-19:00).
- Playback is one constant watchable speed (~40x target, tune by feel).
- No speed buttons, no scrubber, no auto-ramp: "all input is error" stands.
- Expected scale: roughly 90 requests demand, roughly 29 rides served by 5 cabs.

Implementation note:

- Requires demand extract regen for 64800-68400, replay cache regen, contract
  window/cutoff updates (assignment cutoff proportionally, e.g. 18:50), and doc
  updates. Old 3h artifacts become legacy.

## 2026-07-05 - Overnight Cleanup Mandate

Raw user language:

> i think you can set yourself a goal to clean the code, write the docs, see that the folder is in good shape generally and that it is lean and clean -- most importantly, that the design decisions stay

Extracted decision:

- Repo hygiene matters: docs current, folder lean, code clean.
- Preserving logged design decisions outranks all cleanup; cleanup must never
  erase or contradict a recorded product decision.

Implementation note:

- Reconcile stale docs (AGENTS.md, ROBOTAXI_HANDOFF.md, DATA.md,
  ROBOTAXI_DRT_ARCHITECTURE.md) with the shipped v1 watchable-run contract.
- Keep behavior-affecting refactors out of unattended cleanup passes.

## 2026-07-04 - Locked: No Depot Rollout Sequence In V1

Raw user language:

> a

(Choosing: skip the visible depot rollout for v1; card art tells the depot
story, the run starts with cabs already staged in the corridor.)

Extracted decision:

- V1 does not show cabs driving from the depot, neither behind the tutorial nor
  as a prologue segment.
- Tutorial card 2 remains the only depot-rollout storytelling in v1.
- A real rollout sequence may return later with the final imagery pass.

## 2026-07-05 - Tutorial Card Imagery Still Deferred

Raw user language:

> Skip for now

(AskUserQuestion selection while approving the land-v1 plan; options were
inline SVG illustrations, real map screenshots, polishing the CSS visuals, or
skipping.)

Extracted decision:

- Final tutorial-card imagery remains the open v1 item; the pure-CSS
  StoryVisual diagrams stay in place for now.
- This session's scope is landing the working set: commit, push, and redeploy
  both targets, with no imagery work.
