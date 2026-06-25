"""Deploy the robotaxi SUMO backend as a Docker Hugging Face Space.

Usage:
    $env:HF_TOKEN = Read-Host "HF token"
    python scripts/deploy_hf_space.py --repo-id USERNAME/robotaxi-sumo-backend
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPACE_DIR = ROOT / "hf-space"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", required=True, help="Hugging Face Space repo id, e.g. user/name")
    parser.add_argument("--private", action="store_true", help="Create/update the Space as private")
    args = parser.parse_args()

    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError as exc:
        raise SystemExit("Install deploy dependency first: pip install huggingface_hub") from exc

    token = os.getenv("HF_TOKEN")
    api = HfApi(token=token)

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
