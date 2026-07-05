from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pyproj import Transformer


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCENARIO_KEY = "charlottenburg-moabit-tiergarten"
MATSIM_BASE_URL = (
    "https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/"
    "countries/de/berlin/berlin-v6.4/input"
)
DEFAULT_SAMPLE = "1pct"
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "data" / "source" / "matsim-berlin"
FALLBACK_SOURCE_DIR = Path.home() / "Desktop" / "robotaxi-control-room" / "data" / "source" / "matsim-berlin"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "data" / "intermediate" / "matsim" / SCENARIO_KEY
DEFAULT_AREA = (
    PROJECT_ROOT
    / "data"
    / "source"
    / "berlin-ortsteile"
    / SCENARIO_KEY
    / f"{SCENARIO_KEY}.corridor-envelope.geojson"
)
DEFAULT_SERVICE_EDGES = (
    PROJECT_ROOT
    / "data"
    / "intermediate"
    / "sumo"
    / SCENARIO_KEY
    / f"{SCENARIO_KEY}.service-edges.txt"
)
DEFAULT_SUMO_NET = (
    PROJECT_ROOT
    / "data"
    / "intermediate"
    / "sumo"
    / SCENARIO_KEY
    / f"{SCENARIO_KEY}.net.xml"
)

CYBERCAB_SEATS = 2


@dataclass
class Activity:
    type: str
    link: str | None
    x: float | None
    y: float | None
    end_time: float | None


@dataclass
class Leg:
    mode: str
    dep_time: float | None
    route_type: str | None
    start_link: str | None
    end_link: str | None
    distance_m: float | None
    travel_time_s: float | None
    route_links: list[str]


def parse_time_to_seconds(value: str | None) -> float | None:
    if value in (None, "", "undefined"):
        return None
    text = value.strip()
    if ":" not in text:
        try:
            return float(text)
        except ValueError:
            return None
    parts = text.split(":")
    if len(parts) != 3:
        return None
    try:
        hours, minutes, seconds = parts
        return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except ValueError:
        return None


def seconds_to_hhmmss(value: float | None) -> str | None:
    if value is None:
        return None
    whole = int(round(value))
    hours = whole // 3600
    minutes = (whole % 3600) // 60
    seconds = whole % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


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


def sample_url(sample: str) -> str:
    return f"{MATSIM_BASE_URL}/berlin-v6.4-{sample}.plans.xml.gz"


def find_existing_source_dir(sample: str) -> Path:
    local = DEFAULT_SOURCE_DIR / f"berlin-v6.4-{sample}.plans.xml.gz"
    fallback = FALLBACK_SOURCE_DIR / f"berlin-v6.4-{sample}.plans.xml.gz"
    if local.exists():
        return DEFAULT_SOURCE_DIR
    if fallback.exists():
        return FALLBACK_SOURCE_DIR
    return DEFAULT_SOURCE_DIR


def ensure_download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + ".tmp")
    with urllib.request.urlopen(url, timeout=180) as response, temp.open("wb") as out:
        shutil.copyfileobj(response, out)
    temp.replace(target)


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        xi, yi = point[0], point[1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon: float, lat: float, geometry: dict[str, Any] | None) -> bool:
    if geometry is None:
        return True
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    elif geometry["type"] == "LineString":
        coordinates = geometry["coordinates"]
        if not coordinates or coordinates[0] != coordinates[-1]:
            raise ValueError("LineString area filters must be closed rings")
        polygons = [[coordinates]]
    else:
        raise ValueError(f"Unsupported geometry type: {geometry['type']}")
    for polygon in polygons:
        if not polygon or not point_in_ring(lon, lat, polygon[0]):
            continue
        if any(point_in_ring(lon, lat, hole) for hole in polygon[1:]):
            continue
        return True
    return False


def load_area_geometry(path: Path | None, feature_name: str | None) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    if path is None:
        return None, {"areaName": None, "areaFeatureId": None, "areaGeometryType": None}
    with path.open("r", encoding="utf-8") as handle:
        feature_collection = json.load(handle)
    features = feature_collection.get("features", [])
    if not features:
        raise ValueError(f"No features found in {path}")
    if feature_name:
        feature_name_lower = feature_name.lower()
        matches = [
            feature
            for feature in features
            if str(feature.get("id", "")).lower() == feature_name_lower
            or str(feature.get("properties", {}).get("name", "")).lower() == feature_name_lower
            or str(feature.get("properties", {}).get("scenarioKey", "")).lower() == feature_name_lower
        ]
        if len(matches) != 1:
            raise ValueError(f"Expected one feature matching {feature_name!r} in {path}, found {len(matches)}")
        feature = matches[0]
    elif len(features) == 1:
        feature = features[0]
    else:
        raise ValueError(f"Expected one feature in {path}; pass --area-feature for multi-feature files")
    properties = feature.get("properties", {})
    return feature["geometry"], {
        "areaName": properties.get("name") or properties.get("scenarioKey") or feature.get("id"),
        "areaFeatureId": feature.get("id"),
        "areaGeometryType": feature["geometry"].get("type"),
        "areaStrategy": properties.get("source") or properties.get("intendedUse"),
    }


def load_edge_ids(path: Path | None) -> set[str]:
    if path is None:
        return set()
    return {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


def read_net_offset(net_path: Path) -> tuple[float, float]:
    for _event, elem in ET.iterparse(net_path, events=("start",)):
        if elem.tag == "location":
            raw = elem.attrib["netOffset"].split(",", maxsplit=1)
            return float(raw[0]), float(raw[1])
        elem.clear()
    raise RuntimeError(f"No <location> element found in {net_path}")


def load_service_edge_midpoints(
    net_path: Path | None,
    service_edges: set[str],
) -> tuple[list[dict[str, Any]], tuple[float, float] | None]:
    if net_path is None or not net_path.exists() or not service_edges:
        return [], None
    net_offset = read_net_offset(net_path)
    midpoints: list[dict[str, Any]] = []
    for _event, elem in ET.iterparse(net_path, events=("end",)):
        if elem.tag != "edge":
            if elem.tag != "lane":
                elem.clear()
            continue
        edge_id = elem.attrib.get("id")
        if not edge_id or edge_id not in service_edges:
            elem.clear()
            continue
        best_lane = None
        for lane in elem.findall("lane"):
            shape = parse_shape(lane.attrib.get("shape", ""))
            midpoint = shape_midpoint(shape)
            if midpoint is None:
                continue
            length = parse_float(lane.attrib.get("length")) or 0.0
            if best_lane is None or length > best_lane["lengthM"]:
                best_lane = {"x": midpoint[0], "y": midpoint[1], "lengthM": length}
        if best_lane is not None:
            midpoints.append({"edgeId": edge_id, **best_lane})
        elem.clear()
    return midpoints, net_offset


def nearest_service_edge(
    lon: float | None,
    lat: float | None,
    transformer: Transformer,
    net_offset: tuple[float, float] | None,
    service_midpoints: list[dict[str, Any]],
) -> dict[str, Any]:
    if lon is None or lat is None or net_offset is None or not service_midpoints:
        return {"edgeId": None, "distanceM": None}
    source_x, source_y = transformer.transform(lon, lat)
    sumo_x = source_x + net_offset[0]
    sumo_y = source_y + net_offset[1]
    best: dict[str, Any] | None = None
    best_dist = float("inf")
    for candidate in service_midpoints:
        dist = ((candidate["x"] - sumo_x) ** 2 + (candidate["y"] - sumo_y) ** 2) ** 0.5
        if dist < best_dist:
            best = candidate
            best_dist = dist
    return {
        "edgeId": best["edgeId"] if best else None,
        "distanceM": round(best_dist, 1) if best else None,
    }


def parse_attrs(person: ET.Element) -> dict[str, str]:
    attrs: dict[str, str] = {}
    attrs_el = person.find("attributes")
    if attrs_el is None:
        return attrs
    for attr in attrs_el.findall("attribute"):
        name = attr.attrib.get("name")
        if name:
            attrs[name] = attr.text or ""
    return attrs


def is_major_activity(activity_type: str) -> bool:
    return "interaction" not in activity_type


def activity_from_element(elem: ET.Element) -> Activity:
    return Activity(
        type=elem.attrib.get("type", ""),
        link=elem.attrib.get("link"),
        x=parse_float(elem.attrib.get("x")),
        y=parse_float(elem.attrib.get("y")),
        end_time=parse_time_to_seconds(elem.attrib.get("end_time")),
    )


def leg_from_element(elem: ET.Element) -> Leg:
    route = elem.find("route")
    route_links = route.text.strip().split() if route is not None and route.text else []
    return Leg(
        mode=elem.attrib.get("mode", ""),
        dep_time=parse_time_to_seconds(elem.attrib.get("dep_time")),
        route_type=route.attrib.get("type") if route is not None else None,
        start_link=route.attrib.get("start_link") if route is not None else None,
        end_link=route.attrib.get("end_link") if route is not None else None,
        distance_m=parse_float(route.attrib.get("distance")) if route is not None else None,
        travel_time_s=parse_time_to_seconds(route.attrib.get("trav_time")) if route is not None else None,
        route_links=route_links,
    )


def selected_plan(person: ET.Element) -> ET.Element | None:
    selected = person.find("plan[@selected='yes']")
    if selected is not None:
        return selected
    return person.find("plan")


def service_reachability(route_links: list[str], start_link: str | None, end_link: str | None, service_edges: set[str]) -> dict[str, Any]:
    if not service_edges:
        return {
            "startLinkInServiceEdges": None,
            "endLinkInServiceEdges": None,
            "allRouteLinksInServiceEdges": None,
            "routeLinksChecked": len(route_links),
            "routeLinksOutsideServiceEdges": None,
            "reachableByServiceEdges": None,
        }
    outside = [edge for edge in route_links if edge not in service_edges]
    start_ok = start_link in service_edges if start_link else False
    end_ok = end_link in service_edges if end_link else False
    all_route_ok = bool(route_links) and not outside
    return {
        "startLinkInServiceEdges": start_ok,
        "endLinkInServiceEdges": end_ok,
        "allRouteLinksInServiceEdges": all_route_ok,
        "routeLinksChecked": len(route_links),
        "routeLinksOutsideServiceEdges": len(outside),
        "reachableByServiceEdges": start_ok and end_ok and all_route_ok,
    }


def extract_person_trips(
    person: ET.Element,
    transformer: Transformer,
    service_edges: set[str],
) -> list[dict[str, Any]]:
    person_id = person.attrib.get("id", "")
    attrs = parse_attrs(person)
    plan = selected_plan(person)
    if plan is None:
        return []

    trips: list[dict[str, Any]] = []
    origin: Activity | None = None
    pending_legs: list[Leg] = []

    for child in list(plan):
        if child.tag == "activity":
            activity = activity_from_element(child)
            if not is_major_activity(activity.type):
                continue
            if origin is None:
                origin = activity
                pending_legs = []
                continue
            if pending_legs:
                trip_index = len(trips)
                request_id = f"{person_id}:{trip_index}"
                origin_lon, origin_lat = (
                    transformer.transform(origin.x, origin.y)
                    if origin.x is not None and origin.y is not None
                    else (None, None)
                )
                destination_lon, destination_lat = (
                    transformer.transform(activity.x, activity.y)
                    if activity.x is not None and activity.y is not None
                    else (None, None)
                )
                modes = [leg.mode for leg in pending_legs]
                network_legs = [leg for leg in pending_legs if leg.route_type == "links"]
                distance_m = sum(leg.distance_m or 0.0 for leg in pending_legs) or None
                travel_time_s = sum(leg.travel_time_s or 0.0 for leg in pending_legs) or None
                departure_s = pending_legs[0].dep_time if pending_legs[0].dep_time is not None else origin.end_time
                route_links = [link for leg in network_legs for link in leg.route_links]
                start_link = network_legs[0].start_link if network_legs else pending_legs[0].start_link
                end_link = network_legs[-1].end_link if network_legs else pending_legs[-1].end_link
                reachability = service_reachability(route_links, start_link, end_link, service_edges)
                trips.append(
                    {
                        "requestId": request_id,
                        "personId": person_id,
                        "tripIndex": trip_index,
                        "departureSec": departure_s,
                        "departureTime": seconds_to_hhmmss(departure_s),
                        "originActivity": origin.type,
                        "destinationActivity": activity.type,
                        "originLink": origin.link,
                        "destinationLink": activity.link,
                        "originX": origin.x,
                        "originY": origin.y,
                        "destinationX": activity.x,
                        "destinationY": activity.y,
                        "originLon": origin_lon,
                        "originLat": origin_lat,
                        "destinationLon": destination_lon,
                        "destinationLat": destination_lat,
                        "modes": modes,
                        "primaryMode": next((mode for mode in modes if mode not in {"walk"}), modes[0] if modes else None),
                        "networkStartLink": start_link,
                        "networkEndLink": end_link,
                        "networkLinkCount": sum(len(leg.route_links) for leg in network_legs),
                        "distanceM": distance_m,
                        "travelTimeSec": travel_time_s,
                        "passengers": 1,
                        "partySize": 1,
                        "cybercabCapable": True,
                        "age": attrs.get("age"),
                        "sex": attrs.get("sex"),
                        "income": attrs.get("income"),
                        "householdSize": attrs.get("household_size"),
                        "carAvail": attrs.get("carAvail"),
                        "hasLicense": attrs.get("hasLicense"),
                        "subpopulation": attrs.get("subpopulation"),
                        **reachability,
                    }
                )
            origin = activity
            pending_legs = []
        elif child.tag == "leg":
            if origin is not None:
                pending_legs.append(leg_from_element(child))

    return trips


def bump_counter(container: dict[str, int], key: Any) -> None:
    normalized = str(key) if key not in (None, "") else "unknown"
    container[normalized] = container.get(normalized, 0) + 1


def distance_summary(values: list[float]) -> dict[str, float | int | None]:
    if not values:
        return {"count": 0, "min": None, "p50": None, "p90": None, "p95": None, "max": None, "mean": None}
    ordered = sorted(values)

    def percentile(fraction: float) -> float:
        index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
        return round(ordered[index], 1)

    return {
        "count": len(ordered),
        "min": round(ordered[0], 1),
        "p50": percentile(0.50),
        "p90": percentile(0.90),
        "p95": percentile(0.95),
        "max": round(ordered[-1], 1),
        "mean": round(sum(ordered) / len(ordered), 1),
    }


def edge_assignment_reject_reasons(
    trip: dict[str, Any],
    max_edge_distance_m: float,
) -> list[str]:
    reasons: list[str] = []
    pickup_edge = trip.get("pickupServiceEdge")
    dropoff_edge = trip.get("dropoffServiceEdge")
    pickup_distance = trip.get("pickupServiceEdgeDistanceM")
    dropoff_distance = trip.get("dropoffServiceEdgeDistanceM")
    if not pickup_edge or pickup_distance is None:
        reasons.append("missing_pickup_service_edge")
    elif pickup_distance > max_edge_distance_m:
        reasons.append("pickup_service_edge_too_far")
    if not dropoff_edge or dropoff_distance is None:
        reasons.append("missing_dropoff_service_edge")
    elif dropoff_distance > max_edge_distance_m:
        reasons.append("dropoff_service_edge_too_far")
    return reasons


def parse_plans(
    plans_path: Path,
    area_geometry: dict[str, Any] | None,
    start_sec: float,
    end_sec: float,
    include_modes: set[str],
    service_edges: set[str],
    service_midpoints: list[dict[str, Any]],
    net_offset: tuple[float, float] | None,
    max_edge_distance_m: float,
    max_persons: int | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    transformer = Transformer.from_crs("EPSG:25832", "EPSG:4326", always_xy=True)
    lonlat_to_best_source = Transformer.from_crs("EPSG:4326", "EPSG:25833", always_xy=True)
    rows: list[dict[str, Any]] = []
    rejects: list[dict[str, Any]] = []
    accepted_pickup_distances: list[float] = []
    accepted_dropoff_distances: list[float] = []
    candidate_pickup_distances: list[float] = []
    candidate_dropoff_distances: list[float] = []
    stats: dict[str, Any] = {
        "personsRead": 0,
        "tripsExtracted": 0,
        "tripsInTimeWindow": 0,
        "tripsMissingCoordinates": 0,
        "tripsInsideAreaAllModes": 0,
        "tripsInsideAreaAfterModeFilter": 0,
        "candidateTrips": 0,
        "cybercabCapableTrips": 0,
        "insideAreaModeCountsAllModes": {},
        "keptModeCounts": {},
        "partySizeCounts": {},
        "reachability": {
            "serviceEdgesLoaded": len(service_edges),
            "serviceEdgeMidpointsLoaded": len(service_midpoints),
            "maxAcceptedServiceEdgeDistanceM": max_edge_distance_m,
            "keptTripsStartLinkInServiceEdges": 0,
            "keptTripsEndLinkInServiceEdges": 0,
            "keptTripsAllRouteLinksInServiceEdges": 0,
            "keptTripsReachableByServiceEdges": 0,
            "keptTripsWithNoNetworkRouteLinks": 0,
            "acceptedRuntimeRequests": 0,
            "rejectedRuntimeRequests": 0,
            "rejectReasonCounts": {},
            "keptTripsPickupEdgeWithin50m": 0,
            "keptTripsDropoffEdgeWithin50m": 0,
            "keptTripsPickupEdgeWithin100m": 0,
            "keptTripsDropoffEdgeWithin100m": 0,
            "keptTripsPickupEdgeWithin250m": 0,
            "keptTripsDropoffEdgeWithin250m": 0,
            "keptTripsBothEdgesWithin250m": 0,
            "maxPickupEdgeDistanceM": None,
            "maxDropoffEdgeDistanceM": None,
        },
    }

    with gzip.open(plans_path, "rb") as handle:
        for event, elem in ET.iterparse(handle, events=("end",)):
            if elem.tag != "person":
                continue
            stats["personsRead"] += 1
            for trip in extract_person_trips(elem, transformer, service_edges):
                stats["tripsExtracted"] += 1
                dep = trip["departureSec"]
                if dep is None or dep < start_sec or dep >= end_sec:
                    continue
                stats["tripsInTimeWindow"] += 1
                if (
                    trip["originLon"] is None
                    or trip["originLat"] is None
                    or trip["destinationLon"] is None
                    or trip["destinationLat"] is None
                ):
                    stats["tripsMissingCoordinates"] += 1
                    continue
                origin_inside = point_in_geometry(trip["originLon"], trip["originLat"], area_geometry)
                destination_inside = point_in_geometry(trip["destinationLon"], trip["destinationLat"], area_geometry)
                trip["originInsideArea"] = origin_inside
                trip["destinationInsideArea"] = destination_inside
                trip["insideArea"] = origin_inside and destination_inside
                if not trip["insideArea"]:
                    continue
                stats["tripsInsideAreaAllModes"] += 1
                bump_counter(stats["insideAreaModeCountsAllModes"], trip["primaryMode"])
                if include_modes and trip["primaryMode"] not in include_modes:
                    continue
                stats["tripsInsideAreaAfterModeFilter"] += 1
                trip["robotaxiCandidate"] = trip["primaryMode"] in {"car", "ride"}
                if trip["robotaxiCandidate"]:
                    stats["candidateTrips"] += 1
                if trip["robotaxiCandidate"] and trip["cybercabCapable"]:
                    stats["cybercabCapableTrips"] += 1
                bump_counter(stats["keptModeCounts"], trip["primaryMode"])
                bump_counter(stats["partySizeCounts"], trip["partySize"])
                pickup_edge = nearest_service_edge(
                    trip["originLon"],
                    trip["originLat"],
                    lonlat_to_best_source,
                    net_offset,
                    service_midpoints,
                )
                dropoff_edge = nearest_service_edge(
                    trip["destinationLon"],
                    trip["destinationLat"],
                    lonlat_to_best_source,
                    net_offset,
                    service_midpoints,
                )
                trip["pickupServiceEdge"] = pickup_edge["edgeId"]
                trip["pickupEdge"] = pickup_edge["edgeId"]
                trip["pickupServiceEdgeDistanceM"] = pickup_edge["distanceM"]
                trip["dropoffServiceEdge"] = dropoff_edge["edgeId"]
                trip["dropoffEdge"] = dropoff_edge["edgeId"]
                trip["dropoffServiceEdgeDistanceM"] = dropoff_edge["distanceM"]
                if trip["startLinkInServiceEdges"]:
                    stats["reachability"]["keptTripsStartLinkInServiceEdges"] += 1
                if trip["endLinkInServiceEdges"]:
                    stats["reachability"]["keptTripsEndLinkInServiceEdges"] += 1
                if trip["allRouteLinksInServiceEdges"]:
                    stats["reachability"]["keptTripsAllRouteLinksInServiceEdges"] += 1
                if trip["reachableByServiceEdges"]:
                    stats["reachability"]["keptTripsReachableByServiceEdges"] += 1
                if trip["routeLinksChecked"] == 0:
                    stats["reachability"]["keptTripsWithNoNetworkRouteLinks"] += 1
                pickup_distance = trip["pickupServiceEdgeDistanceM"]
                dropoff_distance = trip["dropoffServiceEdgeDistanceM"]
                if pickup_distance is not None:
                    candidate_pickup_distances.append(pickup_distance)
                    stats["reachability"]["maxPickupEdgeDistanceM"] = max(
                        stats["reachability"]["maxPickupEdgeDistanceM"] or 0,
                        pickup_distance,
                    )
                    if pickup_distance <= 50:
                        stats["reachability"]["keptTripsPickupEdgeWithin50m"] += 1
                    if pickup_distance <= 100:
                        stats["reachability"]["keptTripsPickupEdgeWithin100m"] += 1
                    if pickup_distance <= 250:
                        stats["reachability"]["keptTripsPickupEdgeWithin250m"] += 1
                if dropoff_distance is not None:
                    candidate_dropoff_distances.append(dropoff_distance)
                    stats["reachability"]["maxDropoffEdgeDistanceM"] = max(
                        stats["reachability"]["maxDropoffEdgeDistanceM"] or 0,
                        dropoff_distance,
                    )
                    if dropoff_distance <= 50:
                        stats["reachability"]["keptTripsDropoffEdgeWithin50m"] += 1
                    if dropoff_distance <= 100:
                        stats["reachability"]["keptTripsDropoffEdgeWithin100m"] += 1
                    if dropoff_distance <= 250:
                        stats["reachability"]["keptTripsDropoffEdgeWithin250m"] += 1
                if (
                    pickup_distance is not None
                    and pickup_distance <= 250
                    and dropoff_distance is not None
                    and dropoff_distance <= 250
                ):
                    stats["reachability"]["keptTripsBothEdgesWithin250m"] += 1
                reject_reasons = edge_assignment_reject_reasons(trip, max_edge_distance_m)
                if reject_reasons:
                    stats["reachability"]["rejectedRuntimeRequests"] += 1
                    for reason in reject_reasons:
                        bump_counter(stats["reachability"]["rejectReasonCounts"], reason)
                    reject_row = dict(trip)
                    reject_row["rejectReasons"] = reject_reasons
                    rejects.append(reject_row)
                    continue
                stats["reachability"]["acceptedRuntimeRequests"] += 1
                accepted_pickup_distances.append(pickup_distance)
                accepted_dropoff_distances.append(dropoff_distance)
                rows.append(trip)
            elem.clear()
            if max_persons is not None and stats["personsRead"] >= max_persons:
                break
    stats["reachability"]["candidatePickupEdgeDistanceStatsM"] = distance_summary(candidate_pickup_distances)
    stats["reachability"]["candidateDropoffEdgeDistanceStatsM"] = distance_summary(candidate_dropoff_distances)
    stats["reachability"]["acceptedPickupEdgeDistanceStatsM"] = distance_summary(accepted_pickup_distances)
    stats["reachability"]["acceptedDropoffEdgeDistanceStatsM"] = distance_summary(accepted_dropoff_distances)
    return rows, rejects, stats


def write_outputs(
    rows: list[dict[str, Any]],
    rejects: list[dict[str, Any]],
    stats: dict[str, Any],
    output_base: Path,
) -> dict[str, str]:
    output_base.parent.mkdir(parents=True, exist_ok=True)
    json_path = output_base.parent / f"{output_base.name}.json"
    csv_path = output_base.parent / f"{output_base.name}.csv"
    meta_path = output_base.with_name(output_base.name + ".metadata.json")
    rejects_json_path = output_base.parent / f"{output_base.name}.rejects.json"
    rejects_csv_path = output_base.parent / f"{output_base.name}.rejects.csv"
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump({"metadata": stats, "trips": rows}, handle, indent=2)
    if rows:
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    else:
        csv_path.write_text("", encoding="utf-8")
    with rejects_json_path.open("w", encoding="utf-8") as handle:
        json.dump({"metadata": stats, "rejects": rejects}, handle, indent=2)
    if rejects:
        fieldnames = list(rejects[0].keys())
        with rejects_csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rejects)
    else:
        rejects_csv_path.write_text("", encoding="utf-8")
    with meta_path.open("w", encoding="utf-8") as handle:
        json.dump(stats, handle, indent=2)
    return {
        "json": str(json_path.resolve()),
        "csv": str(csv_path.resolve()),
        "metadata": str(meta_path.resolve()),
        "rejectsJson": str(rejects_json_path.resolve()),
        "rejectsCsv": str(rejects_csv_path.resolve()),
    }


def slug(text: str) -> str:
    return text.lower().replace(" ", "_").replace("+", "_").replace("-", "_")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build MATSim person-trip demand rows for the Charlottenburg + Moabit + Tiergarten service corridor."
    )
    parser.add_argument("--sample", default=DEFAULT_SAMPLE, help="MATSim sample, e.g. 0.1pct, 1pct, 3pct, 10pct")
    parser.add_argument("--plans-url", default=None)
    parser.add_argument("--source-dir", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--area-geojson", type=Path, default=DEFAULT_AREA)
    parser.add_argument("--area-feature", default=SCENARIO_KEY)
    parser.add_argument("--service-edges", type=Path, default=DEFAULT_SERVICE_EDGES)
    parser.add_argument("--sumo-net", type=Path, default=DEFAULT_SUMO_NET)
    parser.add_argument("--max-edge-distance-m", type=float, default=250.0)
    parser.add_argument("--start", default="18:00:00")
    parser.add_argument("--end", default="21:00:00")
    parser.add_argument(
        "--include-modes",
        default="car,ride",
        help="Comma-separated primary modes to keep; empty keeps all modes but still reports candidate counts.",
    )
    parser.add_argument("--max-persons", type=int, default=None)
    args = parser.parse_args()

    started_at = time.perf_counter()
    source_dir = args.source_dir or find_existing_source_dir(args.sample)
    url = args.plans_url or sample_url(args.sample)
    plans_path = source_dir / f"berlin-v6.4-{args.sample}.plans.xml.gz"
    ensure_download(url, plans_path)

    start_sec = parse_time_to_seconds(args.start)
    end_sec = parse_time_to_seconds(args.end)
    if start_sec is None or end_sec is None or end_sec <= start_sec:
        raise ValueError(f"Invalid time window: {args.start} - {args.end}")

    include_modes = {mode.strip() for mode in args.include_modes.split(",") if mode.strip()}
    area_geometry, area_metadata = load_area_geometry(args.area_geojson, args.area_feature) if args.area_geojson else (None, {})
    service_edges = load_edge_ids(args.service_edges)
    service_midpoints, net_offset = load_service_edge_midpoints(args.sumo_net, service_edges)
    rows, rejects, stats = parse_plans(
        plans_path,
        area_geometry,
        start_sec,
        end_sec,
        include_modes,
        service_edges,
        service_midpoints,
        net_offset,
        args.max_edge_distance_m,
        args.max_persons,
    )
    stats.update(
        {
            "scenarioKey": SCENARIO_KEY,
            "source": str(plans_path.resolve()),
            "sourceUrl": url,
            "sample": args.sample,
            "areaGeojson": str(args.area_geojson.resolve()) if args.area_geojson else None,
            **area_metadata,
            "serviceEdgesPath": str(args.service_edges.resolve()) if args.service_edges else None,
            "sumoNetPath": str(args.sumo_net.resolve()) if args.sumo_net else None,
            "timeWindow": {"start": args.start, "end": args.end, "startSec": start_sec, "endSec": end_sec},
            "includeModes": sorted(include_modes),
            "cybercabSeats": CYBERCAB_SEATS,
            "runtimeSeconds": round(time.perf_counter() - started_at, 3),
            "packagingStatus": "intermediate-demand-only; not copied into live runtime",
            "notes": [
                "MATSim ride mode is private car passenger, not native robotaxi/DRT.",
                "Each extracted row is one MATSim person trip. MATSim Berlin does not provide ride party sizes.",
                "partySize is fixed to 1 only for backward-compatible schema shape; it is not an observed group-size field.",
                "Coordinates are transformed from EPSG:25832 to EPSG:4326.",
                "Geographic inclusion uses the simulation corridor envelope derived from official Ortsteile.",
                "Reachability counts are conservative link-id checks against SUMO serviceEdges; backend routing still owns final TraCI feasibility.",
                "pickupServiceEdge/dropoffServiceEdge are nearest service-edge assignments from the SUMO cutout, not MATSim-observed links.",
            ],
        }
    )

    sample_slug = args.sample.replace(".", "_")
    mode_slug = "all_modes" if not include_modes else "_".join(sorted(include_modes))
    output_name = f"{SCENARIO_KEY}_person_trips_{sample_slug}_{args.start.replace(':', '')}_{args.end.replace(':', '')}_{mode_slug}"
    output_paths = write_outputs(rows, rejects, stats, args.output_dir / output_name)
    print(f"Wrote {len(rows)} trips")
    print(f"Wrote {len(rejects)} rejects")
    print(f"JSON: {output_paths['json']}")
    print(f"CSV:  {output_paths['csv']}")
    print(f"Meta: {output_paths['metadata']}")
    print(f"Rejects JSON: {output_paths['rejectsJson']}")
    print(f"Rejects CSV:  {output_paths['rejectsCsv']}")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
