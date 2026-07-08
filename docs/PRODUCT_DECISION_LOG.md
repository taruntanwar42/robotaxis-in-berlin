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

## 2026-07-05 - Current Frontend Is Acknowledged Throwaway; Full Redesign Ahead

Raw user language:

> i think the photos can only be added to the tut cards after the app has actually been made, right. like we obv can take screenshots of it before that.

> about the actual app, i think it's kinda rough rn, like we just started mostly, but it's like, kind of unusable, cluttered slop rn (and thats ok bc it has been an experiment/exploration until now) -- it doesnt even open on the right viewport and the ui is definitely compeletely random stuff that codex added (i did the exploration with codex before yesternight)

Extracted decision:

- Current frontend has no precedent value; full UI redesign is in scope.
- Tutorial-card imagery is sequenced LAST: screenshots of the finished app.
- Backend/sim/replay contract is not in question.

## 2026-07-05 - The Viewer And The Purpose

Raw user language:

> the viewer is the recruiter from the future talents team of tesla giga berlin. i'm applying to a duales studium program.

> the main thing to note here is that it's a beautiful, short tesla specific show of skills.

(Context: CV links the app; CV line promises "Simulation einer Cybercab-Flotte
im Berliner Stadtverkehr mit Auswertung zentraler Kennzahlen". Program: TH
Wildau Mobilitaet Umwelt Logistik B.Sc., practice site Giga Berlin, start Sep
2026; per mentor conversation the program is becoming data-science/AI oriented
even though the posted description is outdated.)

Extracted decision:

- Design north star: one uninterrupted, self-explanatory, impressive ~2-minute
  experience for a first-time viewer with 30-60s of attention who will not
  read docs or touch controls.
- The end-of-run Kennzahlen surface must visibly fulfill the CV's plural
  "zentrale Kennzahlen" claim.

## 2026-07-05 - Running Assumption: Nobody Looks At The Repo

Raw user language:

> no, the recruiter/technical person won't look at the github, they dont care, we are only building the app, and the code/commits/log whatever, is only our shit, we dont need to be thinking about this, we are runnin on this assumption

Extracted decision:

- All presentation effort goes into the app itself. Repo hygiene, commits,
  docs, and this log exist only for our own working process; never a design
  consideration for the audience.

## 2026-07-05 - Metrics Tiers: 1 And 2 Now, 3 Later

Raw user language:

> yeah i agree with the intro cards and tier 1 and 2 is what we do rn. tier 3 for later expansion.

> in the final version, i think the cybercab battery and how many people per ride, that kind of stuff is gonna be very important - hopefully at the end we can also show like, how much environmental effect we had (emissions, less cars, etc -- and i think the safety profile is also a very strong point, i think we can show estimates for all our metrics for what a real cybercab fleet could do (like if we just multiplied our cab and traffic numbers by a bigger number - our trips are already like a sample from a simulation of real berlin traffic which is approximately true (the OBS))

Extracted decision:

- Tier 1 (now, from replay data): rides served, wait times, km driven,
  empty-km share, passengers moved.
- Tier 2 (now, derived frontend estimates): emissions saved, private cars
  replaced, scaled-to-Berlin extrapolation (defensible: demand is a 1% sample
  of the calibrated MATSim Open Berlin Scenario). One clean assumption line,
  never caveat-heavy copy.
- Tier 3 (v2, needs sim changes): battery/charging, per-ride occupancy or
  pooling. The Cybercab First Responders Guide details the user pasted (idle
  roaming, charge-before-ride threshold, pull-over on fault, ODD) serve as the
  reference spec for v2 fleet behavior.
- Safety metric: weakest sourcing; one carefully-sourced line or drop from v1.

## 2026-07-05 - Locked: Build In English

Raw user language:

> language- english. we build in english. translation will take 30 mins at the end, or we leave it in english, either way, english, fully, during building.

Extracted decision:

- All UI copy in English during the entire build. German translation is an
  optional short pass at the very end, possibly skipped.

## 2026-07-05 - Viewport Framing Is A Layout Decision

Raw user language:

> viewport is just that the map is not centered and zoomed properly, like its kinda on the lower side of the screen (doesnthave to be in the center, i guess where we put the ui will decide the rollout zone positioning later) -- but rn even the cluttery ui that exists there covers a portion of it by defaualt

Extracted decision:

- Initial camera must frame the corridor cleanly with the final UI layout's
  safe areas in mind; panel placement and camera framing are decided together.
- No UI chrome may cover the active corridor by default.

## 2026-07-05 - Visual Language: Tesla Light / Uber / Shadcn / Apple-Minimal

Raw user language:

> i wanna keep the UI light mode, not 'tesla dark' as u said, tesla light. the viewer will view it in a bright office in the morning/afternoon.

> i think the end ui should look sth like the Uber app yk, simple line based sort of ui yk. like shadcn kinda.

> the ui can be like, reimagined as a bright, minimalist, no clutter/as few text, but very clear, as possible, everything is there for a reason. all small elements, everything. thoughtful minimalist design, like apple yk.

> maybe some like, golden blinking/radiating circles on the map or like some nice ui yk

Extracted decision:

- Light mode, definitively. Bright-office viewing context.
- Reference points: Tesla in-car UI, Uber app map UI, shadcn aesthetic,
  Apple-grade minimalism. Line-based, small, deliberate elements.
- Every element must justify its existence.
- Golden pulse/radiating circles are welcome as tasteful map event markers.

## 2026-07-05 - Cab Rendering: Real Scale, Real Sprite, Smooth Motion

Raw user language:

> the cybercabs look toylike now, the previous sprite was based (at least if codex created it harmoniously) on a 3d model of the cybercab i found online, this one: https://sketchfab.com/3d-models/cybercab-tesla-car-97bc28545418491888ea3ffc96995292

> the map waypoints/paths are kinda broken, also the cars themselves are. like, the robotaxis are not only bad looking but also very big. and the normal cars are kinda small

> the waypoints and circles sorta update in an interval rn, i think every 1 sec or sth, not continuous enough by a long shot, like not live at all, more like random glitching

> i think maybe the cars should be fixed size, like about the width of a lane or so, yk, like only visible when zoomed in, maybe, seems like the best starting point. then we could iterate on how to make them visible when zoomed out, that would be my idea - bc building sized robotaxis, when zoomed out, is a shortcut for now but does look odd - even tho maybe we end up with sth similar in some part of app, maybe on main map, like in uber app or sth yk

Extracted decision:

- Vehicle motion must be smooth/continuous: interpolate between the 1-sim-sec
  replay frames instead of snapping (current snap reads as "random glitching").
- Cybercab marker: quality sprite derived from the Sketchfab Cybercab model.
- Vehicles rendered at roughly true scale (~lane width), naturally visible
  when zoomed in; zoomed-out marker strategy is a later iteration.

## 2026-07-05 - V1 Shows Only Robotaxis

Raw user language:

> also i think good idea to only show robotaxis for now and focus on getting the map/app built right visually before we add in the dozens or more of traffic vehicles, yeah i think that would simplify and help us focus on the core task

> also the lanes and the traffic lights could be more polished/better, its not really like sumo gui 3d, i mean i think it can be better than that but its like a little broken version of that rn

Extracted decision:

- Redesigned v1 renders only the 5 robotaxis plus request/stop markers;
  background traffic hidden until the core visual is right.
- Lane/traffic-light rendering: polish or simplify away; current state is a
  broken middle ground. Aim is clarity, not sumo-gui imitation.

## 2026-07-05 - 3D Dispatch/Monitor Panel (Idea, Not V1-Blocking)

Raw user language:

> i guess maybe we could even do sth a little cool and 3d in the final version, maybe in the dispatch/robotaxi monitor part of the ui yk, viewing what the cabs are doing or sth, idk -- would be very tesla- like, like their in car ui yk that lets u see whats happening, just a cool idea -- i love visual design stuff.

Extracted decision:

- Candidate for the final version: a 3D cab-view "monitor" panel, Tesla
  in-car-UI-like. Logged as aspiration, not v1 scope.

## 2026-07-05 - Anti-Disclaimer Stance Reaffirmed (Stronger)

Raw user language:

> one thing that kept codex back from this was that they kept adding slop text in order to try to be 'honest' -- they were worried that the reader may not understand that this is a simulation and like, these are not confirmed real cybercab values or like, a real research-level sim and the estimates are not made by einstein and yk , and i just want to make like a small beautiful app, and the human reader will definitely know that they're looking at a student app thats built by someone with understanding of the tesla design langauge and products and rollout/robotaxi importance/future direction -- they wont be looking to critique on the scientific methodology or be somehow fooled into thinking that the product does sth that it does actually not

Extracted decision:

- Zero defensive disclaimer copy anywhere in the app. Estimates get at most
  one elegant assumption line. Trust the reader.

## 2026-07-05 - This Log Is Also A Personal Record

Raw user language:

> i hope you're like, using my exact wording and saving as much of it in some sort of document -- and also what you think it means, in extensive length

> my wording (and yours) is also for motivation haha. like when i make it, i would like to do sm kinda therapy or reflect about this yk, this is one of the most importatnt stesp in my life

Extracted decision:

- Keep preserving raw wording faithfully, unsanitized; the log doubles as a
  personal record of this period, not only a product artifact.

## 2026-07-05 - Meta-Mandate: Decisions Are Guesses, Creative Freedom Granted

Raw user language:

> i wanna emphasize x100, the most important thing in this message that i forgot to emphasize in last message, is that all these decisions are just sort of best guesses or like, idk if its the ideal choice -- so like the whole app, dynamics, what it does, how it feels, what the simulation even is, etc, all questions are still completely open and i encourage your creative input on them and would like to make a beautiful app based on this, like u have full creative freedom to actually make this a good app yk, pls dont try to make/fit in an app that may have said that i want, but you can think of/ feel that the actual app we would wanna make, a more beautiful/modern and minimal/decluttered and meaningful/working one, would be imaginable and prefferable, so u can always just make that instead of sticking to a stupid decision, by proactively questioning, suggesting nice stuff, and like making sensible decisions from your side and maybe even stopping midway instead of bulldozing slop yk

Extracted decision:

- This log records direction, not contracts. Agents should treat entries as
  best guesses, question them proactively, and propose better alternatives
  rather than literal-minded compliance. Stopping midway beats bulldozing slop.

## 2026-07-05 - Skew Hack Origin And The Real Zone Intent

Raw user language:

> the skew was actually bc the app originally used the a cutout from the sumo best data source as the rollout zone - and that was a square on the map -- but it appeared a bit tilted on the maplibre map ... so anyway, we skewed the canvas to fix that slight square-oddity. but we dont use that sumo best cutout anymore.

> fundamentally, codex didnt understand that i wanted the rollout area to be made from a cutout of charlottenburg, moabit and tiergarten ... codex just made a rectangle cutout iirc -- whereas the area was chosen by me specifically bc the roads sort of have a nice separation (visually and i think geographically, and in terms of sumo edges) from the rest of the surroundings

> the cybercab depot to be placed at or around the old berlin tegel airport, bc like, then we could show them driving on the highway 'for duty' yk, like a commute haha, and also, like, tegel has some parking lots kinda stuff and already some car/truck fleets or sth like this, seemed like a natural area

Extracted decision:

- Intended service-area visual = true district-boundary cutout (the curves),
  not a bbox. Verified in code: network cut and drawn zone are both a padded
  bbox; the official Ortsteile polygons exist in-repo but are unused.
- Depot at/near old Tegel airport is intentional storytelling (highway
  "commute to duty") and practical (parking lots, existing fleets). Current
  depot edge 8036812#2 is already in the TXL area — placement stands.
- CSS rotate(1.3deg) canvas skew = obsolete patch for the abandoned BeST
  square cutout; delete.

## 2026-07-05 - Lanes And Traffic Lights: Valuable, Zoom-Gated, Fix Rendering

Raw user language:

> lanes and traffic lights are a great thing in sumo/sumo gui i think, they help see the driving behavior very well. but in the old app the lanes are kinda not really as wide as the streets ... they look like tram lines with cars on them ... the traffic lights are also very impressive feature, implemented kind of correctly rn i think ... but they're kinda weirdly rendered, like sometimes theyre maybe rotated lines or sth

> maybe this should be only visible on zooming in ... so like, to save on performance - like when you zoom in, you see the whole traffic, the lights, the lanes, the micro sim for that viewport ... and more likely on the decluttering/good focus on the zoomed out view. as you like.

Extracted decision:

- Lanes/traffic lights/background traffic stay in the product as a zoom-in
  reward (micro-sim detail), hidden in the decluttered zoomed-out view.
- Lane rendering should read as road-width surfaces, not tram lines; traffic
  light stop-bars need a rendering pass.

## 2026-07-05 - Onboarding Cards No Longer Locked

Raw user language:

> ui -- i have no real idea, i just think the 3 cards at the beginning may be a good idea, but dunno for sure, maybe 2-3 tooltips is a better idea - maybe none of this, idk. i'm just winging it tbh.

Extracted decision:

- Intro treatment is open: cards, tooltips, or nothing. Decide by feel during
  the redesign.

## 2026-07-05 - Zones/Flows Exploration Direction

Raw user language:

> one thing i have thats maybe nice/worth exploring is that of 'zones' or 'flows' since theyre very relevant to tesla and the application, and i think some opportunities for traffic flow/like, how much congestion on road segments maybe, is in the simulation data ... worth exploring and thinking about deeply i think - for maybe demand zones or sth like this, and maybe showing traffic instead of many cards on the final app

Extracted decision:

- Demand zones / congestion / flow visuals are a named exploration direction,
  potentially replacing narrative chrome ("showing traffic instead of cards").

## 2026-07-05 - Onion Approach; This Chat Ships One Layer

Raw user language:

> i think we should definitely take an onion approach to building/our scope here. all of this is def not possible in this app. and probably main focus should be to make all the layers of the onion with their exploration directions (potential) and already made decisions (and possible changes in strategy) and writing that all down coherently -- and then maybe making the core 1 or 2 layers of the onion (i think 20% effort will get us to 80% of the result) in this chat

> we want as few layers as possible, and realistically, i think only 1 layer will be verfügbar in this chat, bc the context will be crazy long. so, i wanna think about exact ui deliverable descriptions, backend/coding short summaries, etc and maybe lets do a q-a and finish a basic direction/shape of the app for each layer of the onion (keeping everything minimal - number of total layers, etc and trying to get to deliverable app asap)

Extracted decision:

- Onion structure with minimal layer count; each layer described as an exact
  UI deliverable plus a short coding summary. This chat targets Layer 1 only.
- Shape/direction Q&A first; implementation details discussed separately.

## 2026-07-05 - Metrics Need Sourced Assumptions

Raw user language:

> i think we may need to make some assumptions on the metrics we wanna show and probably need to source some data and confirm assumptions (that i havent already pasted here) / methodology to get the numbers/metrics (that are also to be decided what exactly they gonna be, as of yet)

Extracted decision:

- Exact metric set is still open; every shown estimate needs a sourced
  constant and a written methodology before it ships.

Reference — Cybercab spec details pasted by user as "trustable assumptions"
(2026-07-05): 48 kWh structural pack (4680), 165 Wh/mi efficiency, FWD 163 kW,
3118 lbs, ~300 mi real-world range, 2-seater with butterfly doors, no steering
wheel/pedals, gold wheel covers, "Cybercab" door/trunk decals, charge port on
rear bumper below trunk, pulses front/rear lightbars when picking up
passengers, ~21" display, wheelchair-height seats, 10 airbags, Active Hood,
color-injected panels (no paint shop), unboxed manufacturing target cycle time
under 10 s, exterior mics/speaker for first responders, braille on key door
handles.

## 2026-07-05 - Service-Area Inclusion Semantics (Recalled Rationale)

Raw user language:

> i think the shape/cutout of the service area may be harder than expected ... until now i think the sumo edges which go thru the boundary are included, since it's better than having the cars sometimes go a little out of the zone on one single road for a few meters than having luecken inside our service area - and as for the trips/people, i think we only includedd the ones that were starting and ending inside the zone

Extracted decision:

- Edge inclusion errs generous (boundary-crossing edges in; no gaps inside the
  zone); trip inclusion errs strict (origin AND destination inside). Preserve
  these semantics through any future zone-shape changes.

## 2026-07-05 - OBS-Because-People; People Metrics; Model Y Comparison Idea

Raw user language:

> the whole reason we use the obs data instead of best (which is derived from obs) is bc it has people in it and is like, the actual simulation -- so i think it would be like cool at the end of the app to concretely show metrics about how many people took robotaxis (also idk if any 'trips (ie route travelled by 2 or more people i guess ...) at the same time/'together' in the obs sim -- i heard that its 2 seater bc around 90% trips on uber for ex. are 1 or 2 people, so like maybe it would be cool to compare cybercab to a normal model y and see the metrics yk, idk.

Extracted decision:

- End-of-run metrics should speak in people, not only rides — the OBS choice
  exists because it simulates persons.
- Research items: whether OBS contains co-travelling person-trips (2+ together);
  Cybercab (2-seat) vs Model Y comparison framing.

## 2026-07-05 - Fleet Economics Card (Wanted, Unsure, Minimal If Present)

Raw user language:

> maybe the end direction for the app is like, if a private person deploys a fleet, with the cybercab costing x dollars/euros/whatever, and then it costs like this, demand is like this, or whatever yk, and then theyd be able to pay it off like this, make this much money with these prices, whatever -- but i presume thats for later ig, but i wanna have it yk, idk if its a good idea tho - should be a simple stats card or like minimal if it is there at the end tho ig, not like a full blog or sth yk haha

Extracted decision:

- Fleet-economics ("would a private fleet pay off") is a desired later
  direction, expressly minimal if built: a simple stats card, never a blog.

## 2026-07-05 - Locked: Layer 1 Shape (Onion v2)

Raw user language:

> One cover card + Start / Ops KPIs only / Neutral ops grid / Parking lot, decide later

(AskUserQuestion selections settling the Layer 1 "Watchable Shift" shape.)

Extracted decision:

- Opening = single cover card (title + one sentence + gold Start, the app's
  only input) over the framed map; backend wakes during the card. The 3-card
  intro concept is retired from Layer 1.
- Layer 1 Shift Report = simulation-derived ops KPIs only (rides served,
  people moved, median wait, fleet distance, empty-km share). CO2/cars-replaced
  estimates move to Layer 2 behind a proper sourcing/methodology pass.
- Report presentation = neutral KPI grid, no editorial headline.
- Fleet economics = parking lot; in the log, in no layer, revisit after
  Layer 1 ships.
- Onion v2 (3 layers): L1 Watchable Shift (this chat, frontend-only), L2
  Depth & Context (zoom micro-sim, demand constellation, scripted push-in,
  sourced people/impact metrics), L3 Fleet Business (charging + rollout
  prologue + district-true re-cut + economics card).

## 2026-07-05 - Layer 1 First QA Verdict (Screenshot Review)

Raw user language:

> cover: yeah i guess it's an ok start.

> zone: idk what shapely is supposed to mean here, but that is really like, jagged yk. those boundaries are different from what i saw on google maps, and not very good shape at all ... i guess i will need to see how the boundaries look, if theyre right or wrong or like maybe we need different file or idk. later. also the zone is just an overlay, not actually the zone the app is using. lol. idk if we meant to do it like this, but ok. like, we want the data from sumo and obs to be sourced from the zone too yk haha. rn the cabs have requests and go freely outside the zone lol.

> Motion: it's fine but theres no destination lines and stuff yet, and the circles are just blinking mess.

> cabs: i dont really see a difference tbh, this sprite looks like an ovan bean tbh, like a rice grain. the one codex was using was so much better, i think you didnt even really look at the model i gave you, anyways. sadge. it looks like worms moving around a spoiled fruit. not like futuristic cars responding to roads or sth.

> i think it's an ok job for layer 1 -- not really amazing quality, but i think you tried hard. thanks

Extracted decision:

- Zone shape unresolved: rendered union is jagged and has a visible hole
  around Hansaviertel (its own Ortsteil, not in the 3-district union) — the
  polygon source/composition needs review; possibly different file or added
  Ortsteile, plus stronger smoothing.
- Zone must eventually be the REAL data boundary (SUMO cut + demand filter),
  not just a visual overlay; cabs/requests currently roam outside it. The
  district-true re-cut moves up in priority from "someday Layer 3".
- Destination lines (request/route paths) are wanted in the run view; do not
  ship hidden.
- Request circles read as "blinking mess" — lifecycle visuals need calmer
  design.
- Cybercab sprite rejected ("oval bean/rice grain"): must be built from the
  actual Sketchfab model reference (or restore/iterate on the previous Codex
  sprite from git history), not drawn from imagination.
- Overall verdict: acceptable Layer 1 start, quality bar not yet met.

## 2026-07-06 - Submission Day Reset: App Broken, Order of Work

Raw user language:

> ok so, look, the whole app is actually more or less broken rn actually, like this is not submittable at all, and i need to submit today :') -- and even building layer 3 will not actually fix the app, since what we have rn is broken.

> the app opens with 3 cards - do you remmeber their idea? we can make the images at the end bc we need the map for that. so, this is the intro. then, the app opens. so, the map/core app is almost completely broken rn, so that needs to be fixed. then, we need to make some actual ui yk. not the intro card, but some ui. it's supposed to be a dispatch app/sim yk, not a video playback or sth. we need cab status, etc, like stuff yk. anyways, then the metrics etc at last i guess.

> i think firstly we should start with the data today. so, first question, do u know what are the inputs for this app? like, before we even make any slop on top of it lol. just like, what are the sources yk

Extracted decision:

- DEADLINE: submission is TODAY (2026-07-06). Everything prioritized against that.
- Current app state judged broken / not submittable; adding layers on top will
  not fix it — core must be repaired first.
- Intro = 3 cards again (reverses the 2026-07-05 "single cover card" lock).
  Card imagery = screenshots of the finished app, made LAST.
- App must read as a dispatch app/simulation, not a video playback: real UI
  with cab status and similar operational elements, beyond the intro cards.
- Order of work today: (1) data/inputs first, (2) fix broken map/core,
  (3) build actual dispatch UI, (4) metrics last.

Implementation note:

- Data sources confirmed: BeST Berlin SUMO net (corridor cut), ALKIS Ortsteile
  WFS polygons (Hansaviertel missing -> zone hole), MATSim Open Berlin v6.4 1%
  demand (car+ride 18:00-19:00, 119 requests), BeST background routes, recorded
  SUMO/TraCI replay cache streamed from HF Space, MapTiler basemap.

## 2026-07-06 - First-Principles Reset: Real-Cybercab Realism, View Decides Everything

Raw user language:

> as for real cybercabs, they serve an area about the size of the moabit kiez i think, like smaller than our current area -- at the least (just guesstimate from some stuff ive seen on internet, ~80% accuracy estimate, good enough) -big? idk, probably a large area, probably not more than 2-3x larger than our current cutout, bc at that point it would like half of berlin and berlin is large.

> also, time- i think 6 am to 2 am (so 2-6am off duty), i remember reading. not sure about how they charge, how far the depots are, etc. or how they roam between trips etc. but i think they prolly do roam and also park when off trip, not just return to depot yk. and this is useful bc ideally the app shouldnt have like, just one request after another being fulfilled by the cabs, bc it just looks like a prerecorded thing yk.

> i think i kinda want like, nice demand generation (random selection or like yk, not always the same maybe) and then reaction to that , like how cabs react to trips, etc. but anyway, this is for later.

> i think both sumo and matsim have drt or sth like taxi or like a dispatch kinda thing. sumo and maybe even matsim even had like evs and stuff, idk.

> temporal - idk, like, both geographic, temporal, and fleet, this all depends on like what we want the app to be at the end, like what will the view actually be? bc that also decides everything else yk.

Extracted decision:

- Sample: assume 1pct for now, revisit later if needed.
- Realism anchor = real robotaxi deployments: service zone between "Moabit Kiez size"
  and ~2-3x current corridor; service hours ~06:00-02:00 (02-06 off duty); cabs roam
  and park curbside between trips, not depot-ping-pong.
- Anti-goal: app must not read as "one request after another fulfilled" — visible idle/
  roaming/parked cab behavior is part of the product.
- Wanted later (parking lot): stochastic demand generation (varying request selection
  per run) + visible cab reaction, so runs differ.
- Design order: decide the END VIEW first; geography, temporal window, and fleet size
  all derive from it.

Implementation note:

- SUMO has device.taxi (dispatch: greedy/greedyShared/traci) — we already use it via
  TraCI. MATSim has a full DRT module (rebalancing, used in real ridepooling studies)
  and an EV/charging module; SUMO has battery device + charging stations. EV/charging
  = candidate for the "slice of archetype 5" energy layer.

## 2026-07-06 - Locked: 1-Hour Slice; Sim Controller Box Later; Bandwidth Concern

Raw user language:

> we will do 1 hour slice temporally bc 30 mins would probably be too short and 2 hours doesnt really offer any practical benefits over 1 i think.

> btw, is 104mb the amount of data transmitted from backend to frontend for 1 hr? like, maybe the recruiter doesnt have fast internet idk.

> actually i think later we can add the option to choose the timeframe and speed in a little sim controller ui box i guess, with the start simulation button sort of glowing or like, being annotated to start or sth yk. so normal behaviour would be to just start at default settings (60 min 30x or whatever, we'll decide later).

Extracted decision:

- Temporal window locked: 1-hour slice (30 min too short, 2 h no practical benefit).
- (Rejected: full-day demand-curve chart as macro context — "no thats dumb".)
- Later feature: small sim-controller UI box (timeframe + speed selection), Start
  Simulation button glowing/annotated; default behavior = start at defaults
  (~60 min, ~30x, exact numbers decided later).
- Payload size to recruiter matters — assume slow internet possible.

Implementation note:

- Measured: replay cache = 108 MB gzip on disk, 490 MB decompressed JSON over
  websocket. Frame autopsy: ~81 KB/frame, of which trafficLights 31 KB + dispatch
  45 KB = 94%; what the UI actually renders (mapVehicles, cabRows, requests, totals)
  is ~4-5 KB/frame. Slimmed public replay ~= 20-25 MB raw / few MB gzipped. Must slim
  during rebuild.

## 2026-07-06 - Reference Pasted: Real Cybercab/Robotaxi 2026 Facts (Batman Garage article)

Raw user language:

> some random info i wanna paste in here [article: "Tesla Robotaxi and Cybercab - Inside the 2026 Rollout", Batman Garage, 2026-06-21]

Extracted reference facts (supersede earlier guessed specs):

- Cybercab EPA-certified, in production Giga Texas since ~April 2026. Two-seat, no
  wheel/pedals, butterfly doors, front single PM motor ~163 kW, FWD.
- Battery 47.6 kWh (not 48); efficiency 165 Wh/mile (most efficient EV certified);
  real-world range ~293 mi (~472 km); curb ~1,412 kg; wireless inductive charging
  expected; target price <$30k unconfirmed.
- Service: Austin + Dallas + Houston, mid-2026. Austin geofence ~245 sq mi (~635 km²),
  grown >10x from launch — so launch-era zone was ~60 km²-ish; Dallas/Houston launched
  with smaller tight geofences. Live driverless fleet ~20-42 vehicles total.
- Safety: 4 months no at-fault FSD collision per NHTSA data; SAE Level 4 self-certified.
- No meaningful Robotaxi revenue expected before 2027.

Implementation note:

- Our zone (24 km², 10-12 cabs) sits believably at "launch-day zone" scale; real fleet
  sizes (dozens citywide) make 10-12 cabs per launch zone realistic.
- Update battery constants: 47.6 kWh, 165 Wh/mile, ~472 km range — for the energy/
  charging slice (archetype 5).

## 2026-07-06 - Locked: Zone = Corridor Envelope Rectangle (Visual = Data)

Raw user language:

> ok so rn the polygon is actually still the previous 'cleaned rectangle' zone, right - u previously just overlayed the new borders on it in a previous chat, so maybe let's just restore that square and call it a decision. now just the actual map visuals, ui, and demand generation/response remain, maybe

Extracted decision:

- Service zone = the padded-bbox "cleaned rectangle" (corridor envelope), as both the
  drawn zone AND the data boundary. The curvy Ortsteile-union overlay is retired.
- This dissolves the Hansaviertel-hole problem (bbox covers it) and makes visual zone
  = SUMO cut = demand filter, all one truth.
- Remaining scope after this: map visuals, UI, demand generation/response.

Implementation note:

- Demand extraction ALREADY filters by the envelope rectangle; SUMO net already cut
  from it. So zero pipeline rework for the zone — only frontend swaps curvy geojson
  for the envelope rectangle (fallback path already exists).

## 2026-07-06 - Locked: Map Layers On, Codex Sprite Back, Uber-Like Paths; Build Green Light

Raw user language:

> um, so will u implement roam/parking/whatever using sumo taxi or like how -- like u know where the cars can park on the sumo edges, etc? also, btw pls turn on lanes and traffic lights -- make sure the traffic cars are also on, and a static size. probably only clearly visible when zoomed in. also, use codex sprite, idk if it still exists, it prolly doesnt actually. but idk. it's prolly the same size as the current traffic cars yk -and looks GOOD. pls make the taxis have correct paths, like nice uber-app like pickup, etc. make good ui, etc. i think what you refer to as 'dispatch bloat' may be useful code yk. but your choice i guess.

Extracted decision:

- Lanes + traffic lights rendered ON. Background traffic cars ON, static (real-world)
  size, naturally only clearly visible when zoomed in.
- Cybercab sprite: restore the previous Codex sprite (createCybercabMarkerImage,
  recoverable at git 87fc3ce^:src/App.tsx:1482) — same scale as traffic cars, "looks GOOD".
- Taxi route paths visible and correct: Uber-app-like pickup/dropoff path presentation.
- Good UI (dispatch app feel) — design freedom granted within earlier Tesla-light refs.
- Replay slimming = my choice, but don't discard useful dispatch data the UI needs
  (user flags it "may be useful").

Implementation note:

- Idle behavior via SUMO device.taxi idle-algorithm (stop = curbside park,
  randomCircling = roam) + possible TraCI nudges; parking uses lane-level stops
  (mechanism already proven by depot-return fallback). Will test and pick what
  looks right. Fleet 10 assumed. Build starts now.

## 2026-07-06 - Build Session Findings: Depot Ping-Pong Root Cause, Fleet Saturation Math

(Agent findings during the submission-day rebuild, logged for the record.)

- ROOT CAUSE of the "prerecorded / one request after another" feel: the dispatcher sent
  every cab below 88% battery (the ready-charge threshold) back to the TXL depot whenever
  it had no feasible request. Cabs commuted to Tegel all shift (62% deadhead, 500s avg
  wait). Fixed: mid-shift depot return now only below the low-battery reserve (12 kWh).
- Saturation math at 1pct: ride cycle ~14 min (pickup drive ~320s + 2x60s holds + trip)
  means 10 cabs serve ~43 rides/h. 70+ requests/h oversaturates the fleet: long queues,
  expiries, and 18:50-cutoff rejections. Rebalanced: pickup/dropoff hold 30s, demand
  seeds recalibrated to ~52 requests/h (car/ride 25%, pt 12%, bike 6%, walk 3.5%
  adoption), post-shift depot-recovery cap raised to 1500s so the full fleet gets home.
- Replay slimming results: legacy cache 108 MB gz / 490 MB wire; slim format = TL deltas,
  request lifecycle events, compact background-vehicle arrays (capped 180), route
  polylines only on change = ~17.5 MB gz / ~85 MB raw per seed. Largest remaining chunks:
  TL deltas 38%, background traffic 28%.
- Cybercab battery constants updated to EPA reality (47.6 kWh, 102.5 Wh/km).
- Intro copy drafted (3 cards): "Robotaxis in Berlin" / "Built on Berlin's own data"
  (SUMO + MATSim credit) / "18:00. Ten cabs. One hour." — images deferred, slots ready.

## 2026-07-06 - QA Verdict on Rebuilt App (v2 watch-through)

Raw user language:

> hmm, it's annoying that the 'cards' are just one element that can be scrolled by clicking the dots, which are very small and hard to click. i mean, the point of 3 cards in like a window was to keep interaction friction minimum - this is maximum.

> the map- zone is skewed again , or is it the map -- either way its tilted. best fix probably just to tilt the canvas again or sth idk.

> the cabs are still way too big and look like beans. also the normal traffic like like, way too small lol. it should be like, around 3x wide and also long prolly

> the ride destinations/map lines (not sumo lanes) appear very good now, actually, but its still kinda difficult to understand and unintuitive, but thats probably just my poor idea for the circles and lines yk. i was just winging it

> there still seems to be a little big of lag, which feels somehow a bit periodic ... also one thing broken about the routes/lines: the path remains even after the cab has walked on it, looks weird and laggy.

> i'm thinking that we need to reimagine/take ui advice from you or uber app or tesla app or sth idk rather than imagine my weird circles. but i quite like the way you chose the clors and stuff - the app feels smooth overall, also the ui. and isnt cluttered -- although the positioning of the three ui eleements seems kinda random on the map /main game screen. also the story isnt just there yet, like idk , the experience of the app yk.

Extracted decision:

- Intro cards: navigation friction must be minimal — Next-button/dot clicking is the
  opposite of the intent. (Fix: advance on click-anywhere-on-card / bigger targets.)
- Zone/map reads tilted (corridor rectangle is UTM-aligned, ~1.5deg off screen axes).
  Acceptable fix: rotate map bearing to align zone with screen.
- Sprite scale: cabs smaller (current = "beans"), background traffic ~3x bigger.
- Route lines: keep (good), but trim traversed segment behind the cab — lingering
  path reads as lag/bug.
- Periodic micro-lag suspected (likely the 600ms traffic-light layer rebuild).
- Request circles/lines language = user's improvisation; mandate to redesign the
  map visual language from ride-app conventions (Uber/Tesla app) — agent has
  creative authority here.
- Liked: colors, overall smoothness, uncluttered UI. Disliked: placement of the
  three overlay panels feels random; overall narrative/experience "isn't there yet".
- Meta: chat at ~500k tokens; big reimagining deferred to a fresh session — only
  surgical fixes now.

## 2026-07-06 - v3 Feedback: Canvas Rotation, One-Window Cards, Legend

Raw user language:

> the page skew is real, it was like this with codex too. adjusting maplibre makes it straight -- until you move it, or zoom or do anything, and sometimes even if you dont do anything. the fix we found at the end was to just roate the whole canvas underneath i think.

> wow, u fixed the lines -- app actually looks great now, even tho i still dont really understand it. maybe i need a legend. or maybe this whole thing is just dumb.

> still no 3 cards on one big window, still 3 successsive clicks needed .

> i like the golden radiating circles but it isnt intuitive what they mean - announced trip? accepted trip? idk?

Extracted decision:

- Zone tilt: bearing-based fixes deemed fragile from experience; the proven fix is
  rotating the map canvas itself (the old CSS rotate hack existed FOR this).
  Rotate the canvas, keep UI overlays unrotated.
- Intro: all 3 cards visible AT ONCE in one wide window; exactly one click (Start).
  The 3-successive-cards interpretation was wrong.
- Add a map legend explaining the visual language (pulse ring, marker states,
  gray vs gold lines).
- Route lines confirmed good ("app actually looks great now").

## 2026-07-06 - v4 Mandate: Final Design Pass, Full Creative Authority

Raw user language:

> the cybercabs are still too big, i find the ui completely boring and the legend on the map looks great, and your implementation of the lines is also great, but my color scheme is just stupid i think. could you think of a sane way to show what we're trynna show here? ... maybe it requires interactivity or sth -- like the routes are light or transparent with arrows flowing in the direction of movement by default, and on hover you see the cab details and maybe ride or idk what details. also, do u think you could take this from a bunch of random ui to a great experience - with batteries and whatnot? maybe the best marker for the ride is just a person icon ... i think maybe u just go build the finall app version now. and btw u can do anything you want for the browser if u wannt iterate that way ... but it is actually way more efficient, about 10x, for my usage limit, if you dont use playwright

Extracted decision:

- Full design authority to agent for the map visual language + UI experience.
- Direction hints accepted: person icon for riders, light/transparent routes with
  directional flow, hover for cab/ride details, batteries in the fleet UI.
- Cabs still too big; UI "boring" (structure fine, rows too plain); legend + route
  implementation praised.
- Build the final app version now, in this session; browser iteration allowed but
  minimize (user usage-limit cost ~10x).

## 2026-07-06 - v4 Verdict: Core Solved

Raw user language:

> um, wow. what. you solved the app. it's done -- the core i mean, i think. like the map visual is perfect. you have no idea how good and smooth the app looks in animation now. it's truly a great looking app now. now, just the ui and story is missing- and i'm sure we could also do some nice features i guess.

Extracted decision:

- Core app + map visual language accepted as done. Remaining scope: UI/story arc +
  optional features. Agent invited to propose/build next steps autonomously.

## 2026-07-06 - v5 Direction: Kill Intro, Left Dashboard Rail, Depot Start, Sim Speed, Metrics Window

Raw user language:

> hmm no dont deploy yet, theres no use -- cant let the recruiter see it like this yk. u can commit ofc.

> actually ykw? fuck the 3 cards - just remove that whole screen, its just an interruption anyway. delete.

> for the actual app ui, i'm imagining that a dashboard naviation pane on the left could be good, either have distinct tabs, or maybe everything fits in vertically, idk idk. that seems like the natural starting point to me tho rather than random ui clutter on the map.

> for the story, i actually think it would be cool to start the app at the cybercab depot yk, which would be like a cool place, and then the user otionally selects from a couple options, like maybe how much speed (3x, 30x, 150x, idk, whatever makes sense to you -- i think this can probably stay available during the sim -- as 'sim speed', is it viable or a really stupid idea for some reason? -- ofc it's only most useful when we also let the user choose eg. a time window and a fleet size and stuff like this -- then they click start and the cabs coolly on the highway to the city for their shift - maybe they start 15 mins before or yk whatever time they need or like maybe theyre a tiny bit earlier, idk. anyhoo, that does sound a bit boring and slow tho, possibly

> and maybe hovering or selecting one of your cabs allows seeing it with locked view idk

> and then most importantly, you get a compact window/view with multiple kinds of environment, ppl bla bla metrics that are leightweight but look good, like maybe about the size of an info section on a windows or linux or idk, mabye 20-40 total short lines of text, 3-4 categoreies, idk idk. shit should be useful tho lol, not fluff.

Extracted decision:

- NO deploy until the experience is worthy; local commits fine.
- Intro/cover screen DELETED entirely (also drops the card-images task).
- App shell = left dashboard rail (vertical sections or tabs) instead of floating
  panels on the map.
- Story arc: open at the Cybercab depot; optional pre-shift config (sim speed,
  later time window + fleet size); Start -> cabs drive the highway into the city
  (~15 min pre-shift, possibly compressed); shift with ops UI; cab select = locked
  follow view; END = compact metrics window, 3-4 categories, 20-40 short lines,
  system-info-panel aesthetic, strictly useful.
- Sim speed selectable and adjustable DURING the run.

Implementation note (feasibility):

- Sim speed = pure frontend pacing over the same recording: fully viable, not
  stupid (3x/30x/150x just changes ms-per-frame; interpolation keeps it smooth).
- Fleet size / time window options require one pre-recorded replay per option:
  viable as a small matrix later, not today.
- Depot drive-in opening requires re-recording with a ~17:45 depot departure:
  Phase 2.
- Today (Phase 1): delete cover, left rail (brand/controls/fleet/dispatch),
  sim-speed control, follow-cam on cab select, end metrics window computed
  client-side (service / fleet / energy / people categories).

## 2026-07-06 - v6 Feedback: Tabs, Cab-Centric Detail, Report in Rail, Closer Chase Cam

Raw user language:

> i feel like, the left ui sidebar is kinda cluttered and not i mean its not bad, but i was maybe imaginig more intentional ui ... the most important thing i wanna say is that the results are not in the left sidebar? ... myabe like one should be able to see the stats for one cab first yk, and like with nice icons and stuff, like good readability ... i dont think anyoneis gonna read that much text ... so yes, maybe dedicated tabs? bc the dispath is very visually distracting, and idk what to do with it. i'm mostly interested in the cabs, but theres not much info about them visible. like maybe battery speed graph, idk whatever. maybe like mini cab icon for each cab that shows some kind of state, idk idk. anyways, minimalism is prolly most imp. also the map thing works i think -- but its completely zoomed out i think, so the robotaxi isnt reallly visible -- maybe allow zoom or like ... make the normal view when u wanna lock to a cab be closer maybe?? ... it's also not super clear that clicking a cab and then unclicking makes enables/disables this kind of chase cam ... the small area instead of dedicded cab tab limits us to a thin list entry

Extracted decision:

- Rail gets dedicated TABS (Fleet / Dispatch / Report). Dispatch feed hidden by
  default (visually distracting). Report lives IN the rail as a tab, auto-opens at
  shift end (modal retired).
- Fleet tab is cab-centric: minimal list, then a dedicated CAB DETAIL view on
  select — icons over text, battery graph/sparkline, state, rides, current rider.
- Selecting a cab = camera lock at a CLOSER zoom; explicit "camera locked /
  release" affordance fixes the toggle discoverability. Zooming stays free while
  locked.
- Minimalism is the top priority; nobody reads walls of text.

## 2026-07-06 - v7 Feedback: Terse Language, Separation Over Labels, Chase-Cam Zoom Buttons

Raw user language:

> btw could you please clean up the slop text - just like, why so many words lol... i think clarity in desing language would come thru better separation, not by more extensive labeling - also i think some things probbaly deserve their own place yk, like why is rides served to the left of the speed control, makes no sense

> btw after you're done with this, do anything you want for a bunch- continue iteration (finish minimalist and intentional ui from start to finishfirst, clear and zen user experience) or do refactor or write docs or whatever. btw still no zoom when chase cam locked. maybe zoom +- buttons in the thing itself - but idk. anyway, imma go take a shower

Extracted decision:

- UI copy: 1-2 words per label; clarity comes from SEPARATION (own row/place per
  concept), never from longer labels. Status and controls never share a row.
- Chase cam must be zoomable while locked; explicit -/+ buttons in the chase-cam
  affordance accepted (shipped alongside owned wheel zoom).
- Standing grant renewed: autonomous iteration toward "clear and zen" experience.

## 2026-07-07 - Direction: Full-Berlin Simulation Area (UI Rethink Deferred)

Raw user language:

> the map and app itself are looking really good now, actually. so just the ui would need a complete rethink from first principles later, that's what i'd wanna do.

> now, the only thing i'd like to know, is, if it would be possible to do the simulation for all of berlin. I see that we are currently at around maybe 25% or so (my visual estimate) of berlin's areain our sim. i think it would be really cool to see the robotaxis go all over berlin, and the rectangle is also kind of not beautiful yk -- whe the whole map is right there and we also have the data.

> especially bc the animations and icons, etc u came up with are just chef's kiss for the app, and when i see them i just wanna remove all limitations from this beautiful app.

> i guess it would probably be overoptimising if we aimed for anything more than 60x and 1 hour sim as our first scope (full berlin), cuz around 1-2 min of the recruiters time is what we expect to take (also result viewing etc, so around 1-2 mins of actual sim is probably optimal, i'd tend toward 1)

Extracted decision:

- Next big direction: scale the sim area to ALL of Berlin. Corridor rectangle judged
  "not beautiful" next to a full-city map when the data exists anyway.
- First full-Berlin scope: 1-hour window, ~60x playback, ~1-2 min (tending 1) of
  recruiter viewing time. Anything beyond = overoptimizing.
- UI: complete first-principles rethink WANTED but LATER; current map/app visuals
  accepted as good.

## 2026-07-07 - Locked: Measure First; Caching Acknowledged Wise; BeST Provenance Correction

Raw user language:

> i didnt mean the sim will be baked in. i want to make it so that one can choose the fleet size etc. i mean, it wouldnt really be a simulation then, would it? just a recording. but idk, i guess..... idk. maybe using prerecorded is acceptable and wise

> caching sounds really wise for later. let's actually 1. measure first tho

> the sumo artifact is not an artifact, its a github repo. someone did a simulation from the matsim people based data from tu berlin researchers ... in the microtraffic software sumo, and called it BeST

Extracted decision:

- Tension named: user wants choosable parameters (fleet size etc.) - a recording
  library limits choice to the recorded grid. Prerecorded accepted as likely wise,
  NOT yet locked as the only mode.
- Process lock: benchmark full-Berlin SUMO performance FIRST; architecture decision
  (live vs prerecorded vs hybrid) follows the numbers.
- Provenance corrected on record: full-Berlin net/routes = BeST scenario
  (github.com/mosaic-addons/best-scenario, TU Berlin DCAITI, CC-BY 4.0), built FROM
  MATSim Open Berlin (TU Berlin VSP). Both repos cloned into git-ignored data/vendor/
  for reference.

## 2026-07-07 - Benchmark Results: libsumo Unlocks the Crazy Idea

(Agent findings, logged for the record.)

- Full-volume BeST Berlin (100% traffic, 32k+ concurrent vehicles): ~1.7x realtime.
  Live-at-click impossible at full volume; even recording painful. BeST README
  confirms: 24h takes 7h on a 3.4 GHz CPU.
- The honest baseline is the 1pct world (1pct persons AND ~1pct-scale traffic,
  ~330 concurrent vehicles): raw SUMO 189x realtime; with our TraCI polling 45x
  (the per-step Windows socket round-trip is the cost, not the simulation).
- libsumo (in-process SUMO, same API, no socket) measured 62x steady with our
  exact polling pattern, fully compatible. Adopted as default transport
  (ROBOTAXI_SUMO_TRANSPORT=traci to force the old path).
- Recording a full city hour now takes ~2-4 minutes; a recording MATRIX
  (fleet sizes x seeds) becomes cheap, giving "choose fleet size" without
  live-mode fragility.

## 2026-07-07 - v8 Mandate: No Compromises, Control-Room Left Pane, Full App Today

Raw user language:

> please dont make compromises or stuff like that. i think you understand the app i need to build, and i think you can build a beautiful one. so, if u do end up keeping the scope tight on this run, please take this message as a request to build the full awesome app and shatter all limitations. no compromises -- i didnt mean that when i said build speed, i meant that we shoudlnt waste an hour WAITING.

> the robotaxi state screen should be a clear, detailed view of the fleet or yk, whatever you choose to build in the left pane, it shouldnt be like, a matryoshka, but rather a big beautiful stock market monitor or tesla headquarters view yk, like think of what elon probably sees about red light/green ligh when seeing production bottlenecks

> i think what could be really great is if we have a dedicated ui on the left half side of the screen, and the sim runs on the right half, which is our current map and sim controls. currently it feels like youre just watching cars move, so yeah, idk what to do with that as a user. so in the right half, you can sort of 'monitor the situation' (on the map) and also have a small ui box at the top that lets u toggle speed

> also very caveman wisdom-- why lot words when few do trick and goblin mode -- the desperate cave dwelling create that chases the shiny thing and does sth so resourceful and beautiful, in a crazy way. that's who we are, that's the backone of this project

> i mean, theres no point of building traci first and then the libsumo and then an analytics layer later. idk, i think you can one shot this.

Extracted decision:

- v8 layout: LEFT HALF = dedicated control-room pane (stock-market-monitor /
  Tesla-HQ density: everything visible at once, NO matryoshka drill-downs);
  RIGHT HALF = the map ("monitor the situation") with a small speed box on top.
- Skip intermediate architectures: libsumo + analytics built directly.
- User's role framing: the viewer is the ops manager watching the fleet win or
  lose against demand — not "watching cars move".
- Left pane contents (agent design, accepted creative authority): KPI strip,
  17:40-19:00 progress with 18:00 service tick, 30-cell fleet grid (click =
  chase cam, inline cab card), demand requested-vs-served cumulative chart,
  wait histogram, fleet-state stacked timeline, terse event ticker; report
  renders in-pane at shift end with charts still live above it.
- Stakes acknowledged: this application matters enormously to the user.

## 2026-07-07 - Berlin City Scenario: Ground Truth From Recordings

(Agent findings during the city build.)

- Scenario "berlin": full BeST net (162 MB, 71,324 passenger edges), 1pct
  background (2,005 window vehicles), fleet 30 spawning AT the TXL depot 17:40
  in a staggered convoy (depot drive-in = the v5 wishlist opening, landed),
  city-wide MATSim demand (7,502-trip pool, ~66-78 requests/seed at 6.5%
  scaled adoption), request expiry 900s, no drawn service rectangle (the city
  is the zone), no TL streaming (frontend draws no signals at city scale;
  TL deltas were 68% of the first recording = 103 MB -> 8.5 MB after the cut).
- Fleet-density physics learned the hard way: 30 cabs over 800 km2 = ~5 km
  spacing = 10-15 min pickup drives. A 9-min pickup cap starved the fleet
  (9/78 served); the corridor's 10-min expiry was equally corridor-scale.
  Retuned: 12-min pickup cap, 15-min expiry, staging legs capped at 8 min
  (depot exit exempt). Long waits at 30 cabs are the honest fleet-sizing
  story the 10/30/50 matrix exists to tell.

## 2026-07-07 - v9 Shipped State: Definitive Tuning + Fleet-Sizing Result

(Agent findings; final numbers of the day.)

- Definitive city tuning: pickup cap 15 min, expiry 15 min, staging legs 8 min
  (depot exit exempt), NO assignment cutoff (requests accepted to 19:00),
  recovery cushion up to 60 min hard cap — every run ends the moment the whole
  fleet is parked back at Tegel (verified allFleetRecovered=True on all three
  fleet sizes; runs end 19:37-19:55).
- Fleet-sizing experiment (same evening, same riders, seed 1):
  fleet 10 = 29/76 served (38%), fleet 30 = 49/76 (64%), fleet 50 = 49/76
  (64%). Ten cabs drown; thirty is the sweet spot; fifty adds nothing because
  the binding constraint is spatial coverage + 15-min patience, not fleet
  count. This diminishing-returns curve is the report tab's data story.
- Waits P50 ~14 min are 1pct-density physics: the fleet IS a 1% sample. A
  real-scale fleet (~100x) would wait minutes. One footnote line covers it.
- Two corridor-era bugs found by the matrix (fleet 30 = fleet 50 exactly):
  ride-must-finish-by-19:00-sharp rejected everything after ~18:15 at city
  trip lengths; fixed to finish-within-recovery. Hotspot candidate list was
  capped at 12 edges so extra cabs piled onto the same spots; now scales with
  fleet size.
- Replays: 12-21 MB gz per run (TL cut from 103 MB); five shipped:
  fleet10/30/50 x seed1 + fleet30 x seeds 2-3.

## 2026-07-07 - v9 Final QA: Verified End-to-End; Two Ghosts Exorcised

(Agent findings, closing the day.)

- Full recruiter run verified in the production build: idle setup (centered,
  fleet 10/30/50 chips) -> Start -> 17:40 depot convoy -> live control room
  (KPIs, fleet grid, demand curve, wait histogram, fleet-state timeline,
  ticker, hover cards on riders/cabs) -> chase cam with inline cab card and
  zoom -> 19:00 close -> winddown drop-offs ("21.4m wait" late riders driven
  home) -> camera eases back to the whole city -> in-pane shift report
  (49/76 served, energy self-validates at 10.3 kWh/100 km) -> rerun chips.
- GHOST 1 (the "~15s early-click dead window"): NOT a product bug. The Start
  button is topmost and enabled; a synthetic click works instantly. The
  browser-automation extension's coordinate clicks are what get swallowed.
  Real mice are unaffected.
- GHOST 2 (the "rerun freeze"): NOT a product bug. document.hidden=true —
  occluded-tab rAF throttling (documented since the corridor). Visible
  windows run smooth; zero long tasks measured.
- Shipped replay set: fleet10/30/50 seed 1 + fleet30 seed 2 (45/66, 68%).
  Seed 3 dropped: deterministic stuck depot-returner (one cab loops until the
  hard cap; pre-existing return-routing edge case, logged for next session).
- Late crash class fixed for good: runtime edge mapping now skips lanes
  without taxi access (a rider on a passenger-only lane killed the SUMO
  reservation add mid-recording).

## 2026-07-07 - v9.1 Mandate + Evening Session

Raw user language:

> please ensure that both the right side map and left side ui panel are correctly interactive, and offer a smooth very smooth user ui experience. feel free to keep adding or removing features, staying true to the goal of building a goblin app ... always ask yourself why is this thing here

> maybe first just disabling the traffic and only having the robotaxis correctly would be helpful for the development process

> i can set a /goal for building the ultimate goblin app you could possibly imagine and keep trying and not rest

Extracted decision:

- Standing goal: smooth, correct interactivity on both panes; every element
  must answer "why is this thing here"; keep iterating.
- Delivered in v9.1: fleet-state chart legend (dataviz-validated colors),
  live demand counts + 18:00 axis tick, fleet-sizing comparison row in the
  report (localStorage; fills as the user reruns 10/30/50), clean-slate
  reruns, one-pulse fleet-cell animation on completed rides (reduced-motion
  safe), og/description tags for application-link previews, depot-return
  watchdog.
- Verified E2E: run history persists; fleet chips switch the streamed replay
  (10 cells for fleet 10); reruns start clean.
- QA ground truth for future sessions: every observed "freeze"/dead-click was
  the automation environment (hidden-tab timer throttling; extension click
  dispatch). The app itself is smooth in a visible window with a real mouse.

## 2026-07-08 - v10 Entry Direction Reset (cards killed, guided left-pane intro)

Raw user language:

> thats... amazingly bad. let's start again. ... the intent is definitely not to add some sort of card or slop text to the app.

> instead of wasting our time on building cool animations or elements we dont actually need, let'S answer the question: what are some candidates for the minimal set of things/concepts we need to refresh the user (assume tesla data science engineer-ish level of intelligence) before they can just start click and would understand everythign

> fuck all this, new idea: no cards. so, just the left white pane, and the berlin map on the right by default. in the middle of the pane, we start with a 3d model of the tesla cybercab. aspirationally interactive. the right side is sort like, dimmed yk ... lets stick to whites and grays

> do you think dark mode would be better for the app than light mode? i think probably, yeah, probably more futuristic and better than an empty white pane (empty white pane does not really feel empty, but gray/dark would feel like that)

> dark mode if for nothing else then bc im working at night and i dont want to get blinded. app opens: very tasteful dark grey, tesla kinda, big left pane, 50% of screen or sth. right side: berlin map, currently grayed out/dimmed. just the golden cybercab(s) in the left pane as the central visual.

> the user sees 6am. not 6pm. the sim data we're using is indeed from 6 to 7pm, but we'll just pretend its from 6am and change it later. (and even if we forget no one will notice)

> so maybe the first card (not card, but first thing on the left ui pane, which is our canvas i guess) is this - and text saying sth like, ..cabs coming berlin, in this sim... cyberfleet. ok, then, user clicks next, the first time. text: the cyberfleet is driving .... duty.. traffic lights, cars, bla bla.. clicks next second time, says: react to demand.. impact bullshit... click to start sim.

> i think they will enjoy the cyberfleet cruising down the highway for 5 seconds or so, right?

> i wanted to say, i watched it, thats amazingly bad — [morning attempt: veil + "Berlin" word + spec card overlay, reverted uncommitted]

Extracted decision:

- Morning's entry attempt (opaque veil, dissolving "Berlin" word, floating
  spec card) rejected wholesale and reverted. Diagnosis accepted by both:
  decoration OVER the world, telling instead of showing.
- Minimal concept set a smart viewer needs before Start (agreed): 1) this is
  a real live simulation, not a recording; 2) demand = real people (synthetic
  1% Berlin population); 3) the fleet and its job; 4) time compression.
  Points 3-4 shown, not told.
- New entry shape: app opens as the permanent layout — dark left pane (~50%),
  Berlin map right, dimmed. Left pane = the canvas. Beat 1: golden Cybercab
  3D model (user-supplied GLB, Sketchfab) with fleet hinted behind + a few
  words. Next #1: the Cyberfleet departs the depot on the map, enroute text.
  Next #2: demand/impact text, Start button. Sim holds before 06:00 service
  until Start; quick users watch the convoy cruise ~5 s.
- Displayed time is 06:00-07:00 AM (sim data stays 18-19h internally for
  now; swap later, no user-facing disclaimers).
- Dark mode committed, dark-only, whites/grays, "tasteful dark grey, tesla
  kinda". No accent-color quota (constitution holds).
- Rendering: three.js + GLTFLoader (A), chosen over model-viewer/prerender;
  seed of the future per-card scenes. Asset: public/assets/cybercab.glb
  (1.6 MB, gold metallic body, no textures).
- Step 1 scope approved: revert junk, EntryPane over legacy idle pane
  (legacy untouched beneath, ?entry=off escape), dimmed map veil, cab scene
  (turntable + drag), no text/buttons yet. Browser QA by user directly
  ("cant waste tokens and time on chrome, i'll give quick input").
- Process reaffirmed: Claude proposes options concretely, user picks, Claude
  builds ("you imagine, i choose for a feature, then you build it").

## 2026-07-08 - Direction reset: light app + intro card + LIVE sim default

Raw user language:

> ok so, sorry, i think we wont actually be able to finish the app at this pace. let's roll back. i have a new idea. let's go in an easier direction. we'll just make a user experience, working with/building on top of our previous light app.

> the app loads with a white-ish small tutorial/sim controls window on the top left. tesla design language. says - cybercabs are coming to berlin, shows them driving on a highway road, light/gray map ... blue driving lanes showing the direction they're going in/their intended path, like tesla app ... and then a blue button that says start simulation. at which point the map switches from one robotaxi to a zoomed out view of berlin i guess ... let's keep it simple, modern, fresh. shadcn like ui

> but what i do not understand is, why you keep saying re-record, recordings, etc. like, arent we using a real sim or sth? like, the 'sim' would already start as soon as the site first laods i guess.

> [blue lanes] let's just skip it for now, ok? make your life a bit easier.

Extracted decision:

- Dark 3D-pane entry abandoned; EntryPane/GLB scene deleted (git history
  keeps them). Light v9 app is the base again.
- Live simulation is now the DEFAULT: ws opens with cache=live at page load;
  ?cache=auto is a dev-only fallback to recorded evenings.
- New pre-service experience: full-bleed light map; sim starts computing at
  page load (17:40 depot roll-out); playback holds just before 18:00 until
  the viewer clicks Start; street-level auto-follow of the first cab that
  moves during the intro; on Start the camera releases to the whole city and
  the v9 ops pane takes over.
- Intro card top-left, shadcn language: title "Cybercabs are coming to
  Berlin", two lines, one blue button "Start simulation" (disabled
  "Preparing the city…" until first frames), hint "Runs by itself · about
  two minutes".
- Blue intended-path lanes: deferred by user (needs cab route polylines in
  the stream — same mechanism as the existing request path lines).
- .env.local backend URL corrected 7860→7861 (zombie servers squat 7860).

## 2026-07-08 (late night) - Depot-sleepers dead: fleet spawns on the city grid

Raw user language:

> the app seems to have all the same problems as before, cabs never leave the depot until its 18, they sit at the depot in large part even after it 18, like some of them just stay there and like never leave (like im telling you for the tenth time now that they should be in the city by the time we start, idk whats wrong)

> hopefully atleast the full hour sim works on 60x with proper demand zonee based city entry without wasting time at the beginning. keep iterating on ui clarity and end stats as discussed in previous chats. surprise me and impress me

Extracted decision + engineering findings (measured, not guessed):

- ROOT CAUSE of a week of "cabs never leave the depot": SUMO's taxi device
  (idle-algorithm "stop") pins every idle taxi with a triggered stop
  (stopState=7) that TraCI resume/replaceStop/setRoute cannot lift. The
  python staging layer "succeeded" every run while the cabs physically
  never moved. Proven with per-call TraCI diagnostics + a cab tracker.
- Taxi stands (idle-algorithm taxistand + parkingAreas, the corridor
  pattern) DO move the fleet — but collapse the city-scale sim to
  ~2 sim-s/s. Rejected; stands file kept on disk, unwired.
- SHIPPED: the fleet spawns directly on the 20-slot staging grid
  (spawnAtDepot False), wrap-around for fleets > 20 with car-length
  offsets. Fleet is IN POSITION across Berlin from the first frame; the
  depot-sleeper trap cannot exist. Roam keeps idle cabs alive pre-service.
- Perf: A* routing (CH poisons dispatchTaxi: 90% CPU in hierarchy
  rebuilds), dispatch decisions on a 3-sim-second cadence. Live
  throughput measured: ~80 sim-s/s pre-service, ~25-35 mid-hour on the
  dev machine; the frontend rubber-bands playback toward production rate
  instead of hard Buffering stalls. Honest status: mid-hour 60x is not
  yet reachable on this hardware; the hour plays at ~25-35x mid-run.
- Frontend hold moved to the opening frame (63610): page load shows the
  positioned Cyberfleet + living city; Start releases into 3x-paced
  17:40-18:00, then the service hour.
- Depot drive-in convoy story: retired for now (physically incompatible
  with the taxi device's idle stop without paying the stands cost).

## 2026-07-08 (pre-dawn) - Sprint: dead window killed at the root + honest loading + impact stats

Raw user language:

> an app that expects the recruiter to wait for 15 seconds without any indication of the actual loading percentage (and optimal loading time is 0 ofc), has a depot on the map but places the cabs into a sort of grid ... doesnt say anything of value like battery or efficiency or environmental ... and fucking stutters all the time, instead of running at constant 60x ... it STILL makes the user wait ... on a screen from 17:40 to 18:00 WHILE NOTHING HAPPENS. i thought we were really gonna try for one last hard sprint tonight.

Shipped this sprint:

- Sim now STARTS at 17:59 (SUMO_BERLIN_START_SEC 64740): the 17:40-18:00
  window is gone from existence, not skipped. Start drops straight into
  the service hour. Progress bar/charts re-anchored to 18:00-19:00.
- Loading states name what the backend is doing (Contacting the
  simulator / Starting Berlin — live SUMO run) + an indeterminate load
  bar. No fake percentages: SUMO's net load has no honest progress
  signal. True load-time cut (keep SUMO warm between runs, saveState)
  is the known next architecture step.
- Rubber-band pacing got hysteresis: once eased, the pace stays eased
  until the buffer truly recovers (240 frames) — steady slightly-slower
  beats oscillating stutter.
- KPI strip: live fleet battery average replaces P90; "on ride" renamed
  "active".
- Report "Energy & impact": CO2 avoided (147 g/km petrol reference net
  of 363 g/kWh German grid, footnoted) + car trips avoided.

## 2026-07-08 — First-principles reset requested (fresh-eyes session)

Raw wording (user):

> ok so i want you work on this project with a fresh set of eyes, it would be nice if we could treat this almost like a fresh project we just got, full of experiments and questionable decisions haha. i want the person viewing this to be delighted upon opening this. should feel so easy and natural to understand it.

Audience confirmed: recruiter opens the app (repo invisible).

Then, when offered opening-arc options:

> forget about improvements, let's think from first principles. what is the best app we can make, given the starting data we have from the matsim open berlin scenario

Status: concept exploration in progress this session. Fresh-eyes run findings
(recorded for context): mid-run map + report already strong; dead pre-service
opening (~15s at 60x, replay starts 17:46), half-empty idle pane, wait-optics
mid-run, MapLibre resize-while-occluded bug, minor label inconsistencies.

## 2026-07-08 — "Epic presentation" polish pass (autonomous session)

Raw wording (user):

> let's figure out how we can take this project from experimental to an epic presentation when an engineer opens the link. /goal explore the app explore ways to improve the app experience for the 1-2 minutes it will be used for by the engineer/recruiter, then polish polish polish, make something beautiful, the goal is to make the UI and overall experience clearer and more intentional. do not waste time on watching full recordings, maybe one run at first, max. but then work with screenshots.

One full watch-through done (playback default, fleet 30). Shipped this pass:

- Winddown compression: past 19:00 playback returns to triple pace (shared
  DRIVE_IN_PACE_FACTOR) — the 19:00→19:52 epilogue was ~40 wall-seconds of a
  pegged progress bar; now ~15 s.
- Honest phases: chip now Rolling out → In service → Winding down → Shift
  complete ("In position" lied — the fleet visibly streams out of TXL).
  Drive-in ticker copy matched ("Cyberfleet rolling out across the city").
- Idle cover recomposed: brand + facts + Start as one optically-centered hero
  group (was: brand pinned top, setup floating in a half-empty pane).
- Depot map label: scratchy script PNG replaced by a gold dot + map-typeset
  caption (Metropolis Semi Bold, halo) — reads as part of the basemap. PNG +
  generator script deleted.
- Fleet-grid state legend: the riding/pickup/moving/parked/depot swatch row
  moved from under the Fleet-state chart to under the fleet grid, where the
  colors first appear.
- Demand-chart "requested" now counts declined-at-creation requests (deduped
  by id), so the live chart total converges to the report's "Requests" (was
  65 vs 76 mismatch).
- KPI labels: "P50 wait" → "median wait", "battery" → "avg battery" (report
  already said median; recruiter shouldn't need P-notation).
- Map container background set to the basemap land tone (pre-tile blank read
  as a broken page for ~4 s on first load).

## 2026-07-08 — Declutter + inner-city camera (post-polish direction check)

Raw wording (user), after the polish pass:

> nice. so, thank you so much, looks way better. but i think the ui is still very cluttered and maybe making the app over all of berlin instead of a smaller region wasnt such a great idea. what do you think?

Assessment agreed on clutter (fleet grid + fleet-state chart redundant, waits
histogram = permanent worst-optics report fact, 6 KPIs where 4 carry it).
On Berlin: scope is not the mistake, experienced density is — fix by camera
framing + (optionally) demand density, not by retreating to a corridor.
User: "ok fix it". Shipped:

- Live pane cut to: 4 KPIs (served/waiting/aboard/median wait), progress,
  fleet grid + legend, demand chart (taller, 96px), ticker. Waits histogram
  and fleet-state timeline deleted from live view (report keeps the numbers);
  avg-battery and active KPIs deleted.
- Running camera now frames the inner city (S-Bahn ring + margin,
  innerCityBounds, maxZoom 12.4) at 18:00 release and on chase release; the
  end-of-run report keeps the full-Berlin zoom-out as the scale statement.
- Not done (next lever, needs a product call): raise demand adoption + fleet
  in a re-record to fix wait/empty-share optics — invalidates the current
  "Why 30 cabs" sizing row.

## 2026-07-08 — "Best app possible" mandate; density re-record shipped

Raw wording (user):

> ok but do you think this will be the best app possible? if not, try to make the best app possible /goal

Then via /goal: "continue until app you're sure that it cannot be made into a
better app".

Diagnosis: post-reframe the map looked alive but the numbers told the diluted
story. The MATSim 18-19h pool holds 7,502 trips (shipped seeds sampled at
0.065 adoption = 76 requests). Sizing matrix recorded live (see commit
76209ce): fleet 60 x 133 requests = 89% served / 119 moved / P50 15.2 min —
shipped as the new default replay. Wait-time root cause measured from the
recordings: assignment is instant (~48 s); the pickup DRIVE is ~13 min
because the nearest idle cab averages 5.7 km away (stranded idle supply).
Staging cap raised 480->960 s in main.py (live A/B interrupted — SUMO
processes kept getting killed on the shared machine; verify next session).
Assignment matching (vehicle-ordered greedy, ~23% of assignments >1 km worse
than best idle cab) documented as the next dispatch lever, not yet changed.

Visual QA of the fleet-60 run pending a visible browser window (tab frozen
while occluded).

## 2026-07-09 (night) — stranded idle supply: demand-weighted taxi stands

Correction to the 2026-07-08 entry: the staging-cap change was a NO-OP for
berlin — the stands file is wired ("additional"), which disables the python
staging layer (stands_mode). Idle-cab placement is owned by SUMO taxistand +
the stands file. The old stands mirrored the uniform 6x5 spawn grid over
890 km2 while demand clusters inner-city — THAT is the 5.7 km stranded-idle
measurement.

New: scripts/build_berlin_taxi_stands.py — stands at the densest 750 m
pickup cells of the full 7,502-trip pool + coverage stands for populated
outer slots (47 stands total, taxi-capable service edges, SUMO load-checked,
rerouter block for the taxistand device included after the first recording
attempt errored on the missing rerouter id). Offline evaluation vs seed15
demand: nearest-stand P50 3.49 km (old uniform) -> 1.57 km (demand-weighted).
Re-recording fleet60 x seed15 with the new stands to A/B the wait numbers.

Also this pass: report footnote 3 (waits = pickup drives), error-banner
"Run again" retry (dead mid-run stream is no longer a dead end).
