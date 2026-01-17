import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .panel_service import PanelService
from .websocket_manager import ConnectionManager
from .mqtt_client import MQTTClient

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
    """Handle incoming MQTT message and update panel state."""
    node_serial = data.get("node_serial")
    if not node_serial:
        return

    online = data.get("state_online", "online") == "online"

    panel_service.update_panel(
        sn=node_serial,
        watts=data.get("power"),
        voltage=data.get("voltage_in"),
        online=online,
        timestamp=data.get("timestamp"),
    )

    # Queue update for WebSocket broadcast
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
    try:
        panel_service.load_config()
    except Exception as e:
        logger.error(f"Failed to load panel configuration: {e}")
        raise

    # Start WebSocket background tasks
    ws_manager.start_background_tasks()

    # Apply mock data if enabled (FR-2.3)
    if settings.use_mock_data:
        panel_service.apply_mock_data()
        logger.info("Running in mock data mode")
        # Start periodic refresh for hot-reload during calibration
        mock_refresh_task = asyncio.create_task(mock_refresh_loop())
    else:
        # Start MQTT client
        mqtt_client = MQTTClient(on_message=handle_mqtt_message)
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

# Serve static files (layout image)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "mock_mode": settings.use_mock_data}


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
    """Get current state of all panels (REST fallback)."""
    panels = panel_service.get_all_panels()
    return {"panels": [p.model_dump() for p in panels]}


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
