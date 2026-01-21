import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .panel_service import PanelService
from .websocket_manager import ConnectionManager
from .mqtt_client import MQTTClient
from .config_router import router as config_router
from .config_service import get_config_service
from .discovery_router import router as discovery_router
from .discovery_router import discovery_websocket_router
from .layout_router import router as layout_router

# Configure logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global instances
panel_service = PanelService()
ws_manager = ConnectionManager(
    batch_interval_ms=settings.ws_batch_interval_ms,
    heartbeat_interval=settings.ws_heartbeat_interval,
)
mqtt_client: MQTTClient | None = None


async def handle_mqtt_message(data: dict) -> None:
    """Handle incoming MQTT message and update panel state (FR-7.3)."""
    node_serial = data.get("node_serial")
    if not node_serial:
        return

    online = data.get("state_online", "online") == "online"

    # Pass all available fields from MQTT to panel service
    panel_service.update_panel(
        sn=node_serial,
        watts=data.get("power"),
        voltage_in=data.get("voltage_in"),
        voltage_out=data.get("voltage_out"),
        current_in=data.get("current_in"),
        current_out=data.get("current_out"),
        temperature=data.get("temperature"),
        duty_cycle=data.get("duty_cycle"),
        rssi=data.get("rssi"),
        energy=data.get("energy"),
        online=online,
        timestamp=data.get("timestamp"),
        node_id=data.get("node_id"),
        actual_system=data.get("source_system"),
    )

    # Queue update for WebSocket broadcast
    panels = panel_service.get_all_panels()
    await ws_manager.queue_update(panels)


async def handle_temp_nodes(system: str, node_ids: List[int]) -> None:
    """Handle temp_nodes MQTT message and update panel is_temporary flags (FR-5.4)."""
    panel_service.update_temp_nodes(system, node_ids)

    # Queue update for WebSocket broadcast to reflect is_temporary changes
    panels = panel_service.get_all_panels()
    await ws_manager.queue_update(panels)


async def handle_node_mappings(system: str, mappings: dict) -> None:
    """Handle node_mappings MQTT message and update panel node_id values."""
    panel_service.update_node_mappings(system, mappings)

    # Queue update for WebSocket broadcast to reflect node_id changes
    panels = panel_service.get_all_panels()
    await ws_manager.queue_update(panels)


mock_refresh_task: asyncio.Task | None = None


async def mock_refresh_loop():
    """Periodically check for config changes and broadcast updates in mock mode."""
    while True:
        await asyncio.sleep(0.5)  # Check every 500ms
        # Always reload config from disk and broadcast (bypasses mtime caching issues)
        try:
            panel_service.load_config()
            panel_service.apply_mock_data()
            panels = panel_service.get_all_panels()
            await ws_manager.broadcast(panels)
        except Exception as e:
            logger.error(f"Error in refresh loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global mqtt_client, mock_refresh_task

    # Load panel configuration (FR-1.5)
    # Allow startup without config for setup wizard
    try:
        panel_service.load_config()
    except FileNotFoundError:
        logger.info("No panel configuration found - setup wizard mode")
    except Exception as e:
        logger.error(f"Failed to load panel configuration: {e}")
        # Don't raise - allow app to start for setup wizard

    # Start WebSocket background tasks
    ws_manager.start_background_tasks()

    # Apply mock data if enabled (FR-2.3)
    if settings.use_mock_data:
        panel_service.apply_mock_data()
        logger.info("Running in mock data mode")
        # Start periodic refresh for hot-reload during calibration
        mock_refresh_task = asyncio.create_task(mock_refresh_loop())
    else:
        # Start MQTT client with state, temp_nodes, and node_mappings handlers
        mqtt_client = MQTTClient(
            on_message=handle_mqtt_message,
            on_temp_nodes=handle_temp_nodes,
            on_node_mappings=handle_node_mappings,
        )
        await mqtt_client.start()
        logger.info("MQTT client started")

    yield

    # Cleanup
    await ws_manager.stop_background_tasks()
    if mock_refresh_task:
        mock_refresh_task.cancel()
        try:
            await mock_refresh_task
        except asyncio.CancelledError:
            pass
    if mqtt_client:
        await mqtt_client.stop()


app = FastAPI(
    title="Solar Tigo Viewer",
    description="Real-time solar panel monitoring visualization",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration for local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include configuration router for multi-user setup
app.include_router(config_router)

# Include layout editor router
app.include_router(layout_router)

# Include discovery router for setup wizard
app.include_router(discovery_router)
app.include_router(discovery_websocket_router)

# Serve static files (layout image)
app.mount("/static", StaticFiles(directory="static"), name="static")


def check_state_file(path: str | None) -> dict:
    """Check status of a taptap state file."""
    if not path:
        return {"configured": False, "exists": False, "valid": False, "nodes": 0}

    if not os.path.exists(path):
        return {"configured": True, "exists": False, "valid": False, "nodes": 0}

    try:
        with open(path, "r") as f:
            content = f.read().strip()
            if not content:
                return {"configured": True, "exists": True, "valid": False, "nodes": 0}

            data = json.loads(content)

            # Check for required fields in PersistentState format
            has_tables = "gateway_node_tables" in data
            has_identities = "gateway_identities" in data

            # Count total nodes across all gateways
            node_count = 0
            if has_tables:
                for gateway_nodes in data["gateway_node_tables"].values():
                    node_count += len(gateway_nodes)

            # Check if gateway_identities is empty (common issue)
            identities_empty = (
                not has_identities
                or not data.get("gateway_identities")
                or len(data["gateway_identities"]) == 0
            )

            valid = has_tables and has_identities and not identities_empty and node_count > 0

            return {
                "configured": True,
                "exists": True,
                "valid": valid,
                "nodes": node_count,
                "identities_empty": identities_empty,
            }
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Error reading state file {path}: {e}")
        return {"configured": True, "exists": True, "valid": False, "nodes": 0, "error": str(e)}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "mock_mode": settings.use_mock_data}


@app.get("/api/system-status")
async def system_status():
    """Get system status including state file health."""
    primary_status = check_state_file(settings.taptap_primary_state_file)
    secondary_status = check_state_file(settings.taptap_secondary_state_file)

    # Determine if there are any warnings
    warnings = []

    if settings.taptap_primary_state_file:
        if not primary_status["exists"]:
            warnings.append({
                "level": "error",
                "message": "Primary CCA state file missing - panel data may be scrambled",
                "detail": "Run capture-infrastructure.sh to bootstrap the state file",
            })
        elif not primary_status["valid"]:
            warnings.append({
                "level": "warning",
                "message": "Primary CCA state file is invalid or empty",
                "detail": "State file exists but may be corrupted or incomplete",
            })

    if settings.taptap_secondary_state_file:
        if not secondary_status["exists"]:
            warnings.append({
                "level": "error",
                "message": "Secondary CCA state file missing - panel data may be scrambled",
                "detail": "Run capture-infrastructure.sh to bootstrap the state file",
            })
        elif not secondary_status["valid"]:
            warnings.append({
                "level": "warning",
                "message": "Secondary CCA state file is invalid or empty",
                "detail": "State file exists but may be corrupted or incomplete",
            })

    return {
        "mock_mode": settings.use_mock_data,
        "state_files": {
            "primary": primary_status,
            "secondary": secondary_status,
        },
        "warnings": warnings,
        "has_warnings": len(warnings) > 0,
    }


@app.post("/api/reload")
async def reload_config():
    """Force reload config and broadcast to all clients."""
    panel_service.load_config()
    if settings.use_mock_data:
        panel_service.apply_mock_data()
    panels = panel_service.get_all_panels()
    await ws_manager.broadcast(panels)
    return {"status": "reloaded", "panels": len(panels)}


@app.get("/api/panels")
async def get_panels():
    """Get current state of all panels (REST fallback).

    Uses by_alias=True for backward compatibility during migration (FR-M.5).
    This outputs 'voltage' instead of 'voltage_in'.
    """
    panels = panel_service.get_all_panels()
    return {"panels": [p.model_dump(by_alias=True) for p in panels]}


@app.websocket("/ws/panels")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time panel updates (FR-3.1)."""
    await ws_manager.connect(websocket)

    # Send initial state immediately
    panels = panel_service.get_all_panels()
    await ws_manager.broadcast(panels)

    try:
        while True:
            # Wait for any client messages (e.g., pong responses)
            data = await websocket.receive_text()
            # Client might send pong or other messages - we just acknowledge
            logger.debug(f"Received from client: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)
