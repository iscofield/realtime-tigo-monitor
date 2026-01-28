# Realtime Tigo Monitor

A real-time visualization dashboard for Tigo Energy solar panel monitoring systems. Monitor your solar array with **5-10 second updates** — all running 100% locally on your network.

![Dashboard Preview](docs/screenshots/layout-view.png)

## Why Realtime Tigo Monitor?

| Feature | Realtime Tigo Monitor | Tigo Cloud |
|---------|-------------------|------------|
| **Update Speed** | 5-10 seconds | 30-60 minutes |
| **Data Location** | 100% local | Cloud servers |
| **Internet Required** | No (after setup) | Yes |
| **Privacy** | Your data stays home | Shared with Tigo |

**See your solar production change in real-time** — watch power output respond as clouds pass overhead, instantly identify shaded panels, and monitor your system without waiting for cloud sync.

## Features

### Real-Time Monitoring
- **Live WebSocket updates** every 5-10 seconds
- Color-coded panel status with gradient shading (dark green = low output, light green = high output, red ✕ = offline) — matches the Tigo app
  - Note that the color coded strings are part of the background layout image.  You can create this yourself if you have a screenshot from your plans and add the corresponding overlays in something like Gimp
- Display modes: watts, voltage, or serial number (last 4 digits)
- Panel labels always visible on overlays alongside metrics
- Stale data detection with configurable thresholds
- Temporary ID warnings when optimizers report without persistent state (indicates taptap needs its state file bootstrapped)

### Layout View
Upload your own solar array image and overlay live panel data:
- Toggle between watts, voltage, or serial number display modes
- Pan and zoom with mouse wheel or touch gestures
- Pinch-to-zoom on touch devices
- Responsive scaling on any device

![Layout View Zoomed](https://github.com/iscofield/realtime-tigo-monitor/blob/assets/layout-view.gif?raw=true)

### Table View
Detailed metrics organized by string with aggregation:
- Real-time voltage, current, power, temperature, signal strength, daily energy, and more
- String-level summaries and totals
- Configurable column visibility (15 columns available)
- Mismatch detection for panels on wrong inverter

Available columns: Label, Tigo Label, Node ID, Serial Number, System, Voltage In, Voltage Out, Current In, Current Out, Watts, Temperature, Duty Cycle, RSSI, Energy, Temp ID

![Table View](https://github.com/iscofield/realtime-tigo-monitor/blob/assets/table-view.gif?raw=true)

### Layout Editor
Intuitive visual editor for positioning panels:
- Drag-and-drop panel positioning on your layout image
- Snap-to-align guides for precise placement
- Multi-select with bulk operations
- Keyboard shortcuts (arrows to nudge, Ctrl+Z to undo)
- Undo/redo history
- Auto-save drafts to prevent lost work

![Layout Editor](https://github.com/iscofield/realtime-tigo-monitor/blob/assets/layout-editor.gif?raw=true)

### Setup Wizard
Guided configuration for first-time setup:
- MQTT broker connection testing
- CCA device topology configuration
- **Auto-generates tigo-mqtt docker-compose files** for your Pi
- Automatic panel discovery
- Panel validation and serial number mapping

![Setup Wizard - Panel Validation](https://github.com/iscofield/realtime-tigo-monitor/blob/assets/setup-wizard.gif?raw=true)

### Backup & Restore
Protect your configuration:
- Export complete configuration as ZIP
- Restore on new installations
- Includes layout image and all settings

![Settings Menu](docs/screenshots/settings-menu.png)

### Mobile-Friendly
Works great on phones and tablets:
- Responsive design with bottom navigation
- Touch-optimized controls
- Check your panels from anywhere on your network
- **Pro tip:** Use [Tailscale](https://tailscale.com/) to access your dashboard securely from outside your home network

<p align="center">
  <img src="docs/screenshots/mobile-layout.png" alt="Mobile Layout" width="300" />
</p>

## Panel Data Fields

Every panel reports the following metrics:

| Field | Description | Unit |
|-------|-------------|------|
| Power | Current power output | Watts |
| Voltage In | Input voltage from panel | Volts |
| Voltage Out | Output voltage to string | Volts |
| Current In | Input current | Amps |
| Current Out | Output current | Amps |
| Temperature | Optimizer temperature | °C |
| Duty Cycle | Optimizer duty cycle | % |
| RSSI | Wireless signal strength | dB |
| Energy | Cumulative production | kWh |
| Online | Currently communicating | Yes/No |
| Last Update | Time since last report | seconds |
| Temp ID | Using temporary node ID | Yes/No |

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Data Collection Device                       │
│                    (Raspberry Pi or similar)                    │
│                                                                 │
│   ┌──────────────┐    ┌──────────────┐                         │
│   │   Tigo CCA   │    │   Tigo CCA   │    ... (1 or more)      │
│   │   Device     │    │   Device     │                         │
│   └──────┬───────┘    └──────┬───────┘                         │
│          │ RS485             │ RS485                            │
│   ┌──────▼───────┐    ┌──────▼───────┐                         │
│   │   taptap     │    │   taptap     │                         │
│   │  container   │    │  container   │                         │
│   └──────┬───────┘    └──────┬───────┘                         │
│          └────────────┬──────┘                                 │
│                       │ MQTT Publish                           │
└───────────────────────┼─────────────────────────────────────────┘
                        ▼
                 ┌─────────────┐
                 │ MQTT Broker │  (Home Assistant, Mosquitto, etc.)
                 └──────┬──────┘
                        │ MQTT Subscribe
┌───────────────────────┼─────────────────────────────────────────┐
│                       ▼           Dashboard Server              │
│                ┌─────────────┐                                  │
│                │   Backend   │  FastAPI + WebSocket             │
│                │  (Python)   │                                  │
│                └──────┬──────┘                                  │
│                       │                                         │
│                ┌──────▼──────┐                                  │
│                │  Frontend   │  React SPA                       │
│                │   (nginx)   │                                  │
│                └─────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

The system supports **1 or more CCA devices** — configure as many as your installation requires. Each CCA connects via RS485 serial to the data collection device. See the [taptap documentation](https://github.com/taptap) for hardware connection details.

## Hardware Requirements

### Tigo Equipment
- **Tigo CCA (Cloud Connect Advanced)** — 1 or more units
- **Tigo TS4-A-O Optimizers** — one per solar panel
- RS485-to-USB adapter for connecting CCA to Pi (see [taptap guide](https://github.com/taptap))

### Computing
- **Data Collection Device** — Raspberry Pi (3B+ or newer) or similar
- **Dashboard Server** — Can run on the same Pi or a separate server/NAS
- **MQTT Broker** — Home Assistant's built-in broker, standalone Mosquitto, or any MQTT 3.1.1+ broker

## Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Access to an MQTT broker ([setup guide](docs/DEPLOYMENT.md#mqtt-broker-setup))
- Raspberry Pi with Tigo CCA connected via RS485

### 1. Clone the Repository

```bash
git clone https://github.com/iscofield/solar_tigo_viewer.git
cd solar_tigo_viewer
```

### 2. Deploy the Dashboard

On your dashboard server (can be the same Pi or different machine):

```bash
cd dashboard
cp backend/.env.example backend/.env
# Edit .env with your MQTT broker details
docker compose up --build -d
```

### 3. Run the Setup Wizard

Open `http://your-server:5174` and follow the setup wizard to:
1. Configure MQTT connection
2. Define your CCA topology (names, serial ports, strings)
3. **Download generated docker-compose files** for tigo-mqtt
4. Discover and validate panels

### 4. Deploy tigo-mqtt Service

Copy the generated files to your Raspberry Pi:

```bash
# On your Raspberry Pi
cd solar_tigo_viewer/tigo-mqtt
# Copy the downloaded docker-compose.yml and config files here
docker compose up --build -d
```

For detailed instructions, see the [Deployment Guide](docs/DEPLOYMENT.md).

## Home Assistant Integration

Realtime Tigo Monitor can be embedded in Home Assistant dashboards using an iframe card. For the best experience, install the [Iframe Card](https://github.com/nicufarmache/lovelace-iframe-card) from HACS.

### HACS Installation

1. Open HACS in Home Assistant
2. Go to **Frontend** → **Explore & Download Repositories**
3. Search for "Iframe Card" and install it
4. Restart Home Assistant

### Lovelace Card Configuration

```yaml
type: custom:iframe-card
url: "http://your-server:5174/?view=layout&mode=watts"
aspect_ratio: "150%"
```

### URL Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `view` | `layout`, `table`, `editor` | Which view to display |
| `mode` | `watts`, `voltage`, `sn` | Display mode for panels |

**Recommended:** The **Layout View** works best for embedding. The Table View may not display optimally in an iframe — consider building table-style views natively in Home Assistant using template sensors for better formatting control.

Example URLs:
- `http://server:5174/?view=layout&mode=watts` — Layout view showing power (recommended for embedding)
- `http://server:5174/?view=table` — Table view with all metrics

## Data Storage

**Note:** Realtime Tigo Monitor does not store historical data — it displays real-time values only. For historical tracking, graphing, and analytics, consider routing your MQTT data to:

- **InfluxDB** — Time-series database, works great with Grafana
- **Home Assistant** — Can record sensor history from MQTT
- **Prometheus** — Metrics collection with alerting

The tigo-mqtt service publishes standard MQTT messages that any of these systems can consume alongside the dashboard.

## Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)** — Detailed setup instructions
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** — Common issues and solutions
- **[Configuration Reference](docs/CONFIGURATION.md)** — Environment variables and YAML schemas

## Technology Stack

- **Backend**: Python 3.11, FastAPI, Pydantic, aiomqtt
- **Frontend**: React 18, TypeScript, Vite
- **Data Collection**: Python, taptap binary, paho-mqtt
- **Infrastructure**: Docker, Docker Compose, nginx

## Contributing

Contributions are welcome! The project has a comprehensive test suite:

- **Frontend**: Vitest unit tests (`docker compose exec frontend npm test`)
- **Backend**: pytest tests (`docker compose exec backend pytest`)
- **E2E**: Playwright integration tests

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure nothing breaks
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Issues & Feedback

Found a bug or have a feature request?

- **[Open an Issue](https://github.com/iscofield/solar_tigo_viewer/issues)** — Bug reports and feature requests
- **[Discussions](https://github.com/iscofield/solar_tigo_viewer/discussions)** — Questions and community support

## Support the Project

If you find Realtime Tigo Monitor useful, consider supporting development:

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/iscofield)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [taptap](https://github.com/taptap) — Tigo CCA communication binary
- [Tigo Energy](https://www.tigoenergy.com/) — Solar optimizer hardware
