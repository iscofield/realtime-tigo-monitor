# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solar Tigo Viewer - A visualization tool for Tigo Energy solar panel monitoring systems. The project displays solar array layouts and real-time monitoring data from Tigo optimizers via MQTT.

## Services

This repository contains two independent services that work together:

### 1. Tigo MQTT Service (taptap-mqtt)

**Location:** `tigo_docker/`

**Purpose:** Reads raw data from Tigo CCA (Cloud Connect Advanced) devices via serial connection and publishes panel metrics to MQTT.

**How it works:**
- Runs the `taptap` binary which communicates with Tigo optimizer hardware via Modbus over serial
- Wraps taptap with `taptap-mqtt.py` to publish data to an MQTT broker
- Two containers: `taptap-primary` (CCA on /dev/ttyACM2) and `taptap-secondary` (CCA on /dev/ttyACM3)
- Publishes to topics like `taptap/primary/nodes/<serial>` with power, voltage, and status data

**Runtime:** Always on Raspberry Pi (192.168.2.93) - requires physical serial connections to CCA devices

**Docker Compose:** `tigo_docker/docker-compose.yml`

### 2. Dashboard Service (frontend + backend)

**Location:** `frontend/` and `backend/`

**Purpose:** Web-based visualization dashboard showing real-time solar panel status overlaid on a layout image.

**How it works:**
- **Backend (FastAPI):** Subscribes to MQTT topics from the Tigo MQTT service, maintains panel state, and serves data via WebSocket to connected clients
- **Frontend (React):** Displays the solar array layout image with panel overlays showing watts, voltage, or serial numbers. Updates in real-time via WebSocket.

**Runtime:**
- Development/Testing: Local machine via Docker
- Production: Server via Docker

**Docker Compose:** `docker-compose.yml` (project root)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Raspberry Pi                                  │
│  ┌─────────────┐    ┌─────────────┐                                 │
│  │ Tigo CCA    │    │ Tigo CCA    │                                 │
│  │ (Primary)   │    │ (Secondary) │                                 │
│  └──────┬──────┘    └──────┬──────┘                                 │
│         │ Serial           │ Serial                                 │
│  ┌──────▼──────┐    ┌──────▼──────┐                                 │
│  │ taptap-     │    │ taptap-     │                                 │
│  │ primary     │    │ secondary   │                                 │
│  └──────┬──────┘    └──────┬──────┘                                 │
│         │                  │                                        │
│         └────────┬─────────┘                                        │
│                  │ MQTT Publish                                     │
└──────────────────┼──────────────────────────────────────────────────┘
                   ▼
            ┌─────────────┐
            │ MQTT Broker │
            │ (HA/other)  │
            └──────┬──────┘
                   │ MQTT Subscribe
┌──────────────────┼──────────────────────────────────────────────────┐
│                  ▼              Server / Local Machine              │
│           ┌─────────────┐                                           │
│           │  Backend    │                                           │
│           │  (FastAPI)  │                                           │
│           └──────┬──────┘                                           │
│                  │ WebSocket                                        │
│           ┌──────▼──────┐                                           │
│           │  Frontend   │                                           │
│           │  (React)    │                                           │
│           └─────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Deployment Environments

| Environment | Tigo MQTT Service | Dashboard Service |
|-------------|-------------------|-------------------|
| Development/Testing | Raspberry Pi (192.168.2.93) | Local Docker |
| Production | Raspberry Pi (192.168.2.93) | Server Docker |

**Important:**
- The Tigo MQTT service ALWAYS runs on the Raspberry Pi, even during testing. It requires physical serial connections to the Tigo CCA devices.
- For Dashboard testing, use `docker compose` locally. Do NOT run `npm run dev` or similar outside of Docker.
- Production deployment runs the Dashboard on a separate server via Docker.

## Technology Stack

- **Backend**: Python 3, FastAPI, Pydantic, MQTT (aiomqtt)
- **Frontend**: React, TypeScript, Vite
- **Tigo MQTT**: Python, taptap binary, paho-mqtt
- **Infrastructure**: Docker, Docker Compose

## Project Structure

```
solar_tigo_viewer/
├── backend/              # Dashboard backend (FastAPI)
│   ├── app/              # Application code
│   └── Dockerfile
├── frontend/             # Dashboard frontend (React)
│   ├── src/
│   └── Dockerfile
├── tigo_docker/          # Tigo MQTT service (runs on Pi)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── config-primary.ini
│   └── config-secondary.ini
├── config/               # Shared configuration
│   └── panel_mapping.json
├── assets/               # Static assets
│   └── layout.png
├── docs/                 # Documentation
│   ├── specs/            # Feature specifications
│   └── taptap-docker-testing.md
└── docker-compose.yml    # Dashboard service compose
```

## Testing

### Dashboard Service Testing
```bash
# Run locally via Docker (preferred)
docker compose up --build

# Access at http://localhost:5174
```

### Tigo MQTT Service Testing
See `docs/taptap-docker-testing.md` for detailed instructions on testing the taptap-mqtt containers on the Raspberry Pi.

## Notes

- Reference `assets/layout.png` for the visual design of the solar array grid
- The layout uses color-coded sections representing different inverter zones
- Panel positions are configured in `config/panel_mapping.json`
