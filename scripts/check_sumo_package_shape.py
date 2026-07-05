"""Validate a staged SUMO scenario package before backend runtime wiring."""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


DEFAULT_SCOPE = "charlottenburg-moabit-tiergarten"
DEFAULT_START_SEC = 64_800
DEFAULT_END_SEC = 75_600


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package-dir", required=True, type=Path)
    parser.add_argument("--scope", default=DEFAULT_SCOPE)
    parser.add_argument("--net-file")
    parser.add_argument("--route-file")
    parser.add_argument("--config-file")
    parser.add_argument("--boundary-file")
    parser.add_argument("--expected-start-sec", type=int, default=DEFAULT_START_SEC)
    parser.add_argument("--expected-end-sec", type=int, default=DEFAULT_END_SEC)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def file_name(value: str | None, fallback: str) -> str:
    return value if value else fallback


def default_route_file(scope: str) -> str:
    return f"{scope}-contained.rou.xml"


def expected_file_names(args: argparse.Namespace) -> dict[str, str]:
    return {
        "net": file_name(args.net_file, f"{args.scope}.net.xml"),
        "route": file_name(args.route_file, default_route_file(args.scope)),
        "config": file_name(args.config_file, f"{args.scope}.sumocfg"),
        "boundary": file_name(args.boundary_file, f"{args.scope}.geojson"),
    }


def resolve_package_dir(package_dir: Path, scope: str, expected: dict[str, str]) -> tuple[Path, str | None]:
    if all((package_dir / filename).exists() for filename in expected.values()):
        return package_dir, None

    nested = package_dir / scope
    if nested.is_dir() and all((nested / filename).exists() for filename in expected.values()):
        return nested, f"resolved nested package directory: {nested}"

    return package_dir, None


def config_value(root: ET.Element, tag: str) -> str | None:
    element = root.find(f".//{tag}")
    if element is None:
        return None
    return element.attrib.get("value")


def split_sumo_file_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def summarize_net(path: Path, errors: list[str]) -> dict[str, Any]:
    try:
        root = ET.parse(path).getroot()
    except Exception as error:
        errors.append(f"net XML cannot be parsed: {error}")
        return {"edges": 0, "lanes": 0, "trafficLights": 0}

    edges = [edge for edge in root.findall("edge") if not edge.attrib.get("id", "").startswith(":")]
    lanes = [
        lane
        for edge in edges
        for lane in edge.findall("lane")
    ]
    traffic_lights = [
        junction
        for junction in root.findall("junction")
        if junction.attrib.get("type") == "traffic_light"
    ]
    if root.find("location") is None:
        errors.append("net XML is missing SUMO location/projection metadata")
    if not edges:
        errors.append("net XML has no non-internal edges")
    if not lanes:
        errors.append("net XML has no non-internal lanes")
    return {"edges": len(edges), "lanes": len(lanes), "trafficLights": len(traffic_lights)}


def summarize_routes(path: Path, errors: list[str]) -> dict[str, int]:
    counts = {"vehicles": 0, "trips": 0, "persons": 0}
    try:
        for _event, element in ET.iterparse(path, events=("end",)):
            if element.tag in {"vehicle", "trip", "person"}:
                counts[f"{element.tag}s"] += 1
            element.clear()
    except Exception as error:
        errors.append(f"route XML cannot be parsed: {error}")
    if sum(counts.values()) == 0:
        errors.append("route XML has no vehicle, trip, or person demand elements")
    return counts


def summarize_boundary(path: Path, errors: list[str]) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as error:
        errors.append(f"boundary GeoJSON cannot be parsed: {error}")
        return {"type": None, "features": 0}

    payload_type = payload.get("type")
    feature_count = len(payload.get("features") or []) if payload_type == "FeatureCollection" else 1
    if payload_type not in {"FeatureCollection", "Feature"}:
        errors.append("boundary GeoJSON must be a Feature or FeatureCollection")
    return {"type": payload_type, "features": feature_count}


def validate_package(args: argparse.Namespace) -> dict[str, Any]:
    requested_package_dir = args.package_dir.resolve()
    expected = expected_file_names(args)
    package_dir, resolved_note = resolve_package_dir(
        requested_package_dir,
        args.scope,
        expected,
    )
    paths = {name: package_dir / filename for name, filename in expected.items()}

    errors: list[str] = []
    warnings: list[str] = []
    if not package_dir.exists():
        errors.append(f"package directory does not exist: {package_dir}")
    elif not package_dir.is_dir():
        errors.append(f"package path is not a directory: {package_dir}")

    files = {name: path.exists() for name, path in paths.items()}
    for name, exists in files.items():
        if not exists:
            errors.append(f"missing {name} file: {paths[name].name}")

    config_summary: dict[str, Any] = {}
    if paths["config"].exists():
        try:
            config_root = ET.parse(paths["config"]).getroot()
            net_refs = split_sumo_file_list(config_value(config_root, "net-file"))
            route_refs = split_sumo_file_list(config_value(config_root, "route-files"))
            additional_refs = split_sumo_file_list(config_value(config_root, "additional-files"))
            begin = config_value(config_root, "begin")
            end = config_value(config_root, "end")
            config_summary = {
                "netFiles": net_refs,
                "routeFiles": route_refs,
                "additionalFiles": additional_refs,
                "begin": begin,
                "end": end,
            }
            for ref in net_refs + route_refs + additional_refs:
                if not (package_dir / ref).exists():
                    errors.append(f"sumocfg references missing file: {ref}")
            if net_refs and paths["net"].name not in net_refs:
                errors.append(f"sumocfg net-file does not reference {paths['net'].name}")
            if route_refs and paths["route"].name not in route_refs:
                errors.append(f"sumocfg route-files does not reference {paths['route'].name}")
            if begin is not None and int(float(begin)) != args.expected_start_sec:
                warnings.append(
                    f"sumocfg begin={begin} differs from expected {args.expected_start_sec}"
                )
            if end is not None and int(float(end)) != args.expected_end_sec:
                warnings.append(f"sumocfg end={end} differs from expected {args.expected_end_sec}")
        except Exception as error:
            errors.append(f"sumocfg cannot be parsed: {error}")

    summary = {
        "scope": args.scope,
        "requestedPackageDir": str(requested_package_dir),
        "packageDir": str(package_dir),
        "resolvedPackageDirNote": resolved_note,
        "expectedWindow": {
            "startSec": args.expected_start_sec,
            "endSec": args.expected_end_sec,
        },
        "files": files,
        "expectedFiles": expected,
        "config": config_summary,
        "net": summarize_net(paths["net"], errors) if paths["net"].exists() else None,
        "routes": summarize_routes(paths["route"], errors) if paths["route"].exists() else None,
        "boundary": summarize_boundary(paths["boundary"], errors)
        if paths["boundary"].exists()
        else None,
        "warnings": warnings,
        "errors": errors,
        "ok": not errors,
    }
    return summary


def main() -> None:
    args = parse_args()
    summary = validate_package(args)
    if summary.get("ok"):
        print("SUMO package shape: ok")
    else:
        print("SUMO package shape: failed")
    if summary["warnings"]:
        print("Warnings:")
        for warning in summary["warnings"]:
            print(f"- {warning}")
    if summary["errors"]:
        print("Errors:")
        for error in summary["errors"]:
            print(f"- {error}")
    if args.json:
        print(json.dumps(summary, indent=2))
    sys.exit(0 if summary.get("ok") else 1)


if __name__ == "__main__":
    main()
