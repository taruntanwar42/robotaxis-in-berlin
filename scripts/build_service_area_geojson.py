"""Build the frontend service-area polygon from the official Ortsteile.

Unions the Charlottenburg + Moabit + Tiergarten district polygons and
simplifies the result into a small GeoJSON the frontend ships statically.
The SUMO network stays cut by the padded bbox envelope; this asset is the
*visual* service area (the real district curves the product wants to show).

Usage: python scripts/build_service_area_geojson.py
"""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE = (
    REPO_ROOT
    / "hf-space"
    / "app"
    / "sumo"
    / "charlottenburg-moabit-tiergarten"
    / "charlottenburg-moabit-tiergarten.official-ortsteile.geojson"
)
TARGET = REPO_ROOT / "public" / "data" / "service-area.geojson"

# ~11 m at Berlin latitude: keeps the district curves, drops survey-level noise.
SIMPLIFY_TOLERANCE_DEG = 0.0001


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    geometries = [shape(feature["geometry"]) for feature in source["features"]]
    names = [
        str(feature.get("properties", {}).get("name", "?")) for feature in source["features"]
    ]

    union = unary_union(geometries)
    # buffer(0-ish) closes sliver gaps between adjacent district boundaries so
    # the union is one clean ring instead of three touching polygons.
    healed = union.buffer(0.00005).buffer(-0.00005)
    simplified = healed.simplify(SIMPLIFY_TOLERANCE_DEG, preserve_topology=True)

    feature = {
        "type": "Feature",
        "properties": {
            "name": "Charlottenburg - Moabit - Tiergarten",
            "source": "Union of official Berlin Ortsteil polygons",
            "districts": names,
            "simplifyToleranceDeg": SIMPLIFY_TOLERANCE_DEG,
        },
        "geometry": mapping(simplified),
    }
    collection = {"type": "FeatureCollection", "features": [feature]}

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(collection, separators=(",", ":")), encoding="utf-8")

    bounds = simplified.bounds
    print(f"districts: {names}")
    print(f"geometry: {simplified.geom_type}, bounds: {bounds}")
    print(f"wrote {TARGET} ({TARGET.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
