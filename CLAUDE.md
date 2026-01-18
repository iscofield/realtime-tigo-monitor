# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Solar Tigo Viewer - A visualization tool for Tigo Energy solar panel monitoring systems. The project displays solar array layouts and real-time monitoring data from Tigo optimizers via MQTT.

## Services

This repository contains two independent services that work together:

### 1. Tigo MQTT Service (taptap-mqtt)

**Location:** `tigo-mqtt/`

**Purpose:** Reads raw data from Tigo CCA (Cloud Connect Advanced) devices via serial connection and publishes panel metrics to MQTT.

**How it works:**
- Runs the `taptap` binary which communicates with Tigo optimizer hardware via Modbus over serial
- Wraps taptap with `taptap-mqtt.py` to publish data to an MQTT broker
- Two containers: `taptap-primary` (CCA on /dev/ttyACM2) and `taptap-secondary` (CCA on /dev/ttyACM3)
- Publishes to topics like `taptap/primary/nodes/<serial>` with power, voltage, and status data

**Runtime:** Always on Raspberry Pi (<PI_HOST>) - requires physical serial connections to CCA devices

**Docker Compose:** `tigo-mqtt/docker-compose.yml`

### 2. Dashboard Service (frontend + backend)

**Location:** `dashboard/`

**Purpose:** Web-based visualization dashboard showing real-time solar panel status overlaid on a layout image.

**How it works:**
- **Backend (FastAPI):** Subscribes to MQTT topics from the Tigo MQTT service, maintains panel state, and serves data via WebSocket to connected clients
- **Frontend (React):** Displays the solar array layout image with panel overlays showing watts, voltage, or serial numbers. Updates in real-time via WebSocket.

**Runtime:**
- Development/Testing: Local machine via Docker
- Production: Server via Docker

**Docker Compose:** `dashboard/docker-compose.yml`

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
- For Dashboard testing, use `docker compose` locally from the `dashboard/` directory. Do NOT run `npm run dev` or similar outside of Docker.
- Production deployment runs the Dashboard on a separate server via Docker.

## Technology Stack

- **Backend**: Python 3, FastAPI, Pydantic, MQTT (aiomqtt)
- **Frontend**: React, TypeScript, Vite
- **Tigo MQTT**: Python, taptap binary, paho-mqtt
- **Infrastructure**: Docker, Docker Compose

## Project Structure

```
solar_tigo_viewer/
├── dashboard/                # Dashboard service
│   ├── backend/              # FastAPI backend
│   │   ├── app/              # Application code
│   │   └── Dockerfile
│   ├── frontend/             # React frontend
│   │   ├── src/
│   │   └── Dockerfile
│   ├── docker-compose.yml    # Dashboard orchestration
│   └── docker-compose.test.yml
├── tigo-mqtt/                # Tigo MQTT service (runs on Pi)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── config-primary.ini
│   ├── config-secondary.ini
│   ├── data/                 # State files (primary/secondary)
│   └── temp-id-monitor/      # Temp ID monitoring service
├── config/                   # Shared configuration
│   └── panel_mapping.json
├── assets/                   # Static assets
│   └── layout.png
└── docs/                     # Documentation
    ├── specs/                # Feature specifications
    └── guides/               # Setup and testing guides
```

## Testing

### Dashboard Service Testing

**IMPORTANT:** All frontend/backend testing is done via Docker. Do NOT run `npm` commands directly on the host machine.

**CRITICAL:** After making ANY changes to frontend or backend code, you MUST rebuild and redeploy the Docker containers before testing or considering the task complete:

```bash
cd dashboard
docker compose up --build -d
```

This applies to:
- Any TypeScript/React changes in `dashboard/frontend/src/`
- Any Python changes in `dashboard/backend/app/`
- CSS or asset changes
- Configuration changes

**Standard workflow after code changes:**
1. Make code changes
2. Rebuild containers: `cd dashboard && docker compose up --build -d`
3. Test via Playwright MCP or browser
4. Commit and push

```bash
# Build and run the dashboard locally via Docker
cd dashboard
docker compose up --build

# Access at http://localhost:5174
```

#### Running Unit Tests (via Docker)
```bash
cd dashboard

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
1. Start the Docker services: `cd dashboard && docker compose up --build -d`
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
See `docs/guides/taptap-docker-testing.md` for detailed instructions on testing the taptap-mqtt containers on the Raspberry Pi.

## Git Workflow

### Committing Changes

**IMPORTANT:** Be proactive about committing and pushing changes to reduce the risk of losing work.

**When to commit:**
- After completing a feature or bug fix that has been tested and verified
- After making significant progress on a larger feature (create incremental commits)
- Before ending a session, if there are uncommitted changes

**How to handle commits with concurrent sessions:**

Since multiple Claude sessions may be working on this repository simultaneously:

1. **Before committing, check what files YOU modified in this session** - only stage and commit those specific files
2. **Use `git status` to review changes** - be aware that some changes may be from other sessions
3. **Stage files explicitly** - use `git add <specific-files>` rather than `git add .` or `git add -A`
4. **If unsure about a file's origin**, ask the user before including it in the commit

**Commit workflow:**
```bash
# 1. Check status to see all changes
git status

# 2. Stage ONLY the files you modified in this session
git add path/to/file1 path/to/file2

# 3. Commit with a descriptive message
git commit -m "feat: description of what was implemented"

# 4. Push to remote
git push
```

**When to ask for confirmation:**
- If the feature seems incomplete or may need more user input
- If you're unsure whether the user wants to commit at this point
- If there are uncommitted changes from what appear to be other sessions

**Proactive behavior:**
- After completing and testing a feature, proactively offer to commit and push
- Example: "The collapsible table feature is complete and tested. Would you like me to commit and push these changes?"

## Restricted Files

- **`docs/TODOs.md`** - Do NOT modify this file. Only the user should edit it. You may commit it when the user has made changes, but never add, remove, or change its contents.

## Notes

- Reference `assets/layout.png` for the visual design of the solar array grid
- The layout uses color-coded sections representing different inverter zones
- Panel positions are configured in `config/panel_mapping.json`
