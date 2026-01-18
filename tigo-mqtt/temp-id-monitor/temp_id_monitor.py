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
from typing import Dict, Set

import aiomqtt

# Configuration via environment variables
# Support both MQTT_HOST and MQTT_SERVER for compatibility
MQTT_HOST = os.environ.get("MQTT_HOST") or os.environ.get("MQTT_SERVER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER")
MQTT_PASS = os.environ.get("MQTT_PASS")

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
    topic = f"taptap/{system}/temp_nodes"
    payload = json.dumps(sorted(list(nodes)))
    # Retained message ensures new subscribers get current state immediately
    await mqtt.publish(topic, payload, retain=True)
    logger.info(f"Published temp_nodes for {system}: {payload}")


async def publish_node_mappings(mqtt: aiomqtt.Client, system: str, mappings: Dict[str, str]):
    """Publish node_id → serial mappings with retain flag.

    This provides the node_id data that isn't included in taptap-mqtt's
    standard MQTT messages, allowing the dashboard to display node IDs.

    Topic: taptap/{system}/node_mappings
    Payload: {"42": "4-C3F23CR", "57": "4-XYZ123", ...}
    """
    topic = f"taptap/{system}/node_mappings"
    payload = json.dumps(mappings)
    await mqtt.publish(topic, payload, retain=True)
    logger.info(f"Published node_mappings for {system}: {len(mappings)} nodes")


async def monitor_container(container_name: str, system: str):
    """Monitor a container's logs and publish temp node status and mappings."""
    temp_nodes: Set[int] = set()
    node_mappings: Dict[str, str] = {}  # node_id (str) -> serial

    # Phase 1: Parse historical logs to recover state on startup
    logger.info(f"Parsing historical logs for {container_name}...")
    try:
        hist_process = await asyncio.create_subprocess_exec(
            "docker", "logs", container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await hist_process.communicate()

        for line in stdout.decode(errors="replace").splitlines():
            if temp_match := TEMP_PATTERN.search(line):
                temp_nodes.add(int(temp_match.group(1)))
            elif perm_match := PERM_SERIAL_PATTERN.search(line):
                node_id = perm_match.group(1)
                serial = perm_match.group(2)
                temp_nodes.discard(int(node_id))
                node_mappings[node_id] = serial

        if hist_process.returncode == 0:
            logger.info(
                f"Recovered from {container_name} history: "
                f"{len(temp_nodes)} temp nodes, {len(node_mappings)} mappings"
            )
        else:
            logger.warning(f"Docker logs failed for {container_name} (exit code {hist_process.returncode})")
            logger.warning("Container may not exist yet - will retry in follow phase")

    except FileNotFoundError:
        logger.error("Docker CLI not found - is Docker installed?")
        raise
    except PermissionError as e:
        logger.error(f"Docker socket permission denied: {e}")
        logger.error("Ensure /var/run/docker.sock is mounted and readable")
        raise
    except Exception as e:
        logger.warning(f"Failed to parse historical logs for {container_name}: {e}")

    # Phase 2: Follow logs in real-time with retry loop
    while True:
        try:
            logger.info(f"Starting real-time log monitoring for {container_name}...")

            process = await asyncio.create_subprocess_exec(
                "docker", "logs", "-f", "--since", "0s", container_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            async with aiomqtt.Client(
                hostname=MQTT_HOST,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASS,
            ) as mqtt:
                # Publish initial state on connect (retained for new subscribers)
                await publish_temp_nodes(mqtt, system, temp_nodes)
                await publish_node_mappings(mqtt, system, node_mappings)

                async for line in process.stdout:
                    line_str = line.decode(errors="replace").strip()

                    # Check for temporary enumeration
                    if temp_match := TEMP_PATTERN.search(line_str):
                        node_id = int(temp_match.group(1))
                        if node_id not in temp_nodes:
                            temp_nodes.add(node_id)
                            logger.info(f"[{system}] Node {node_id} temporarily enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)

                    # Check for permanent enumeration with serial extraction
                    elif perm_match := PERM_SERIAL_PATTERN.search(line_str):
                        node_id_str = perm_match.group(1)
                        serial = perm_match.group(2)
                        node_id_int = int(node_id_str)

                        # Remove from temp nodes if present
                        if node_id_int in temp_nodes:
                            temp_nodes.discard(node_id_int)
                            logger.info(f"[{system}] Node {node_id_str} permanently enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)

                        # Update mapping and publish
                        if node_mappings.get(node_id_str) != serial:
                            node_mappings[node_id_str] = serial
                            logger.info(f"[{system}] Node {node_id_str} -> serial {serial}")
                            await publish_node_mappings(mqtt, system, node_mappings)

            # Process ended (container stopped or logs exhausted)
            await process.wait()
            logger.warning(f"Log stream for {container_name} ended")

        except aiomqtt.MqttError as e:
            logger.error(f"MQTT connection failed for {system}: {e}")
        except Exception as e:
            logger.error(f"Error monitoring {container_name}: {e}")

        # Retry after 5s - handles both Docker and MQTT failures
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
