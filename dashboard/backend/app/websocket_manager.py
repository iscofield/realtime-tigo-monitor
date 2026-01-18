import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import WebSocket

from .models import WebSocketMessage, PanelData

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections with batching and heartbeat (FR-3.2, FR-3.4)."""

    def __init__(self, batch_interval_ms: int = 500, heartbeat_interval: int = 30):
        self.active_connections: list[WebSocket] = []
        self.batch_interval_ms = batch_interval_ms
        self.heartbeat_interval = heartbeat_interval
        self._pending_update: bool = False
        self._batch_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self._panel_data: list[PanelData] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and track a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        client_info = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        logger.info(f"WebSocket client connected: {client_info}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            client_info = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
            logger.info(f"WebSocket client disconnected: {client_info}")

    async def broadcast(self, panels: list[PanelData]) -> None:
        """Broadcast panel data to all connected clients (FR-3.4).

        Uses by_alias=True for backward compatibility during migration (FR-M.5).
        This outputs 'voltage' instead of 'voltage_in'.
        """
        if not self.active_connections:
            return

        message = WebSocketMessage(
            timestamp=datetime.now(timezone.utc).isoformat(),
            panels=panels,
        )
        message_dict = message.model_dump(by_alias=True)

        # Collect failed connections to avoid modifying list while iterating
        failed_connections: list[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_json(message_dict)
            except Exception as e:
                client_info = f"{connection.client.host}:{connection.client.port}" if connection.client else "unknown"
                logger.warning(f"Failed to send to {client_info}: {e}")
                failed_connections.append(connection)

        # Remove failed connections after iteration
        for connection in failed_connections:
            self.disconnect(connection)

    async def queue_update(self, panels: list[PanelData]) -> None:
        """Queue panel update for batched broadcast (FR-3.2)."""
        async with self._lock:
            self._panel_data = panels
            self._pending_update = True

    async def _batch_loop(self) -> None:
        """Background task to batch and broadcast updates (FR-3.2)."""
        while True:
            await asyncio.sleep(self.batch_interval_ms / 1000.0)
            async with self._lock:
                if self._pending_update and self._panel_data:
                    logger.info(f"Batch loop: broadcasting to {len(self.active_connections)} clients")
                    await self.broadcast(self._panel_data)
                    self._pending_update = False

    async def _heartbeat_loop(self) -> None:
        """Background task for WebSocket heartbeat (FR-3.4)."""
        while True:
            await asyncio.sleep(self.heartbeat_interval)
            failed_connections: list[WebSocket] = []

            for connection in self.active_connections:
                try:
                    await connection.send_json({"type": "ping"})
                except Exception as e:
                    client_info = f"{connection.client.host}:{connection.client.port}" if connection.client else "unknown"
                    logger.warning(f"Heartbeat failed for {client_info}: {e}")
                    failed_connections.append(connection)

            for connection in failed_connections:
                self.disconnect(connection)

    def start_background_tasks(self) -> None:
        """Start batch and heartbeat background tasks."""
        if self._batch_task is None:
            self._batch_task = asyncio.create_task(self._batch_loop())
        if self._heartbeat_task is None:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop_background_tasks(self) -> None:
        """Stop background tasks."""
        if self._batch_task:
            self._batch_task.cancel()
            try:
                await self._batch_task
            except asyncio.CancelledError:
                pass
            self._batch_task = None
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
            self._heartbeat_task = None
