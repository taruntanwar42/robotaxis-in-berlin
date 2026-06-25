"""Deploy the robotaxi SUMO backend as a Docker Hugging Face Space.

Usage:
    $env:HF_TOKEN = Read-Host "HF token"
    python scripts/deploy_hf_space.py --repo-id USERNAME/robotaxi-sumo-backend
"""

from __future__ import annotations

import argparse
import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPACE_DIR = ROOT / "hf-space"
SCENARIO_SOURCE = ROOT / "public" / "data" / "six-seven-scenario.json"
SCENARIO_TARGET = SPACE_DIR / "app" / "data" / "six-seven-scenario.json"
DEFAULT_BERLIN_SOURCE_DIR = (
    Path.home()
    / "Desktop"
    / "EV Mobility Dashboard"
    / "data"
    / "raw"
    / "best-scenario"
    / "scenario"
    / "sumo"
)
BERLIN_TARGET_DIR = SPACE_DIR / "app" / "sumo" / "berlin"
BERLIN_SUMO_FILES = [
    "berlin.net.xml",
    "berlin.rou.gz",
    "berlin.sumocfg",
    "berlin_bus.rou.xml",
    "berlin_bus_stops.add.xml",
]
BERLIN_DOWNLOAD_URL = "https://www.dcaiti.tu-berlin.de/research/simulation/downloads/get/best-scenario-v2.zip"


def download_berlin_sumo_files() -> Path:
    temp_dir = Path(tempfile.mkdtemp(prefix="best-berlin-sumo-"))
    zip_path = temp_dir / "best-scenario-v2.zip"
    print("Downloading BeST Berlin SUMO bundle for HF deploy...")
    urllib.request.urlretrieve(BERLIN_DOWNLOAD_URL, zip_path)
    print("Extracting BeST Berlin SUMO bundle...")
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(temp_dir)
    zip_path.unlink(missing_ok=True)

    matches = list(temp_dir.rglob("berlin.sumocfg"))
    if not matches:
        raise SystemExit("Downloaded BeST archive did not contain berlin.sumocfg")
    return matches[0].parent


def copy_berlin_sumo_files(source_dir: Path) -> None:
    if not source_dir.exists():
        source_dir = download_berlin_sumo_files()

    missing_files = [name for name in BERLIN_SUMO_FILES if not (source_dir / name).exists()]
    if missing_files:
        raise SystemExit(
            "Missing Berlin SUMO files in "
            f"{source_dir}: {', '.join(missing_files)}"
        )

    BERLIN_TARGET_DIR.mkdir(parents=True, exist_ok=True)
    for name in BERLIN_SUMO_FILES:
        source = source_dir / name
        target = BERLIN_TARGET_DIR / name
        if target.exists() and target.stat().st_size == source.stat().st_size:
            continue
        print(f"Copying Berlin SUMO file: {name}")
        shutil.copy2(source, target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", required=True, help="Hugging Face Space repo id, e.g. user/name")
    parser.add_argument("--private", action="store_true", help="Create/update the Space as private")
    parser.add_argument(
        "--berlin-source-dir",
        type=Path,
        default=Path(os.getenv("BERLIN_SUMO_SOURCE_DIR", DEFAULT_BERLIN_SOURCE_DIR)),
        help="Directory containing full Berlin BeST SUMO files.",
    )
    parser.add_argument(
        "--skip-berlin",
        action="store_true",
        help="Deploy without bundling full Berlin SUMO files.",
    )
    args = parser.parse_args()

    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError as exc:
        raise SystemExit("Install deploy dependency first: pip install huggingface_hub") from exc

    token = os.getenv("HF_TOKEN")
    api = HfApi(token=token)

    if not SCENARIO_SOURCE.exists():
        raise SystemExit(f"Missing scenario bundle: {SCENARIO_SOURCE}")

    SCENARIO_TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCENARIO_SOURCE, SCENARIO_TARGET)
    if not args.skip_berlin:
        copy_berlin_sumo_files(args.berlin_source_dir)

    create_repo(
        repo_id=args.repo_id,
        token=token,
        repo_type="space",
        space_sdk="docker",
        private=args.private,
        exist_ok=True,
    )

    api.upload_folder(
        repo_id=args.repo_id,
        repo_type="space",
        folder_path=str(SPACE_DIR),
        commit_message="Deploy robotaxi SUMO backend",
        ignore_patterns=[
            "**/__pycache__/**",
            "**/*.pyc",
            "**/output/**",
        ],
    )
    runtime = api.restart_space(
        repo_id=args.repo_id,
        token=token,
        factory_reboot=True,
    )

    space_slug = args.repo_id.replace("/", "-")
    print(f"Deployed: https://huggingface.co/spaces/{args.repo_id}")
    print(f"App URL:   https://{space_slug}.hf.space")
    print(f"Runtime:   {runtime.stage}")


if __name__ == "__main__":
    main()
