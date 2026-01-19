# Solar Tigo Viewer

A real-time visualization dashboard for Tigo Energy solar panel monitoring systems. This project displays solar array layouts with live power, voltage, and status data from Tigo optimizers via MQTT.

![Dashboard Preview](assets/layout.png)

## Features

- **Real-time Monitoring**: Live updates via WebSocket showing watts, voltage, current, and temperature for each panel
- **Layout View**: Visual representation of your solar array with color-coded panel overlays
- **Table View**: Detailed tabular data with string-level aggregation and mismatch detection
- **Multiple Display Modes**: Toggle between watts, voltage, and serial number views
- **Stale Data Detection**: Visual indicators for panels that haven't reported recently
- **Temporary ID Alerts**: Notifications when panels are using temporary node IDs
- **Zoom Controls**: Pan and zoom the layout view for detailed inspection
- **URL Deep Linking**: Share direct links to specific views and modes

## System Architecture

The system consists of two independent services that communicate via MQTT:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Raspberry Pi (Data Collection)                        │
│                                                                              │
│   ┌──────────────┐        ┌──────────────┐        ┌──────────────────┐      │
│   │  Tigo CCA    │        │  Tigo CCA    │        │                  │      │
│   │  (Primary)   │        │  (Secondary) │        │  temp-id-monitor │      │
│   │ /dev/ttyACM2 │        │ /dev/ttyACM3 │        │                  │      │
│   └──────┬───────┘        └──────┬───────┘        └────────┬─────────┘      │
│          │ Modbus/Serial         │ Modbus/Serial           │                │
│   ┌──────▼───────┐        ┌──────▼───────┐                 │                │
│   │   taptap-    │        │   taptap-    │◄────────────────┘                │
│   │   primary    │        │   secondary  │   (monitors for temp IDs)        │
│   │  container   │        │  container   │                                  │
│   └──────┬───────┘        └──────┬───────┘                                  │
│          │                       │                                          │
│          └───────────┬───────────┘                                          │
│                      │ MQTT Publish                                         │
└──────────────────────┼──────────────────────────────────────────────────────┘
                       ▼
                ┌─────────────┐
                │ MQTT Broker │
                │   (e.g.,    │
                │ Home Asst.) │
                └──────┬──────┘
                       │ MQTT Subscribe
┌──────────────────────┼──────────────────────────────────────────────────────┐
│                      ▼              Server / NAS                            │
│               ┌─────────────┐                                               │
│               │   Backend   │ ◄── Maintains panel state                     │
│               │  (FastAPI)  │     Serves REST API                           │
│               │  Port 3050  │     WebSocket server                          │
│               └──────┬──────┘                                               │
│                      │ WebSocket (real-time updates)                        │
│               ┌──────▼──────┐                                               │
│               │  Frontend   │ ◄── React SPA                                 │
│               │   (nginx)   │     Layout & Table views                      │
│               │  Port 5174  │     Real-time visualization                   │
│               └─────────────┘                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Hardware Requirements

### Tigo Equipment
- **Tigo CCA (Cloud Connect Advanced)** - One or two units depending on array size
- **Tigo TS4-A-O Optimizers** - One per solar panel
- USB cables to connect CCA units to Raspberry Pi

### Computing
- **Raspberry Pi** (3B+ or newer) - For running taptap-mqtt service
- **Server/NAS** (optional) - For running the dashboard (can also run on Pi)
- **MQTT Broker** - Can use Home Assistant's built-in broker or standalone Mosquitto

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Access to an MQTT broker
- For tigo-mqtt service: Raspberry Pi with Tigo CCA connected via USB

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/solar_tigo_viewer.git
cd solar_tigo_viewer
```

### 2. Configure the Dashboard

```bash
cd dashboard/backend
cp .env.example .env
```

Edit `.env` with your MQTT broker details:

```env
# MQTT Configuration
MQTT_BROKER_HOST=192.168.1.100    # Your MQTT broker IP
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

# Staleness Configuration (5 minutes to match Tigo reporting interval)
STALENESS_THRESHOLD_SECONDS=300
```

### 3. Configure Panel Mapping

Edit `config/panel_mapping.json` to match your solar array layout. Each panel entry includes:

```json
{
  "sn": "4-C3F23CR",           // Tigo optimizer serial number
  "tigo_label": "A1",          // Label in Tigo system
  "display_label": "A1",       // Label shown in dashboard
  "string": "A",               // String identifier for grouping
  "system": "primary",         // "primary" or "secondary" CCA
  "position": {
    "x_percent": 35.5,         // X position (0-100%)
    "y_percent": 11.75         // Y position (0-100%)
  }
}
```

### 4. Add Your Layout Image

Replace `assets/layout.png` with your solar array layout diagram. Panel positions in `panel_mapping.json` are percentages relative to this image.

### 5. Start the Dashboard

```bash
cd dashboard
docker compose up --build -d
```

Access the dashboard at `http://localhost:5174`

### 6. Set Up Tigo MQTT Service (on Raspberry Pi)

```bash
# On your Raspberry Pi
cd tigo-mqtt
cp .env.example .env
# Edit .env with your MQTT settings

docker compose up --build -d
```

## Project Structure

```
solar_tigo_viewer/
├── dashboard/                    # Dashboard service
│   ├── backend/                  # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py          # FastAPI application
│   │   │   ├── config.py        # Configuration settings
│   │   │   ├── models.py        # Pydantic models
│   │   │   ├── panel_service.py # Panel state management
│   │   │   ├── mqtt_client.py   # MQTT subscription
│   │   │   └── websocket.py     # WebSocket handlers
│   │   ├── Dockerfile
│   │   └── .env.example
│   ├── frontend/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/      # React components
│   │   │   ├── hooks/           # Custom hooks (WebSocket)
│   │   │   └── App.tsx          # Main application
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── docker-compose.yml
│
├── tigo-mqtt/                    # Tigo MQTT service (runs on Pi)
│   ├── taptap-mqtt.py           # MQTT publisher wrapper
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── config-primary.ini       # Primary CCA config
│   ├── config-secondary.ini     # Secondary CCA config
│   ├── data/                    # Persistent state files
│   │   ├── primary/
│   │   └── secondary/
│   └── temp-id-monitor/         # Temporary ID detection service
│
├── config/
│   └── panel_mapping.json       # Panel configuration
│
├── assets/
│   └── layout.png               # Solar array layout image
│
└── docs/
    ├── guides/                  # Setup and troubleshooting guides
    └── specs/                   # Feature specifications
```

## Configuration

### Environment Variables

#### Backend (.env)

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

### MQTT Topics

The system uses the following MQTT topic structure:

| Topic | Description | Publisher |
|-------|-------------|-----------|
| `taptap/primary/state` | Panel power/voltage data from primary CCA | taptap-primary |
| `taptap/secondary/state` | Panel power/voltage data from secondary CCA | taptap-secondary |
| `taptap/primary/temp_nodes` | List of temporary node IDs | temp-id-monitor |
| `taptap/secondary/temp_nodes` | List of temporary node IDs | temp-id-monitor |
| `taptap/primary/node_mappings` | Node ID to serial number mapping | temp-id-monitor |
| `taptap/secondary/node_mappings` | Node ID to serial number mapping | temp-id-monitor |

## Deployment

### Development/Testing

Run the dashboard locally while the tigo-mqtt service runs on the Pi:

```bash
# On your local machine
cd dashboard
docker compose up --build

# Access at http://localhost:5174
```

### Production

Deploy the dashboard on a server/NAS:

```bash
# On your server
cd dashboard
docker compose up --build -d
```

Configure a reverse proxy (nginx, Traefik, etc.) for HTTPS access.

### Deployment Matrix

| Environment | Tigo MQTT Service | Dashboard Service |
|-------------|-------------------|-------------------|
| Development | Raspberry Pi | Local Docker |
| Production | Raspberry Pi | Server/NAS Docker |

> **Note**: The tigo-mqtt service ALWAYS runs on the Raspberry Pi as it requires physical USB connections to the Tigo CCA devices.

## Troubleshooting

### Quick Diagnostic Commands

**Check container status (on Pi):**
```bash
ssh user@raspberry-pi "docker ps --filter name=taptap"
```

**Check API data:**
```bash
curl -s "http://your-server:3050/api/panels" | python3 -c "
import sys,json
data=json.load(sys.stdin)
primary=[p for p in data['panels'] if p['system']=='primary']
secondary=[p for p in data['panels'] if p['system']=='secondary']
p_data=[p for p in primary if p['watts'] is not None]
s_data=[p for p in secondary if p['watts'] is not None]
print(f'Primary: {len(p_data)}/{len(primary)} panels with data')
print(f'Secondary: {len(s_data)}/{len(secondary)} panels with data')
"
```

**View taptap logs:**
```bash
ssh user@raspberry-pi "docker logs taptap-primary --tail 20"
ssh user@raspberry-pi "docker logs taptap-secondary --tail 20"
```

### Common Issues

#### Dashboard Shows "-" for All Panels

1. **Check if taptap containers are running** on the Raspberry Pi
2. **Verify MQTT connectivity** - check backend logs for "Connected to MQTT broker"
3. **Check if it's nighttime** - panels don't report when not producing power

#### Container Won't Start

**"Unable to write to file" error:**
```bash
cd tigo-mqtt
docker compose down
docker compose build --no-cache
docker compose up -d
```

**Volume mount errors:**
```bash
docker rm -f taptap-primary taptap-secondary
docker compose build
docker compose up -d
```

#### Panels Show as Stale

Panels are marked stale if they haven't reported data within the staleness threshold (default: 5 minutes). This is normal for:
- Panels in shade
- Low-light conditions
- Tigo optimizers reporting at longer intervals

#### USB Serial Disconnect

Check for USB events:
```bash
dmesg | grep -i 'ttyACM\|usb' | tail -20
```

Verify serial devices:
```bash
ls -la /dev/ttyACM*
```

For detailed troubleshooting, see [docs/guides/troubleshooting-guide.md](docs/guides/troubleshooting-guide.md).

## Technology Stack

- **Backend**: Python 3.11, FastAPI, Pydantic, aiomqtt
- **Frontend**: React 18, TypeScript, Vite
- **Tigo MQTT**: Python, taptap binary, paho-mqtt
- **Infrastructure**: Docker, Docker Compose, nginx

## API Reference

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/panels` | GET | Get all panel data |
| `/api/health` | GET | Health check |
| `/static/layout.png` | GET | Layout image |

### WebSocket

Connect to `/ws` for real-time updates. Messages are JSON with the following structure:

```json
{
  "type": "panel_update",
  "data": {
    "panels": [...],
    "temp_nodes": {
      "primary": [],
      "secondary": []
    }
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests: `cd dashboard && docker compose exec backend pytest`
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [taptap](https://github.com/taptap) - Tigo CCA communication binary
- [Tigo Energy](https://www.tigoenergy.com/) - Solar optimizer hardware
