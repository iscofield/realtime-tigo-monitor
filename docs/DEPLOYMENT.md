# Deployment Guide

This guide walks you through deploying Realtime Tigo Monitor from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Docker** and **Docker Compose** installed on all devices
- **Data collection device** with Tigo CCA connected via USB (e.g., Raspberry Pi 3B+ or newer)
- **MQTT Broker** accessible on your network
- Basic familiarity with command line and Docker

## MQTT Broker Setup

You need an MQTT broker for the tigo-mqtt service to publish data and the dashboard to subscribe. Choose one of these options:

### Option 1: Home Assistant Mosquitto Add-on (Recommended)

If you use Home Assistant, the Mosquitto add-on is the easiest option:

1. Go to **Settings → Add-ons → Add-on Store**
2. Search for "Mosquitto broker" and install it
3. Start the add-on
4. Create a user for MQTT in **Settings → People → Users**
5. Configure the MQTT integration in **Settings → Devices & Services**

For detailed instructions, see:
- [Official MQTT Integration Docs](https://www.home-assistant.io/integrations/mqtt/)
- [Mosquitto Add-on Documentation](https://github.com/home-assistant/addons/blob/master/mosquitto/DOCS.md)

### Option 2: Standalone Mosquitto Docker

Run Mosquitto as a standalone Docker container:

```bash
# Create directories
mkdir -p ~/mosquitto/config ~/mosquitto/data

# Create configuration file
cat > ~/mosquitto/config/mosquitto.conf << 'EOF'
listener 1883
persistence true
persistence_location /mosquitto/data/
allow_anonymous false
password_file /mosquitto/config/pwfile
EOF

# Start Mosquitto
docker run -d \
  --name mosquitto \
  -p 1883:1883 \
  -v ~/mosquitto/config:/mosquitto/config:rw \
  -v ~/mosquitto/data:/mosquitto/data:rw \
  --restart unless-stopped \
  eclipse-mosquitto:2

# Create a user (replace 'myuser' with your username)
docker exec -it mosquitto mosquitto_passwd -c /mosquitto/config/pwfile myuser
```

For more details, see:
- [Eclipse Mosquitto Docker Hub](https://hub.docker.com/_/eclipse-mosquitto)
- [Mosquitto Docker Configuration Guide](https://cedalo.com/blog/mosquitto-docker-configuration-ultimate-guide/)

## Step 1: Deploy the Dashboard

The dashboard can run on the same device or a separate server.

### 1.1 Clone the Repository

```bash
git clone https://github.com/iscofield/solar_tigo_viewer.git
cd solar_tigo_viewer/dashboard
```

### 1.2 Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# MQTT Configuration
MQTT_BROKER_HOST=<MQTT_BROKER_HOST>    # e.g. mqtt.example.lan or a private LAN IP
MQTT_BROKER_PORT=1883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
MQTT_TOPIC_PREFIX=taptap

# Application Configuration
USE_MOCK_DATA=false
LOG_LEVEL=INFO

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL=30
WS_BATCH_INTERVAL_MS=500

# Staleness Configuration
STALENESS_THRESHOLD_SECONDS=300
```

### 1.3 Start the Dashboard

```bash
docker compose up --build -d
```

### 1.4 Access the Dashboard

Open your browser to `http://your-server:5174`

## Step 2: First-Time Setup Wizard

When you first access the dashboard, you'll be guided through the setup wizard.

### 2.1 Welcome Screen

Choose **Fresh Setup** to configure from scratch, or **Restore from Backup** if you have a previous configuration.

### 2.2 MQTT Configuration

Enter your MQTT broker details and test the connection:

- **Server Address**: IP or hostname of your MQTT broker
- **Port**: Usually 1883
- **Username/Password**: Your MQTT credentials

### 2.3 System Setup

This step covers defining your hardware topology and entering panel serial numbers.

**Define your CCA devices and their strings:**

1. Add each CCA device with a name and serial port
2. For each CCA, add the strings (groups of panels)
3. Specify the number of panels on each string

Example topology:
```
CCA: "primary" on /dev/tigo-primary
  - String A: 8 panels
  - String B: 10 panels

CCA: "secondary" on /dev/tigo-secondary
  - String C: 6 panels
  - String D: 8 panels
```

> **Recommended:** Use persistent udev symlinks (e.g., `/dev/tigo-primary`) instead of raw device paths (e.g., `/dev/ttyACM0`). The kernel-assigned `ttyACM*` numbers shift when USB devices are added/removed or on reboot. See [USB Device Persistence](#usb-device-persistence) below for setup instructions.

**Enter panel serial numbers:**

After defining your topology, you'll enter the serial number for each panel position. Serial numbers are printed on the back of each Tigo optimizer (e.g., `4-C3F2CCZ`).

- **Manual entry:** Type each serial into the table, organized by CCA and string
- **Bulk import:** Paste tab-separated label-serial pairs (e.g., `B4<tab>4-C3F2CCY`), or a plain list of serials assigned sequentially
- **Skip:** If you don't have serial numbers available, choose "Use Placeholders" — you'll need to manually edit the generated config files on your device later

### 2.4 Download Generated Configurations

The wizard will generate docker-compose and configuration files for the tigo-mqtt service. Download these files — you'll deploy them in the next step before continuing the wizard.

### 2.5 Deploy tigo-mqtt Service

Before the wizard can discover your panels, the tigo-mqtt service must be running on the device connected to your Tigo CCA hardware.

**On your data collection device:**

1. Clone the repository (if not already done):

   ```bash
   ssh user@your-device
   git clone https://github.com/iscofield/solar_tigo_viewer.git
   cd solar_tigo_viewer/tigo-mqtt
   ```

2. Set up persistent device symlinks (see [USB Device Persistence](#usb-device-persistence) below), then verify they resolve correctly:

   ```bash
   ls -la /dev/tigo-*
   # lrwxrwxrwx 1 root root 7 /dev/tigo-primary -> ttyACM4
   # lrwxrwxrwx 1 root root 7 /dev/tigo-secondary -> ttyACM5
   ```

3. Copy the configuration files downloaded in step 2.4 to the `tigo-mqtt/` directory, then start the service:

   ```bash
   docker compose up --build -d
   ```

4. Verify the service is running:

   ```bash
   docker compose logs -f
   ```

   You should see messages indicating connection to the CCA devices and MQTT publishing.

Once tigo-mqtt is running, return to the wizard in your browser and continue to the next step.

### 2.6 Panel Discovery

The wizard will discover panels as they report in via MQTT. Wait for all panels to appear (this may take a few minutes during daylight hours).

### 2.7 Panel Mapping

Map discovered panels to their expected topology positions:
- Panels that match expected positions are auto-placed
- Drag and drop unassigned panels into the correct slots
- Swap panels between slots if needed
- Review the summary bar showing auto-matched, user-mapped, and empty slots

### 2.8 Save Configuration

Review the final configuration and save. The dashboard is now ready to use.

## Step 3: Upload Layout Image

After setup, upload your solar array layout image:

1. Go to the **Layout Editor** tab
2. Click **Upload Image**
3. Select a PNG, JPEG, or WebP image of your array layout
4. Position panels by dragging them onto the image
5. Use snap-to-align for precise placement
6. Click **Save** when done

## Updating

### Update the Dashboard

```bash
cd solar_tigo_viewer/dashboard
git pull
docker compose down
docker compose up --build -d
```

### Update tigo-mqtt

```bash
ssh user@your-device
cd solar_tigo_viewer/tigo-mqtt
git pull
docker compose down
docker compose up --build -d
```

## Production Deployment

### Reverse Proxy (nginx)

For HTTPS access, set up a reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name solar.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Auto-Start on Boot

Docker containers with `restart: unless-stopped` will automatically start on boot after Docker starts.

### Backup Configuration

Regularly backup your configuration:

1. Open the dashboard
2. Click the **Settings** gear icon
3. Select **Backup Configuration**
4. Save the ZIP file securely

## USB Device Persistence

Linux assigns `/dev/ttyACM*` and `/dev/ttyUSB*` numbers dynamically based on the order USB devices are discovered. These numbers **will shift** when you:
- Add or remove a USB device
- Reboot the system
- Experience a USB hub re-enumeration (e.g., power glitch)

If your serial device paths change, the taptap containers will either fail to start or communicate with the wrong device. The solution is to create **persistent udev symlinks** that match on hardware identifiers instead of kernel-assigned numbers.

### Step 1: Discover Device Attributes

SSH into your data collection device and identify each serial adapter's properties:

```bash
for dev in /dev/ttyACM* /dev/ttyUSB*; do
    [ -e "$dev" ] || continue
    echo "=== $dev ==="
    udevadm info --query=property --name="$dev" | \
        grep -E 'ID_SERIAL_SHORT|ID_USB_INTERFACE_NUM|ID_VENDOR|ID_MODEL'
    echo ""
done
```

Key fields:
- **`ID_SERIAL_SHORT`** — unique serial number burned into the USB adapter chip. Identifies the physical adapter.
- **`ID_USB_INTERFACE_NUM`** — for multi-port adapters, identifies which port on the adapter. Single-port adapters only have one interface, so this isn't needed.
- **`ID_VENDOR`** / **`ID_MODEL`** — helpful for identifying what type of adapter it is.

### Step 2: Create udev Rules

Create a rules file that maps hardware IDs to stable symlink names:

```bash
sudo nano /etc/udev/rules.d/99-serial-devices.rules
```

**Example for a multi-port adapter** (e.g., WCH 4-port, serial `BC5697ABCD`):

```udev
# WCH 4-port USB-to-Serial adapter
# Each interface number maps to a fixed physical port on the adapter.
SUBSYSTEM=="tty", ENV{ID_SERIAL_SHORT}=="BC5697ABCD", ENV{ID_USB_INTERFACE_NUM}=="00", SYMLINK+="tigo-primary"
SUBSYSTEM=="tty", ENV{ID_SERIAL_SHORT}=="BC5697ABCD", ENV{ID_USB_INTERFACE_NUM}=="02", SYMLINK+="tigo-secondary"
```

**Example for single-port FTDI adapters** (each has a unique serial):

```udev
# FTDI single USB-to-Serial adapters
SUBSYSTEM=="tty", ENV{ID_SERIAL_SHORT}=="BG018YLI", SYMLINK+="tigo-primary"
SUBSYSTEM=="tty", ENV{ID_SERIAL_SHORT}=="BG01PT61", SYMLINK+="tigo-secondary"
```

### Step 3: Reload and Verify

```bash
sudo udevadm control --reload-rules
sudo udevadm trigger
ls -la /dev/tigo-*
```

You should see symlinks pointing to the current ttyACM/ttyUSB numbers:

```
lrwxrwxrwx 1 root root 7 /dev/tigo-primary -> ttyACM4
lrwxrwxrwx 1 root root 7 /dev/tigo-secondary -> ttyACM5
```

### Step 4: Use Symlinks in Configuration

In your taptap config files, reference the symlink:

```ini
[TAPTAP]
SERIAL = /dev/tigo-primary
```

In `docker-compose.yml`, map the symlink into the container:

```yaml
devices:
  - /dev/tigo-primary:/dev/tigo-primary
```

### Verifying After Reboot

After rebooting, confirm the symlinks still resolve correctly:

```bash
ls -la /dev/tigo-*
```

The underlying `ttyACM*` number may change, but the symlink will always point to the correct physical port.

## Logging Configuration

### Log Levels

Log verbosity is controlled per-CCA via the `LOG_LEVEL` setting in each taptap config file (`config-primary.ini`, etc.):

- **Info** (`LOG_LEVEL = info`): High-level operational events — when panels come online or go offline, MQTT connection status, errors, and warnings. Enough to confirm the system is healthy and catch problems at a glance. Lightweight enough to keep running indefinitely.

- **Debug** (`LOG_LEVEL = debug`): Everything in info, plus detailed telemetry from every poll cycle — the raw power, voltage, and current readings from each panel, power report events, node enumeration steps, and Modbus communication details. Essential for diagnosing hardware issues or verifying that panel data is accurate, but generates substantial volume.

### Retention & Storage

Logs are persisted to disk with a configurable retention window via the `LOG_RETENTION` environment variable on the dashboard backend. Supports duration strings:

| Format | Example | Meaning |
|--------|---------|---------|
| `Nd` | `7d` | N days |
| `Nh` | `8h` | N hours |
| `Nm` | `30m` | N minutes |

Default is `1d` (1 day). Minimum is `10m`, maximum is `30d`. Logs older than the retention window are automatically pruned.

The in-memory buffer size is controlled by `LOG_BUFFER_SIZE` (default: 500 entries, range: 100-5000). This determines how many recent entries are immediately available without reading from disk.

### Disk Usage Estimates

At the default 5-second polling interval (`UPDATE = 5`):

| Panels | Info (per day) | Debug (per day) |
|--------|----------------|-----------------|
| 10 | ~20-30 MB | ~4-5 GB |
| 25 | ~50-75 MB | ~10-13 GB |
| 47 | ~95-140 MB | ~19-24 GB |
| 69 | ~140-210 MB | ~28-35 GB |

Longer polling intervals reduce volume proportionally. At `UPDATE = 60` (60-second intervals), divide these estimates by roughly 12x.

> **Warning:** Debug logging generates approximately 400-500 MB per panel per day at 5-second polling intervals. For a 47-panel system, that is roughly 22 GB/day. Keep debug enabled only for short-term troubleshooting, and pair it with a short retention window (e.g. `LOG_RETENTION=1d`).

### Recommended Configuration

Use **info** level for normal operation. Info logs are small enough (2-3 MB/panel/day at 5s polling) to retain for extended periods without concern.

Only enable **debug** when actively troubleshooting a specific issue — a misbehaving panel, incorrect serial mappings, or suspected communication problems. When you do, set `LOG_RETENTION` to `1d` or less to avoid filling your disk.

```yaml
# dashboard/docker-compose.yml — backend environment
environment:
  LOG_RETENTION: "1d"    # How long to keep logs (default: 1d)
  LOG_BUFFER_SIZE: "500" # In-memory entries per CCA (default: 500)
```

```ini
# tigo-mqtt/config-primary.ini — per-CCA log level
[TAPTAP]
LOG_LEVEL = info   # Use "debug" only for short-term troubleshooting
```

## Docker Memory Limits

The docker-compose files include memory limits (`deploy.resources.limits.memory`) as a general best practice for long-running services. These limits require the Linux **cgroup memory controller** to be enabled.

### Most Linux Distributions

Most x86 Linux distributions (Ubuntu, Debian, Fedora, etc.) have cgroup memory enabled by default. No action needed — Docker memory limits will work out of the box.

### Raspberry Pi and ARM Devices

The Raspberry Pi kernel **intentionally disables** cgroup memory by default to reduce memory overhead on RAM-constrained devices. Without it, Docker memory limits are silently ignored — the containers will run normally, just without enforced memory caps.

**This is fine.** The memory limits in the compose files are conservative guardrails, not required for correct operation. The tigo-mqtt and dashboard services have modest memory footprints and will run well within a Pi's available RAM without enforcement.

> **Warning:** Do **not** enable `cgroup_enable=memory cgroup_memory=1` in `/boot/firmware/cmdline.txt` on a Raspberry Pi. The memory accounting overhead can cause system instability, including hard lockups that require a power cycle to recover from. This is a [known issue](https://github.com/raspberrypi/linux/commit/9b0efcc1ec497b2985c6aaa60cd97f0d2d96d203) and the reason the Pi kernel disables it by default.

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `MQTT_BROKER_HOST` | MQTT broker hostname/IP | `mosquitto` |
| `MQTT_BROKER_PORT` | MQTT broker port | `1883` |
| `MQTT_USERNAME` | MQTT authentication username | (none) |
| `MQTT_PASSWORD` | MQTT authentication password | (none) |
| `MQTT_TOPIC_PREFIX` | Prefix for MQTT topics | `taptap` |
| `USE_MOCK_DATA` | Enable mock data for testing | `false` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |
| `WS_HEARTBEAT_INTERVAL` | WebSocket ping interval (seconds) | `30` |
| `WS_BATCH_INTERVAL_MS` | WebSocket batch interval (ms) | `500` |
| `STALENESS_THRESHOLD_SECONDS` | Time before panel marked stale | `300` |

## Next Steps

- [Troubleshooting Guide](TROUBLESHOOTING.md) — Common issues and solutions
- [Configuration Reference](CONFIGURATION.md) — Detailed configuration options
