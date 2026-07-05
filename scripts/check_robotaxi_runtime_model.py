"""Check pure robotaxi runtime model semantics without live SUMO."""

from __future__ import annotations

import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HF_SPACE_ROOT = PROJECT_ROOT / "hf-space"
sys.path.insert(0, str(HF_SPACE_ROOT))

from app.robotaxi_runtime import (  # noqa: E402
    CabSnapshot,
    RequestSnapshot,
    RouteEstimate,
    RuntimeConfig,
    assignment_score,
    choose_assignments,
    final_audit_payload,
    is_request_expired,
    phase_for_run,
    status_frame,
)


def main() -> None:
    config = RuntimeConfig(
        scope="charlottenburg-moabit-tiergarten",
        fleet_size=5,
        start_sec=64_800,
        end_sec=75_600,
        request_expiry_sec=600,
        depot_edge="depot-edge",
    )
    cabs = [
        CabSnapshot(id="cybercab-01", state="idle", lon=13.3, lat=52.5),
        CabSnapshot(id="cybercab-02", state="idle", lon=13.4, lat=52.5),
    ]
    requests = [
        RequestSnapshot(
            id="r1",
            state="open",
            depart_sec=64_850,
            mode="car",
            pickup_edge="edge-a",
            dropoff_edge="edge-b",
        ),
        RequestSnapshot(
            id="r2",
            state="open",
            depart_sec=64_860,
            mode="ride",
            pickup_edge="edge-c",
            dropoff_edge="edge-d",
        ),
    ]
    estimates = [
        RouteEstimate("cybercab-01", "r1", eta_to_pickup_sec=120, pickup_to_dropoff_sec=400),
        RouteEstimate("cybercab-02", "r1", eta_to_pickup_sec=60, pickup_to_dropoff_sec=400),
        RouteEstimate("cybercab-01", "r2", eta_to_pickup_sec=90, pickup_to_dropoff_sec=100),
        RouteEstimate("cybercab-02", "r2", eta_to_pickup_sec=300, pickup_to_dropoff_sec=100),
    ]

    assert assignment_score(requests[0], estimates[0], 64_900, config) is not None
    assert is_request_expired(requests[0], 65_451, config) is True

    assignments = choose_assignments(cabs, requests, estimates, 64_900, config)
    assert assignments == [
        {
            "cabId": "cybercab-01",
            "requestId": "r2",
            "score": 280.0,
            "etaToPickupSec": 90,
            "pickupToDropoffSec": 100,
        },
        {
            "cabId": "cybercab-02",
            "requestId": "r1",
            "score": 520.0,
            "etaToPickupSec": 60,
            "pickupToDropoffSec": 400,
        },
    ]

    assert phase_for_run(64_700, config, can_start=True) == "idle"
    assert phase_for_run(64_900, config, can_start=True) == "running"
    assert phase_for_run(75_600, config, can_start=True, active_rides=1) == "winding_down"
    assert phase_for_run(75_600, config, can_start=True, returning_cabs=2) == "returning_to_depot"
    assert phase_for_run(75_600, config, can_start=True) == "complete"

    completed = [
        RequestSnapshot(
            id="done",
            state="completed",
            depart_sec=65_000,
            mode="car",
            pickup_edge="edge-a",
            dropoff_edge="edge-b",
        )
    ]
    frame = status_frame(config, phase="running", time_sec=65_100, cabs=cabs, requests=completed)
    assert frame["ridesServed"] == 1
    assert frame["cabsActive"] == 2
    audit = final_audit_payload(config, [CabSnapshot(id="cybercab-01", state="at_depot")], completed)
    assert audit["ridesServed"] == 1
    assert audit["cabsReturned"] == 1


if __name__ == "__main__":
    main()
