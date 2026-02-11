#!/usr/bin/env python3
"""
Temporary ID Monitor Sidecar

Monitors taptap container logs for enumeration events and publishes:
1. The current list of temporarily-enumerated node IDs (temp_nodes topic)
2. Node ID → serial number mappings (node_mappings topic)

This helps detect panels with incorrect IDs and provides node_id data
that isn't available in the standard taptap-mqtt messages.
"""

import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, Set

import aiomqtt

# Configuration via environment variables
# Support both MQTT_HOST and MQTT_SERVER for compatibility
MQTT_HOST = os.environ.get("MQTT_HOST") or os.environ.get("MQTT_SERVER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER")
MQTT_PASS = os.environ.get("MQTT_PASS")
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "taptap")

MAX_LINE_LENGTH = 10240

# Max lines to load from container history on startup (override with HISTORY_TAIL_LINES env var)
HISTORY_TAIL_LINES = int(os.environ.get("HISTORY_TAIL_LINES", "2000"))

# Batch size for historical log replay (lines per MQTT message)
HISTORY_BATCH_SIZE = 50

# Max seconds to buffer real-time log lines before flushing
REALTIME_FLUSH_INTERVAL = 1.0

# Sensor reset prefixes — these lines are ALWAYS_HIDDEN in the frontend
# and constitute ~88% of taptap log volume at debug level.  Filtering at
# the source avoids publishing, transmitting, and storing lines that are
# never displayed to users.
_RESET_PREFIXES = (
    "Calling reset_node_sensor",
    "Calling reset_stat_sensor",
    "Calling reset_sensor_integral",
    "Calling reset_stats_tele",
)

# Regex to strip timestamp+level prefix from taptap log lines
# Example: "2025-01-15 12:34:56.789 INFO: Calling reset_node_sensor" -> "Calling reset_node_sensor"
_TS_LEVEL_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\w+:?\s+(.*)"
)


def _is_sensor_reset(line: str) -> bool:
    """Return True if *line* is a sensor-reset message that the frontend never shows."""
    m = _TS_LEVEL_RE.match(line)
    msg = m.group(1) if m else line
    return msg.startswith(_RESET_PREFIXES)

# asyncio StreamReader line buffer limit for `docker logs -f` output.
# Taptap telemetry JSON dumps are ~460 bytes/panel. At 1MB limit this
# supports ~2,200 panels. If you run more panels than that and see
# "Separator is not found, and chunk exceed the limit" errors, increase
# this value.
STREAM_LINE_LIMIT = 1024 * 1024  # 1MB

# Log patterns for enumeration events
# Pattern: "Temporary enumerated node id: 42 to node name: A7"
TEMP_PATTERN = re.compile(r"Temporary enumerated node id: (\d+)")
# Pattern: "Permanently enumerated node id: 42 to node name: A7 device serial: 4-C3F23CR"
PERM_PATTERN = re.compile(r"Permanently enumerated node id: (\d+)")
# Full pattern to extract node_id and serial from permanent enumeration
PERM_SERIAL_PATTERN = re.compile(
    r"Permanently enumerated node id: (\d+).*?(?:device )?serial[:\s]+(\S+)"
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


async def publish_temp_nodes(mqtt: aiomqtt.Client, system: str, nodes: Set[int]):
    """Publish current list of temporarily enumerated nodes with retain flag."""
    topic = f"{MQTT_TOPIC_PREFIX}/{system}/temp_nodes"
    payload = json.dumps(sorted(list(nodes)))
    # Retained message ensures new subscribers get current state immediately
    await mqtt.publish(topic, payload, retain=True)
    logger.info(f"Published temp_nodes for {system}: {payload}")


async def publish_node_mappings(mqtt: aiomqtt.Client, system: str, mappings: Dict[str, str]):
    """Publish node_id → serial mappings with retain flag.

    This provides the node_id data that isn't included in taptap-mqtt's
    standard MQTT messages, allowing the dashboard to display node IDs.

    Topic: {MQTT_TOPIC_PREFIX}/{system}/node_mappings
    Payload: {"42": "4-C3F23CR", "57": "4-XYZ123", ...}
    """
    topic = f"{MQTT_TOPIC_PREFIX}/{system}/node_mappings"
    payload = json.dumps(mappings)
    await mqtt.publish(topic, payload, retain=True)
    logger.info(f"Published node_mappings for {system}: {len(mappings)} nodes")


async def monitor_container(container_name: str, system: str):
    """Monitor a container's logs and publish temp node status, mappings, and log lines."""
    temp_nodes: Set[int] = set()
    node_mappings: Dict[str, str] = {}  # node_id (str) -> serial
    seq = 0
    log_topic = f"{MQTT_TOPIC_PREFIX}/{system}/logs"

    # Phase 1: Parse historical logs to recover state on startup
    historical_lines: list[str] = []
    dedup_set: set[str] | None = None
    dedup_phase_active = False
    before_phase1_ts = datetime.now(timezone.utc)

    logger.info(f"Parsing historical logs for {container_name}...")
    try:
        hist_process = await asyncio.create_subprocess_exec(
            "docker", "logs", "--tail", str(HISTORY_TAIL_LINES), container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await hist_process.communicate()

        reset_count = 0
        for line in stdout.decode(errors="replace").splitlines():
            line_stripped = line.strip()
            if not line_stripped:
                continue
            # Truncate long lines
            if len(line_stripped) > MAX_LINE_LENGTH:
                line_stripped = line_stripped[:MAX_LINE_LENGTH] + " [truncated]"

            # Parse enumeration events from ALL lines (including resets)
            if temp_match := TEMP_PATTERN.search(line_stripped):
                temp_nodes.add(int(temp_match.group(1)))
            elif perm_match := PERM_SERIAL_PATTERN.search(line_stripped):
                node_id = perm_match.group(1)
                serial = perm_match.group(2)
                temp_nodes.discard(int(node_id))
                node_mappings[node_id] = serial

            # Filter sensor_reset lines from replay (never shown in frontend)
            if _is_sensor_reset(line_stripped):
                reset_count += 1
                continue

            historical_lines.append(line_stripped)

        if hist_process.returncode == 0:
            logger.info(
                f"Recovered from {container_name} history: "
                f"{len(temp_nodes)} temp nodes, {len(node_mappings)} mappings, "
                f"{len(historical_lines)} log lines ({reset_count} sensor_reset filtered)"
            )
        else:
            logger.warning(f"Docker logs failed for {container_name} (exit code {hist_process.returncode})")

    except FileNotFoundError:
        logger.error("Docker CLI not found - is Docker installed?")
        raise
    except PermissionError as e:
        logger.error(f"Docker socket permission denied: {e}")
        raise
    except Exception as e:
        logger.warning(f"Failed to parse historical logs for {container_name}: {e}")

    # Build dedup set from last 100 lines
    dedup_set = set(historical_lines[-100:])
    dedup_phase_active = True

    # Phase 2: Connect MQTT, replay historical, then follow real-time
    while True:
        try:
            logger.info(f"Starting real-time log monitoring for {container_name}...")

            async with aiomqtt.Client(
                hostname=MQTT_HOST,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASS,
            ) as mqtt:
                # Publish initial retained state on connect
                await publish_temp_nodes(mqtt, system, temp_nodes)
                await publish_node_mappings(mqtt, system, node_mappings)

                # Replay historical lines in batches
                base_ts = datetime.now(timezone.utc)
                batch: list[dict] = []
                for i, line_str in enumerate(historical_lines):
                    entry_ts = base_ts + timedelta(microseconds=i)
                    batch.append({
                        "ts": entry_ts.isoformat(),
                        "line": line_str,
                        "seq": seq,
                    })
                    seq += 1
                    if len(batch) >= HISTORY_BATCH_SIZE:
                        await mqtt.publish(log_topic, json.dumps(batch), qos=0, retain=False)
                        batch = []
                        await asyncio.sleep(0)
                if batch:
                    await mqtt.publish(log_topic, json.dumps(batch), qos=0, retain=False)
                historical_lines = []  # Free memory

                # Follow new logs with dedup
                since_ts = before_phase1_ts.isoformat()
                process = await asyncio.create_subprocess_exec(
                    "docker", "logs", "-f", "--since", since_ts, container_name,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    limit=STREAM_LINE_LIMIT,
                )

                realtime_buf: list[dict] = []
                last_flush = asyncio.get_event_loop().time()

                async def flush_buf():
                    nonlocal realtime_buf, last_flush
                    if realtime_buf:
                        await mqtt.publish(log_topic, json.dumps(realtime_buf), qos=0, retain=False)
                        realtime_buf = []
                    last_flush = asyncio.get_event_loop().time()

                async for line in process.stdout:
                    line_str = line.decode(errors="replace").strip()
                    if not line_str:
                        continue

                    if len(line_str) > MAX_LINE_LENGTH:
                        line_str = line_str[:MAX_LINE_LENGTH] + " [truncated]"

                    # Dedup during phase transition
                    if dedup_phase_active and dedup_set is not None and line_str in dedup_set:
                        dedup_set.discard(line_str)
                        # Still parse for enumeration events even during dedup
                        if temp_match := TEMP_PATTERN.search(line_str):
                            pass  # Already parsed in Phase 1
                        elif perm_match := PERM_SERIAL_PATTERN.search(line_str):
                            pass  # Already parsed in Phase 1
                        continue
                    if dedup_phase_active and dedup_set is not None and not dedup_set:
                        dedup_phase_active = False
                        dedup_set = None

                    # Enumeration parsing (always runs, even for filtered lines)
                    if temp_match := TEMP_PATTERN.search(line_str):
                        node_id = int(temp_match.group(1))
                        if node_id not in temp_nodes:
                            temp_nodes.add(node_id)
                            logger.info(f"[{system}] Node {node_id} temporarily enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)
                    elif perm_match := PERM_SERIAL_PATTERN.search(line_str):
                        node_id_str = perm_match.group(1)
                        serial = perm_match.group(2)
                        node_id_int = int(node_id_str)
                        if node_id_int in temp_nodes:
                            temp_nodes.discard(node_id_int)
                            logger.info(f"[{system}] Node {node_id_str} permanently enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)
                        if node_mappings.get(node_id_str) != serial:
                            node_mappings[node_id_str] = serial
                            logger.info(f"[{system}] Node {node_id_str} -> serial {serial}")
                            await publish_node_mappings(mqtt, system, node_mappings)

                    # Filter sensor_reset lines (never shown in frontend)
                    if _is_sensor_reset(line_str):
                        continue

                    # Buffer log entry for batched publish
                    realtime_buf.append({
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "line": line_str,
                        "seq": seq,
                    })
                    seq += 1

                    # Flush buffer if interval elapsed
                    now = asyncio.get_event_loop().time()
                    if now - last_flush >= REALTIME_FLUSH_INTERVAL:
                        await flush_buf()

                # Flush any remaining buffered lines
                await flush_buf()
                await process.wait()
                logger.warning(f"Log stream for {container_name} ended")

        except aiomqtt.MqttError as e:
            logger.error(f"MQTT connection failed for {system}: {e}")
        except (OSError, asyncio.CancelledError):
            raise
        except Exception as e:
            logger.error(f"Error monitoring {container_name}: {e}")

        logger.warning(f"Restarting monitor for {container_name} in 5s...")
        await asyncio.sleep(5)


def get_containers_config() -> dict:
    """
    Build container configuration from environment variables.

    Environment variable precedence:
      1. PRIMARY_CONTAINER=custom-name -> uses custom container name for primary
      2. SECONDARY_CONTAINER=custom-name -> uses custom container name for secondary
      3. ENABLE_SECONDARY=false -> no secondary monitoring (single-inverter setup)
      4. Defaults: taptap-primary, taptap-secondary
    """
    containers = {}

    # Primary container (always enabled)
    primary_name = os.environ.get("PRIMARY_CONTAINER", "taptap-primary")
    containers[primary_name] = "primary"

    # Secondary container (configurable)
    if os.environ.get("SECONDARY_CONTAINER"):
        containers[os.environ["SECONDARY_CONTAINER"]] = "secondary"
    elif os.environ.get("ENABLE_SECONDARY", "true").lower() == "true":
        containers["taptap-secondary"] = "secondary"

    return containers


async def main():
    """Main entry point - starts monitors for all configured containers."""
    containers = get_containers_config()

    logger.info("Temp ID Monitor starting...")
    logger.info(f"MQTT: {MQTT_HOST}:{MQTT_PORT}")
    logger.info(f"Monitoring containers: {containers}")

    if not containers:
        logger.error("No containers configured - exiting")
        return

    tasks = [
        monitor_container(container, system)
        for container, system in containers.items()
    ]

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
