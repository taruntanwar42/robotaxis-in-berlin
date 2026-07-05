"""Validate staged robotaxi demand JSON before backend runtime activation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_SCOPE = "charlottenburg-moabit-tiergarten"
DEFAULT_START_SEC = 64_800
DEFAULT_END_SEC = 75_600
DEFAULT_ALLOWED_MODES = {"car", "ride"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demand-file", required=True, type=Path)
    parser.add_argument("--scope", default=DEFAULT_SCOPE)
    parser.add_argument("--expected-start-sec", type=int, default=DEFAULT_START_SEC)
    parser.add_argument("--expected-end-sec", type=int, default=DEFAULT_END_SEC)
    parser.add_argument("--allowed-mode", action="append", dest="allowed_modes")
    parser.add_argument("--service-edges-file", type=Path)
    parser.add_argument("--rejects-file", type=Path)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args()


def first_present(payload: dict[str, Any], names: list[str]) -> Any:
    for name in names:
        if name in payload:
            return payload[name]
    return None


def parse_time_sec(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            parts = text.split(":")
            if len(parts) not in {2, 3}:
                return None
            try:
                hours = int(parts[0])
                minutes = int(parts[1])
                seconds = float(parts[2]) if len(parts) == 3 else 0.0
            except ValueError:
                return None
            return hours * 3600 + minutes * 60 + seconds
    return None


def parse_coord(value: Any) -> tuple[float, float] | None:
    if isinstance(value, dict):
        lon = first_present(value, ["lon", "lng", "longitude", "x"])
        lat = first_present(value, ["lat", "latitude", "y"])
        if lon is None or lat is None:
            return None
        try:
            return float(lon), float(lat)
        except (TypeError, ValueError):
            return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            return float(value[0]), float(value[1])
        except (TypeError, ValueError):
            return None
    return None


def trip_origin(trip: dict[str, Any]) -> Any:
    return first_present(trip, ["origin", "from", "originCoord", "originCoords"])


def trip_destination(trip: dict[str, Any]) -> Any:
    return first_present(trip, ["destination", "to", "destinationCoord", "destinationCoords"])


def trip_origin_coord(trip: dict[str, Any]) -> Any:
    direct = trip_origin(trip)
    if direct is not None:
        return direct
    if "originLon" in trip and "originLat" in trip:
        return {"lon": trip["originLon"], "lat": trip["originLat"]}
    return None


def trip_destination_coord(trip: dict[str, Any]) -> Any:
    direct = trip_destination(trip)
    if direct is not None:
        return direct
    if "destinationLon" in trip and "destinationLat" in trip:
        return {"lon": trip["destinationLon"], "lat": trip["destinationLat"]}
    return None


def trip_mode(trip: dict[str, Any], allowed_modes: set[str]) -> str:
    mode = first_present(trip, ["mode", "primaryMode", "mainMode", "transportMode"])
    if mode:
        return str(mode).strip()
    modes = trip.get("modes")
    if isinstance(modes, list):
        allowed_in_chain = [str(candidate).strip() for candidate in modes if str(candidate).strip() in allowed_modes]
        if allowed_in_chain:
            return allowed_in_chain[0]
        non_walk = [str(candidate).strip() for candidate in modes if str(candidate).strip() != "walk"]
        if non_walk:
            return non_walk[0]
    return ""


def load_service_edges(path: Path | None) -> set[str] | None:
    if path is None:
        return None
    if not path.exists():
        raise FileNotFoundError(f"service edges file does not exist: {path}")
    edges: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if text and not text.startswith("#"):
            edges.add(text)
    return edges


def load_demand(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, list):
        return {}, payload
    if not isinstance(payload, dict):
        raise ValueError("demand JSON must be an object or an array of trips")
    trips = first_present(payload, ["trips", "requests", "demand", "candidates"])
    if not isinstance(trips, list):
        raise ValueError("demand JSON object must contain trips, requests, demand, or candidates array")
    return payload, trips


def load_rejects(path: Path | None) -> list[dict[str, Any]] | None:
    if path is None:
        return None
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        rejects = first_present(payload, ["rejects", "rejected", "unreachable"])
        if isinstance(rejects, list):
            return rejects
    raise ValueError("rejects JSON must be an array or contain rejects/rejected/unreachable array")


def validate_demand(args: argparse.Namespace) -> dict[str, Any]:
    demand_path = args.demand_file.resolve()
    allowed_modes = set(args.allowed_modes or DEFAULT_ALLOWED_MODES)
    errors: list[str] = []
    warnings: list[str] = []

    try:
        metadata, trips = load_demand(demand_path)
    except Exception as error:
        return {
            "ok": False,
            "demandFile": str(demand_path),
            "errors": [f"demand JSON cannot be loaded: {error}"],
            "warnings": [],
        }

    try:
        service_edges = load_service_edges(args.service_edges_file)
    except Exception as error:
        service_edges = None
        errors.append(str(error))

    meta = metadata.get("metadata") if isinstance(metadata.get("metadata"), dict) else metadata

    scope = first_present(metadata, ["scope", "scenario", "scenarioKey"])
    if scope is None:
        scope = first_present(meta, ["scope", "scenario", "scenarioKey"])
    if scope is not None and scope != args.scope:
        errors.append(f"scope={scope} differs from expected {args.scope}")

    window = metadata.get("window") if isinstance(metadata.get("window"), dict) else None
    if window is None:
        window = meta.get("window") if isinstance(meta.get("window"), dict) else None
    if window is None:
        window = meta.get("timeWindow") if isinstance(meta.get("timeWindow"), dict) else {}
    start_sec = first_present(window, ["startSec", "begin", "start"])
    end_sec = first_present(window, ["endSec", "end"])
    if start_sec is not None and int(float(start_sec)) != args.expected_start_sec:
        warnings.append(f"window startSec={start_sec} differs from expected {args.expected_start_sec}")
    if end_sec is not None and int(float(end_sec)) != args.expected_end_sec:
        warnings.append(f"window endSec={end_sec} differs from expected {args.expected_end_sec}")

    source = first_present(metadata, ["source", "provenance", "metadata"])
    if source is None:
        errors.append("top-level source/provenance/metadata is required")

    counts = metadata.get("counts")
    if not isinstance(counts, dict) and any(
        key in meta for key in ["candidateTrips", "acceptedRuntimeRequests", "rejectedRuntimeRequests"]
    ):
        counts = meta
    if not isinstance(counts, dict):
        errors.append("top-level counts object is required")
        counts = {}

    rejects = first_present(metadata, ["rejects", "rejected", "unreachable"])
    if rejects is None:
        try:
            rejects = load_rejects(args.rejects_file)
        except Exception as error:
            errors.append(f"rejects JSON cannot be loaded: {error}")
    if rejects is None:
        warnings.append("rejects/rejected/unreachable metadata is absent")

    accepted_trips = 0
    mode_counts: dict[str, int] = {}
    edge_errors = 0
    samples: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, trip in enumerate(trips):
        if not isinstance(trip, dict):
            errors.append(f"trip[{index}] is not an object")
            continue

        trip_id = first_present(trip, ["id", "tripId", "requestId", "personId"])
        if not trip_id:
            errors.append(f"trip[{index}] is missing id/tripId/requestId")
        elif str(trip_id) in seen_ids:
            errors.append(f"duplicate trip id: {trip_id}")
        else:
            seen_ids.add(str(trip_id))

        depart_sec = parse_time_sec(
            first_present(trip, ["departSec", "departureSec", "departTime", "departureTime", "timeSec"])
        )
        if depart_sec is None:
            errors.append(f"trip[{index}] is missing a parseable departSec/departTime")
        elif not args.expected_start_sec <= depart_sec <= args.expected_end_sec:
            errors.append(f"trip[{index}] departSec={depart_sec:g} outside expected window")

        mode = trip_mode(trip, allowed_modes)
        if not mode:
            errors.append(f"trip[{index}] is missing mode")
        else:
            mode_counts[mode] = mode_counts.get(mode, 0) + 1
            if mode not in allowed_modes:
                errors.append(f"trip[{index}] mode={mode} is not allowed")

        origin = parse_coord(trip_origin_coord(trip))
        destination = parse_coord(trip_destination_coord(trip))
        if origin is None:
            errors.append(f"trip[{index}] is missing origin lon/lat")
        if destination is None:
            errors.append(f"trip[{index}] is missing destination lon/lat")

        pickup_edge = first_present(
            trip,
            ["pickupEdge", "pickupServiceEdge", "pickupSumoEdge", "fromEdge", "originEdge"],
        )
        dropoff_edge = first_present(
            trip,
            ["dropoffEdge", "dropoffServiceEdge", "dropoffSumoEdge", "toEdge", "destinationEdge"],
        )
        if not pickup_edge:
            errors.append(f"trip[{index}] is missing pickup SUMO edge")
            edge_errors += 1
        elif service_edges is not None and str(pickup_edge) not in service_edges:
            errors.append(f"trip[{index}] pickup edge is not in service edge set: {pickup_edge}")
            edge_errors += 1
        if not dropoff_edge:
            errors.append(f"trip[{index}] is missing dropoff SUMO edge")
            edge_errors += 1
        elif service_edges is not None and str(dropoff_edge) not in service_edges:
            errors.append(f"trip[{index}] dropoff edge is not in service edge set: {dropoff_edge}")
            edge_errors += 1

        if len(samples) < 3:
            samples.append(
                {
                    "id": trip_id,
                    "departSec": depart_sec,
                    "mode": mode,
                    "pickupEdge": pickup_edge,
                    "dropoffEdge": dropoff_edge,
                }
            )
        accepted_trips += 1

    count_total = first_present(counts, ["total", "totalTrips", "candidateTrips"])
    count_accepted = first_present(counts, ["accepted", "acceptedTrips", "acceptedRuntimeRequests", "trips"])
    count_rejected = first_present(counts, ["rejected", "rejectedTrips", "rejectedRuntimeRequests"])
    if count_total is not None and int(count_total) < len(trips):
        warnings.append(f"counts.total={count_total} is less than trip rows={len(trips)}")
    if count_accepted is not None and int(count_accepted) != len(trips):
        warnings.append(f"counts.accepted={count_accepted} differs from trip rows={len(trips)}")
    if count_rejected is not None and isinstance(rejects, list) and int(count_rejected) != len(rejects):
        warnings.append(f"counts.rejected={count_rejected} differs from reject rows={len(rejects)}")

    return {
        "ok": not errors,
        "demandFile": str(demand_path),
        "scope": scope,
        "expectedScope": args.scope,
        "expectedWindow": {
            "startSec": args.expected_start_sec,
            "endSec": args.expected_end_sec,
        },
        "tripRows": len(trips),
        "validatedTrips": accepted_trips,
        "modeCounts": mode_counts,
        "allowedModes": sorted(allowed_modes),
        "edgeSetChecked": service_edges is not None,
        "edgeErrors": edge_errors,
        "counts": counts,
        "hasRejectMetadata": rejects is not None,
        "rejectRows": len(rejects) if isinstance(rejects, list) else None,
        "sampleTrips": samples,
        "warnings": warnings,
        "errors": errors,
    }


def main() -> None:
    args = parse_args()
    summary = validate_demand(args)
    if summary.get("ok"):
        print("Robotaxi demand shape: ok")
    else:
        print("Robotaxi demand shape: failed")
    if summary["warnings"]:
        print("Warnings:")
        for warning in summary["warnings"]:
            print(f"- {warning}")
    if summary["errors"]:
        print("Errors:")
        for error in summary["errors"][:50]:
            print(f"- {error}")
        if len(summary["errors"]) > 50:
            print(f"- ... {len(summary['errors']) - 50} more errors")
    if args.json:
        print(json.dumps(summary, indent=2))
    sys.exit(0 if summary.get("ok") else 1)


if __name__ == "__main__":
    main()
