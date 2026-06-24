import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
EV_ROOT = Path(r"C:\Users\KitCat\Desktop\EV Mobility Dashboard")

SOURCE_DIR = EV_ROOT / "data" / "intermediate" / "robotaxi-sim" / "reinickendorf"
TRIPS_PATH = SOURCE_DIR / "internal-trips.json"
EDGES_PATH = SOURCE_DIR / "internal-edge-geometries.json"
SUMMARY_PATH = SOURCE_DIR / "summary.json"

OUT_DIR = PROJECT_ROOT / "public" / "data"
OUT_PATH = OUT_DIR / "six-seven-scenario.json"

WINDOW_START = 21_600
WINDOW_END = 25_200


def append_shape(route_coords, shape):
    for lon, lat in shape:
        point = [round(lon, 7), round(lat, 7)]
        if route_coords and route_coords[-1] == point:
            continue
        route_coords.append(point)


def main():
    trips_doc = json.loads(TRIPS_PATH.read_text(encoding="utf-8"))
    edges_doc = json.loads(EDGES_PATH.read_text(encoding="utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))

    edge_lookup = edges_doc["edges"]
    window_trips = [
        trip
        for trip in trips_doc["trips"]
        if WINDOW_START <= float(trip["departSec"]) < WINDOW_END
    ]

    used_edges = set()
    exported_trips = []

    for trip in window_trips:
        route_coords = []
        route_length_m = 0.0

        for edge_id in trip["edges"]:
            edge = edge_lookup.get(edge_id)
            if not edge:
                continue
            used_edges.add(edge_id)
            route_length_m += float(edge.get("lengthM", 0))
            append_shape(route_coords, edge["shapeLonLat"])

        if len(route_coords) < 2:
            route_coords = [trip["originLonLat"], trip["destinationLonLat"]]

        exported_trips.append(
            {
                "id": trip["id"],
                "departSec": round(float(trip["departSec"]), 1),
                "departOffsetSec": round(float(trip["departSec"]) - WINDOW_START, 1),
                "distanceKm": round(float(trip["distanceKm"]), 3),
                "routeLengthKm": round(route_length_m / 1000, 3),
                "origin": [round(trip["originLonLat"][0], 7), round(trip["originLonLat"][1], 7)],
                "destination": [
                    round(trip["destinationLonLat"][0], 7),
                    round(trip["destinationLonLat"][1], 7),
                ],
                "route": route_coords,
            }
        )

    road_features = []
    for edge_id in sorted(used_edges):
        edge = edge_lookup[edge_id]
        road_features.append(
            {
                "type": "Feature",
                "properties": {
                    "edgeId": edge_id,
                    "lengthM": round(float(edge.get("lengthM", 0)), 2),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [round(lon, 7), round(lat, 7)] for lon, lat in edge["shapeLonLat"]
                    ],
                },
            }
        )

    boundary_coords = [
        [13.3314666, 52.5455115],
        [13.3301359, 52.5805580],
        [13.3891451, 52.5813756],
        [13.3904288, 52.5463280],
        [13.3314666, 52.5455115],
    ]

    exported = {
        "schemaVersion": "robotaxi-control-room-six-seven-v1",
        "scenario": {
            "id": "six-seven-morning-ramp",
            "name": "Six-Seven Morning Ramp",
            "areaLabel": "BeST Reinickendorf cutout",
            "windowLabel": "06:00-07:00",
            "startSec": WINDOW_START,
            "endSec": WINDOW_END,
            "durationSec": WINDOW_END - WINDOW_START,
            "totalRequests": len(exported_trips),
            "source": {
                "dataset": "BeST Berlin SUMO scenario, internal in/in Reinickendorf trips",
                "sourceTrips": str(TRIPS_PATH.relative_to(EV_ROOT)),
                "sourceEdges": str(EDGES_PATH.relative_to(EV_ROOT)),
                "method": "Filtered to trips with departSec in [21600, 25200). Routes reuse SUMO edge geometries.",
            },
            "notes": [
                "This is a demand replay, not a robotaxi dispatch model yet.",
                "Vehicle animation duration is estimated in the browser from route length.",
                "The service area is the BeST technical cutout, not the official Bezirk boundary.",
            ],
        },
        "summary": {
            "allDayInternalTrips": summary["internalTrips"]["trips"],
            "peakHour": summary["internalTrips"]["peakHour"],
            "peak15MinuteWindow": summary["internalTrips"]["peak15MinuteWindow"],
            "windowRequests": len(exported_trips),
            "windowUniqueEdges": len(used_edges),
        },
        "serviceArea": {
            "type": "Feature",
            "properties": {"name": "BeST Reinickendorf cutout"},
            "geometry": {"type": "Polygon", "coordinates": [boundary_coords]},
        },
        "depot": {
            "id": "txl-external-candidate",
            "label": "TXL candidate depot",
            "coordinates": [13.2877, 52.5567],
            "status": "outside current cutout",
        },
        "roads": {"type": "FeatureCollection", "features": road_features},
        "trips": exported_trips,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(exported, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(exported_trips)} trips, {len(used_edges)} edges)")


if __name__ == "__main__":
    main()
