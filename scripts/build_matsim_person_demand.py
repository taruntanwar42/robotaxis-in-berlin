from __future__ import annotations

import argparse
import csv
import gzip
import json
import shutil
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pyproj import Transformer


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SAMPLE = "0.1pct"
MATSim_BASE_URL = (
    "https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/"
    "countries/de/berlin/berlin-v6.4/input"
)
DEFAULT_SOURCE_DIR = ROOT / "data" / "source" / "matsim-berlin"
DEFAULT_OUTPUT_DIR = ROOT / "data" / "processed" / "matsim"
DEFAULT_AREA = ROOT / "public" / "data" / "cutouts" / "best-cutouts.geojson"
DEFAULT_AREA_FEATURE = "Reinickendorf"

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
    link_count: int


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


def sample_url(sample: str) -> str:
    return f"{MATSim_BASE_URL}/berlin-v6.4-{sample}.plans.xml.gz"


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
            or str(feature.get("properties", {}).get("rawName", "")).lower() == feature_name_lower
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
        "areaName": properties.get("name") or feature.get("id"),
        "areaFeatureId": feature.get("id"),
        "areaGeometryType": feature["geometry"].get("type"),
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
    route_text = route.text.strip().split() if route is not None and route.text else []
    return Leg(
        mode=elem.attrib.get("mode", ""),
        dep_time=parse_time_to_seconds(elem.attrib.get("dep_time")),
        route_type=route.attrib.get("type") if route is not None else None,
        start_link=route.attrib.get("start_link") if route is not None else None,
        end_link=route.attrib.get("end_link") if route is not None else None,
        distance_m=parse_float(route.attrib.get("distance")) if route is not None else None,
        travel_time_s=parse_time_to_seconds(route.attrib.get("trav_time")) if route is not None else None,
        link_count=len(route_text),
    )


def selected_plan(person: ET.Element) -> ET.Element | None:
    selected = person.find("plan[@selected='yes']")
    if selected is not None:
        return selected
    return person.find("plan")


def extract_person_trips(person: ET.Element, transformer: Transformer) -> list[dict[str, Any]]:
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
                origin_lon, origin_lat = transformer.transform(origin.x, origin.y) if origin.x is not None and origin.y is not None else (None, None)
                destination_lon, destination_lat = transformer.transform(activity.x, activity.y) if activity.x is not None and activity.y is not None else (None, None)
                modes = [leg.mode for leg in pending_legs]
                network_legs = [leg for leg in pending_legs if leg.route_type == "links"]
                distance_m = sum(leg.distance_m or 0.0 for leg in pending_legs) or None
                travel_time_s = sum(leg.travel_time_s or 0.0 for leg in pending_legs) or None
                departure_s = pending_legs[0].dep_time if pending_legs[0].dep_time is not None else origin.end_time
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
                        "networkStartLink": network_legs[0].start_link if network_legs else pending_legs[0].start_link,
                        "networkEndLink": network_legs[-1].end_link if network_legs else pending_legs[-1].end_link,
                        "networkLinkCount": sum(leg.link_count for leg in network_legs),
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
                    }
                )
            origin = activity
            pending_legs = []
        elif child.tag == "leg":
            if origin is not None:
                pending_legs.append(leg_from_element(child))

    return trips


def parse_plans(
    plans_path: Path,
    area_geometry: dict[str, Any] | None,
    start_sec: float,
    end_sec: float,
    include_modes: set[str],
    max_persons: int | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    transformer = Transformer.from_crs("EPSG:25832", "EPSG:4326", always_xy=True)
    rows: list[dict[str, Any]] = []
    stats: dict[str, Any] = {
        "personsRead": 0,
        "tripsExtracted": 0,
        "tripsInTimeWindow": 0,
        "tripsMissingCoordinates": 0,
        "tripsInsideArea": 0,
        "candidateTrips": 0,
        "cybercabCapableTrips": 0,
        "modeCounts": {},
        "partySizeCounts": {},
    }

    with gzip.open(plans_path, "rb") as handle:
        for event, elem in ET.iterparse(handle, events=("end",)):
            if elem.tag != "person":
                continue
            stats["personsRead"] += 1
            for trip in extract_person_trips(elem, transformer):
                stats["tripsExtracted"] += 1
                dep = trip["departureSec"]
                if dep is None or dep < start_sec or dep >= end_sec:
                    continue
                stats["tripsInTimeWindow"] += 1
                if include_modes and trip["primaryMode"] not in include_modes:
                    continue
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
                stats["tripsInsideArea"] += 1
                trip["robotaxiCandidate"] = trip["primaryMode"] in {"car", "ride"}
                if trip["robotaxiCandidate"]:
                    stats["candidateTrips"] += 1
                if trip["robotaxiCandidate"] and trip["cybercabCapable"]:
                    stats["cybercabCapableTrips"] += 1
                stats["modeCounts"][trip["primaryMode"]] = stats["modeCounts"].get(trip["primaryMode"], 0) + 1
                party_key = str(trip["partySize"])
                stats["partySizeCounts"][party_key] = stats["partySizeCounts"].get(party_key, 0) + 1
                rows.append(trip)
            elem.clear()
            if max_persons is not None and stats["personsRead"] >= max_persons:
                break
    return rows, stats


def write_outputs(rows: list[dict[str, Any]], stats: dict[str, Any], output_base: Path) -> None:
    output_base.parent.mkdir(parents=True, exist_ok=True)
    json_path = output_base.parent / f"{output_base.name}.json"
    csv_path = output_base.parent / f"{output_base.name}.csv"
    meta_path = output_base.with_name(output_base.name + ".metadata.json")
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump({"metadata": stats, "trips": rows}, handle, indent=2)
    if rows:
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    else:
        csv_path.write_text("", encoding="utf-8")
    with meta_path.open("w", encoding="utf-8") as handle:
        json.dump(stats, handle, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build person-trip demand rows from public MATSim Berlin selected plans."
    )
    parser.add_argument("--sample", default=DEFAULT_SAMPLE, help="MATSim sample, e.g. 0.1pct, 1pct, 3pct, 10pct")
    parser.add_argument("--plans-url", default=None)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--area-geojson", type=Path, default=DEFAULT_AREA)
    parser.add_argument("--area-feature", default=DEFAULT_AREA_FEATURE)
    parser.add_argument("--start", default="06:00:00")
    parser.add_argument("--end", default="07:00:00")
    parser.add_argument("--include-modes", default="car,ride", help="Comma-separated primary modes to keep; empty keeps all modes")
    parser.add_argument("--max-persons", type=int, default=None)
    args = parser.parse_args()

    url = args.plans_url or sample_url(args.sample)
    plans_path = args.source_dir / f"berlin-v6.4-{args.sample}.plans.xml.gz"
    ensure_download(url, plans_path)

    start_sec = parse_time_to_seconds(args.start)
    end_sec = parse_time_to_seconds(args.end)
    if start_sec is None or end_sec is None or end_sec <= start_sec:
        raise ValueError(f"Invalid time window: {args.start} - {args.end}")

    include_modes = {mode.strip() for mode in args.include_modes.split(",") if mode.strip()}
    area_geometry, area_metadata = load_area_geometry(args.area_geojson, args.area_feature) if args.area_geojson else (None, {})
    rows, stats = parse_plans(plans_path, area_geometry, start_sec, end_sec, include_modes, args.max_persons)
    stats.update(
        {
            "source": str(plans_path.resolve()),
            "sourceUrl": url,
            "sample": args.sample,
            "areaGeojson": str(args.area_geojson.resolve()) if args.area_geojson else None,
            **area_metadata,
            "timeWindow": {"start": args.start, "end": args.end},
            "includeModes": sorted(include_modes),
            "cybercabSeats": CYBERCAB_SEATS,
            "notes": [
                "MATSim ride mode is private car passenger, not robotaxi/DRT.",
                "Each extracted row is one MATSim person trip. MATSim Berlin does not provide ride party sizes.",
                "partySize is fixed to 1 only for backward-compatible schema shape; it is not an observed group-size field.",
                "Coordinates are transformed from EPSG:25832 to EPSG:4326.",
            ],
        }
    )

    sample_slug = args.sample.replace(".", "_")
    area_slug = str(area_metadata.get("areaName") or "no_area").lower().replace(" ", "_")
    mode_slug = "all_modes" if not include_modes else "_".join(sorted(include_modes))
    output_name = (
        f"{area_slug}_person_trips_{sample_slug}_{args.start.replace(':', '')}_"
        f"{args.end.replace(':', '')}_{mode_slug}"
    )
    output_base = args.output_dir / output_name
    write_outputs(rows, stats, output_base)
    print(f"Wrote {len(rows)} trips")
    print(f"JSON: {output_base.parent / f'{output_base.name}.json'}")
    print(f"CSV:  {output_base.parent / f'{output_base.name}.csv'}")
    print(f"Meta: {output_base.with_name(output_base.name + '.metadata.json')}")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
