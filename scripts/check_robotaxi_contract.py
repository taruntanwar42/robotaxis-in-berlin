"""Check the backend robotaxi frame contract stays product-aligned."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HF_SPACE_ROOT = PROJECT_ROOT / "hf-space"
sys.path.insert(0, str(HF_SPACE_ROOT))

from app.main import (  # noqa: E402
    MATSIM_ROBOTAXI_MODES,
    ROBOTAXI_FLEET_SIZE,
    build_contract_frame_fields,
)


def main() -> None:
    dispatch_payload = {
        "robotaxis": [
            {
                "id": f"cybercab_{index + 1:02d}",
                "status": "staged",
                "targetEdge": f"edge_{index}",
                "requestId": None,
            }
            for index in range(ROBOTAXI_FLEET_SIZE)
        ],
        "requests": [],
        "metrics": {
            "activeRobotaxis": 0,
            "completed": 0,
            "targetRequests": 0,
            "fleetAtDepot": 0,
            "requestStatusCounts": {
                "scheduled": 10,
                "waiting": 2,
                "assigned": 3,
                "onboard": 1,
                "completed": 4,
            },
            "openRequests": 12,
            "acceptedRequests": 4,
            "availableRobotaxis": ROBOTAXI_FLEET_SIZE,
            "availableCabs": ROBOTAXI_FLEET_SIZE,
            "serviceWindowComplete": False,
            "fleetStateCounts": {"staged": ROBOTAXI_FLEET_SIZE},
        },
    }
    frame = build_contract_frame_fields(dispatch_payload, [], 64_800)

    assert MATSIM_ROBOTAXI_MODES == {"car", "ride", "pt", "bike", "walk"}
    assert ROBOTAXI_FLEET_SIZE == 10
    assert frame["phase"] == "running"
    assert frame["timeSec"] == 64_800
    assert frame["timeLabel"] == "18:00"
    assert frame["cabsActive"] == 0
    assert frame["ridesServed"] == 0
    assert frame["requestCounts"]["scheduled"] == 10
    assert frame["requestCounts"]["waiting"] == 2
    assert frame["requestCounts"]["assigned"] == 3
    assert frame["requestCounts"]["onboard"] == 1
    assert len(frame["cabRows"]) == ROBOTAXI_FLEET_SIZE
    assert frame["mapVehicles"] == []
    assert frame["mapRequests"] == []
    assert frame["totals"] == {
        "ridesServed": 0,
        "totalDemand": 0,
        "expiredRequests": 0,
        "rejectedRequests": 0,
        "cabsReturned": 0,
    }
    assert frame["finalAudit"] is None

    complete_payload = {
        **dispatch_payload,
        "metrics": {
            **dispatch_payload["metrics"],
            "serviceWindowComplete": True,
            "fleetAtDepot": ROBOTAXI_FLEET_SIZE,
        },
    }
    complete_frame = build_contract_frame_fields(complete_payload, [], 68_400)
    assert complete_frame["totals"]["cabsReturned"] == ROBOTAXI_FLEET_SIZE

    charging_payload = {
        **dispatch_payload,
        "robotaxis": [
            {
                "id": "cybercab_01",
                "status": "charging",
                "targetEdge": "edge_0",
                "requestId": None,
            }
        ],
    }
    charging_frame = build_contract_frame_fields(charging_payload, [], 68_400)
    assert charging_frame["cabRows"][0]["state"] == "idle_at_depot"


if __name__ == "__main__":
    main()
