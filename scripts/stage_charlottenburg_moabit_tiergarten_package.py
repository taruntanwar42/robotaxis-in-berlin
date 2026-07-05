from __future__ import annotations

import argparse
import json
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_KEY = "charlottenburg-moabit-tiergarten"
INTERMEDIATE_DIR = PROJECT_ROOT / "data" / "intermediate" / "sumo" / SCENARIO_KEY
SOURCE_GEOMETRY_DIR = PROJECT_ROOT / "data" / "source" / "berlin-ortsteile" / SCENARIO_KEY
DEFAULT_STAGING_DIR = INTERMEDIATE_DIR / "package-staging" / SCENARIO_KEY
LIVE_RUNTIME_DIR = PROJECT_ROOT / "hf-space" / "app" / "sumo" / SCENARIO_KEY

NET_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.net.xml"
ROUTE_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.service-contained.rou.xml"
BUILD_PLAN_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.sumo-build-plan.json"
ROUTE_METADATA_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.service-contained.routes.metadata.json"
SERVICE_EDGES_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.service-edges.txt"
ACTIVE_EDGES_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.active-edges.txt"
CORRIDOR_BOUNDARY_SOURCE = INTERMEDIATE_DIR / f"{SCENARIO_KEY}.corridor.sumo-boundary.txt"
CORRIDOR_GEOJSON_SOURCE = SOURCE_GEOMETRY_DIR / f"{SCENARIO_KEY}.corridor-envelope.geojson"
OFFICIAL_ORSTEILE_SOURCE = SOURCE_GEOMETRY_DIR / f"{SCENARIO_KEY}.ortsteile.geojson"
PROVENANCE_MANIFEST_SOURCE = SOURCE_GEOMETRY_DIR / f"{SCENARIO_KEY}.manifest.json"

PACKAGE_NET = f"{SCENARIO_KEY}.net.xml"
PACKAGE_ROUTES = f"{SCENARIO_KEY}-contained.rou.xml"
PACKAGE_CONFIG = f"{SCENARIO_KEY}.sumocfg"
PACKAGE_WINDOW_CONFIG = f"{SCENARIO_KEY}-1800-2100.sumocfg"
PACKAGE_GEOJSON = f"{SCENARIO_KEY}.geojson"
PACKAGE_METADATA = "metadata.json"
PACKAGE_BUILD_PLAN = f"{SCENARIO_KEY}.sumo-build-plan.json"
PACKAGE_ROUTE_METADATA = f"{SCENARIO_KEY}.service-contained.routes.metadata.json"
PACKAGE_OFFICIAL_GEOJSON = f"{SCENARIO_KEY}.official-ortsteile.geojson"
PACKAGE_PROVENANCE_MANIFEST = f"{SCENARIO_KEY}.source-manifest.json"

SHIFT_BEGIN_SECONDS = 18 * 60 * 60
SHIFT_END_SECONDS = 21 * 60 * 60
INITIAL_FLEET_SIZE = 5


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def require_file(path: Path) -> None:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(path)


def ensure_safe_staging_dir(path: Path) -> Path:
    resolved = path.resolve()
    intermediate_root = INTERMEDIATE_DIR.resolve()
    live_root = LIVE_RUNTIME_DIR.resolve()
    if resolved == live_root or live_root in resolved.parents:
        raise RuntimeError(f"Refusing to stage directly into live runtime path: {resolved}")
    if resolved != intermediate_root and intermediate_root not in resolved.parents:
        raise RuntimeError(f"Staging path must stay under {intermediate_root}: {resolved}")
    return resolved


def copy_required_file(source: Path, target: Path) -> dict[str, Any]:
    require_file(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    return {
        "source": str(source.resolve()),
        "target": str(target.resolve()),
        "bytes": target.stat().st_size,
    }


def write_sumocfg(path: Path, route_file: str, output_prefix: str) -> None:
    sumocfg = f"""<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value="{PACKAGE_NET}"/>
        <route-files value="{route_file}"/>
    </input>
    <output>
        <output-prefix value="output/{output_prefix}"/>
        <log value="console_1800_2100.log"/>
        <summary-output value="summary_1800_2100.xml"/>
        <statistic-output value="statistics_1800_2100.xml"/>
    </output>
    <time>
        <begin value="{float(SHIFT_BEGIN_SECONDS):.1f}"/>
        <end value="{float(SHIFT_END_SECONDS):.1f}"/>
    </time>
    <processing>
        <route-steps value="200"/>
        <no-internal-links value="false"/>
        <ignore-junction-blocker value="20"/>
        <time-to-teleport value="120.0"/>
        <time-to-teleport.highways value="0"/>
        <eager-insert value="false"/>
    </processing>
    <random_number>
        <random value="false"/>
        <seed value="251920"/>
    </random_number>
</configuration>
"""
    path.write_text(sumocfg, encoding="utf-8", newline="\n")


def validate_sumocfg_paths(path: Path) -> dict[str, Any]:
    tree = ET.parse(path)
    root = tree.getroot()

    net_elem = root.find("./input/net-file")
    route_elem = root.find("./input/route-files")
    begin_elem = root.find("./time/begin")
    end_elem = root.find("./time/end")
    net_value = net_elem.attrib["value"] if net_elem is not None else None
    route_value = route_elem.attrib["value"] if route_elem is not None else None
    begin = float(begin_elem.attrib["value"]) if begin_elem is not None else None
    end = float(end_elem.attrib["value"]) if end_elem is not None else None

    if begin != float(SHIFT_BEGIN_SECONDS) or end != float(SHIFT_END_SECONDS):
        raise RuntimeError(f"Unexpected SUMO time window in {path}: {begin} to {end}")
    if not net_value or not (path.parent / net_value).exists():
        raise RuntimeError(f"SUMO config net-file is missing or unresolved: {net_value}")
    if not route_value or not (path.parent / route_value).exists():
        raise RuntimeError(f"SUMO config route-files is missing or unresolved: {route_value}")

    return {
        "config": str(path.resolve()),
        "netFile": net_value,
        "routeFiles": route_value,
        "begin": begin,
        "end": end,
        "pathsResolve": True,
    }


def package_metadata(
    staging_dir: Path,
    build_plan: dict[str, Any],
    route_metadata: dict[str, Any],
    copied_files: dict[str, dict[str, Any]],
    config_validation: dict[str, Any],
) -> dict[str, Any]:
    return {
        "scenarioKey": SCENARIO_KEY,
        "name": "Charlottenburg + Moabit + Tiergarten service zone",
        "packageStatus": "staged-intermediate-only",
        "stagingDir": str(staging_dir.resolve()),
        "intendedRuntimeDir": str(LIVE_RUNTIME_DIR.resolve()),
        "liveRuntimeWritten": False,
        "shiftWindow": {
            "label": "18:00-21:00",
            "beginSeconds": SHIFT_BEGIN_SECONDS,
            "endSeconds": SHIFT_END_SECONDS,
        },
        "initialFleetSize": INITIAL_FLEET_SIZE,
        "depot": {
            "fixed": True,
            "depotEdge": build_plan.get("depot", {}).get("depotEdge"),
            "depotReturnEdge": build_plan.get("depot", {}).get("depotReturnEdge"),
            "connectorRoutesSample": build_plan.get("depot", {}).get("connectorRoutes", [])[:5],
        },
        "serviceArea": {
            "key": SCENARIO_KEY,
            "boundaryFile": PACKAGE_GEOJSON,
            "officialProvenanceFile": PACKAGE_OFFICIAL_GEOJSON,
            "strategy": build_plan.get("geometry", {}).get("strategy"),
            "sourceCrs": build_plan.get("geometry", {}).get("sourceCrs"),
        },
        "guardrails": {
            "backgroundRouteFilterEdgeSet": route_metadata.get("routeFilterEdgeSet"),
            "activeEdgesNotUsedForBackgroundRoutes": route_metadata.get("activeEdgesNotUsed"),
            "serviceEdgesDriveTrafficAndDemandFiltering": True,
            "activeEdgesIncludeDepotConnectorsOnlyForDepotOriginReturnMovement": True,
            "doNotSpawnBackgroundTrafficFromDepotConnectorOnlyEdges": True,
        },
        "counts": {
            "serviceEdges": build_plan.get("counts", {}).get("selectedServiceEdges"),
            "activeEdges": build_plan.get("counts", {}).get("activeEdges"),
            "connectorEdges": build_plan.get("counts", {}).get("connectorEdges"),
            "generatedNet": build_plan.get("generatedNetCounts", {}),
            "vehiclesScanned": route_metadata.get("vehiclesScanned"),
            "vehiclesKept": route_metadata.get("vehiclesKept"),
            "vehiclesRejected": route_metadata.get("vehiclesRejected"),
            "vehiclesWithoutRoute": route_metadata.get("vehiclesWithoutRoute"),
        },
        "staging": build_plan.get("staging", {}),
        "files": copied_files,
        "sumocfg": config_validation,
        "remainingRuntimeBlockers": [
            "MATSim 18:00-21:00 demand extract is not packaged yet.",
            "Backend SUMO_SCENARIOS registration has not been edited.",
            "Frontend scenario key/map switching has not been edited.",
            "Full TraCI playback validation with robotaxi-controlled vehicles is not done.",
            "Staged package has not been copied into hf-space/app/sumo.",
        ],
    }


def stage_package(staging_dir: Path, force: bool) -> dict[str, Any]:
    staging_dir = ensure_safe_staging_dir(staging_dir)
    if staging_dir.exists() and any(staging_dir.iterdir()) and not force:
        raise RuntimeError(f"Staging directory is not empty; pass --force to replace files: {staging_dir}")
    staging_dir.mkdir(parents=True, exist_ok=True)
    (staging_dir / "output").mkdir(exist_ok=True)
    (staging_dir / "output" / ".gitkeep").write_text("", encoding="utf-8")

    required_sources = [
        NET_SOURCE,
        ROUTE_SOURCE,
        BUILD_PLAN_SOURCE,
        ROUTE_METADATA_SOURCE,
        SERVICE_EDGES_SOURCE,
        ACTIVE_EDGES_SOURCE,
        CORRIDOR_BOUNDARY_SOURCE,
        CORRIDOR_GEOJSON_SOURCE,
        OFFICIAL_ORSTEILE_SOURCE,
        PROVENANCE_MANIFEST_SOURCE,
    ]
    for source in required_sources:
        require_file(source)

    build_plan = load_json(BUILD_PLAN_SOURCE)
    route_metadata = load_json(ROUTE_METADATA_SOURCE)
    if route_metadata.get("routeFilterEdgeSet") != "serviceEdges":
        raise RuntimeError("Route metadata does not confirm serviceEdges filtering.")
    if route_metadata.get("activeEdgesNotUsed") is not True:
        raise RuntimeError("Route metadata does not confirm activeEdgesNotUsed=true.")

    copied_files = {
        "net": copy_required_file(NET_SOURCE, staging_dir / PACKAGE_NET),
        "routes": copy_required_file(ROUTE_SOURCE, staging_dir / PACKAGE_ROUTES),
        "boundaryGeojson": copy_required_file(CORRIDOR_GEOJSON_SOURCE, staging_dir / PACKAGE_GEOJSON),
        "officialOrtsteileGeojson": copy_required_file(
            OFFICIAL_ORSTEILE_SOURCE, staging_dir / PACKAGE_OFFICIAL_GEOJSON
        ),
        "sourceManifest": copy_required_file(PROVENANCE_MANIFEST_SOURCE, staging_dir / PACKAGE_PROVENANCE_MANIFEST),
        "buildPlan": copy_required_file(BUILD_PLAN_SOURCE, staging_dir / PACKAGE_BUILD_PLAN),
        "routeMetadata": copy_required_file(ROUTE_METADATA_SOURCE, staging_dir / PACKAGE_ROUTE_METADATA),
        "serviceEdges": copy_required_file(SERVICE_EDGES_SOURCE, staging_dir / SERVICE_EDGES_SOURCE.name),
        "activeEdges": copy_required_file(ACTIVE_EDGES_SOURCE, staging_dir / ACTIVE_EDGES_SOURCE.name),
        "sumoBoundary": copy_required_file(CORRIDOR_BOUNDARY_SOURCE, staging_dir / CORRIDOR_BOUNDARY_SOURCE.name),
    }

    write_sumocfg(staging_dir / PACKAGE_CONFIG, PACKAGE_ROUTES, "charlottenburg_moabit_tiergarten_1800_2100_")
    write_sumocfg(
        staging_dir / PACKAGE_WINDOW_CONFIG,
        PACKAGE_ROUTES,
        "charlottenburg_moabit_tiergarten_1800_2100_",
    )
    config_validation = validate_sumocfg_paths(staging_dir / PACKAGE_CONFIG)
    copied_files["config"] = {
        "target": str((staging_dir / PACKAGE_CONFIG).resolve()),
        "bytes": (staging_dir / PACKAGE_CONFIG).stat().st_size,
    }
    copied_files["windowConfigAlias"] = {
        "target": str((staging_dir / PACKAGE_WINDOW_CONFIG).resolve()),
        "bytes": (staging_dir / PACKAGE_WINDOW_CONFIG).stat().st_size,
    }

    metadata = package_metadata(staging_dir, build_plan, route_metadata, copied_files, config_validation)
    metadata_path = staging_dir / PACKAGE_METADATA
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    metadata["files"]["metadata"] = {
        "target": str(metadata_path.resolve()),
        "bytes": metadata_path.stat().st_size,
    }
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Stage the Charlottenburg + Moabit + Tiergarten SUMO package under "
            "data/intermediate only. This never writes to hf-space/app/sumo."
        )
    )
    parser.add_argument("--staging-dir", type=Path, default=DEFAULT_STAGING_DIR)
    parser.add_argument("--force", action="store_true", help="Allow replacing files in the staging directory.")
    args = parser.parse_args()

    metadata = stage_package(args.staging_dir, args.force)
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
