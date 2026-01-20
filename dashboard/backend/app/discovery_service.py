"""Panel discovery service for setup wizard (Phase 1 spec FR-6).

Handles MQTT subscription in discovery mode and emits WebSocket events
as panels are discovered.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable, Optional

from .config_models import DiscoveredPanel

logger = logging.getLogger(__name__)


class DiscoveryService:
    """Service for panel discovery during setup wizard."""

    def __init__(self):
        self._discovered_panels: dict[str, DiscoveredPanel] = {}
        self._subscribers: list[Callable[[dict], Awaitable[None]]] = []
        self._mqtt_task: Optional[asyncio.Task] = None
        self._running = False
        self._discovery_start_time: Optional[datetime] = None

    @property
    def discovered_panels(self) -> dict[str, DiscoveredPanel]:
        """Get all discovered panels by serial number."""
        return self._discovered_panels.copy()

    @property
    def discovered_count(self) -> int:
        """Get count of discovered panels."""
        return len(self._discovered_panels)

    def subscribe(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        """Subscribe to discovery events."""
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        """Unsubscribe from discovery events."""
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def _emit_event(self, event: dict) -> None:
        """Emit event to all subscribers."""
        for callback in self._subscribers:
            try:
                await callback(event)
            except Exception as e:
                logger.error(f"Error in discovery event callback: {e}")

    async def start_discovery(
        self,
        mqtt_host: str,
        mqtt_port: int = 1883,
        mqtt_username: Optional[str] = None,
        mqtt_password: Optional[str] = None,
        topic_prefix: str = "taptap"
    ) -> None:
        """Start MQTT discovery mode (FR-6.1).

        Subscribes to taptap/+/nodes/# wildcard topic and emits
        panel_discovered events for each unique panel found.
        """
        if self._running:
            logger.warning("Discovery already running")
            return

        self._running = True
        self._discovery_start_time = datetime.now(timezone.utc)
        self._mqtt_task = asyncio.create_task(
            self._discovery_loop(
                mqtt_host, mqtt_port, mqtt_username, mqtt_password, topic_prefix
            )
        )

    async def stop_discovery(self) -> None:
        """Stop MQTT discovery mode."""
        self._running = False
        if self._mqtt_task:
            self._mqtt_task.cancel()
            try:
                await self._mqtt_task
            except asyncio.CancelledError:
                pass
            self._mqtt_task = None

    def clear_discovered(self) -> None:
        """Clear all discovered panels (for restart discovery)."""
        self._discovered_panels.clear()

    async def _discovery_loop(
        self,
        mqtt_host: str,
        mqtt_port: int,
        mqtt_username: Optional[str],
        mqtt_password: Optional[str],
        topic_prefix: str
    ) -> None:
        """MQTT connection loop for discovery mode."""
        retry_delay = 1

        while self._running:
            try:
                import aiomqtt

                logger.info(f"Discovery: Connecting to MQTT {mqtt_host}:{mqtt_port}")

                async with aiomqtt.Client(
                    hostname=mqtt_host,
                    port=mqtt_port,
                    username=mqtt_username,
                    password=mqtt_password,
                ) as client:
                    retry_delay = 1  # Reset on successful connection

                    # Emit connection status
                    await self._emit_event({
                        "type": "connection_status",
                        "data": {"status": "connected"}
                    })

                    # Subscribe to state topics with wildcard (FR-6.1)
                    state_topic = f"{topic_prefix}/+/state"
                    await client.subscribe(state_topic)
                    logger.info(f"Discovery: Subscribed to {state_topic}")

                    async for message in client.messages:
                        if not self._running:
                            break

                        try:
                            topic_str = str(message.topic)
                            payload = json.loads(message.payload.decode())

                            if topic_str.endswith("/state"):
                                # Extract system from topic
                                parts = topic_str.split("/")
                                source_system = parts[1] if len(parts) >= 2 else "unknown"

                                await self._process_state_message(payload, source_system)

                        except json.JSONDecodeError as e:
                            logger.debug(f"Discovery: Failed to parse message: {e}")
                        except Exception as e:
                            logger.error(f"Discovery: Error processing message: {e}")

            except asyncio.CancelledError:
                logger.info("Discovery: Task cancelled")
                break
            except Exception as e:
                logger.error(f"Discovery: MQTT connection error: {e}")

                # Emit disconnection event
                await self._emit_event({
                    "type": "connection_status",
                    "data": {"status": "disconnected", "reason": str(e)}
                })

                if self._running:
                    logger.info(f"Discovery: Reconnecting in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 30)

    async def _process_state_message(self, payload: dict, source_system: str) -> None:
        """Process a state MQTT message and emit discovery events."""
        nodes = payload.get("nodes", {})
        now = datetime.now(timezone.utc).isoformat()

        for node_key, node_data in nodes.items():
            if not isinstance(node_data, dict):
                continue

            node_serial = node_data.get("node_serial")
            if not node_serial:
                continue

            tigo_label = node_data.get("node_name", "")
            watts = node_data.get("power", 0.0)
            voltage = node_data.get("voltage_in", 0.0)

            is_new = node_serial not in self._discovered_panels

            # Update or create discovered panel
            if is_new:
                panel = DiscoveredPanel(
                    serial=node_serial,
                    cca=source_system,
                    tigo_label=tigo_label,
                    watts=watts or 0.0,
                    voltage=voltage or 0.0,
                    discovered_at=now,
                    last_seen_at=now
                )
                self._discovered_panels[node_serial] = panel

                # Emit panel_discovered event (FR-6.2)
                await self._emit_event({
                    "type": "panel_discovered",
                    "data": {
                        "serial": node_serial,
                        "cca": source_system,
                        "tigo_label": tigo_label,
                        "watts": watts or 0.0,
                        "voltage": voltage or 0.0
                    }
                })

                logger.info(
                    f"Discovery: Found panel {node_serial} ({tigo_label}) "
                    f"from {source_system}"
                )
            else:
                # Update existing panel
                panel = self._discovered_panels[node_serial]
                panel.watts = watts or panel.watts
                panel.voltage = voltage or panel.voltage
                panel.last_seen_at = now

                # Emit update event (for live data display)
                await self._emit_event({
                    "type": "panel_updated",
                    "data": {
                        "serial": node_serial,
                        "watts": panel.watts,
                        "voltage": panel.voltage
                    }
                })


# Singleton instance
_discovery_service: Optional[DiscoveryService] = None


def get_discovery_service() -> DiscoveryService:
    """Get or create the singleton DiscoveryService instance."""
    global _discovery_service
    if _discovery_service is None:
        _discovery_service = DiscoveryService()
    return _discovery_service
