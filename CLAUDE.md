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

**Runtime:** Always on Raspberry Pi (<PI_HOST>) - requires physical serial connections to CCA devices

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
| Development/Testing | Raspberry Pi (<PI_HOST>) | Local Docker |
| Production | Raspberry Pi (<PI_HOST>) | Server Docker |

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

**IMPORTANT:** All frontend/backend testing is done via Docker. Do NOT run `npm` commands directly on the host machine.

```bash
# Build and run the dashboard locally via Docker
docker compose up --build

# Access at http://localhost:5174
```

#### Running Unit Tests (via Docker)
```bash
# Frontend unit tests - run inside the frontend container
docker compose exec frontend npm run test

# Backend unit tests
docker compose exec backend pytest
```

#### Running E2E Tests
**IMPORTANT:** Use the Playwright MCP server for e2e testing. NEVER install Playwright locally or in Docker.

The Playwright MCP provides browser automation tools:
- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshots
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_type` - Type text
- etc.

To run e2e tests:
1. Start the Docker services: `docker compose up --build -d`
2. Use the Playwright MCP tools to interact with http://localhost:5174

### Troubleshooting Playwright MCP

#### "Browser is already in use" Error

This error occurs when Playwright MCP's internal state gets stuck, often after a browser crash, improper close, or interrupted session. Symptoms include:
- Error: `Browser is already in use for /Users/.../ms-playwright/mcp-chrome-*`
- New blank Chrome tabs keep opening
- Browser commands fail or hang

**Solution: Clear the MCP Chrome cache**

```bash
# Clear the MCP browser cache directory
rm -rf ~/Library/Caches/ms-playwright/mcp-chrome-*

# Then retry your Playwright commands
```

**Alternative solutions (if cache clear doesn't work):**

```bash
# 1. Kill any orphaned MCP Chrome processes
pkill -f "mcp-chrome"

# 2. Check for and remove lock files
find ~/Library/Caches/ms-playwright -name "*lock*" -delete

# 3. Full cache reset (last resort)
rm -rf ~/Library/Caches/ms-playwright/
# Note: This will require Playwright to re-download browser binaries
```

**Prevention tips:**
- Always use `browser_close` when done with Playwright testing
- If a session is interrupted, clear the cache before starting a new one
- Don't run multiple Playwright MCP sessions simultaneously

#### Browser Commands Hang or Timeout

If browser commands hang without the "already in use" error:

```bash
# Check for running Chrome processes
ps aux | grep -i chrome | grep mcp

# Kill any stuck processes
pkill -9 -f "mcp-chrome"

# Clear cache and retry
rm -rf ~/Library/Caches/ms-playwright/mcp-chrome-*
```

#### Quick Recovery Workflow

When Playwright MCP stops working, run this sequence:

```bash
# Full reset sequence
pkill -f "mcp-chrome" 2>/dev/null || true
rm -rf ~/Library/Caches/ms-playwright/mcp-chrome-*
echo "Playwright MCP reset complete - retry your commands"
```

### Tigo MQTT Service Testing
See `docs/taptap-docker-testing.md` for detailed instructions on testing the taptap-mqtt containers on the Raspberry Pi.

## Notes

- Reference `assets/layout.png` for the visual design of the solar array grid
- The layout uses color-coded sections representing different inverter zones
- Panel positions are configured in `config/panel_mapping.json`
