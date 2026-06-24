"""Smoke-check a Robotaxi SUMO backend URL.

Examples:
    python scripts/smoke_backend.py --base-url http://127.0.0.1:7860
    python scripts/smoke_backend.py --base-url https://icybean-robotaxi-sumo-backend.hf.space
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def get_json(base_url: str, path: str) -> dict:
    url = f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--retry-delay-sec", type=float, default=10)
    args = parser.parse_args()

    checks = {
        "health": "/health",
        "sumo_summary": "/sumo/reinickendorf/summary",
        "scenario_summary": "/scenario/summary",
    }

    failures: list[str] = []
    for attempt in range(1, args.retries + 1):
        failures = []
        print(f"Attempt {attempt}/{args.retries}")
        for label, path in checks.items():
            try:
                payload = get_json(args.base_url, path)
            except urllib.error.HTTPError as error:
                failures.append(f"{label}: HTTP {error.code}")
                continue
            except Exception as error:
                failures.append(f"{label}: {error}")
                continue

            print(f"{label}: ok")
            if label == "health" and not payload.get("ok"):
                failures.append(f"{label}: backend reported ok=false")
            if label == "sumo_summary" and not payload.get("available"):
                failures.append(f"{label}: SUMO summary reports unavailable")

        if not failures:
            break

        if attempt < args.retries:
            time.sleep(args.retry_delay_sec)

    if failures:
        print("\nFailures:")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)


if __name__ == "__main__":
    main()
