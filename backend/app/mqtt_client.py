import asyncio
import json
import logging
from typing import Callable, Awaitable, Optional

from .config import get_settings

logger = logging.getLogger(__name__)


class MQTTClient:
    """MQTT client for subscribing to taptap-mqtt topics (FR-2.1, FR-2.7)."""

    def __init__(self, on_message: Callable[[dict], Awaitable[None]]):
        self.on_message = on_message
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
                    topic = f"{settings.mqtt_topic_prefix}/+/state"
                    await client.subscribe(topic)
                    logger.info(f"Subscribed to topic: {topic}")

                    async for message in client.messages:
                        if not self._running:
                            break
                        try:
                            payload = json.loads(message.payload.decode())
                            await self._process_message(payload)
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

    async def _process_message(self, payload: dict) -> None:
        """Process incoming MQTT message (FR-2.2)."""
        nodes = payload.get("nodes", {})

        for node_key, node_data in nodes.items():
            if not isinstance(node_data, dict):
                continue

            # Extract required fields (FR-2.2)
            node_serial = node_data.get("node_serial")
            if not node_serial:
                continue

            processed_data = {
                "node_serial": node_serial,
                "power": node_data.get("power"),
                "voltage_in": node_data.get("voltage_in"),
                "timestamp": node_data.get("timestamp"),
                "state_online": node_data.get("state_online", "online"),
            }

            await self.on_message(processed_data)
