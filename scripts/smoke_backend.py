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


async def check_sumo_websocket(
    base_url: str,
    scope: str,
    max_messages: int,
    demand_source: str,
    require_done: bool,
    speed: int,
    dispatch_engine: str,
    playback_detail: str,
    playback_cache: str,
) -> None:
    try:
        import websockets
    except ImportError as error:
        raise RuntimeError(
            "websockets is required for --check-websocket; install it with "
            "`python -m pip install websockets`"
        ) from error

    uri = websocket_url(
        base_url,
        (
            f"/ws/sumo/{scope}/playback?speed={speed}&demand={demand_source}"
            f"&replacement=25&engine={dispatch_engine}&detail={playback_detail}"
            f"&cache={playback_cache}"
        ),
    )
    saw_chunk = False
    saw_dispatch_metadata = False
    saw_vehicle = False
    saw_done = False
    replaced_vehicle_ids: set[str] = set()
    playback_message_count = 0
    raw_message_count = 0
    max_raw_messages = max_messages * 3 + 10
    async with websockets.connect(uri, open_timeout=30, max_size=8 * 1024 * 1024) as websocket:
        while playback_message_count < max_messages and raw_message_count < max_raw_messages:
            raw_message = await asyncio.wait_for(websocket.recv(), timeout=30)
            raw_message_count += 1
            message = json.loads(raw_message)
            message_type = message.get("type")
            if message_type in {"chunk", "done", "error", "stopped"}:
                playback_message_count += 1
            if message_type == "error":
                raise RuntimeError(message.get("message", "backend sent error frame"))
            if message_type == "done":
                saw_done = True
                audit = message.get("audit") or {}
                final_dispatch = message.get("finalDispatch") or {}
                missing_audit_keys = sorted(
                    {
                        "completed",
                        "openRequests",
                        "fleetAtDepot",
                        "fleetSize",
                        "deadheadingPercent",
                        "energyKwh",
                        "chargingSessions",
                        "passed",
                    }
                    - set(audit)
                )
                if missing_audit_keys:
                    raise RuntimeError(
                        "done audit missing keys: "
                        + ", ".join(missing_audit_keys)
                    )
                if not final_dispatch.get("metrics"):
                    raise RuntimeError("done frame missing final dispatch metrics")
                return
            if message_type == "chunk":
                saw_chunk = True
                frames = message.get("frames") or []
                for frame in frames:
                    dispatch = frame.get("dispatch") or {}
                    demand = dispatch.get("demand") or dispatch.get("replacement") or {}
                    if demand:
                        for request in dispatch.get("requests") or []:
                            source_vehicle_id = request.get("sourceVehicleId")
                            if (
                                source_vehicle_id is not None
                                and request.get("status") != "unreachable"
                                and request.get("cybercabCapable") is not False
                            ):
                                replaced_vehicle_ids.add(str(source_vehicle_id))
                    vehicles = frame.get("vehicles") or []
                    if vehicles:
                        saw_vehicle = True
                        live_ids = {str(vehicle.get("id")) for vehicle in vehicles}
                        leaked_ids = sorted(replaced_vehicle_ids & live_ids)
                        if leaked_ids:
                            raise RuntimeError(
                                "replaced source vehicles still streamed: "
                                + ", ".join(leaked_ids[:5])
                            )
                    if demand:
                        metrics = dispatch.get("metrics") or {}
                        required_metric_keys = {
                            "fleetStateCounts",
                            "cybercabCapacityMisses",
                            "cybercabServeableRequests",
                            "passengerKm",
                            "vehicleKm",
                            "emptyKm",
                        }
                        missing_metric_keys = sorted(required_metric_keys - set(metrics))
                        if missing_metric_keys:
                            raise RuntimeError(
                                "dispatch metrics missing keys: "
                                + ", ".join(missing_metric_keys)
                            )
                        if demand.get("usingFallbackDemand"):
                            raise RuntimeError(
                                "playback used fallback demand"
                            )
                        if demand.get("targetRequestCount", 0) <= 0:
                            raise RuntimeError(
                                "playback produced no requests"
                            )
                        if demand_source == "sumo" and demand.get("removedVehicles", 0) <= 0:
                            raise RuntimeError(
                                "replacement playback removed no source vehicles"
                            )
                        if demand_source == "matsim" and demand.get("source") != "matsim":
                            raise RuntimeError(
                                f"expected matsim demand, got {demand.get('source')}"
                            )
                        saw_dispatch_metadata = True
                if saw_vehicle and saw_dispatch_metadata and not require_done:
                    return

    if require_done and not saw_done:
        raise RuntimeError(f"no done audit received after {max_messages} playback messages")
    if saw_chunk:
        missing = []
        if not saw_vehicle:
            missing.append("vehicles")
        if not saw_dispatch_metadata:
            missing.append("dispatch demand metadata")
        raise RuntimeError(
            f"missing {', '.join(missing)} after {max_messages} playback messages"
        )
    raise RuntimeError(f"no SUMO playback chunk received after {max_messages} playback messages")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--retry-delay-sec", type=float, default=10)
    parser.add_argument("--check-websocket", action="store_true")
    parser.add_argument("--websocket-max-messages", type=int, default=300)
    parser.add_argument("--require-websocket-done", action="store_true")
    parser.add_argument("--speed", type=int, default=50)
    parser.add_argument("--demand", choices=["matsim", "sumo"], default="matsim")
    parser.add_argument("--engine", choices=["taxi", "custom"], default="taxi")
    parser.add_argument("--detail", choices=["full", "public"], default="public")
    parser.add_argument("--cache", choices=["auto", "live", "cache"], default="auto")
    parser.add_argument("--scope", default="charlottenburg-moabit-tiergarten")
    args = parser.parse_args()

    checks = {
        "health": "/health",
        "sumo_summary": f"/sumo/{args.scope}/summary",
        "sumo_network": f"/sumo/{args.scope}/network",
        "sumo_validate": f"/sumo/{args.scope}/validate",
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
                    check_sumo_websocket(
                        args.base_url,
                        args.scope,
                        args.websocket_max_messages,
                        args.demand,
                        args.require_websocket_done,
                        args.speed,
                        args.engine,
                        args.detail,
                        args.cache,
                    )
                )
            except Exception as error:
                message = str(error) or repr(error)
                failures.append(f"sumo_websocket: {message}")
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
