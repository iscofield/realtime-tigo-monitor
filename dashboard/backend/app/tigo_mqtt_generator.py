"""Tigo-MQTT configuration generator (Phase 1 spec FR-2).

Generates deployment files for tigo-mqtt service:
- docker-compose.yml
- config-{cca_name}.ini for each CCA
- .env (with credentials from wizard)
- README.md with deployment instructions
- ZIP archive containing all files
"""

import io
import logging
import re
import zipfile
from typing import Optional

import yaml

from .config_models import (
    SystemConfig,
    CCAConfig,
    MQTTConfig,
    Panel,
    parse_tigo_label,
)

logger = logging.getLogger(__name__)


class TigoMQTTGeneratorError(Exception):
    """Error during tigo-mqtt config generation."""
    pass


def generate_docker_compose(system_config: SystemConfig) -> str:
    """Generate docker-compose.yml for tigo-mqtt deployment (FR-2.1).

    Args:
        system_config: System configuration with CCAs defined

    Returns:
        YAML string for docker-compose.yml
    """
    services = {}

    for cca in system_config.ccas:
        service_name = f"taptap-{cca.name}"
        services[service_name] = {
            "build": ".",
            "container_name": service_name,
            "restart": "unless-stopped",
            "network_mode": "host",
            "mem_limit": "256m",
            "group_add": ["dialout"],
            "env_file": [".env"],
            "devices": [f"{cca.serial_device}:{cca.serial_device}"],
            "volumes": [
                f"./config-{cca.name}.ini:/app/config-template.ini:ro",
                f"./data/{cca.name}:/data",
                f"./run/{cca.name}:/run/taptap"
            ],
            "logging": {
                "driver": "json-file",
                "options": {
                    "max-size": "10m",
                    "max-file": "3"
                }
            },
            "healthcheck": {
                "test": [
                    "CMD", "sh", "-c",
                    "test -f /run/taptap/taptap.run && "
                    "find /run/taptap/taptap.run -mmin -2 | grep -q ."
                ],
                "interval": "60s",
                "timeout": "10s",
                "retries": 3,
                "start_period": "120s"
            }
        }

    # Add temp-id-monitor service
    cca_names = [cca.name for cca in system_config.ccas]
    taptap_services = [f"taptap-{name}" for name in cca_names]

    # Build environment variables for container names
    temp_id_env = []
    if len(taptap_services) >= 1:
        temp_id_env.append(f"PRIMARY_CONTAINER={taptap_services[0]}")
    if len(taptap_services) >= 2:
        temp_id_env.append(f"SECONDARY_CONTAINER={taptap_services[1]}")
    else:
        temp_id_env.append("ENABLE_SECONDARY=false")

    services["temp-id-monitor"] = {
        "build": "./temp-id-monitor",
        "container_name": "temp-id-monitor",
        "restart": "unless-stopped",
        "network_mode": "host",
        "env_file": [".env"],
        "environment": temp_id_env,
        "volumes": ["/var/run/docker.sock:/var/run/docker.sock:ro"],
        "depends_on": taptap_services,
        "logging": {
            "driver": "json-file",
            "options": {
                "max-size": "10m",
                "max-file": "3"
            }
        }
    }

    compose = {"services": services}

    # Build device mapping comment from CCA configs
    device_lines = [f"#   {cca.serial_device} -> taptap-{cca.name}" for cca in system_config.ccas]
    device_comment = "\n".join(device_lines)

    header = (
        "# Device paths: use persistent udev symlinks (e.g., /dev/tigo-primary) instead of\n"
        "# raw /dev/ttyACM* numbers, which shift when USB devices are added/removed or on reboot.\n"
        "# Symlinks are defined in /etc/udev/rules.d/99-serial-devices.rules on your device.\n"
        "# See docs/DEPLOYMENT.md#usb-device-persistence for setup instructions.\n"
        "#\n"
        "# Current mapping:\n"
        f"{device_comment}\n"
        "\n"
    )

    # Use custom representer to get cleaner YAML output
    return header + yaml.dump(compose, default_flow_style=False, sort_keys=False)


def generate_ini_config(
    cca: CCAConfig,
    panels: list[Panel],
    mqtt: MQTTConfig
) -> str:
    """Generate config-{name}.ini for a single CCA (FR-2.2).

    Args:
        cca: CCA configuration
        panels: List of panels (filtered to this CCA)
        mqtt: MQTT configuration

    Returns:
        INI file content as string

    Raises:
        TigoMQTTGeneratorError: If CCA has no panels or label parsing fails
    """
    # Build MODULES line from panels
    modules = []
    for panel in panels:
        if panel.cca == cca.name:
            # Defense-in-depth: validate serial format before writing to INI
            if not re.match(r'^[A-Z0-9][A-Z0-9\-]{2,19}$', panel.serial):
                raise TigoMQTTGeneratorError(
                    "Invalid serial format: %s" % (panel.serial[:30],)
                )
            # Format: STRING:POSITION:SERIAL
            parsed = parse_tigo_label(panel.tigo_label)
            if parsed is None:
                raise TigoMQTTGeneratorError(
                    f"Invalid tigo_label format: {panel.tigo_label}"
                )
            string_name, position = parsed
            modules.append(f"{string_name}:{position}:{panel.serial}")

    if not modules:
        raise TigoMQTTGeneratorError(
            f"CCA '{cca.name}' has no panels configured. "
            "Each CCA must have at least one panel."
        )

    modules_line = ",".join(modules)

    return f"""# TapTap-MQTT Configuration - {cca.name.title()} CCA
# Generated by Realtime Tigo Monitor Setup Wizard
# Credentials are injected via environment variables at startup

[MQTT]
SERVER = ${{MQTT_SERVER}}
PORT = ${{MQTT_PORT}}
USER = ${{MQTT_USER}}
PASS = ${{MQTT_PASS}}
QOS = 1
TIMEOUT = 30

[TAPTAP]
# Controls verbosity of taptap logs surfaced in the dashboard's Logs tab.
#   info:  Node status changes, MQTT events, errors, and warnings.
#          ~2-3 MB/panel/day at UPDATE=5, much less at UPDATE=60.
#   debug: Everything in info, plus per-poll telemetry data, power report
#          events, node enumeration steps, and raw Modbus responses.
#          ~400-500 MB/panel/day at UPDATE=5 — can quickly fill disk.
# Recommended: "info" for normal operation. Use "debug" only for
# short-term troubleshooting, and pair with a short LOG_RETENTION (e.g. 1d)
# in the dashboard's docker-compose.yml to avoid excessive disk usage.
LOG_LEVEL = debug
BINARY = /usr/local/bin/taptap
# Use a persistent udev symlink (e.g., /dev/tigo-primary) instead of raw /dev/ttyACM*
# paths, which shift when USB devices are added/removed or on reboot. Symlinks match
# on hardware IDs so they always resolve to the correct physical port.
# See docs/DEPLOYMENT.md#usb-device-persistence for setup instructions.
SERIAL = {cca.serial_device}
# WORKAROUND: ADDRESS must be present (even empty) due to taptap-mqtt.py validation bug
ADDRESS =
PORT = 502
# Module definitions: STRING:POSITION:SERIAL (comma-separated, single line)
# STRING is the string identifier (A, B, etc.)
# POSITION is the panel position in the string (1, 2, etc.)
# SERIAL is the module serial number (e.g., 4-C3F23CR)
# Example: A:1:4-C3F23CR,A:2:4-C3F2ACK,B:1:4-C3F282R
MODULES = {modules_line}
TOPIC_PREFIX = taptap
# Name used as device name in Home Assistant and in TapTap MQTT topics for this installation
TOPIC_NAME = {cca.name}
TIMEOUT = 300
UPDATE = 5
STATE_FILE = /data/taptap.state

[HA]
DISCOVERY_PREFIX = homeassistant
DISCOVERY_LEGACY = false
BIRTH_TOPIC = homeassistant/status
NODES_AVAILABILITY_ONLINE = true
NODES_AVAILABILITY_IDENTIFIED = true
STRINGS_AVAILABILITY_ONLINE = true
STRINGS_AVAILABILITY_IDENTIFIED = true
STATS_AVAILABILITY_ONLINE = true
STATS_AVAILABILITY_IDENTIFIED = true
# Recorder settings control Home Assistant long-term statistics
# Valid values: 'energy' (cumulative), 'energy_daily' (daily totals), or empty (disabled)
NODES_SENSORS_RECORDER = energy
STRINGS_SENSORS_RECORDER = energy_daily
STATS_SENSORS_RECORDER = energy_daily

[RUNTIME]
MAX_ERROR = 15
RUN_FILE = /run/taptap/taptap.run
"""


def generate_env(mqtt: MQTTConfig, timezone: Optional[str] = None) -> str:
    """Generate .env file with MQTT credentials (FR-2.3).

    Args:
        mqtt: MQTT configuration with credentials from wizard
        timezone: IANA timezone string (e.g. 'America/Los_Angeles')

    Returns:
        .env file content
    """
    lines = [
        "# MQTT Broker Configuration",
        "# Generated by Realtime Tigo Monitor Setup Wizard",
        "",
        f"MQTT_SERVER={mqtt.server}",
        f"MQTT_PORT={mqtt.port}",
        f"MQTT_USER={mqtt.username or ''}",
        f"MQTT_PASS={mqtt.password or ''}",
    ]

    if timezone:
        lines.append("")
        lines.append("# Timezone for log timestamps and energy reset boundaries")
        lines.append(f"TZ={timezone}")

    lines.append("")  # trailing newline
    return "\n".join(lines)


def generate_readme(system_config: SystemConfig) -> str:
    """Generate README.md with deployment instructions.

    Args:
        system_config: System configuration

    Returns:
        README.md content
    """
    cca_names = [cca.name for cca in system_config.ccas]
    cca_list = "\n".join(f"- `taptap-{name}`" for name in cca_names)
    config_list = "\n".join(f"- `config-{name}.ini`" for name in cca_names)

    return f"""# Tigo-MQTT Deployment Configuration

This archive contains **configuration files only** for the tigo-mqtt service.
It does not include the Dockerfile or application code needed to build the
containers — those are in the main repository.

## What's in this ZIP

- `docker-compose.yml` — Container orchestration for your CCA setup
- `config-*.ini` — TapTap configuration for each CCA device
- `.env` — MQTT broker credentials
- `README.md` — This file

## What's NOT in this ZIP

The following files are required to build and are provided by the repository:

- `Dockerfile` — Builds the taptap-mqtt container (downloads taptap binary and taptap-mqtt.py at build time)
- `entrypoint.sh` — Startup script that generates config from template + environment variables
- `temp-id-monitor/` — Companion service for detecting temporary panel IDs

## Generated Configuration

**Services:**
{cca_list}

**Config Files:**
{config_list}

## Deployment Instructions

### 1. Clone the repository on your Raspberry Pi

```bash
git clone https://github.com/iscofield/realtime-tigo-monitor.git
cd realtime-tigo-monitor/tigo-mqtt
```

### 2. Copy generated configuration files into the tigo-mqtt directory

Extract this ZIP and overlay the generated files onto the cloned repository:

```bash
unzip tigo-mqtt-config.zip -d /path/to/realtime-tigo-monitor/tigo-mqtt/
```

### 3. Create data and runtime directories

```bash
mkdir -p data/{{{",".join(cca_names)}}}
mkdir -p run/{{{",".join(cca_names)}}}
```

### 4. Build and start the services

```bash
docker compose build
docker compose up -d
```

**Note:** The Docker build downloads the taptap binary and taptap-mqtt.py from
GitHub at build time. The Raspberry Pi must have internet access during the
initial build.

### 5. Verify the services are running

```bash
docker compose ps
docker compose logs -f
```

### 6. Return to the setup wizard

Once the services are running and publishing data to MQTT, return to the
Realtime Tigo Monitor setup wizard to continue with panel discovery.

## Troubleshooting

### Services won't start

- Check serial device symlinks: `ls -la /dev/tigo-*`
- Verify user is in dialout group: `groups`
- Check Docker logs: `docker compose logs taptap-{cca_names[0]}`

### No MQTT data

- Verify MQTT broker is reachable: `mosquitto_pub -h {system_config.mqtt.server} -t test -m test`
- Check credentials in `.env` file
- Look for connection errors in logs

## Configuration Reference

- MQTT Server: `{system_config.mqtt.server}`
- MQTT Port: `{system_config.mqtt.port}`
- Topic Prefix: `taptap`

Generated by Realtime Tigo Monitor Setup Wizard
"""


def generate_tigo_mqtt_zip(
    system_config: SystemConfig,
    panels: Optional[list[Panel]] = None,
    timezone: Optional[str] = None
) -> bytes:
    """Generate ZIP archive with all tigo-mqtt deployment files (FR-2.4).

    Args:
        system_config: System configuration
        panels: Panel list (may be empty for initial setup)
        timezone: IANA timezone string (e.g. 'America/Los_Angeles')

    Returns:
        ZIP file content as bytes
    """
    panels = panels or []

    # Create in-memory ZIP file
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # docker-compose.yml
        compose_content = generate_docker_compose(system_config)
        zf.writestr("docker-compose.yml", compose_content)

        # config-{name}.ini for each CCA
        for cca in system_config.ccas:
            try:
                ini_content = generate_ini_config(cca, panels, system_config.mqtt)
                zf.writestr(f"config-{cca.name}.ini", ini_content)
            except TigoMQTTGeneratorError as e:
                error_msg = str(e)
                if "has no panels configured" in error_msg:
                    logger.warning(
                        "Generated tigo-mqtt config with placeholder serials for CCA '%s'. "
                        "Config requires manual serial number entry before deployment.",
                        cca.name
                    )
                    placeholder = generate_placeholder_ini(cca, system_config.mqtt)
                    zf.writestr(f"config-{cca.name}.ini", placeholder)
                else:
                    raise

        # .env (with credentials and timezone from wizard)
        env_content = generate_env(system_config.mqtt, timezone=timezone)
        zf.writestr(".env", env_content)

        # README.md
        readme_content = generate_readme(system_config)
        zf.writestr("README.md", readme_content)

    return zip_buffer.getvalue()


def generate_placeholder_ini(cca: CCAConfig, mqtt: MQTTConfig) -> str:
    """Generate placeholder INI config when panels aren't known yet.

    This is used during initial setup before discovery completes.
    """
    # Generate placeholder modules from topology (strings * panel_count)
    modules = []
    for string in cca.strings:
        for i in range(1, string.panel_count + 1):
            # Use placeholder serial numbers
            modules.append(f"{string.name}:{i}:PLACEHOLDER_{string.name}{i}")

    modules_line = ",".join(modules)

    return f"""# TapTap-MQTT Configuration - {cca.name.title()} CCA
# Generated by Realtime Tigo Monitor Setup Wizard
#
# NOTE: This is a PLACEHOLDER configuration.
# Serial numbers will need to be updated after discovery.
# Credentials are injected via environment variables at startup

[MQTT]
SERVER = ${{MQTT_SERVER}}
PORT = ${{MQTT_PORT}}
USER = ${{MQTT_USER}}
PASS = ${{MQTT_PASS}}
QOS = 1
TIMEOUT = 30

[TAPTAP]
# Controls verbosity of taptap logs surfaced in the dashboard's Logs tab.
#   info:  Node status changes, MQTT events, errors, and warnings.
#          ~2-3 MB/panel/day at UPDATE=5, much less at UPDATE=60.
#   debug: Everything in info, plus per-poll telemetry data, power report
#          events, node enumeration steps, and raw Modbus responses.
#          ~400-500 MB/panel/day at UPDATE=5 — can quickly fill disk.
# Recommended: "info" for normal operation. Use "debug" only for
# short-term troubleshooting, and pair with a short LOG_RETENTION (e.g. 1d)
# in the dashboard's docker-compose.yml to avoid excessive disk usage.
LOG_LEVEL = debug
BINARY = /usr/local/bin/taptap
# Use a persistent udev symlink (e.g., /dev/tigo-primary) instead of raw /dev/ttyACM*
# paths, which shift when USB devices are added/removed or on reboot. Symlinks match
# on hardware IDs so they always resolve to the correct physical port.
# See docs/DEPLOYMENT.md#usb-device-persistence for setup instructions.
SERIAL = {cca.serial_device}
# WORKAROUND: ADDRESS must be present (even empty) due to taptap-mqtt.py validation bug
ADDRESS =
PORT = 502
# Module definitions: STRING:POSITION:SERIAL (comma-separated, single line)
# STRING is the string identifier (A, B, etc.)
# POSITION is the panel position in the string (1, 2, etc.)
# SERIAL is the module serial number (e.g., 4-C3F23CR)
# Example: A:1:4-C3F23CR,A:2:4-C3F2ACK,B:1:4-C3F282R
# PLACEHOLDER: Update MODULES with actual serial numbers after discovery
MODULES = {modules_line}
TOPIC_PREFIX = taptap
# Name used as device name in Home Assistant and in TapTap MQTT topics for this installation
TOPIC_NAME = {cca.name}
TIMEOUT = 300
UPDATE = 5
STATE_FILE = /data/taptap.state

[HA]
DISCOVERY_PREFIX = homeassistant
DISCOVERY_LEGACY = false
BIRTH_TOPIC = homeassistant/status
NODES_AVAILABILITY_ONLINE = true
NODES_AVAILABILITY_IDENTIFIED = true
STRINGS_AVAILABILITY_ONLINE = true
STRINGS_AVAILABILITY_IDENTIFIED = true
STATS_AVAILABILITY_ONLINE = true
STATS_AVAILABILITY_IDENTIFIED = true
# Recorder settings control Home Assistant long-term statistics
# Valid values: 'energy' (cumulative), 'energy_daily' (daily totals), or empty (disabled)
NODES_SENSORS_RECORDER = energy
STRINGS_SENSORS_RECORDER = energy_daily
STATS_SENSORS_RECORDER = energy_daily

[RUNTIME]
MAX_ERROR = 15
RUN_FILE = /run/taptap/taptap.run
"""
