# Cybercab Behavior Audit

This app is a SUMO/TraCI dispatch prototype for a Cybercab-style fleet. It should
not be described as a complete Tesla autonomy simulation.

Primary public source checked on 2026-06-30:

- Tesla Cybercab First Responder Interaction Plan, version 1.0, dated 2026-06-22:
  https://digitalassets.tesla.com/tesla-contents/image/upload/cybercab-first-responder-interaction-plan.pdf

## Implemented In The Simulation

- Cybercabs are two-seat taxi vehicles controlled by SUMO/TraCI.
- Passenger requests are accepted through SUMO's taxi reservation flow.
- Empty vehicles are assigned to reachable pickup/dropoff pairs inside the service window.
- Vehicles no longer return to the depot merely because there is no immediate request.
- Low-charge vehicles are kept out of new assignments and routed back toward the depot/charging area.
- Depot charging is modeled by the backend controller using configured capacity and charging power.
- Motion-derived metrics are tracked from TraCI odometer deltas: vehicle-km, empty-km,
  passenger-km, energy estimate, deadheading percent, and charging sessions.
- The final service-window policy still returns the fleet to the depot before the run ends.

## Represented As Simplified Controller Logic

- Battery use is a controller estimate, not a calibrated EV battery model.
- Charging is represented by backend state and depot position, not by a validated
  wireless charging physics model.
- Pickup/dropoff dwell is represented by SUMO taxi pickup/dropoff durations.
- "Roaming" is represented as idle/staged availability inside the SUMO taxi device,
  not as a learned demand-search policy.

## Not Simulated

- Tesla FSD perception, path negotiation, first-responder recognition, cones, hand
  signals, siren detection, or emergency-scene behavior.
- Door, seatbelt, airbag, collision, window, cabin-support, or rapid-hazard hardware
  workflows.
- Extreme-weather service suspension or dynamic public-safety geofencing.
- Remote Robotaxi Support / Mission Control decisions beyond the controller's
  dispatch, charging, and end-window return policies.

## Claim Boundary

Use wording like:

> SUMO/TraCI robotaxi dispatch prototype with Cybercab-inspired capacity, depot,
> charging, and fleet-state behavior.

Avoid wording like:

> Real Tesla Cybercab behavior simulation.

