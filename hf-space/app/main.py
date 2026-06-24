import asyncio
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


APP_DIR = Path(__file__).resolve().parent
SCENARIO_PATH = APP_DIR / "data" / "six-seven-scenario.json"
SUMO_SCENARIO_DIR = APP_DIR / "sumo" / "reinickendorf"
SUMO_CONFIG_PATH = SUMO_SCENARIO_DIR / "reinickendorf-internal.sumocfg"
SUMO_START_SEC = 21_600
SUMO_END_SEC = 25_200

app = FastAPI(title="Robotaxi SUMO Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in os.getenv("ALLOW_ORIGINS", "*").split(",") if origin],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_scenario() -> dict[str, Any]:
    with SCENARIO_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def find_sumo_home() -> Path | None:
    configured_home = os.getenv("SUMO_HOME")
    if configured_home and Path(configured_home).exists():
        return Path(configured_home)

    windows_home = Path(r"C:\Program Files (x86)\Eclipse\Sumo")
    if windows_home.exists():
        return windows_home

    linux_home = Path("/usr/share/sumo")
    if linux_home.exists():
        return linux_home

    return None


def find_sumo_binary() -> str | None:
    configured_binary = os.getenv("SUMO_BINARY")
    if configured_binary and Path(configured_binary).exists():
        return configured_binary

    path_binary = shutil.which("sumo")
    if path_binary:
        return path_binary

    sumo_home = find_sumo_home()
    if not sumo_home:
        return None

    candidate = sumo_home / "bin" / ("sumo.exe" if os.name == "nt" else "sumo")
    return str(candidate) if candidate.exists() else None


def ensure_traci_import() -> Any:
    sumo_home = find_sumo_home()
    if sumo_home:
        tools_path = sumo_home / "tools"
        if tools_path.exists() and str(tools_path) not in sys.path:
            sys.path.append(str(tools_path))

    import traci  # type: ignore[import-not-found]

    return traci


def sumo_version() -> dict[str, Any]:
    sumo_binary = find_sumo_binary()
    if not sumo_binary:
        return {"available": False, "error": "sumo binary not found"}

    try:
        result = subprocess.run(
            [sumo_binary, "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return {
            "available": result.returncode == 0,
            "binary": sumo_binary,
            "returnCode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except FileNotFoundError:
        return {"available": False, "error": "sumo binary not found"}
    except subprocess.TimeoutExpired:
        return {"available": False, "error": "sumo --version timed out"}


@app.get("/health")
def health() -> dict[str, Any]:
    scenario = load_scenario()
    sumo = sumo_version()
    files = packaged_sumo_files()
    return {
        "ok": bool(sumo["available"] and all(files.values())),
        "service": "robotaxi-sumo-backend",
        "scenario": scenario["scenario"]["id"],
        "sumoAvailable": sumo["available"],
        "packagedFiles": files,
    }


@app.get("/sumo/version")
def get_sumo_version() -> dict[str, Any]:
    return sumo_version()


def packaged_sumo_files() -> dict[str, bool]:
    return {
        "net": (SUMO_SCENARIO_DIR / "reinickendorf.net.xml").exists(),
        "routes": (SUMO_SCENARIO_DIR / "reinickendorf-internal.rou.gz").exists(),
        "config": SUMO_CONFIG_PATH.exists(),
    }


@app.get("/scenario/summary")
def scenario_summary() -> dict[str, Any]:
    scenario = load_scenario()
    return {
        "schemaVersion": scenario["schemaVersion"],
        "scenario": scenario["scenario"],
        "summary": scenario["summary"],
        "serviceArea": scenario["serviceArea"],
        "depot": scenario["depot"],
        "counts": {
            "roads": len(scenario["roads"]["features"]),
            "trips": len(scenario["trips"]),
        },
    }


@app.get("/scenario")
def get_scenario() -> dict[str, Any]:
    return load_scenario()


@app.get("/sumo/reinickendorf/summary")
def sumo_reinickendorf_summary() -> dict[str, Any]:
    scenario = load_scenario()
    return {
        "available": SUMO_CONFIG_PATH.exists() and find_sumo_binary() is not None,
        "sumo": sumo_version(),
        "config": str(SUMO_CONFIG_PATH),
        "window": {
            "startSec": SUMO_START_SEC,
            "endSec": SUMO_END_SEC,
            "label": scenario["scenario"]["windowLabel"],
        },
        "files": packaged_sumo_files(),
    }


@app.get("/sumo/reinickendorf/validate")
def validate_sumo_reinickendorf() -> dict[str, Any]:
    sumo_binary = find_sumo_binary()
    if not sumo_binary:
        return {"ok": False, "error": "sumo binary not found"}

    (SUMO_SCENARIO_DIR / "output").mkdir(exist_ok=True)
    sumo_home = find_sumo_home()
    env = os.environ.copy()
    if sumo_home:
        env["SUMO_HOME"] = str(sumo_home)

    command = [
        sumo_binary,
        "-c",
        str(SUMO_CONFIG_PATH),
        "--begin",
        str(SUMO_START_SEC),
        "--end",
        str(SUMO_START_SEC + 10),
        "--step-length",
        "1",
        "--no-step-log",
        "true",
        "--quit-on-end",
        "true",
    ]
    result = subprocess.run(
        command,
        cwd=str(SUMO_SCENARIO_DIR),
        env=env,
        check=False,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return {
        "ok": result.returncode == 0,
        "returnCode": result.returncode,
        "command": command,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


@app.websocket("/ws/replay")
async def replay(websocket: WebSocket) -> None:
    await websocket.accept()
    scenario = load_scenario()
    trips = sorted(scenario["trips"], key=lambda trip: trip["departOffsetSec"])
    start_sec = scenario["scenario"]["startSec"]

    try:
        await websocket.send_json(
            {
                "type": "hello",
                "scenario": scenario["scenario"],
                "counts": {"trips": len(trips)},
            }
        )

        speed = 120.0
        frame_step_sec = 30
        current_offset = 0
        trip_index = 0

        while current_offset <= scenario["scenario"]["durationSec"]:
            new_requests = []
            while (
                trip_index < len(trips)
                and trips[trip_index]["departOffsetSec"] <= current_offset
            ):
                trip = trips[trip_index]
                new_requests.append(
                    {
                        "id": trip["id"],
                        "origin": trip["origin"],
                        "destination": trip["destination"],
                        "distanceKm": trip["distanceKm"],
                    }
                )
                trip_index += 1

            await websocket.send_json(
                {
                    "type": "frame",
                    "simSec": start_sec + current_offset,
                    "offsetSec": current_offset,
                    "newRequests": new_requests,
                }
            )
            current_offset += frame_step_sec
            await asyncio.sleep(frame_step_sec / speed)

        await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        return


@app.websocket("/ws/sumo/reinickendorf")
async def sumo_reinickendorf(websocket: WebSocket) -> None:
    await websocket.accept()

    sumo_binary = find_sumo_binary()
    if not sumo_binary or not SUMO_CONFIG_PATH.exists():
        await websocket.send_json(
            {
                "type": "error",
                "message": "SUMO binary or Reinickendorf config is unavailable.",
                "sumoAvailable": bool(sumo_binary),
                "configExists": SUMO_CONFIG_PATH.exists(),
            }
        )
        await websocket.close()
        return

    try:
        traci = ensure_traci_import()
    except Exception as error:  # pragma: no cover - runtime environment dependent
        await websocket.send_json({"type": "error", "message": f"TraCI import failed: {error}"})
        await websocket.close()
        return

    command = [
        sumo_binary,
        "-c",
        str(SUMO_CONFIG_PATH),
        "--begin",
        str(SUMO_START_SEC),
        "--end",
        str(SUMO_END_SEC),
        "--step-length",
        "1",
        "--no-step-log",
        "true",
        "--quit-on-end",
        "true",
    ]

    connection_label = f"reinickendorf-{id(websocket)}"
    frame_delay_sec = float(os.getenv("SUMO_FRAME_DELAY_SEC", "0.035"))

    try:
        (SUMO_SCENARIO_DIR / "output").mkdir(exist_ok=True)
        sumo_home = find_sumo_home()
        if sumo_home:
            os.environ["SUMO_HOME"] = str(sumo_home)

        await websocket.send_json(
            {
                "type": "hello",
                "backend": "sumo-traci",
                "window": {"startSec": SUMO_START_SEC, "endSec": SUMO_END_SEC},
            }
        )

        await asyncio.to_thread(
            traci.start,
            command,
            label=connection_label,
        )
        connection = traci.getConnection(connection_label)

        sim_sec = SUMO_START_SEC
        while sim_sec <= SUMO_END_SEC:
            await asyncio.to_thread(connection.simulationStep)
            sim_sec = int(connection.simulation.getTime())
            vehicle_ids = list(connection.vehicle.getIDList())
            vehicles = []

            for vehicle_id in vehicle_ids:
                x, y = connection.vehicle.getPosition(vehicle_id)
                lon, lat = connection.simulation.convertGeo(x, y)
                vehicles.append(
                    {
                        "id": vehicle_id,
                        "lon": lon,
                        "lat": lat,
                        "speed": round(float(connection.vehicle.getSpeed(vehicle_id)), 3),
                        "lane": connection.vehicle.getLaneID(vehicle_id),
                        "route": connection.vehicle.getRouteID(vehicle_id),
                    }
                )

            await websocket.send_json(
                {
                    "type": "frame",
                    "simSec": sim_sec,
                    "vehicles": vehicles,
                    "vehicleCount": len(vehicles),
                    "departed": list(connection.simulation.getDepartedIDList()),
                    "arrived": list(connection.simulation.getArrivedIDList()),
                }
            )
            await asyncio.sleep(frame_delay_sec)

        await websocket.send_json({"type": "done"})
    except WebSocketDisconnect:
        return
    except Exception as error:
        await websocket.send_json({"type": "error", "message": str(error)})
    finally:
        try:
            traci.switch(connection_label)
            traci.close(False)
        except Exception:
            pass
