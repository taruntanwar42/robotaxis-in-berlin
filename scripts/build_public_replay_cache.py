"""Build the public robotaxi replay cache from the live SUMO WebSocket."""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
from pathlib import Path
from urllib.parse import urlparse, urlunparse


DEFAULT_CACHE_PATH = (
    Path("hf-space")
    / "app"
    / "data"
    / "replays"
    / "charlottenburg-moabit-tiergarten_taxi_matsim_public.jsonl.gz"
)


def websocket_url(base_url: str, path: str) -> str:
    parsed = urlparse(base_url.rstrip("/"))
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunparse((scheme, parsed.netloc, path, "", "", ""))


async def build_cache(base_url: str, output_path: Path) -> None:
    try:
        import websockets
    except ImportError as error:
        raise RuntimeError(
            "websockets is required; install it with `python -m pip install websockets`"
        ) from error

    uri = websocket_url(
        base_url,
        (
            "/ws/sumo/charlottenburg-moabit-tiergarten/playback"
            "?speed=50&demand=matsim&engine=taxi&detail=public&cache=live"
        ),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")

    chunk_count = 0
    frame_count = 0
    with gzip.open(tmp_path, "wt", encoding="utf-8") as cache_file:
        async with websockets.connect(uri, open_timeout=30, max_size=16 * 1024 * 1024) as websocket:
            while True:
                message = json.loads(await asyncio.wait_for(websocket.recv(), timeout=90))
                message_type = message.get("type")
                if message_type == "hello":
                    continue
                if message_type in {"recording", "chunk", "done"}:
                    cache_file.write(json.dumps(message, separators=(",", ":")) + "\n")
                if message_type == "chunk":
                    chunk_count += 1
                    frame_count += len(message.get("frames") or [])
                if message_type == "error":
                    raise RuntimeError(message.get("message", "backend sent error frame"))
                if message_type == "done":
                    break

    tmp_path.replace(output_path)
    print(f"cached {chunk_count} chunks / {frame_count} frames -> {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:7860")
    parser.add_argument("--output", type=Path, default=DEFAULT_CACHE_PATH)
    args = parser.parse_args()

    asyncio.run(build_cache(args.base_url, args.output))


if __name__ == "__main__":
    main()
