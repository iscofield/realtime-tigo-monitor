"""Discovery API endpoints and WebSocket for setup wizard (Phase 1 spec FR-6).

Provides:
- POST /api/discovery/start - Start panel discovery
- POST /api/discovery/stop - Stop panel discovery
- GET /api/discovery/panels - Get discovered panels
- WebSocket /ws/discovery - Real-time discovery events
"""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from .discovery_service import get_discovery_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/discovery", tags=["discovery"])


class StartDiscoveryRequest(BaseModel):
    """Request to start panel discovery."""
    mqtt_host: str
    mqtt_port: int = 1883
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None
    topic_prefix: str = "taptap"


class DiscoveryStatusResponse(BaseModel):
    """Response with discovery status."""
    running: bool
    panels_count: int
    panels: list[dict]


@router.post("/start")
async def start_discovery(request: StartDiscoveryRequest):
    """Start MQTT discovery mode (FR-6.1).

    Connects to MQTT broker and subscribes to panel topics.
    Discovery events are emitted via WebSocket.
    """
    service = get_discovery_service()

    # Clear previous discoveries
    service.clear_discovered()

    # Start discovery
    await service.start_discovery(
        mqtt_host=request.mqtt_host,
        mqtt_port=request.mqtt_port,
        mqtt_username=request.mqtt_username,
        mqtt_password=request.mqtt_password,
        topic_prefix=request.topic_prefix
    )

    return {
        "success": True,
        "message": "Discovery started"
    }


@router.post("/stop")
async def stop_discovery():
    """Stop MQTT discovery mode."""
    service = get_discovery_service()
    await service.stop_discovery()

    return {
        "success": True,
        "message": "Discovery stopped",
        "panels_count": service.discovered_count
    }


@router.get("/panels")
async def get_discovered_panels():
    """Get all discovered panels."""
    service = get_discovery_service()
    panels = service.discovered_panels

    return {
        "panels": [
            {
                "serial": p.serial,
                "cca": p.cca,
                "tigo_label": p.tigo_label,
                "watts": p.watts,
                "voltage": p.voltage,
                "discovered_at": p.discovered_at,
                "last_seen_at": p.last_seen_at
            }
            for p in panels.values()
        ],
        "count": len(panels)
    }


@router.post("/clear")
async def clear_discovered():
    """Clear all discovered panels (restart discovery)."""
    service = get_discovery_service()
    service.clear_discovered()

    return {
        "success": True,
        "message": "Discovered panels cleared"
    }


# WebSocket endpoint for real-time discovery events
discovery_websocket_router = APIRouter(tags=["discovery"])


@discovery_websocket_router.websocket("/ws/discovery")
async def discovery_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time discovery events (FR-6.2).

    Emits events:
    - panel_discovered: New panel found
    - panel_updated: Existing panel data updated
    - connection_status: MQTT connection status changes
    """
    await websocket.accept()
    logger.info("Discovery WebSocket connected")

    service = get_discovery_service()
    message_queue: asyncio.Queue[dict] = asyncio.Queue()

    async def on_event(event: dict) -> None:
        """Queue event for WebSocket send."""
        await message_queue.put(event)

    # Subscribe to discovery events
    service.subscribe(on_event)

    try:
        # Send current state immediately
        panels = service.discovered_panels
        for panel in panels.values():
            await websocket.send_json({
                "type": "panel_discovered",
                "data": {
                    "serial": panel.serial,
                    "cca": panel.cca,
                    "tigo_label": panel.tigo_label,
                    "watts": panel.watts,
                    "voltage": panel.voltage
                }
            })

        # Event loop
        while True:
            try:
                # Wait for event with timeout (for keepalive)
                event = await asyncio.wait_for(
                    message_queue.get(),
                    timeout=30.0
                )
                await websocket.send_json(event)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info("Discovery WebSocket disconnected")
    except Exception as e:
        logger.error(f"Discovery WebSocket error: {e}")
    finally:
        service.unsubscribe(on_event)
