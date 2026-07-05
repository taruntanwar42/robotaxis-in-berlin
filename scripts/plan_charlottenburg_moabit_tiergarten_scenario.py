from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pyproj import Transformer


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_KEY = "charlottenburg-moabit-tiergarten"
SCENARIO_NAME = "Charlottenburg + Moabit + Tiergarten service zone"
INITIAL_FLEET_SIZE = 5
FIXED_DEPOT_STORY = "Existing Cybercab depot marker and fleet-origin story"
FIXED_DEPOT_EDGE = "8036812#2"
FIXED_DEPOT_RETURN_EDGE = "-8036812#2"

ORTSTEILE_WFS_URL = "https://gdi.berlin.de/services/wfs/alkis_ortsteile"
ORTSTEILE_LAYER = "alkis_ortsteile:ortsteile"
ORTSTEILE_SOURCE_CRS = "EPSG:25833"

LOR_WFS_URL = "https://gdi.berlin.de/services/wfs/lor_2021"
LOR_PLANUNGSRAUM = "lor_2021:a_lor_plr_2021"
LOR_BEZIRKSREGION = "lor_2021:b_lor_bzr_2021"
LOR_PROGNOSERAUM = "lor_2021:c_lor_pgr_2021"
LOR_SOURCE_CRS = "EPSG:25833"
WGS84 = "EPSG:4326"

TARGET_AREAS = [
    {
        "role": "charlottenburg",
        "layer": ORTSTEILE_LAYER,
        "idField": "nam",
        "id": "Charlottenburg",
        "expectedName": "Charlottenburg",
        "reason": (
            "Official Ortsteil boundary matching the screenshot/product framing; "
            "keeps Charlottenburg-Nord out of the first west-central corridor."
        ),
    },
    {
        "role": "moabit",
        "layer": ORTSTEILE_LAYER,
        "idField": "nam",
        "id": "Moabit",
        "expectedName": "Moabit",
        "reason": "Official Ortsteil boundary matching the corrected product area.",
    },
    {
        "role": "tiergarten",
        "layer": ORTSTEILE_LAYER,
        "idField": "nam",
        "id": "Tiergarten",
        "expectedName": "Tiergarten",
        "reason": (
            "Official Ortsteil boundary for the landmark Tiergarten zone; "
            "does not include Mitte Ortsteil."
        ),
    },
]


def default_output_dir() -> Path:
    return PROJECT_ROOT / "data" / "source" / "berlin-ortsteile" / SCENARIO_KEY


def candidate_best_sumo_dirs() -> list[Path]:
    candidates = []
    env_path = os.getenv("BEST_SUMO_DIR")
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            PROJECT_ROOT.parent / "EV Mobility Dashboard" / "data" / "raw" / "best-scenario" / "scenario" / "sumo",
            Path.home() / "Desktop" / "Projects" / "EV Mobility Dashboard" / "data" / "raw" / "best-scenario" / "scenario" / "sumo",
            Path.home() / "Desktop" / "EV Mobility Dashboard" / "data" / "raw" / "best-scenario" / "scenario" / "sumo",
        ]
    )
    return dedupe_paths(candidates)


def candidate_matsim_plan_files(sample: str) -> list[Path]:
    filename = f"berlin-v6.4-{sample}.plans.xml.gz"
    candidates = []
    env_path = os.getenv("MATSIM_PLANS")
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            PROJECT_ROOT / "data" / "source" / "matsim-berlin" / filename,
            Path.home() / "Desktop" / "robotaxi-control-room" / "data" / "source" / "matsim-berlin" / filename,
        ]
    )
    return dedupe_paths(candidates)


def dedupe_paths(paths: list[Path]) -> list[Path]:
    seen = set()
    unique = []
    for path in paths:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def first_existing(paths: list[Path], required_files: list[str] | None = None) -> Path | None:
    for path in paths:
        if not path.exists():
            continue
        if required_files and not all((path / name).exists() for name in required_files):
            continue
        return path
    return None


def fetch_wfs(url: str, type_name: str) -> dict:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": type_name,
        "outputFormat": "application/json",
    }
    request = Request(
        f"{url}?{urlencode(params)}",
        headers={"User-Agent": "robotaxi-control-room-scenario-planner"},
    )
    with urlopen(request, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def convert_position(position: list[float], transformer: Transformer) -> list[float]:
    lon, lat = transformer.transform(float(position[0]), float(position[1]))
    return [round(lon, 7), round(lat, 7)]


def convert_geometry_to_wgs84(geometry: dict, transformer: Transformer) -> dict:
    geometry_type = geometry["type"]
    coordinates = geometry["coordinates"]
    if geometry_type == "Polygon":
        converted = [
            [convert_position(position, transformer) for position in ring]
            for ring in coordinates
        ]
    elif geometry_type == "MultiPolygon":
        converted = [
            [
                [convert_position(position, transformer) for position in ring]
                for ring in polygon
            ]
            for polygon in coordinates
        ]
    else:
        raise ValueError(f"Unsupported geometry type: {geometry_type}")
    return {"type": geometry_type, "coordinates": converted}


def geometry_positions(geometry: dict) -> list[list[float]]:
    positions: list[list[float]] = []

    def walk(value):
        if (
            isinstance(value, list)
            and len(value) >= 2
            and all(isinstance(item, (int, float)) for item in value[:2])
        ):
            positions.append(value)
            return
        if isinstance(value, list):
            for item in value:
                walk(item)

    walk(geometry.get("coordinates", []))
    return positions


def corridor_envelope(features: list[dict], padding_m: float) -> dict:
    positions = []
    for feature in features:
        positions.extend(geometry_positions(feature["geometry"]))
    if not positions:
        raise RuntimeError("Cannot build corridor envelope without source coordinates.")

    min_x = min(float(position[0]) for position in positions) - padding_m
    max_x = max(float(position[0]) for position in positions) + padding_m
    min_y = min(float(position[1]) for position in positions) - padding_m
    max_y = max(float(position[1]) for position in positions) + padding_m
    ring = [
        [min_x, min_y],
        [max_x, min_y],
        [max_x, max_y],
        [min_x, max_y],
        [min_x, min_y],
    ]
    transformer = Transformer.from_crs(ORTSTEILE_SOURCE_CRS, WGS84, always_xy=True)
    return {
        "type": "FeatureCollection",
        "name": f"{SCENARIO_KEY}-corridor-envelope",
        "features": [
            {
                "type": "Feature",
                "id": f"{SCENARIO_KEY}:simulation-corridor-envelope",
                "properties": {
                    "scenarioKey": SCENARIO_KEY,
                    "name": "Simulation-friendly corridor envelope",
                    "source": "Generated padded bbox around official Ortsteil polygons",
                    "sourceCrs": ORTSTEILE_SOURCE_CRS,
                    "paddingM": padding_m,
                    "minX": round(min_x, 2),
                    "maxX": round(max_x, 2),
                    "minY": round(min_y, 2),
                    "maxY": round(max_y, 2),
                    "intendedUse": (
                        "SUMO edge-selection approximation when exact Ortsteil union is too jagged "
                        "for a compact demonstrator cutout."
                    ),
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [convert_position(position, transformer) for position in ring]
                    ],
                },
            }
        ],
    }


def select_target_features() -> tuple[list[dict], list[dict], dict[str, dict]]:
    transformer = Transformer.from_crs(ORTSTEILE_SOURCE_CRS, WGS84, always_xy=True)
    collections: dict[str, dict] = {}
    source_features = []
    selected_features = []
    for target in TARGET_AREAS:
        layer = target["layer"]
        if layer not in collections:
            collections[layer] = fetch_wfs(ORTSTEILE_WFS_URL, layer)
        matches = [
            feature
            for feature in collections[layer].get("features", [])
            if str(feature.get("properties", {}).get(target["idField"])) == target["id"]
        ]
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected one {layer} feature where {target['idField']}={target['id']}, found {len(matches)}."
            )
        feature = matches[0]
        source_features.append(feature)
        properties = {
            **feature.get("properties", {}),
            "scenarioKey": SCENARIO_KEY,
            "selectedRole": target["role"],
            "selectionLayer": layer,
            "selectionField": target["idField"],
            "selectionId": target["id"],
            "selectionReason": target["reason"],
        }
        selected_features.append(
            {
                "type": "Feature",
                "id": f"{target['role']}:{feature.get('id')}",
                "properties": properties,
                "geometry": convert_geometry_to_wgs84(feature["geometry"], transformer),
            }
        )
    return selected_features, source_features, collections


def path_status(path: Path | None) -> dict:
    if path is None:
        return {"path": None, "exists": False}
    return {"path": str(path.resolve()), "exists": path.exists()}


def write_plan(output_dir: Path, sample: str, envelope_padding_m: float) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    features, source_features, collections = select_target_features()

    best_sumo_candidates = candidate_best_sumo_dirs()
    best_sumo_dir = first_existing(best_sumo_candidates, ["berlin.net.xml", "berlin.rou.gz"])
    matsim_candidates = candidate_matsim_plan_files(sample)
    matsim_plans = first_existing(matsim_candidates)

    service_area_geojson = {
        "type": "FeatureCollection",
        "name": SCENARIO_KEY,
        "features": features,
    }
    geojson_path = output_dir / f"{SCENARIO_KEY}.ortsteile.geojson"
    geojson_path.write_text(json.dumps(service_area_geojson, indent=2, ensure_ascii=False), encoding="utf-8")

    envelope_geojson = corridor_envelope(source_features, envelope_padding_m)
    envelope_path = output_dir / f"{SCENARIO_KEY}.corridor-envelope.geojson"
    envelope_path.write_text(json.dumps(envelope_geojson, indent=2, ensure_ascii=False), encoding="utf-8")

    selected = []
    for feature in features:
        props = feature["properties"]
        selected.append(
            {
                "role": props["selectedRole"],
                "layer": props["selectionLayer"],
                "idField": props["selectionField"],
                "id": props["selectionId"],
                "name": props.get("nam"),
                "schluessel": props.get("sch"),
                "areaSqM": props.get("gdf"),
                "uuid": props.get("uuid"),
            }
        )

    manifest = {
        "scenarioKey": SCENARIO_KEY,
        "scenarioName": SCENARIO_NAME,
        "status": "planning_scaffold",
        "createdBy": Path(__file__).name,
        "sourceBoundary": {
            "provider": "Geoportal Berlin / ALKIS Ortsteile WFS",
            "url": ORTSTEILE_WFS_URL,
            "layer": ORTSTEILE_LAYER,
            "sourceCrs": ORTSTEILE_SOURCE_CRS,
            "outputCrs": WGS84,
            "featureCounts": {layer: len(collection.get("features", [])) for layer, collection in collections.items()},
            "selectedAreas": selected,
        },
        "serviceGeometryStrategy": {
            "officialBoundary": (
                "Use the three official Ortsteil polygons for source provenance, user-facing inspection, "
                "and MATSim demand membership unless the product intentionally chooses a broader corridor."
            ),
            "simulationEnvelope": {
                "path": str(envelope_path.relative_to(PROJECT_ROOT)),
                "method": "Padded EPSG:25833 bounding rectangle around the selected official Ortsteil polygons.",
                "paddingM": envelope_padding_m,
                "intendedUse": (
                    "Candidate SUMO edge-selection polygon for a clean rectangular-ish west-central corridor. "
                    "If used, report it as an approximation rather than an official neighborhood boundary."
                ),
            },
            "screenshotContext": [
                r"C:\Users\KitCat\Pictures\Screenshots\Screenshot 2026-07-03 163916.png",
                r"C:\Users\KitCat\Pictures\Screenshots\Screenshot 2026-07-03 163928.png",
                r"C:\Users\KitCat\Pictures\Screenshots\Screenshot 2026-07-03 163939.png",
            ],
        },
        "fleetAndDepotStrategy": {
            "initialFleetSize": INITIAL_FLEET_SIZE,
            "depotUserControl": False,
            "depotStory": FIXED_DEPOT_STORY,
            "depotEdge": FIXED_DEPOT_EDGE,
            "depotReturnEdge": FIXED_DEPOT_RETURN_EDGE,
            "operatingModel": [
                "Keep the existing depot location/story as a visual marker and fleet origin.",
                "During onboarding/tutorial playback, cabs may be shown driving from the depot in the background.",
                "At service start, the 5 cabs should already be staged inside the Charlottenburg + Moabit + Tiergarten service area.",
                "Do not count the depot-to-service staging drive as active customer service.",
                "After the 18:00-21:00 service window, cabs return to the fixed depot.",
                "Do not expose depot choice as a user control.",
            ],
        },
        "localSourceAvailability": {
            "bestSumoDir": path_status(best_sumo_dir),
            "bestSumoCandidates": [str(path) for path in best_sumo_candidates],
            "matsimPlans": path_status(matsim_plans),
            "matsimPlanCandidates": [str(path) for path in matsim_candidates],
            "matsimSample": sample,
        },
        "plannedOutputs": {
            "sourceBoundaryGeojson": str(geojson_path.relative_to(PROJECT_ROOT)),
            "simulationEnvelopeGeojson": str(envelope_path.relative_to(PROJECT_ROOT)),
            "sumoIntermediateDir": f"data/intermediate/sumo/{SCENARIO_KEY}/",
            "appSumoDir": f"hf-space/app/sumo/{SCENARIO_KEY}/",
            "demandOutputBase": f"data/processed/matsim/{SCENARIO_KEY}_person_trips_v6_4_{sample.replace('.', '_')}_180000_210000",
        },
        "generatorPlan": [
            "Use the official Ortsteil GeoJSON as the service-area membership test for demand extraction.",
            "Use either official Ortsteil polygons or the generated corridor envelope for SUMO edge selection, then document which one was used.",
            "Parse BeST berlin.net.xml and keep road edges whose lane or edge midpoint is inside the selected service polygon.",
            "Add connector edges from the fixed depot edge to the service-zone edge set using sumolib shortest paths.",
            "Generate initial staging positions for 5 cabs inside the service area before the 18:00 service start.",
            "Run netconvert with --keep-edges.input-file instead of a single --keep-edges.in-boundary polygon.",
            "Filter berlin.rou.gz to strict-contained background routes inside the service-zone edge set, excluding depot connector-only edges.",
            "Extract MATSim person trips for 18:00-21:00 whose origin and destination are inside the Ortsteil service area.",
        ],
        "acceptanceChecks": [
            "Boundary GeoJSON contains exactly the official Charlottenburg, Moabit, and Tiergarten Ortsteil features.",
            "No selected target area is Mitte Zentrum or any other Mitte core replacement.",
            "Corridor envelope is visually inspected against the screenshots before it becomes a SUMO cutout input.",
            "Generated SUMO net validates with netconvert/sumo and contains a connected path from depot edge to service-zone entry edges.",
            "Scenario manifest fixes fleet size at 5 and does not expose depot choice as a user control.",
            "Service playback starts with all 5 cabs staged in the service area; depot drive-in is tutorial/background only.",
            "Post-service return-to-depot path is feasible from service-zone edges.",
            "Background route filter reports total, kept, and rejected vehicle counts.",
            "MATSim demand metadata reports persons read, trips in window, trips inside area, and candidate car/ride trips.",
            "Backend smoke checks pass after the packaged scenario is wired into hf-space/app/main.py.",
        ],
        "blockers": [
            "Current isolated worktree does not include the legacy MATSim demand script; the older desktop checkout has a reference implementation.",
            "Current isolated worktree does not include BeST berlin.net.xml, berlin.rou.gz, or cutouts.txt; the planner found them in a nearby EV Mobility Dashboard project path.",
            "Multi-feature official service areas need edge-list generation; a single hand-written SUMO boundary string is not sufficient.",
        ],
    }
    manifest_path = output_dir / f"{SCENARIO_KEY}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return {
        "geojson": geojson_path,
        "envelope": envelope_path,
        "manifest": manifest_path,
        "manifestData": manifest,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plan the Charlottenburg + Moabit + Tiergarten scenario without running SUMO generation."
    )
    parser.add_argument("--output-dir", type=Path, default=default_output_dir())
    parser.add_argument("--sample", default="1pct", help="MATSim v6.4 sample to look for locally.")
    parser.add_argument(
        "--envelope-padding-m",
        type=float,
        default=250.0,
        help="Padding around the official Ortsteil bbox for the simulation-friendly corridor envelope.",
    )
    args = parser.parse_args()

    result = write_plan(args.output_dir, args.sample, args.envelope_padding_m)
    print(f"Wrote Ortsteile:    {result['geojson']}")
    print(f"Wrote corridor:     {result['envelope']}")
    print(f"Wrote manifest:     {result['manifest']}")
    availability = result["manifestData"]["localSourceAvailability"]
    print(f"BeST SUMO source:   {availability['bestSumoDir']['path'] or 'missing'}")
    print(f"MATSim plans:       {availability['matsimPlans']['path'] or 'missing'}")


if __name__ == "__main__":
    main()
