"""Smoke-check a Robotaxi SUMO backend URL.

Examples:
    python scripts/smoke_backend.py --base-url http://127.0.0.1:7860
    python scripts/smoke_backend.py --base-url https://icybean-robotaxi-sumo-backend.hf.space
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse, urlunparse


def get_json(base_url: str, path: str) -> dict:
    url = f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def websocket_url(base_url: str, path: str) -> str:
    parsed = urlparse(base_url.rstrip("/"))
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunparse((scheme, parsed.netloc, path, "", "", ""))


async def check_sumo_websocket(base_url: str, max_messages: int) -> None:
    try:
        import websockets
    except ImportError as error:
        raise RuntimeError(
            "websockets is required for --check-websocket; install it with "
            "`python -m pip install websockets`"
        ) from error

    uri = websocket_url(base_url, "/ws/sumo/reinickendorf-district")
    saw_frame = False
    async with websockets.connect(uri, open_timeout=30) as websocket:
        await websocket.send(json.dumps({"command": "start"}))
        for _ in range(max_messages):
            raw_message = await asyncio.wait_for(websocket.recv(), timeout=30)
            message = json.loads(raw_message)
            message_type = message.get("type")
            if message_type == "error":
                raise RuntimeError(message.get("message", "backend sent error frame"))
            if message_type == "frame":
                saw_frame = True
                if (message.get("vehicleCount") or 0) > 0:
                    return

    if saw_frame:
        raise RuntimeError(f"no vehicle frame received after {max_messages} messages")
    raise RuntimeError(f"no SUMO frame received after {max_messages} messages")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--retry-delay-sec", type=float, default=10)
    parser.add_argument("--check-websocket", action="store_true")
    parser.add_argument("--websocket-max-messages", type=int, default=60)
    args = parser.parse_args()

    checks = {
        "health": "/health",
        "sumo_summary": "/sumo/reinickendorf-district/summary",
        "sumo_network": "/sumo/reinickendorf-district/network",
        "sumo_validate": "/sumo/reinickendorf-district/validate",
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
            if label == "sumo_network":
                if not payload.get("available"):
                    failures.append(f"{label}: SUMO network reports unavailable")
                counts = payload.get("counts") or {}
                if counts.get("lanes", 0) <= 0:
                    failures.append(f"{label}: no SUMO lanes returned")
                if counts.get("internalLanes", 0) <= 0:
                    failures.append(f"{label}: no SUMO internal lanes returned")
                if counts.get("trafficLights", 0) <= 0:
                    failures.append(f"{label}: no traffic lights returned")
            if label == "sumo_validate" and not payload.get("ok"):
                failures.append(f"{label}: SUMO validation failed")

        if args.check_websocket:
            try:
                asyncio.run(
                    check_sumo_websocket(args.base_url, args.websocket_max_messages)
                )
            except Exception as error:
                failures.append(f"sumo_websocket: {error}")
            else:
                print("sumo_websocket: ok")

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
