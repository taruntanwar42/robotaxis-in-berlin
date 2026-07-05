# Robotaxi Data Guide

The active app uses one SUMO scenario: the generated
`charlottenburg-moabit-tiergarten` service corridor (official Berlin Ortsteile
provenance, BeST/SUMO road network and background traffic). The legacy
`reinickendorf-district` package remains in the repo for debug/history only.

## Active Runtime Data

Packaged for the backend in:

```text
hf-space/app/sumo/charlottenburg-moabit-tiergarten/
```

Key files:

- `charlottenburg-moabit-tiergarten.net.xml`
  - SUMO network for the corridor cutout (4063 edges, 378 traffic lights).
- `charlottenburg-moabit-tiergarten-contained.rou.xml`
  - Corridor-contained background vehicle routes.
- `charlottenburg-moabit-tiergarten.sumocfg` /
  `charlottenburg-moabit-tiergarten-1800-2100.sumocfg`
  - SUMO configs. The runtime window is enforced by the backend scenario
    registry (`startSec=64800`, `endSec=68400`), not by the config file.
- `charlottenburg-moabit-tiergarten.geojson`
  - Cleaned corridor boundary rendered by the frontend.
- `charlottenburg-moabit-tiergarten.official-ortsteile.geojson`
  - Official Berlin Ortsteile provenance for the corridor.
- `charlottenburg-moabit-tiergarten.service-edges.txt` / `.active-edges.txt`
  - Service-capable and active edge id lists used by demand mapping.
- `metadata.json`
  - Scenario metadata: fixed depot (`8036812#2`), depot connector routes, and
    the five staging edges (spread center/west/east/north/south slots) used to
    place cabs at 18:00.

Active demand and replay data:

```text
hf-space/app/data/matsim/charlottenburg-moabit-tiergarten_person_trips_1pct_180000_190000_car_ride.json
hf-space/app/data/matsim/..._car_ride.rejects.json
hf-space/app/data/matsim/..._car_ride.metadata.json
hf-space/app/data/replays/charlottenburg-moabit-tiergarten_taxi_matsim_public.jsonl.gz
```

The demand file covers the v1 window `18:00-19:00` (`64800-68400`), modes
`car + ride` only, both trip ends inside the corridor (125 trips; the backend
maps them to reachable SUMO edges at load, currently 119 runtime requests).
The replay is the packaged public playback: 1 frame per simulated second,
recorded from a live run at `speed=50`.

## Regenerating Data

Corridor SUMO package (see
`docs/SCENARIO_CHARLOTTENBURG_MOABIT_TIERGARTEN.md` for the full pipeline):

```powershell
python scripts\build_charlottenburg_moabit_tiergarten_sumo.py
python scripts\check_sumo_package_shape.py --package-dir <staging> --scope charlottenburg-moabit-tiergarten --expected-start-sec 64800 --expected-end-sec 68400
python scripts\stage_charlottenburg_moabit_tiergarten_package.py
```

MATSim corridor demand (writes to `data/intermediate/matsim/...`; copy the
`.json`, `.rejects.json`, and `.metadata.json` into `hf-space/app/data/matsim/`
after validation):

```powershell
python scripts\build_charlottenburg_moabit_tiergarten_matsim_demand.py --start 18:00:00 --end 19:00:00 --include-modes car,ride
python scripts\check_robotaxi_demand_shape.py --demand-file <file> --scope charlottenburg-moabit-tiergarten --expected-start-sec 64800 --expected-end-sec 68400 --allowed-mode car --allowed-mode ride
```

Public replay cache (needs a running local backend; takes a few minutes):

```powershell
python scripts\build_public_replay_cache.py --base-url http://127.0.0.1:7860
```

Source cache (large, git-ignored):

```text
data/source/matsim-berlin/berlin-v6.4-1pct.plans.xml.gz
data/source/berlin-ortsteile/
```

All of `data/` is git-ignored (sources plus intermediates). Packaged runtime
copies live under `hf-space/app/`; of these, `hf-space/app/data/matsim/` and
`hf-space/app/data/replays/` are also git-ignored (the replay cache exceeds
GitHub's 100 MB file limit) — they reach the Hugging Face Space because
`scripts/deploy_hf_space.py` uploads the local `hf-space/` folder from disk.
Rebuild them with the commands above.

## Interpretation Notes

- MATSim `ride` mode means private car passenger in this scenario. It is not
  DRT, taxi, or robotaxi.
- MATSim Berlin does not provide ride party sizes. Each row is one person
  trip; `partySize = 1` is backward-compatible schema shape, not observed
  group size.
- Use the current 1% extract as-is; do not fake-scale demand. Sample expansion
  factors in metadata are provenance only and must not multiply any default
  metric.
- MATSim network link ids do not match the SUMO cutout ids; runtime dispatch
  maps person-trip coordinates to nearest reachable SUMO pickup/dropoff edges.
  Unmappable trips are rejected with reasons and kept out of user-facing
  totals.
- The frontend must not draw placeholder service areas; the active boundary
  comes from `/sumo/charlottenburg-moabit-tiergarten/network`.

## Legacy Data (Reinickendorf)

`hf-space/app/sumo/reinickendorf-district/` and the
`reinickendorf_person_trips_*` MATSim extracts belong to the earlier
Reinickendorf prototype. They stay packaged so the legacy scope keeps working
for comparison, but no product work should build on them. Regeneration script:
`scripts/build_reinickendorf_best_cutout_sumo.py`.

## Local SUMO Tools

SUMO is installed locally at:

```text
C:\Program Files (x86)\Eclipse\Sumo\
```

Useful tools include `netconvert.exe`, `duarouter.exe`, `sumo.exe`,
`sumo-gui.exe`, `osmGet.py`, and `osmBuild.py`.
