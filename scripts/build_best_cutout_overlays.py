import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from pyproj import Transformer


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EV_DASHBOARD = PROJECT_ROOT.parent / "EV Mobility Dashboard"
BEST_SUMO_DIR = (
    DEFAULT_EV_DASHBOARD / "data" / "raw" / "best-scenario" / "scenario" / "sumo"
)
CUTOUTS_PATH = BEST_SUMO_DIR / "cutouts" / "cutouts.txt"
NET_PATH = BEST_SUMO_DIR / "berlin.net.xml"
OUT_PATH = PROJECT_ROOT / "public" / "data" / "cutouts" / "best-cutouts.geojson"

CUTOUT_STYLES = {
    "Reinickendorf": {"label": "Reinickendorf", "color": "#37d9ff"},
    "charlottenburg": {"label": "Charlottenburg", "color": "#ffbf3f"},
    "mitte": {"label": "Mitte", "color": "#ff5fd2"},
}


def read_sumo_location(net_path: Path):
    for _event, elem in ET.iterparse(net_path, events=("start",)):
        if elem.tag == "location":
            net_offset = tuple(float(value) for value in elem.attrib["netOffset"].split(","))
            proj_parameter = elem.attrib["projParameter"]
            elem.clear()
            return net_offset, proj_parameter
        elem.clear()
    raise RuntimeError(f"No <location> element found in {net_path}")


def parse_cutouts(cutouts_path: Path):
    cutouts = []
    for line in cutouts_path.read_text(encoding="utf-8").splitlines():
        if "->" not in line:
            continue
        name, raw_points = [part.strip() for part in line.split("->", 1)]
        points = [
            (float(x), float(y))
            for x, y in re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", raw_points)
        ]
        if len(points) < 3:
            continue
        if points[0] != points[-1]:
            points.append(points[0])
        cutouts.append((name, points))
    if not cutouts:
        raise RuntimeError(f"No cutout polygons parsed from {cutouts_path}")
    return cutouts


def main():
    net_offset, proj_parameter = read_sumo_location(NET_PATH)
    transformer = Transformer.from_crs(proj_parameter, "EPSG:4326", always_xy=True)
    ox, oy = net_offset

    features = []
    for raw_name, points in parse_cutouts(CUTOUTS_PATH):
        style = CUTOUT_STYLES.get(raw_name, {"label": raw_name, "color": "#ffffff"})
        coordinates = []
        for x, y in points:
            lon, lat = transformer.transform(x - ox, y - oy)
            coordinates.append([round(lon, 7), round(lat, 7)])

        features.append(
            {
                "type": "Feature",
                "id": raw_name.lower(),
                "properties": {
                    "name": style["label"],
                    "rawName": raw_name,
                    "lineColor": style["color"],
                    "source": "BeST Berlin SUMO cutouts.txt",
                    "sourcePath": str(CUTOUTS_PATH),
                    "sourceCoordinateSystem": "SUMO net coordinates shifted by berlin.net.xml netOffset",
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            }
        )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(features)} BeST cutout borders to {OUT_PATH}")


if __name__ == "__main__":
    main()
