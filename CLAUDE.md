# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Realtime Tigo Monitor - A visualization tool for Tigo Energy solar panel monitoring systems. The project displays solar array layouts and real-time monitoring data from Tigo optimizers via MQTT.

## Services

This repository contains two independent services that work together:

### 1. Tigo MQTT Service (taptap-mqtt)

**Location:** `tigo-mqtt/`

**Purpose:** Reads raw data from Tigo CCA (Cloud Connect Advanced) devices via serial connection and publishes panel metrics to MQTT.

**How it works:**
- Runs the `taptap` binary which communicates with Tigo optimizer hardware via Modbus over serial
- Wraps taptap with `taptap-mqtt.py` to publish data to an MQTT broker
- Two containers: `taptap-primary` (CCA on /dev/tigo-primary) and `taptap-secondary` (CCA on /dev/tigo-secondary)
- Persistent device symlinks are managed by udev rules on the Pi (`/etc/udev/rules.d/99-serial-devices.rules`)
- Publishes to topics like `taptap/primary/nodes/<serial>` with power, voltage, and status data

**Runtime:** Always on Raspberry Pi (<PI_HOST>) - requires physical serial connections to CCA devices

**Docker Compose:** `tigo-mqtt/docker-compose.yml`

## CRITICAL: TapTap State Files - READ THIS FIRST

**State files are IRREPLACEABLE and must NEVER be overwritten without a backup.**

### What are state files?

Located at `tigo-mqtt/data/{primary,secondary}/taptap.state`, these JSON files contain **node_id → MAC address mappings** from CCA infrastructure reports. They allow taptap to permanently identify which physical panel corresponds to which node ID.

### Why are they critical?

- **Infrastructure reports are EXTREMELY RARE** - they may only be sent once per day, or not at all
- **Without correct state files, panel data is SCRAMBLED** - data shows on wrong panels
- **Temporary enumeration is UNRELIABLE** - panels are assigned in random order as they report in
- **Losing state files can halt all progress for 24+ hours** while waiting for new infrastructure reports

### Operations that can destroy state files

**BEFORE performing ANY of these operations, you MUST backup the state files:**

1. **Mutagen sync operations** - especially resolving conflicts or resetting sync
2. **Copying files to/from NAS** - local files may be older than NAS files
3. **Docker volume operations** - removing or recreating volumes
4. **Restoring from backups** - backup may have older state files
5. **Any file sync that touches `tigo-mqtt/data/`**

### Required backup procedure

```bash
# ALWAYS run this BEFORE any sync/copy operation that could touch state files:

# 1. Backup from Pi's NAS mount (the authoritative source)
ssh solar-assistant@<PI_HOST> "cp /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/primary/taptap.state \
    /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/primary/taptap.state.backup-$(date +%Y%m%d-%H%M%S)"
ssh solar-assistant@<PI_HOST> "cp /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/secondary/taptap.state \
    /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/secondary/taptap.state.backup-$(date +%Y%m%d-%H%M%S)"

# 2. Verify backups exist before proceeding
ssh solar-assistant@<PI_HOST> "ls -la /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/*/taptap.state*"
```

### If state files are lost

1. Delete the corrupted/old state file
2. Restart the taptap container
3. **Wait for an infrastructure report** (could take hours or until next day)
4. Monitor with: `sudo docker logs -f taptap-{primary,secondary} 2>&1 | grep -i "permanent\|infrastructure"`
5. When you see "Permanently enumerated" messages, the state file has been rebuilt

### Verifying state file correctness

```bash
# Check node count matches expected panel count
# Primary: 47 panels, Secondary: 22 panels
ssh solar-assistant@<PI_HOST> "cat /mnt/nas/solar_tigo_viewer/tigo-mqtt/data/primary/taptap.state | python3 -c \"import json,sys; d=json.load(sys.stdin); print(sum(len(n) for n in d.get('gateway_node_tables',{}).values()))\""
```

### CCA Status & Backup Script

**Location:** `tigo-mqtt/cca-status.sh`

A diagnostic script that connects to the Pi and reports on all taptap CCA containers. Auto-discovers containers by prefix (no hardcoded container names or counts).

```bash
# Status report only
./tigo-mqtt/cca-status.sh

# Status report + create timestamped backup
./tigo-mqtt/cca-status.sh --backup

# Use a specific env file for credentials
./tigo-mqtt/cca-status.sh --env /path/to/env

# Override container prefix (default: taptap-)
./tigo-mqtt/cca-status.sh --prefix taptap-

# Use local NAS mount for faster backup copies
./tigo-mqtt/cca-status.sh --backup --nas-dir /path/to/nas/tigo-mqtt/data
```

**Credentials:** The script reads `PI_HOST`, `PI_USER`, `PI_PASS` from an env file. It searches for:
1. `--env FILE` (explicit argument)
2. `tigo-mqtt/.env.pi` (project-local, git-ignored)
3. `.claude/env` (fallback)

**What it reports:**
- Container status and uptime
- Enumeration status (permanent vs temporary) per CCA
- Full panel list with node IDs and serials (from most recent startup only)
- State file analysis: node counts, gateway details, TAP repeater detection
- State file backups present on disk

**Backups** are saved to `tigo-mqtt/backups/<timestamp>/` with state files and infra logs per CCA.

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

## Credentials & SSH Access

**Pi SSH credentials and other secrets are stored in:** `.claude/env` (git-ignored)

This file is also referenced by `tigo-mqtt/cca-status.sh` as a fallback. Always read credentials from this file rather than hardcoding them. Use `sshpass` for all SSH commands since the Pi uses password-based auth.

## USB Serial Device Mapping

All serial devices on the Pi use **persistent udev symlinks** instead of raw `/dev/ttyACM*` or `/dev/ttyUSB*` paths. The kernel-assigned numbers shift when USB devices are added/removed or on reboot. The symlinks match on hardware IDs (adapter serial number + interface number) so they always resolve to the correct physical port.

**Udev rules:** `/etc/udev/rules.d/99-serial-devices.rules` on the Pi

| Symlink | Adapter | Interface | Device |
|---------|---------|-----------|--------|
| `/dev/tigo-primary` | WCH quad `<WCH_PRIMARY_SERIAL>` | `04` (port 3) | Tigo CCA primary |
| `/dev/tigo-secondary` | WCH quad `<WCH_PRIMARY_SERIAL>` | `06` (port 4) | Tigo CCA secondary |
| `/dev/inverter-primary-top` | WCH quad `<WCH_PRIMARY_SERIAL>` | `00` (port 1) | EG4 inverter primary top |
| `/dev/inverter-primary-bottom` | WCH quad `<WCH_PRIMARY_SERIAL>` | `02` (port 2) | EG4 inverter primary bottom |
| `/dev/inverter-secondary-top` | WCH quad `<WCH_SECONDARY_SERIAL>` | `00` (port 1) | EG4 inverter secondary top |

The actual adapter serial numbers for this deployment are in `/etc/udev/rules.d/99-serial-devices.rules` on the Pi (operator-specific values not committed to the repo).

### ModemManager gotcha

The Pi runs `ModemManager` by default. WCH/CH340-based USB-Serial adapters appear as CDC-ACM devices (`/dev/ttyACM*`) and ModemManager misidentifies them as cellular modems — probing them with AT commands at boot. This briefly holds the port open and causes the application's first read to fail with `[Errno 16] Resource busy`.

The udev rules file at `/etc/udev/rules.d/99-serial-devices.rules` includes a global ModemManager opt-out for any adapter matching `vendor=1a86, product=55d5` (WCH Quad Serial):

```
SUBSYSTEM=="tty", ENV{ID_VENDOR_ID}=="1a86", ENV{ID_MODEL_ID}=="55d5", ENV{ID_MM_DEVICE_IGNORE}="1"
```

This must come BEFORE the SYMLINK rules in the file. If a new adapter type (e.g., FTDI) is added later that ModemManager misbehaves on, add another opt-out line for that vendor/product pair.

After editing the udev rules:

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=tty --action=add
sudo systemctl restart ModemManager   # required to drop existing ports it's holding
```

The inverter (ppg) containers are managed in a separate repo: `nas_docker/solar_assistant/PythonProtocolGateway/`

## Pi Resiliency & Re-setup Reference

This repo deploys to a Raspberry Pi that's shared with the PPG inverter containers. Both projects rely on the same physical infrastructure (Pi, USB-Serial adapters, NAS CIFS mount, MQTT broker). The mechanisms below were progressively built up to address concrete failures observed in production. **When provisioning a new Pi (or restoring an existing one after a wipe), all of these need to be in place.**

### Mechanisms in place

| # | Mechanism | Location | What it fixes |
|---|---|---|---|
| 1 | Persistent USB serial symlinks | `/etc/udev/rules.d/99-serial-devices.rules` (on Pi, NOT in repo) | ttyACM/ttyUSB numbers shift across reboots; symlinks match on adapter serial + interface |
| 2 | ModemManager opt-out for WCH adapters | Same udev rules file | `[Errno 16] Resource busy` when ModemManager probes new ttyACM ports with AT commands |
| 3 | Boot-time mount/docker race fix | `/etc/systemd/system/mnt-nas.mount.d/wait-for-network.conf` and `docker.service.d/wait-for-mnt-nas.conf` (on Pi) | `Network is unreachable` on CIFS mount at boot; Docker starts before NAS mount is ready |
| 4 | Container entrypoint hardening | `tigo-mqtt/entrypoint.sh` (in repo, baked into image) | EEXIST on stale `/run/taptap/` directory; cold-boot race where container starts before udev creates `/dev/tigo-*` |
| 5 | Static MQTT client IDs | `tigo-mqtt/Dockerfile` patches taptap-mqtt at build time; `MQTT_CLIENT_ID` env var in deployed `docker-compose.yml` (NOT in repo) | Broker logs unmineable when paho auto-generates random client IDs |

### Verifying each mechanism is active

After a reboot, run these from your workstation:

```bash
PI_HOST=$(grep '^PI_HOST=' .claude/env | cut -d= -f2)
PI_USER=$(grep '^PI_USER=' .claude/env | cut -d= -f2)
PI_PASS=$(grep '^PI_PASS=' .claude/env | cut -d= -f2)

# (1) USB symlinks resolved
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
  "ls -la /dev/tigo-* /dev/inverter-*"
# Expected: all 5 symlinks present, pointing at ttyACM* devices

# (2) ModemManager IGNORE flag set on new adapter
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
  "udevadm info --query=property --name=/dev/tigo-primary | grep ID_MM_DEVICE_IGNORE"
# Expected: ID_MM_DEVICE_IGNORE=1

# (3) NAS auto-mounted (no manual reset-failed)
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
  "mount | grep nas && systemctl cat mnt-nas.mount | grep ExecStartPre"
# Expected: mount line present, drop-in shows the ping-loop ExecStartPre

# (4) Entrypoint hardening baked into image
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
  "sudo docker logs taptap-primary 2>&1 | grep -E 'Serial device|rm -rf' | head -2"
# Expected: 'Serial device /dev/tigo-primary is present.' (from wait-for-device)

# (5) Static client ID in use
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_HOST" \
  "sudo docker run --rm --entrypoint sh tigo-mqtt-taptap-primary -c 'grep mqtt.Client /app/taptap-mqtt.py'"
# Expected: line shows mqtt.Client(client_id=config.get("MQTT", "CLIENT_ID", fallback=""))
```

### Re-setup checklist for a fresh Pi

If the Pi is wiped or replaced, do these in order:

1. **Base OS** — install Raspberry Pi OS, enable SSH, set hostname, configure `solar-assistant` user with `dialout` group membership.
2. **Network** — static IP or DHCP reservation matching `<PI_HOST>` in `.claude/env`. Verify routable to `<MQTT_BROKER_HOST>` (NAS).
3. **CIFS credentials + mount unit** — create `/etc/smbcredentials` + `/etc/systemd/system/mnt-nas.mount` + `/etc/systemd/system/mnt-nas.automount` for `//<MQTT_BROKER_HOST>/docker → /mnt/nas`. (Both files are NOT tracked here — they contain operator-specific paths/credentials.)
4. **Boot-hardening drop-ins** — clone this repo onto the NAS so `/mnt/nas/solar_tigo_viewer/tigo-mqtt/` exists, then:
   ```bash
   sudo sh /mnt/nas/solar_tigo_viewer/tigo-mqtt/scripts/install-pi-boot-hardening.sh
   ```
5. **Plug in USB-Serial adapters** — capture the new adapter serials with:
   ```bash
   for d in /dev/ttyACM* /dev/ttyUSB*; do echo "=== $d ==="; udevadm info --query=property --name="$d" | grep -E 'ID_SERIAL_SHORT|ID_USB_INTERFACE_NUM|ID_VENDOR_ID|ID_MODEL_ID'; done
   ```
6. **Write `/etc/udev/rules.d/99-serial-devices.rules`** — start with the ModemManager opt-out for any vendor/model the operator's adapters use, then SYMLINK rules for each port. See "USB Serial Device Mapping" + "ModemManager gotcha" sections above.
7. **Reload udev**: `sudo udevadm control --reload-rules && sudo udevadm trigger --subsystem-match=tty --action=add && sudo systemctl restart ModemManager`. Verify with `ls -la /dev/tigo-* /dev/inverter-*`.
8. **Build images**: `cd /mnt/nas/solar_tigo_viewer/tigo-mqtt && sudo docker compose build --no-cache`.
9. **Create deployed `docker-compose.yml`** — copy from `docker-compose.sample.yml`, fill in `MQTT_CLIENT_ID=taptap-{primary,secondary}` env vars per service. This file is NOT tracked.
10. **Create `.env`** with MQTT credentials (see `.env.example`).
11. **Bring up**: `sudo docker compose up -d`. Verify state files at `/mnt/nas/solar_tigo_viewer/tigo-mqtt/data/{primary,secondary}/taptap.state` exist (if not, you'll need to wait for an infrastructure report — see the state files section above).
12. **Reboot test** — issue `sudo reboot`, verify the Pi recovers without manual intervention in <3 minutes, all 6 containers come up automatically.

### When to update this section

Update this list and the verification commands whenever:
- A new resiliency mechanism is added (new udev rule, new systemd drop-in, new entrypoint guard)
- A failure mode is discovered that's NOT covered by the existing mechanisms (add the new fix here AND in `docs/TROUBLESHOOTING.md`)
- A mechanism's location/file moves
- An installer script's interface changes

The corresponding section in `~/code/nas_docker/solar_assistant/CLAUDE.md` is the operator-facing twin of this — keep them in sync (this one uses placeholders since it's public, that one uses literal values for the operator's deployment).

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

#### Test Backup File

For testing in worktrees or fresh environments, restore from the test backup:

**Location:** `dashboard/backend/tests/fixtures/test-backup-69-panels.zip`

This backup contains a complete 69-panel configuration with all strings (A-I), panel positions, and layout settings. Use the Setup Wizard's "Restore from Backup" option to load it.

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

### Parallel Development with Worktrees

For spec implementations or parallel Claude sessions, use git worktrees to prevent conflicts:

```bash
# Create isolated worktree for a spec implementation
git worktree add -b implement/feature-name .worktrees/implement-feature-name main

# Work in the worktree
cd .worktrees/implement-feature-name
docker compose -f dashboard/docker-compose.yml up --build -d

# After completion, merge and clean up
cd ../..
git merge implement/feature-name
git worktree remove .worktrees/implement-feature-name
git branch -d implement/feature-name
```

See `docs/worktree-support.md` for project-specific worktree configuration.

## Protected Branches

- **`assets`** - An **orphan branch** (no common ancestor with `main`) used to store GIF/image assets referenced by the README (e.g., layout-view.gif, setup-wizard.gif). It has a corresponding worktree at `.worktrees/assets`. Do NOT delete this branch, remove the worktree, or merge it into `main`. It is intentionally separate.

## Restricted Files

- **`docs/TODOs.md`** - Do NOT modify this file. Only the user should edit it. You may commit it when the user has made changes, but never add, remove, or change its contents.

## WUD (What's Up Docker) Status

The dashboard services (backend + frontend) use **local builds** and are **hidden from WUD** (`wud.watch=false`). WUD cannot check for updates since there are no registry images. Version management is manual — rebuild when making code changes.

The tigo-mqtt services run on the Raspberry Pi and are not monitored by the goober WUD instance.

See `wud/NEW_SERVICE_GUIDE.md` for WUD configuration reference.

## Notes

- Reference `assets/layout.png` for the visual design of the solar array grid
- The layout uses color-coded sections representing different inverter zones
- Panel positions are configured in `config/panel_mapping.json`
