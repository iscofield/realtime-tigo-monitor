# Deployment Guide

This guide walks you through deploying Solar Tigo Viewer from scratch.

## Prerequisites

Before you begin, ensure you have:

- **Docker** and **Docker Compose** installed on all devices
- **Raspberry Pi** (3B+ or newer) with Tigo CCA connected via USB
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

The dashboard can run on the same Raspberry Pi or a separate server.

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
MQTT_BROKER_HOST=192.168.1.100
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

### 2.3 System Topology

Define your CCA devices and their strings:

1. Add each CCA device with a name and serial port
2. For each CCA, add the strings (groups of panels)
3. Specify the number of panels on each string

Example topology:
```
CCA: "inverter1" on /dev/ttyACM0
  - String A: 8 panels
  - String B: 10 panels

CCA: "inverter2" on /dev/ttyACM1
  - String C: 6 panels
  - String D: 8 panels
```

### 2.4 Download Generated Configurations

The wizard will generate docker-compose and configuration files for the tigo-mqtt service. Download these files — you'll deploy them in Step 3.

### 2.5 Panel Discovery

Once tigo-mqtt is running with the new configuration, the wizard will discover panels as they report in. Wait for all panels to appear (this may take a few minutes during daylight hours).

### 2.6 Panel Validation

Review and confirm the discovered panels:
- Verify serial numbers match your installation
- Assign labels if needed
- Confirm string assignments

### 2.7 Save Configuration

Review the final configuration and save. The dashboard is now ready to use.

## Step 3: Deploy tigo-mqtt Service

The tigo-mqtt service runs on the device connected to your Tigo CCA hardware (typically a Raspberry Pi).

### 3.1 Clone the Repository

```bash
ssh pi@your-raspberry-pi
git clone https://github.com/iscofield/solar_tigo_viewer.git
cd solar_tigo_viewer/tigo-mqtt
```

### 3.2 Identify Serial Devices

Connect your Tigo CCA device(s) via USB and identify the serial ports:

```bash
ls -la /dev/ttyACM*
# or
dmesg | grep ttyACM
```

Note the device paths (e.g., `/dev/ttyACM0`, `/dev/ttyACM1`).

**Note:** Your serial device paths may vary depending on your USB adapter and system configuration. Common device paths include:
- `/dev/ttyACM0`, `/dev/ttyACM1` — for CDC ACM devices (most common)
- `/dev/ttyUSB0`, `/dev/ttyUSB1` — for FTDI/CH340 USB-to-serial adapters

### 3.3 Deploy Generated Configuration

Copy the configuration files downloaded from the Setup Wizard (Step 2.4) to your Raspberry Pi:

```bash
# Copy docker-compose.yml and config files to tigo-mqtt directory
# Then start the service
docker compose up --build -d
```

### 3.4 Verify Operation

Check the logs to ensure it's running:

```bash
docker compose logs -f
```

You should see messages indicating connection to the CCA devices and MQTT publishing.

## Step 4: Upload Layout Image

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
ssh pi@your-raspberry-pi
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
