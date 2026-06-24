---
title: Robotaxi SUMO Backend
emoji: 🚕
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
---

# Robotaxi SUMO Backend

Docker Hugging Face Space for the Robotaxi Control Room prototype.

This first backend is a deployment/smoke layer:

- installs SUMO inside the container
- exposes a FastAPI service
- serves the current `06:00-07:00` Reinickendorf scenario bundle
- provides a WebSocket replay stream for quick frontend integration

Next layer: add live TraCI/libsumo control against a mounted SUMO network and
route file.

## Endpoints

- `GET /health`
- `GET /sumo/version`
- `GET /scenario/summary`
- `GET /scenario`
- `WS /ws/replay`
