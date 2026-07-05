from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_KEY = "charlottenburg-moabit-tiergarten"
PLAN_DIR = PROJECT_ROOT / "data" / "source" / "berlin-ortsteile" / SCENARIO_KEY
PLAN_MANIFEST = PLAN_DIR / f"{SCENARIO_KEY}.manifest.json"
OUT_DIR = PROJECT_ROOT / "data" / "intermediate" / "sumo" / SCENARIO_KEY
SUMO_ROOT = Path(r"C:\Program Files (x86)\Eclipse\Sumo")

DEFAULT_BEST_SUMO_DIR = (
    Path.home()
    / "Desktop"
    / "Projects"
    / "EV Mobility Dashboard"
    / "data"
    / "raw"
    / "best-scenario"
    / "scenario"
    / "sumo"
)

NET_NAME = f"{SCENARIO_KEY}.net.xml"
SERVICE_EDGE_LIST_NAME = f"{SCENARIO_KEY}.service-edges.txt"
ACTIVE_EDGE_LIST_NAME = f"{SCENARIO_KEY}.active-edges.txt"
METADATA_NAME = f"{SCENARIO_KEY}.sumo-build-plan.json"
SUMO_BOUNDARY_NAME = f"{SCENARIO_KEY}.corridor.sumo-boundary.txt"

FIXED_DEPOT_EDGE = "8036812#2"
FIXED_DEPOT_RETURN_EDGE = "-8036812#2"
INITIAL_FLEET_SIZE = 5
ROAD_MODES = {"passenger", "taxi", "drt", "car"}


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def find_best_sumo_dir(plan: dict[str, Any]) -> Path:
    env_path = os.getenv("BEST_SUMO_DIR")
    if env_path:
        return Path(env_path)
    path = plan.get("localSourceAvailability", {}).get("bestSumoDir", {}).get("path")
    if path:
        return Path(path)
    return DEFAULT_BEST_SUMO_DIR


def find_sumo_root() -> Path:
    env_path = os.getenv("SUMO_HOME")
    if env_path:
        return Path(env_path)
    return SUMO_ROOT


def read_net_location(net_path: Path) -> tuple[tuple[float, float], str]:
    for _event, elem in ET.iterparse(net_path, events=("start",)):
        if elem.tag == "location":
            net_offset = tuple(float(value) for value in elem.attrib["netOffset"].split(","))
            proj_parameter = elem.attrib.get("projParameter", "")
            elem.clear()
            return (net_offset[0], net_offset[1]), proj_parameter
        elem.clear()
    raise RuntimeError(f"No <location> element found in {net_path}")


def parse_pair(value: str) -> tuple[float, float]:
    x, y = value.split(",", maxsplit=1)
    return float(x), float(y)


def parse_shape(value: str) -> list[tuple[float, float]]:
    return [parse_pair(point) for point in value.split() if point]


def shape_midpoint(shape: list[tuple[float, float]]) -> tuple[float, float] | None:
    if not shape:
        return None
    if len(shape) == 1:
        return shape[0]

    segments = []
    total = 0.0
    for start, end in zip(shape, shape[1:]):
        length = ((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2) ** 0.5
        segments.append((start, end, length))
        total += length
    if total <= 0:
        return shape[len(shape) // 2]

    target = total / 2
    walked = 0.0
    for start, end, length in segments:
        if walked + length >= target:
            ratio = (target - walked) / length if length else 0
            return (
                start[0] + (end[0] - start[0]) * ratio,
                start[1] + (end[1] - start[1]) * ratio,
            )
        walked += length
    return shape[-1]


def corridor_bounds(plan: dict[str, Any]) -> dict[str, float]:
    envelope_path = PROJECT_ROOT / plan["serviceGeometryStrategy"]["simulationEnvelope"]["path"]
    envelope = load_json(envelope_path)
    feature = envelope["features"][0]
    props = feature["properties"]
    return {
        "minX": float(props["minX"]),
        "maxX": float(props["maxX"]),
        "minY": float(props["minY"]),
        "maxY": float(props["maxY"]),
    }


def sumo_to_source_xy(
    point: tuple[float, float],
    net_offset: tuple[float, float],
) -> tuple[float, float]:
    return point[0] - net_offset[0], point[1] - net_offset[1]


def source_to_sumo_xy(
    point: tuple[float, float],
    net_offset: tuple[float, float],
) -> tuple[float, float]:
    return point[0] + net_offset[0], point[1] + net_offset[1]


def inside_bounds(point: tuple[float, float], bounds: dict[str, float]) -> bool:
    return (
        bounds["minX"] <= point[0] <= bounds["maxX"]
        and bounds["minY"] <= point[1] <= bounds["maxY"]
    )


def mode_set(edge_elem: ET.Element, lane_elem: ET.Element) -> set[str]:
    allow = lane_elem.attrib.get("allow") or edge_elem.attrib.get("allow")
    disallow = lane_elem.attrib.get("disallow") or edge_elem.attrib.get("disallow")
    if allow:
        return {mode.strip() for mode in allow.split() if mode.strip()}
    if disallow and "passenger" in disallow and "taxi" in disallow:
        return set()
    return {"passenger"}


def select_service_edges(
    net_path: Path,
    bounds: dict[str, float],
    net_offset: tuple[float, float],
) -> tuple[set[str], dict[str, Any], list[dict[str, Any]]]:
    selected_edges: set[str] = set()
    edge_records: list[dict[str, Any]] = []
    total_edges = 0
    internal_edges = 0
    road_edges = 0
    selected_length_m = 0.0
    road_length_m = 0.0
    selected_mode_counts: dict[str, int] = {}

    for _event, elem in ET.iterparse(net_path, events=("end",)):
        if elem.tag != "edge":
            if elem.tag != "lane":
                elem.clear()
            continue

        edge_id = elem.attrib.get("id")
        total_edges += 1
        if not edge_id or elem.attrib.get("function") == "internal" or edge_id.startswith(":"):
            internal_edges += 1
            elem.clear()
            continue

        edge_selected = False
        edge_midpoint: tuple[float, float] | None = None
        edge_length = 0.0
        edge_modes: set[str] = set()

        for lane in elem.findall("lane"):
            lane_modes = mode_set(elem, lane)
            edge_modes.update(lane_modes)
            if not (lane_modes & ROAD_MODES):
                continue

            road_edges += 1
            lane_length = float(lane.attrib.get("length", "0") or 0)
            road_length_m += lane_length
            edge_length = max(edge_length, lane_length)
            shape = parse_shape(lane.attrib.get("shape", ""))
            midpoint = shape_midpoint(shape)
            if midpoint is None:
                continue
            source_midpoint = sumo_to_source_xy(midpoint, net_offset)
            if inside_bounds(source_midpoint, bounds):
                edge_selected = True
                edge_midpoint = midpoint

        if edge_selected:
            selected_edges.add(edge_id)
            selected_length_m += edge_length
            for mode in sorted(edge_modes):
                selected_mode_counts[mode] = selected_mode_counts.get(mode, 0) + 1
            if edge_midpoint is not None:
                source_midpoint = sumo_to_source_xy(edge_midpoint, net_offset)
                edge_records.append(
                    {
                        "edgeId": edge_id,
                        "sumoX": round(edge_midpoint[0], 2),
                        "sumoY": round(edge_midpoint[1], 2),
                        "sourceX": round(source_midpoint[0], 2),
                        "sourceY": round(source_midpoint[1], 2),
                        "lengthM": round(edge_length, 2),
                        "modes": sorted(edge_modes),
                    }
                )

        elem.clear()

    stats = {
        "totalEdges": total_edges,
        "internalEdges": internal_edges,
        "roadLaneRecordsConsidered": road_edges,
        "selectedServiceEdges": len(selected_edges),
        "roadLaneLengthKm": round(road_length_m / 1000, 3),
        "selectedServiceEdgeLengthKm": round(selected_length_m / 1000, 3),
        "selectedModeCounts": selected_mode_counts,
    }
    return selected_edges, stats, edge_records


def load_sumolib(sumo_root: Path):
    tools_path = sumo_root / "tools"
    if str(tools_path) not in sys.path:
        sys.path.append(str(tools_path))
    import sumolib  # type: ignore[import-not-found]

    return sumolib


def shortest_path_edges(net, from_edge_id: str, to_edge_id: str) -> list[str] | None:
    try:
        from_edge = net.getEdge(from_edge_id)
        to_edge = net.getEdge(to_edge_id)
        path, _cost = net.getShortestPath(from_edge, to_edge)
    except Exception:
        return None
    if not path:
        return None
    return [edge.getID() for edge in path]


def path_length_m(net, edge_ids: list[str]) -> float:
    total = 0.0
    for edge_id in edge_ids:
        try:
            total += float(net.getEdge(edge_id).getLength())
        except Exception:
            continue
    return total


def build_depot_connector(
    source_net: Path,
    sumo_root: Path,
    selected_edges: set[str],
    max_candidates: int,
    max_routes: int,
) -> tuple[set[str], list[dict[str, Any]]]:
    sumolib = load_sumolib(sumo_root)
    net = sumolib.net.readNet(str(source_net), withInternal=False)
    depot_edge = net.getEdge(FIXED_DEPOT_EDGE)
    depot_center = depot_edge.getShape()[len(depot_edge.getShape()) // 2]

    candidates = []
    for edge_id in selected_edges:
        try:
            edge = net.getEdge(edge_id)
        except Exception:
            continue
        if not (edge.allows("taxi") or edge.allows("passenger")):
            continue
        shape = edge.getShape()
        ex, ey = shape[len(shape) // 2]
        distance = ((depot_center[0] - ex) ** 2 + (depot_center[1] - ey) ** 2) ** 0.5
        candidates.append((distance, edge_id))

    connector = {FIXED_DEPOT_EDGE, FIXED_DEPOT_RETURN_EDGE}
    selected_routes = []
    for distance, candidate_id in sorted(candidates)[:max_candidates]:
        outbound = shortest_path_edges(net, FIXED_DEPOT_EDGE, candidate_id)
        inbound = shortest_path_edges(net, candidate_id, FIXED_DEPOT_EDGE)
        if not outbound or not inbound:
            continue
        connector.update(outbound)
        connector.update(inbound)
        selected_routes.append(
            {
                "entryEdge": candidate_id,
                "straightLineDistanceM": round(distance, 1),
                "outboundEdges": len(outbound),
                "inboundEdges": len(inbound),
                "outboundLengthM": round(path_length_m(net, outbound), 1),
                "inboundLengthM": round(path_length_m(net, inbound), 1),
            }
        )
        if len(selected_routes) >= max_routes:
            break

    if not selected_routes:
        raise RuntimeError("No depot connector route into the service edge set was found.")
    return connector, selected_routes


def select_staging_edges(edge_records: list[dict[str, Any]], bounds: dict[str, float]) -> list[dict[str, Any]]:
    center_x = (bounds["minX"] + bounds["maxX"]) / 2
    center_y = (bounds["minY"] + bounds["maxY"]) / 2
    width = bounds["maxX"] - bounds["minX"]
    height = bounds["maxY"] - bounds["minY"]
    targets = [
        ("center", center_x, center_y),
        ("west", center_x - width * 0.25, center_y),
        ("east", center_x + width * 0.25, center_y),
        ("north", center_x, center_y + height * 0.25),
        ("south", center_x, center_y - height * 0.25),
    ]
    usable = [
        record
        for record in edge_records
        if set(record.get("modes", [])) & {"passenger", "taxi"}
    ]
    selected: list[dict[str, Any]] = []
    minimum_spacing_m = 250.0

    def record_distance(record: dict[str, Any], x: float, y: float) -> float:
        return ((record["sourceX"] - x) ** 2 + (record["sourceY"] - y) ** 2) ** 0.5

    def selected_distance(record: dict[str, Any], other: dict[str, Any]) -> float:
        return (
            (record["sourceX"] - other["sourceX"]) ** 2
            + (record["sourceY"] - other["sourceY"]) ** 2
        ) ** 0.5

    for target_name, target_x, target_y in targets:
        ranked = sorted(
            usable,
            key=lambda record: (
                record_distance(record, target_x, target_y),
                record["edgeId"],
            ),
        )
        pick = None
        used_edge_ids = {record["edgeId"] for record in selected}
        for record in ranked:
            if record["edgeId"] in used_edge_ids:
                continue
            if selected and min(selected_distance(record, other) for other in selected) < minimum_spacing_m:
                continue
            pick = record
            break
        if pick is None:
            pick = next(record for record in ranked if record["edgeId"] not in used_edge_ids)

        selected.append(
            {
                **pick,
                "targetSlot": target_name,
                "targetSourceX": round(target_x, 2),
                "targetSourceY": round(target_y, 2),
                "distanceToTargetM": round(record_distance(pick, target_x, target_y), 1),
                "internal": False,
                "validForTaxiOrPassenger": True,
            }
        )
        if len(selected) >= INITIAL_FLEET_SIZE:
            break

    for record in selected:
        other_distances = [
            selected_distance(record, other)
            for other in selected
            if other["edgeId"] != record["edgeId"]
        ]
        record["nearestOtherStagingEdgeM"] = (
            round(min(other_distances), 1) if other_distances else None
        )

    return selected


def write_edge_file(path: Path, edge_ids: set[str]) -> None:
    path.write_text("\n".join(sorted(edge_ids)) + "\n", encoding="utf-8")


def write_sumo_boundary(path: Path, bounds: dict[str, float], net_offset: tuple[float, float]) -> str:
    source_ring = [
        (bounds["minX"], bounds["minY"]),
        (bounds["maxX"], bounds["minY"]),
        (bounds["maxX"], bounds["maxY"]),
        (bounds["minX"], bounds["maxY"]),
        (bounds["minX"], bounds["minY"]),
    ]
    sumo_ring = [source_to_sumo_xy(point, net_offset) for point in source_ring]
    boundary = " ".join(f"{x:.2f},{y:.2f}" for x, y in sumo_ring)
    path.write_text(boundary + "\n", encoding="utf-8")
    return boundary


def run(command: list[Any], cwd: Path, env: dict[str, str] | None = None) -> None:
    print(" ".join(str(part) for part in command))
    subprocess.run(command, cwd=cwd, check=True, env=env)


def count_sumo_net(net_path: Path) -> dict[str, int]:
    counts = {
        "edgeTags": 0,
        "nonInternalEdgeTags": 0,
        "internalEdgeTags": 0,
        "laneTags": 0,
        "junctionTags": 0,
        "connectionTags": 0,
        "tlLogicTags": 0,
    }
    for _event, elem in ET.iterparse(net_path, events=("end",)):
        if elem.tag == "edge":
            counts["edgeTags"] += 1
            if elem.attrib.get("function") == "internal" or elem.attrib.get("id", "").startswith(":"):
                counts["internalEdgeTags"] += 1
            else:
                counts["nonInternalEdgeTags"] += 1
        elif elem.tag == "lane":
            counts["laneTags"] += 1
        elif elem.tag == "junction":
            counts["junctionTags"] += 1
        elif elem.tag == "connection":
            counts["connectionTags"] += 1
        elif elem.tag == "tlLogic":
            counts["tlLogicTags"] += 1
        elem.clear()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the service-area edge list and optional SUMO cutout for Charlottenburg + Moabit + Tiergarten."
    )
    parser.add_argument("--best-sumo-dir", type=Path, default=None)
    parser.add_argument("--sumo-root", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--connector-candidates", type=int, default=256)
    parser.add_argument("--connector-routes", type=int, default=32)
    parser.add_argument("--skip-depot-connector", action="store_true")
    parser.add_argument("--run-netconvert", action="store_true")
    args = parser.parse_args()

    plan = load_json(PLAN_MANIFEST)
    best_sumo_dir = args.best_sumo_dir or find_best_sumo_dir(plan)
    sumo_root = args.sumo_root or find_sumo_root()
    source_net = best_sumo_dir / "berlin.net.xml"
    source_routes = best_sumo_dir / "berlin.rou.gz"
    netconvert = sumo_root / "bin" / ("netconvert.exe" if os.name == "nt" else "netconvert")

    for path in [source_net, source_routes]:
        if not path.exists():
            raise FileNotFoundError(path)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    bounds = corridor_bounds(plan)
    net_offset, proj_parameter = read_net_location(source_net)

    service_edges, selection_stats, edge_records = select_service_edges(
        source_net,
        bounds,
        net_offset,
    )
    if not service_edges:
        raise RuntimeError("No service edges were selected from the corridor envelope.")

    connector_edges: set[str] = set()
    connector_routes: list[dict[str, Any]] = []
    if not args.skip_depot_connector:
        connector_edges, connector_routes = build_depot_connector(
            source_net,
            sumo_root,
            service_edges,
            args.connector_candidates,
            args.connector_routes,
        )

    active_edges = set(service_edges) | connector_edges
    service_edge_path = args.out_dir / SERVICE_EDGE_LIST_NAME
    active_edge_path = args.out_dir / ACTIVE_EDGE_LIST_NAME
    sumo_boundary_path = args.out_dir / SUMO_BOUNDARY_NAME
    metadata_path = args.out_dir / METADATA_NAME
    net_path = args.out_dir / NET_NAME

    write_edge_file(service_edge_path, service_edges)
    write_edge_file(active_edge_path, active_edges)
    sumo_boundary = write_sumo_boundary(sumo_boundary_path, bounds, net_offset)
    staging_edges = select_staging_edges(edge_records, bounds)

    netconvert_command = [
        str(netconvert),
        "-s",
        str(source_net),
        "-o",
        str(net_path),
        "--keep-edges.input-file",
        str(active_edge_path),
        "-v",
    ]

    metadata: dict[str, Any] = {
        "scenarioKey": SCENARIO_KEY,
        "status": "edge_list_ready",
        "source": {
            "bestSumoDir": str(best_sumo_dir.resolve()),
            "sourceNet": str(source_net.resolve()),
            "sourceRoutes": str(source_routes.resolve()),
            "sumoRoot": str(sumo_root.resolve()),
            "projParameter": proj_parameter,
            "netOffset": list(net_offset),
        },
        "geometry": {
            "strategy": "cleaned corridor envelope from official Ortsteil polygons",
            "sourceCrs": "EPSG:25833",
            "bounds": bounds,
            "sumoBoundary": sumo_boundary,
        },
        "counts": {
            **selection_stats,
            "connectorEdges": len(connector_edges),
            "activeEdges": len(active_edges),
            "stagingEdges": len(staging_edges),
            "initialFleetSize": INITIAL_FLEET_SIZE,
        },
        "depot": {
            "depotEdge": FIXED_DEPOT_EDGE,
            "depotReturnEdge": FIXED_DEPOT_RETURN_EDGE,
            "connectorRoutes": connector_routes,
            "depotUserControl": False,
        },
        "staging": {
            "rule": "Pick 5 passenger/taxi-capable service edges near spread target slots across the corridor.",
            "validation": {
                "allNonInternal": all(not edge["internal"] for edge in staging_edges),
                "allValidForTaxiOrPassenger": all(
                    edge["validForTaxiOrPassenger"] for edge in staging_edges
                ),
                "minimumNearestOtherStagingEdgeM": min(
                    edge["nearestOtherStagingEdgeM"]
                    for edge in staging_edges
                    if edge["nearestOtherStagingEdgeM"] is not None
                ),
                "targetSlots": [edge["targetSlot"] for edge in staging_edges],
            },
            "edges": staging_edges,
        },
        "packagingStatus": {
            "networkCutout": "generated only in data/intermediate; not packaged into hf-space/app/sumo",
            "backgroundRoutes": "not generated",
            "demand": "not generated",
            "backendScenarioRegistration": "not done",
            "routeFilterMustUse": "serviceEdges",
            "routeFilterMustNotUse": "activeEdges",
            "reason": (
                "activeEdges includes fixed depot connector links for tutorial/return movement; "
                "using it for background traffic would allow connector-only boundary traffic."
            ),
        },
        "outputs": {
            "serviceEdges": str(service_edge_path.resolve()),
            "activeEdges": str(active_edge_path.resolve()),
            "sumoBoundary": str(sumo_boundary_path.resolve()),
            "netconvertOutput": str(net_path.resolve()),
        },
        "commands": {
            "netconvert": netconvert_command,
        },
        "notes": [
            "Background route filtering should use serviceEdges, not activeEdges, so connector-only depot links do not create boundary-spawning traffic.",
            "Route and demand packaging is not complete in this step.",
            "Active service starts with cabs staged inside the service area; depot movement is tutorial/background or post-service return.",
        ],
    }

    if args.run_netconvert:
        if not netconvert.exists():
            raise FileNotFoundError(netconvert)
        env = os.environ.copy()
        env["SUMO_HOME"] = str(sumo_root)
        run(netconvert_command, cwd=PROJECT_ROOT, env=env)
        metadata["status"] = "netconvert_complete"
        metadata["outputs"]["netExists"] = net_path.exists()
        metadata["outputs"]["netBytes"] = net_path.stat().st_size if net_path.exists() else 0
        if net_path.exists():
            metadata["generatedNetCounts"] = count_sumo_net(net_path)

    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(json.dumps(metadata["counts"], indent=2))
    print(f"Wrote service edges: {service_edge_path}")
    print(f"Wrote active edges:  {active_edge_path}")
    print(f"Wrote metadata:      {metadata_path}")
    if not args.run_netconvert:
        print("Netconvert not run. Use --run-netconvert to build the SUMO network.")
        print("Command:")
        print(" ".join(netconvert_command))


if __name__ == "__main__":
    main()
