import argparse
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from pyproj import Transformer


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EV_DASHBOARD = PROJECT_ROOT.parent / "EV Mobility Dashboard"
BEST_SUMO_DIR = (
    DEFAULT_EV_DASHBOARD / "data" / "raw" / "best-scenario" / "scenario" / "sumo"
)
SUMO_ROOT = Path(r"C:\Program Files (x86)\Eclipse\Sumo")
OUT_DIR = PROJECT_ROOT / "data" / "intermediate" / "sumo" / "reinickendorf-district"
APP_SUMO_DIR = PROJECT_ROOT / "hf-space" / "app" / "sumo" / "reinickendorf-district"

CUTOUT_NAME = "Reinickendorf"
SCENARIO_ID = "reinickendorf-district"
NET_NAME = "reinickendorf-district.net.xml"
ROUTE_NAME = "reinickendorf-district-contained.rou.xml"
SUMOCFG_NAME = "reinickendorf-district.sumocfg"
GEOJSON_NAME = "reinickendorf-district.geojson"
DEPOT_EDGE = "8036812#2"
DEPOT_RETURN_EDGE = "-8036812#2"
DEPOT_ADDITIONAL_NAME = "txl-adac-cybercab-depot.add.xml"


def run(command, cwd, env=None):
    print(" ".join(str(part) for part in command))
    subprocess.run(command, cwd=cwd, check=True, env=env)


def open_text(path, mode):
    if str(path).endswith(".gz"):
        return gzip.open(path, mode, encoding="utf-8")
    return open(path, mode, encoding="utf-8")


def parse_cutout_boundary(path: Path, name: str) -> list[tuple[float, float]]:
    for line in path.read_text(encoding="utf-8").splitlines():
        if "->" not in line:
            continue
        raw_name, raw_points = [part.strip() for part in line.split("->", 1)]
        if raw_name != name:
            continue
        points = [
            (float(x), float(y))
            for x, y in re.findall(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", raw_points)
        ]
        if len(points) < 3:
            raise RuntimeError(f"Cutout {name} has too few points")
        if points[0] != points[-1]:
            points.append(points[0])
        return points
    raise RuntimeError(f"Cutout {name} not found in {path}")


def read_sumo_location(net_path: Path):
    for _event, elem in ET.iterparse(net_path, events=("start",)):
        if elem.tag == "location":
            net_offset = tuple(float(value) for value in elem.attrib["netOffset"].split(","))
            proj_parameter = elem.attrib["projParameter"]
            elem.clear()
            return net_offset, proj_parameter
        elem.clear()
    raise RuntimeError(f"No <location> element found in {net_path}")


def boundary_geojson(points: list[tuple[float, float]], source_net: Path, cutout_source: Path):
    net_offset, proj_parameter = read_sumo_location(source_net)
    transformer = Transformer.from_crs(proj_parameter, "EPSG:4326", always_xy=True)
    ox, oy = net_offset
    coordinates = []
    for x, y in points:
        lon, lat = transformer.transform(x - ox, y - oy)
        coordinates.append([round(lon, 7), round(lat, 7)])

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "best-reinickendorf-cutout",
                "properties": {
                    "name": "BeST Reinickendorf cutout",
                    "source": "BeST Berlin SUMO cutouts.txt",
                    "sourcePath": str(cutout_source),
                    "sourceCoordinateSystem": "SUMO net coordinates shifted by berlin.net.xml netOffset",
                },
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
            }
        ],
    }


def read_net_edges(net_path: Path) -> set[str]:
    edge_ids = set()
    for _event, elem in ET.iterparse(net_path, events=("end",)):
        if elem.tag == "edge" and elem.get("function") != "internal":
            edge_ids.add(elem.attrib["id"])
        elem.clear()
    return edge_ids


def write_edge_file(path: Path, edge_ids: set[str]):
    path.write_text("\n".join(sorted(edge_ids)) + "\n", encoding="utf-8")


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


def connector_edges(
    source_net: Path,
    sumo_root: Path,
    cutout_edges: set[str],
    max_candidates: int,
    max_routes: int,
):
    sumolib = load_sumolib(sumo_root)
    net = sumolib.net.readNet(str(source_net), withInternal=False)
    depot_edge = net.getEdge(DEPOT_EDGE)
    depot_center = depot_edge.getShape()[len(depot_edge.getShape()) // 2]

    candidates = []
    for edge_id in cutout_edges:
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

    connector = {DEPOT_EDGE, DEPOT_RETURN_EDGE}
    selected_routes = []
    for _distance, candidate_id in sorted(candidates)[:max_candidates]:
        outbound = shortest_path_edges(net, DEPOT_EDGE, candidate_id)
        inbound = shortest_path_edges(net, candidate_id, DEPOT_EDGE)
        if not outbound or not inbound:
            continue
        connector.update(outbound)
        connector.update(inbound)
        selected_routes.append(
            {
                "entryEdge": candidate_id,
                "outboundEdges": len(outbound),
                "inboundEdges": len(inbound),
            }
        )
        if len(selected_routes) >= max_routes:
            break

    if not selected_routes:
        raise RuntimeError("No depot connector route into the BeST Reinickendorf cutout was found")

    return connector, selected_routes


def write_strict_contained_routes(source_routes: Path, output_path: Path, valid_edges: set[str]):
    total = 0
    kept = 0
    rejected = 0
    vtypes = []

    with open_text(source_routes, "rt") as source, output_path.open(
        "w", encoding="utf-8", newline="\n"
    ) as out:
        out.write('<?xml version="1.0" encoding="UTF-8"?>\n')
        out.write("<!-- generated by build_reinickendorf_best_cutout_sumo.py strict-contained mode -->\n")
        out.write(
            '<routes xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/routes_file.xsd">\n'
        )

        root = None
        wrote_vtypes = False
        for event, elem in ET.iterparse(source, events=("start", "end")):
            if root is None and event == "start":
                root = elem
                continue
            if event != "end":
                continue

            if elem.tag == "vType":
                vtypes.append(ET.tostring(elem, encoding="unicode"))
                elem.clear()
                continue

            if elem.tag != "vehicle":
                continue

            total += 1
            route = elem.find("route")
            route_edges = route.get("edges", "").split() if route is not None else []
            if route_edges and all(edge in valid_edges for edge in route_edges):
                if not wrote_vtypes:
                    for vtype in vtypes:
                        out.write(f"    {vtype}\n")
                    wrote_vtypes = True
                out.write(f"    {ET.tostring(elem, encoding='unicode')}\n")
                kept += 1
            else:
                rejected += 1
            elem.clear()
            if root is not None:
                root.clear()

        out.write("</routes>\n")

    return {"totalVehicles": total, "keptVehicles": kept, "rejectedVehicles": rejected}


def sumocfg(route_name: str):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/sumoConfiguration.xsd">
    <input>
        <net-file value="{NET_NAME}"/>
        <route-files value="{route_name}"/>
    </input>
    <output>
        <output-prefix value="output/reinickendorf_district_"/>
        <log value="console.log"/>
        <summary-output value="summary.xml"/>
        <statistic-output value="statistics.xml"/>
    </output>
    <time>
        <begin value="0.0"/>
        <end value="86400.0"/>
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


def depot_additional():
    spaces = []
    for y in [19690.0, 19708.0, 19726.0, 19744.0]:
        for x in [12588.0, 12608.0, 12628.0, 12648.0, 12668.0]:
            spaces.append(
                f'        <space x="{x:.2f}" y="{y:.2f}" width="4.0" length="7.0" angle="90"/>'
            )
    spaces_xml = "\n".join(spaces)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<additional xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://sumo.dlr.de/xsd/additional_file.xsd">
    <poly
        id="txl_adac_cybercab_depot_footprint"
        color="35,35,35,180"
        fill="1"
        layer="-10"
        shape="12558.00,19638.00 12692.00,19638.00 12692.00,19762.00 12558.00,19762.00" />

    <poly
        id="txl_adac_cybercab_depot_outline"
        color="255,195,0,255"
        fill="0"
        lineWidth="1.6"
        layer="10"
        shape="12558.00,19638.00 12692.00,19638.00 12692.00,19762.00 12558.00,19762.00 12558.00,19638.00" />

    <parkingArea
        id="txl_adac_cybercab_depot"
        lane="8036812#2_0"
        startPos="118.0"
        endPos="132.0"
        roadsideCapacity="0"
        onRoad="false"
        friendlyPos="true">
{spaces_xml}
    </parkingArea>

    <chargingStation
        id="txl_adac_wireless_charging"
        lane="8036812#2_0"
        startPos="118.0"
        endPos="132.0"
        power="150000"
        totalPower="3000000"
        efficiency="0.95"
        chargeDelay="0"
        chargeInTransit="false"
        parkingArea="txl_adac_cybercab_depot" />
</additional>
"""


def copy_live_outputs(out_dir: Path, app_sumo_dir: Path):
    app_sumo_dir.mkdir(parents=True, exist_ok=True)
    (app_sumo_dir / "output").mkdir(exist_ok=True)
    for name in [
        NET_NAME,
        ROUTE_NAME,
        SUMOCFG_NAME,
        GEOJSON_NAME,
        DEPOT_ADDITIONAL_NAME,
        "metadata.json",
    ]:
        shutil.copy2(out_dir / name, app_sumo_dir / name)


def main():
    parser = argparse.ArgumentParser(
        description="Build the smaller BeST Reinickendorf SUMO cutout plus TXL/ADAC robotaxi depot connector."
    )
    parser.add_argument("--best-sumo-dir", type=Path, default=BEST_SUMO_DIR)
    parser.add_argument("--sumo-root", type=Path, default=SUMO_ROOT)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    parser.add_argument("--app-sumo-dir", type=Path, default=APP_SUMO_DIR)
    parser.add_argument("--connector-candidates", type=int, default=256)
    parser.add_argument("--connector-routes", type=int, default=64)
    parser.add_argument("--skip-live-copy", action="store_true")
    args = parser.parse_args()

    netconvert = args.sumo_root / "bin" / ("netconvert.exe" if os.name == "nt" else "netconvert")
    source_net = args.best_sumo_dir / "berlin.net.xml"
    source_routes = args.best_sumo_dir / "berlin.rou.gz"
    cutouts_path = args.best_sumo_dir / "cutouts" / "cutouts.txt"
    for path in [netconvert, source_net, source_routes, cutouts_path]:
        if not path.exists():
            raise FileNotFoundError(path)

    env = os.environ.copy()
    env["SUMO_HOME"] = str(args.sumo_root)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "output").mkdir(exist_ok=True)

    cutout_points = parse_cutout_boundary(cutouts_path, CUTOUT_NAME)
    cutout_boundary = " ".join(f"{x:.6f},{y:.6f}" for x, y in cutout_points)

    with tempfile.TemporaryDirectory(prefix="best-rdorf-cutout-") as temp_dir_raw:
        temp_dir = Path(temp_dir_raw)
        small_net = temp_dir / "small.net.xml"
        run(
            [
                netconvert,
                "-s",
                source_net,
                "-o",
                small_net,
                "--keep-edges.in-boundary",
                cutout_boundary,
                "-v",
            ],
            cwd=PROJECT_ROOT,
            env=env,
        )

        cutout_edges = read_net_edges(small_net)
        connector_edge_ids, connector_routes = connector_edges(
            source_net,
            args.sumo_root,
            cutout_edges,
            args.connector_candidates,
            args.connector_routes,
        )
        active_network_edges = set(cutout_edges) | connector_edge_ids
        edge_file = temp_dir / "active-edges.txt"
        write_edge_file(edge_file, active_network_edges)

        net_path = args.out_dir / NET_NAME
        run(
            [
                netconvert,
                "-s",
                source_net,
                "-o",
                net_path,
                "--keep-edges.input-file",
                edge_file,
                "-v",
            ],
            cwd=PROJECT_ROOT,
            env=env,
        )

    route_path = args.out_dir / ROUTE_NAME
    route_stats = write_strict_contained_routes(source_routes, route_path, cutout_edges)
    (args.out_dir / SUMOCFG_NAME).write_text(sumocfg(route_path.name), encoding="utf-8")
    (args.out_dir / DEPOT_ADDITIONAL_NAME).write_text(depot_additional(), encoding="utf-8")
    (args.out_dir / GEOJSON_NAME).write_text(
        json.dumps(boundary_geojson(cutout_points, source_net, cutouts_path), indent=2),
        encoding="utf-8",
    )

    metadata = {
        "id": SCENARIO_ID,
        "name": "BeST Reinickendorf cutout with TXL/ADAC depot connector",
        "sourceBoundary": {
            "provider": "BeST Berlin SUMO cutouts.txt",
            "path": str(cutouts_path.resolve()),
            "name": CUTOUT_NAME,
            "sumoBoundary": cutout_boundary,
        },
        "outputs": {
            "net": str((args.out_dir / NET_NAME).resolve()),
            "routes": str(route_path.resolve()),
            "config": str((args.out_dir / SUMOCFG_NAME).resolve()),
            "boundary": str((args.out_dir / GEOJSON_NAME).resolve()),
        },
        "routeFilter": {
            "mode": "strict-contained",
            "validCutoutEdges": len(cutout_edges),
            **route_stats,
            "rule": "Keep only vehicles whose complete original route edge list is inside the original BeST Reinickendorf cutout edge set.",
        },
        "depotConnector": {
            "depotEdge": DEPOT_EDGE,
            "depotReturnEdge": DEPOT_RETURN_EDGE,
            "connectorEdges": len(connector_edge_ids),
            "activeNetworkEdges": len(active_network_edges),
            "cutoutEdges": len(cutout_edges),
            "selectedRoutes": connector_routes,
            "trafficFilterExcludesConnector": True,
        },
    }
    (args.out_dir / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    if not args.skip_live_copy:
        copy_live_outputs(args.out_dir, args.app_sumo_dir)

    print(f"Wrote network:  {args.out_dir / NET_NAME}")
    print(f"Wrote routes:   {route_path}")
    print(f"Wrote config:   {args.out_dir / SUMOCFG_NAME}")
    print(
        "Route filter: "
        f"kept {route_stats['keptVehicles']} / {route_stats['totalVehicles']} vehicles "
        f"({route_stats['rejectedVehicles']} rejected)"
    )
    print(
        "Connector: "
        f"{len(connector_edge_ids)} connector edges + {len(cutout_edges)} cutout edges"
    )


if __name__ == "__main__":
    main()
