# Robotaxi Data Guide

This repo now contains the robotaxi data needed to rebuild the current Reinickendorf prototype without reaching back into the EV Mobility Dashboard workspace.

## Data Inventory

### Source Analysis Data

Stored in:

```text
data/source/reinickendorf/
```

Files:

- `internal-trips.json`
  - 25,023 internal Reinickendorf trips.
  - Includes `id`, `departSec`, `departHour`, `distanceKm`, `originXy`, `destinationXy`, `originLonLat`, `destinationLonLat`, and the SUMO edge list in `edges`.
- `internal-edge-geometries.json`
  - 1,601 SUMO edges used by internal trips.
  - Includes `shapeXy`, `shapeLonLat`, start/end coordinates, and edge length.
- `summary.json`
  - Source summary for the internal-trip subset.
  - Includes peak hour, peak 15-minute window, distance distribution, and service-area polygon in SUMO XY coordinates.

These files were copied from:

```text
C:\Users\KitCat\Desktop\EV Mobility Dashboard\data\intermediate\robotaxi-sim\reinickendorf\
```

Future agents should use the local copies in this repo.

### App-Facing Generated Bundle

Stored in:

```text
public/data/six-seven-scenario.json
hf-space/app/data/six-seven-scenario.json
```

This is the compact bundle used by the frontend and backend:

- 701 trips in the 06:00-07:00 window.
- Route polylines for browser display.
- Service-area polygon for the BeST Reinickendorf technical cutout.
- A TXL/Tegel candidate depot coordinate marked as outside the current cutout.

Regenerate the public bundle with:

```powershell
python scripts\export_six_seven_scenario.py
```

After regenerating `public/data/six-seven-scenario.json`, copy it to the HF backend data folder if backend parity is needed:

```powershell
Copy-Item public\data\six-seven-scenario.json hf-space\app\data\six-seven-scenario.json -Force
```

### SUMO Runtime Inputs

Stored in:

```text
hf-space/app/sumo/reinickendorf/
```

Files:

- `reinickendorf.net.xml`
  - SUMO network for the BeST Reinickendorf technical cutout.
- `reinickendorf-internal.rou.gz`
  - SUMO routes for internal trips.
  - Important for dispatch work because it contains authoritative edge sequences per trip ID.
- `reinickendorf-internal.sumocfg`
  - SUMO config used by the backend and GUI.

Generated output under `hf-space/app/sumo/**/output/` is ignored except `.gitkeep`.

## Current Scope Boundary

The current packaged SUMO network is not official Berlin-Reinickendorf and not full Berlin. It is a rectangular-ish BeST/SUMO technical cutout around part of Reinickendorf/Wedding/Pankow.

Tegel/TXL is outside this packaged cutout. A true Tegel depot requires one of:

- a larger SUMO network that includes both the current service area and TXL/Tegel, or
- a full Berlin network and a scenario-specific route/request filter.

Do not fake a Tegel depot by drawing frontend-only routes. If a vehicle starts at Tegel, SUMO must have roads from Tegel into the service area.

## Edge/Coordinate Notes

- The app map uses lon/lat rendered by MapLibre/Web Mercator.
- SUMO network geometry is stored in SUMO XY and projected lon/lat.
- Some trip endpoints can snap to internal junction edges such as `:...` if using `simulation.convertRoad(...)` directly.
- For dispatch, prefer authoritative first/last normal edges from `reinickendorf-internal.rou.gz` or `data/source/reinickendorf/internal-trips.json`.
- Reject internal edges starting with `:` for pickup/dropoff routing unless deliberately handling junction connectors.

## What Is Missing For Premium/Goblin Versions

Not currently present in this repo:

- SUMO network covering Tegel/TXL plus the Reinickendorf cutout.
- Charlottenburg SUMO scenario/cutout.
- Mitte SUMO scenario/cutout.
- Full Berlin SUMO scenario.
- Charging-site/depot model.
- Fleet dispatch state machine.
- Charging, battery, deadheading, or routing-algorithm comparison data.

SUMO tooling is available locally on this machine under:

```text
C:\Program Files (x86)\Eclipse\Sumo\
```

Useful tools include `netconvert.exe`, `duarouter.exe`, `sumo.exe`, `sumo-gui.exe`, `osmGet.py`, and `osmBuild.py`.
