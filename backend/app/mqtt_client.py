import asyncio
import json
import logging
from typing import Callable, Awaitable, Optional, List

from .config import get_settings

logger = logging.getLogger(__name__)


class MQTTClient:
    """MQTT client for subscribing to taptap-mqtt topics (FR-2.1, FR-2.7)."""

    def __init__(
        self,
        on_message: Callable[[dict], Awaitable[None]],
        on_temp_nodes: Optional[Callable[[str, List[int]], Awaitable[None]]] = None,
        on_node_mappings: Optional[Callable[[str, dict], Awaitable[None]]] = None,
    ):
        self.on_message = on_message
        self.on_temp_nodes = on_temp_nodes  # Callback for temp_nodes updates (FR-5.4)
        self.on_node_mappings = on_node_mappings  # Callback for node_id → serial mappings
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._retry_delay = 1  # Initial retry delay in seconds
        self._max_retry_delay = 60  # Max retry delay (FR-2.7)

    async def start(self) -> None:
        """Start the MQTT listener with reconnection logic."""
        self._running = True
        self._task = asyncio.create_task(self._connect_loop())

    async def stop(self) -> None:
        """Stop the MQTT listener."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _connect_loop(self) -> None:
        """Connection loop with exponential backoff (FR-2.7)."""
        settings = get_settings()

        while self._running:
            try:
                import aiomqtt

                logger.info(
                    f"Connecting to MQTT broker at {settings.mqtt_broker_host}:{settings.mqtt_broker_port}"
                )

                async with aiomqtt.Client(
                    hostname=settings.mqtt_broker_host,
                    port=settings.mqtt_broker_port,
                    username=settings.mqtt_username,
                    password=settings.mqtt_password,
                ) as client:
                    # Reset retry delay on successful connection
                    self._retry_delay = 1
                    logger.info("Connected to MQTT broker")

                    # Subscribe to state topics for all systems (FR-2.1)
                    state_topic = f"{settings.mqtt_topic_prefix}/+/state"
                    await client.subscribe(state_topic)
                    logger.info(f"Subscribed to topic: {state_topic}")

                    # Subscribe to temp_nodes topics for temporary ID detection (FR-5.4)
                    temp_topic = f"{settings.mqtt_topic_prefix}/+/temp_nodes"
                    await client.subscribe(temp_topic)
                    logger.info(f"Subscribed to topic: {temp_topic}")

                    # Subscribe to node_mappings topics for node_id → serial data
                    mappings_topic = f"{settings.mqtt_topic_prefix}/+/node_mappings"
                    await client.subscribe(mappings_topic)
                    logger.info(f"Subscribed to topic: {mappings_topic}")

                    async for message in client.messages:
                        if not self._running:
                            break
                        try:
                            topic_str = str(message.topic)
                            payload = json.loads(message.payload.decode())

                            # Route message based on topic type
                            if topic_str.endswith("/temp_nodes"):
                                await self._process_temp_nodes(topic_str, payload)
                            elif topic_str.endswith("/node_mappings"):
                                await self._process_node_mappings(topic_str, payload)
                            elif topic_str.endswith("/state"):
                                # Extract system from topic (e.g., "taptap/primary/state" -> "primary")
                                parts = topic_str.split("/")
                                source_system = parts[1] if len(parts) >= 2 else None
                                await self._process_message(payload, source_system)
                            else:
                                logger.debug(f"Ignoring message from unknown topic: {topic_str}")

                        except json.JSONDecodeError as e:
                            logger.error(f"Failed to parse MQTT message: {e}")
                        except Exception as e:
                            logger.error(f"Error processing MQTT message: {e}")

            except asyncio.CancelledError:
                logger.info("MQTT client task cancelled")
                break
            except Exception as e:
                logger.error(f"MQTT connection error: {e}")

                if self._running:
                    logger.info(f"Reconnecting in {self._retry_delay} seconds...")
                    await asyncio.sleep(self._retry_delay)
                    # Exponential backoff (FR-2.7)
                    self._retry_delay = min(self._retry_delay * 2, self._max_retry_delay)

    async def _process_message(self, payload: dict, source_system: str | None = None) -> None:
        """Process incoming MQTT message (FR-2.2, FR-7.3)."""
        nodes = payload.get("nodes", {})

        for node_key, node_data in nodes.items():
            if not isinstance(node_data, dict):
                continue

            # Extract required fields (FR-2.2)
            node_serial = node_data.get("node_serial")
            if not node_serial:
                continue

            # Extract all available fields from taptap-mqtt (FR-7.3)
            processed_data = {
                "node_serial": node_serial,
                "node_id": node_data.get("node_id"),
                "node_name": node_data.get("node_name"),  # Tigo's label
                "power": node_data.get("power"),
                "voltage_in": node_data.get("voltage_in"),
                "voltage_out": node_data.get("voltage_out"),
                "current_in": node_data.get("current_in"),
                "current_out": node_data.get("current_out"),
                "temperature": node_data.get("temperature"),
                "duty_cycle": node_data.get("duty_cycle"),
                "rssi": node_data.get("rssi"),
                "energy": node_data.get("energy"),
                "timestamp": node_data.get("timestamp"),
                "state_online": node_data.get("state_online", "online"),
                "source_system": source_system,  # Which CCA this data came from
            }

            await self.on_message(processed_data)

    async def _process_temp_nodes(self, topic: str, payload: list) -> None:
        """Process temp_nodes MQTT message (FR-5.4).

        Topic format: taptap/{system}/temp_nodes
        Payload: JSON array of node IDs, e.g., [42, 57, 63]
        """
        if self.on_temp_nodes is None:
            return

        # Extract system from topic (e.g., "taptap/primary/temp_nodes" -> "primary")
        parts = topic.split("/")
        if len(parts) >= 2:
            system = parts[1]
        else:
            logger.warning(f"Could not extract system from topic: {topic}")
            return

        # Validate payload is a list of integers
        if not isinstance(payload, list):
            logger.warning(f"Invalid temp_nodes payload (expected list): {payload}")
            return

        try:
            node_ids = [int(n) for n in payload]
            logger.info(f"Received temp_nodes for {system}: {node_ids}")
            await self.on_temp_nodes(system, node_ids)
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid node IDs in temp_nodes payload: {e}")

    async def _process_node_mappings(self, topic: str, payload: dict) -> None:
        """Process node_mappings MQTT message.

        Topic format: taptap/{system}/node_mappings
        Payload: {"42": "4-C3F23CR", "57": "4-XYZ123", ...}
        """
        if self.on_node_mappings is None:
            return

        # Extract system from topic
        parts = topic.split("/")
        if len(parts) >= 2:
            system = parts[1]
        else:
            logger.warning(f"Could not extract system from topic: {topic}")
            return

        # Validate payload is a dict
        if not isinstance(payload, dict):
            logger.warning(f"Invalid node_mappings payload (expected dict): {payload}")
            return

        logger.info(f"Received node_mappings for {system}: {len(payload)} nodes")
        await self.on_node_mappings(system, payload)
