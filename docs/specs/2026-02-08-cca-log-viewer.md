# CCA Log Viewer

Stream and display real-time taptap CCA container logs in the dashboard via MQTT. Adds a fourth "Logs" tab that shows log output from each configured CCA, with per-CCA sub-tabs (when multiple CCAs exist), descending timestamp order, and client-side search.

## Motivation

Currently, CCA logs are only accessible by SSH-ing into the Raspberry Pi and running `docker logs`. This makes it difficult for users to monitor enumeration events, diagnose issues, or verify CCA health without terminal access. By streaming logs over the existing MQTT infrastructure and displaying them in the dashboard, users get immediate visibility into CCA behavior without leaving the browser.

## Functional Requirements

### FR-1: MQTT Log Publishing (tigo-mqtt side)

**FR-1.1:** The `temp-id-monitor` sidecar MUST publish raw log lines from each taptap container to the MQTT topic `taptap/{system}/logs` (e.g., `taptap/primary/logs`, `taptap/secondary/logs`).

**FR-1.2:** Each MQTT log message MUST be a JSON object with the following schema:
```json
{
  "ts": "2026-02-08T14:30:05.123456",
  "line": "Permanently enumerated node id: 3 to node name: C5 and serial: 4-C3F269M"
}
```
- `ts`: ISO 8601 timestamp (UTC). For real-time logs, this is the capture time (`datetime.now(timezone.utc)`). For historical replay on startup, this is also the capture time (not the original log time), since Docker's log timestamps are not easily parseable from the raw line text. This means replayed historical entries will all share a similar recent timestamp, which is acceptable since they represent "data available since startup."
- `line`: The raw, unmodified log line text from the taptap container

**FR-1.3:** Log messages MUST be published with QoS 0 (fire-and-forget) and `retain=false`. Logs are ephemeral and MUST NOT be retained at the broker.

**FR-1.4:** The publisher MUST NOT publish to any topic under the `homeassistant/` prefix. This ensures Home Assistant does not create entities or store log data.

**FR-1.5:** On startup, the publisher MUST replay existing historical container logs (from the current container lifecycle) to the MQTT topic, so the backend can populate its log store even if it connects after the taptap container has been running.

**FR-1.6:** The publisher MUST NOT duplicate log lines. When transitioning from historical log replay (Phase 1) to real-time follow (Phase 2), the publisher MUST use the `--since` flag with a timestamp that avoids re-publishing lines already sent during replay.

### FR-2: Backend Log Ingestion and Persistence

**FR-2.1:** The backend MQTT client MUST subscribe to `taptap/+/logs` and route incoming messages to a log handler.

**FR-2.2:** The backend MUST persist received log lines to disk as append-only log files, one file per CCA system per day:
```
/app/logs/primary/2026-02-08.log
/app/logs/primary/2026-02-09.log
/app/logs/secondary/2026-02-08.log
```

**FR-2.3:** Each line in the log file MUST be stored as a single JSON object (one per line, JSONL format):
```jsonl
{"ts": "2026-02-08T14:30:05.123456", "line": "Permanently enumerated node id: 3 ..."}
{"ts": "2026-02-08T14:30:06.789012", "line": "Node 3 online"}
```

**FR-2.4:** The backend MUST enforce a rolling 7-day retention window. On startup, the backend MUST call `prune_old_logs()` to delete log files older than 7 days. Additionally, the backend MUST schedule a recurring pruning task using `asyncio.create_task(log_service._pruning_loop())` — see the `_pruning_loop` method in the LogService class (Section 2) which sleeps for 24 hours between runs and reloads from disk to prune in-memory entries. The pruning task MUST be started during the FastAPI lifespan and cancelled on shutdown (see Section 3 for lifespan code).

**FR-2.5:** The log directory MUST be mounted as a Docker volume in `docker-compose.yml` so logs persist across container restarts:
```yaml
volumes:
  - ./backend/logs:/app/logs
```

**FR-2.6:** On startup, the backend MUST load all log entries within the 7-day retention window into memory for fast initial delivery to new WebSocket clients. New entries received via MQTT are appended to the in-memory store and persisted to disk simultaneously.

### FR-3: Backend Log API

**FR-3.1:** The backend MUST expose a WebSocket endpoint at `/ws/logs` for streaming log data to the frontend.

**FR-3.2:** When a client connects to `/ws/logs`, the backend MUST immediately send all in-memory log entries (the full 7-day window) as an initial payload:
```json
{
  "type": "initial",
  "systems": ["primary", "secondary"],
  "logs": {
    "primary": [
      {"ts": "2026-02-08T14:30:05.123456", "line": "..."},
      ...
    ],
    "secondary": [
      {"ts": "2026-02-08T14:30:06.789012", "line": "..."},
      ...
    ]
  }
}
```

**FR-3.3:** After the initial payload, new log entries MUST be pushed to connected clients in real-time as they arrive from MQTT:
```json
{
  "type": "log",
  "system": "primary",
  "entry": {"ts": "2026-02-08T14:30:07.345678", "line": "..."}
}
```

**FR-3.4:** The backend MUST expose a REST endpoint `GET /api/logs/{system}` that returns historical logs with pagination support.

Request (query string parameters):
```
GET /api/logs/primary?days=3&limit=500&offset=0
```
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `days` | int | 7 | `log_retention_days` | Number of days of history to include |
| `limit` | int | 1000 | 5000 | Maximum entries to return |
| `offset` | int | 0 | — | Offset into the filtered result set |

Response (200 OK):
```json
{
  "system": "primary",
  "entries": [...],
  "total": 1234,
  "has_more": true
}
```
- `entries`: Log entries in descending timestamp order (newest first), sliced by `offset` and `limit`
- `total`: Count of all entries within the `days` filter (before pagination)
- `has_more`: `true` if `offset + limit < total`

Error responses:
- `404 Not Found`: Unknown system name — `{"detail": "System not found"}`
- `422 Unprocessable Entity`: Invalid parameter values (FastAPI auto-validation)

**FR-3.5:** The backend MUST expose `GET /api/logs/systems` to return the list of CCA systems that have log data available:
```json
{
  "systems": ["primary", "secondary"]
}
```

### FR-4: Frontend Logs Tab

**FR-4.1:** The dashboard MUST add a fourth main tab labeled "Logs" (with a `ScrollText` lucide icon) to the `TabNavigation` component. The `TabType` union MUST be extended to include `'logs'`.

**FR-4.2:** When only one CCA system has log data, the Logs tab MUST display logs directly without sub-tabs.

**FR-4.3:** When multiple CCA systems have log data, the Logs tab MUST display sub-tabs (e.g., "Primary", "Secondary") allowing the user to switch between systems. Sub-tab labels MUST be the capitalized system name.

**FR-4.4:** Log entries MUST be displayed in descending order by timestamp (most recent at top).

**FR-4.5:** Log messages MUST be displayed as raw, unmodified text in a monospace font. No parsing, coloring, or transformation of the log content.

**FR-4.6:** The log view MUST include a search bar at the top that filters displayed log entries client-side. The search MUST be case-insensitive substring matching across the full log line text.

**FR-4.7:** The search bar MUST have a clear button (X) to reset the filter and a placeholder text: "Search logs (MAC, serial, node ID...)".

**FR-4.8:** New log entries arriving via WebSocket MUST be prepended to the top of the list in real-time. When the user is viewing the top of the log list (newest entries), new entries MUST be immediately visible. When the user has scrolled down to view older entries, new entries MUST be prepended without changing the user's current scroll position (no viewport jump).

**FR-4.9:** The log view MUST display a count of total entries and filtered entries when a search is active (e.g., "Showing 23 of 456 entries").

**FR-4.10:** Each log entry MUST display the timestamp in the user's local timezone, formatted as `HH:MM:SS.mmm` (hours, minutes, seconds, milliseconds) with the full date shown on hover via a title attribute.

**FR-4.11:** The frontend MUST hold all log entries delivered by the backend (up to the full 7-day retention window). Given the low log volume (~200-500 lines/CCA/day, ~3,500 max per CCA for 7 days), no client-side cap is needed.

**FR-4.12:** The `VALID_VIEWS` array in `useUrlParams.ts` MUST be extended to include `"logs"`. The URL parameter `?view=logs` MUST correctly restore the Logs tab on page load, consistent with the existing tab URL synchronization behavior.

**FR-4.13:** The log viewer MUST maintain the accessibility standards established by the existing tab navigation:
- Sub-tabs (when shown) MUST use `role="tablist"` and `role="tab"` with `aria-selected`
- The search input MUST have `aria-label="Search logs"`
- The log entry container MUST use `role="log"` (WAI-ARIA log role for live log regions)
- The clear search button MUST have `aria-label="Clear search"`
- The entry count display MUST use `aria-live="polite"` to announce filter result counts to screen readers

### FR-5: Configuration

**FR-5.1:** The backend `Settings` class MUST add a `log_retention_days` configuration option (default: 7).

**FR-5.2:** The backend `Settings` class MUST add a `log_dir` configuration option (default: `/app/logs`).

**FR-5.3:** *(Removed — no buffer size cap needed given low log volume.)*

**FR-5.4:** When running in mock mode (`use_mock_data=True`), the `LogService` MUST still be created and load any existing logs from disk. The `/ws/logs` WebSocket endpoint MUST function and return an empty initial payload (`systems: []`) if no log files exist. The Logs tab MUST display an empty state message: "No log data available. Connect to live CCA devices to see logs." No synthetic/mock log generation is needed.

## Non-Functional Requirements

**NFR-1.1:** Log storage MUST NOT exceed 10 MB total for 7 days of retention across all CCAs. Estimated volume is ~100-150 KB per CCA per day (~1-2 MB total for 7 days with 2 CCAs). This is well within limits.

**NFR-1.2:** The MQTT log publishing MUST NOT impact the performance of the existing panel data flow. Log messages use QoS 0 and are independent of state/temp_nodes/node_mappings topics.

**NFR-1.3:** The frontend log viewer MUST remain responsive with the full 7-day log history (~3,500 entries per CCA max). The search filter MUST respond within 100ms for typical search terms.

**NFR-1.4:** Log persistence MUST be crash-safe: each log line MUST be followed by `f.flush()` (Python buffer flush to OS). Full `os.fsync()` is NOT required given the ephemeral nature of log data. Partial writes (due to crash mid-line) MUST be handled gracefully on reload by skipping malformed trailing lines (the `json.JSONDecodeError` catch in `load_from_disk()`).

**NFR-1.5:** The Logs tab MUST be lazy-loaded (code-split) like the Layout Editor to avoid increasing the initial bundle size.

## High Level Design

```mermaid
sequenceDiagram
    autonumber
    participant TapTap as TapTap Container<br/>(Raspberry Pi)
    participant Monitor as temp-id-monitor<br/>(Raspberry Pi)
    participant MQTT as MQTT Broker
    participant Backend as Dashboard Backend<br/>(FastAPI)
    participant Disk as Log Files<br/>(/app/logs/)
    participant WS as WebSocket /ws/logs
    participant Frontend as Dashboard Frontend<br/>(React)

    Note over TapTap,Monitor: Log Capture Flow
    TapTap->>Monitor: stdout/stderr (docker logs -f)
    Monitor->>MQTT: publish taptap/{system}/logs<br/>QoS 0, retain=false

    Note over MQTT,Backend: Log Ingestion Flow
    MQTT->>Backend: taptap/+/logs subscription
    Backend->>Disk: Append to {system}/{date}.log (JSONL)
    Backend->>Backend: Add to in-memory log store

    Note over Backend,Frontend: Log Delivery Flow
    Frontend->>WS: Connect to /ws/logs
    WS->>Frontend: Initial payload (buffered entries)
    loop Real-time streaming
        Backend->>WS: New log entry arrives
        WS->>Frontend: Push log entry
        Frontend->>Frontend: Prepend to display list
    end

    Note over Frontend: Client-side search
    Frontend->>Frontend: Filter entries by substring match
```

### Component Architecture

#### 1. Log Publisher (tigo-mqtt side)

The existing `temp-id-monitor` sidecar already reads `docker logs -f` for each taptap container. The log publishing functionality is added to this sidecar by publishing each raw log line to MQTT as it arrives.

The sidecar's `monitor_container` function currently has two phases:
- **Phase 1 (Historical):** Reads all existing logs via `docker logs <container>` — runs BEFORE the MQTT connection is established
- **Phase 2 (Real-time):** Follows new logs via `docker logs -f --since <timestamp> <container>` — runs inside the `async with aiomqtt.Client(...)` context

**MQTT lifecycle change required:** The existing code creates the MQTT client connection only inside the Phase 2 while-loop (`async with aiomqtt.Client(...) as mqtt:`). To publish during Phase 1 (historical replay per FR-1.5), the MQTT connection MUST be established before Phase 1 begins. The `monitor_container` function MUST be restructured to wrap both phases inside the `async with aiomqtt.Client(...)` context:

```python
# Restructured monitor_container():
async def monitor_container(container_name: str, system: str):
    # Phase 1: Collect historical logs (no MQTT needed yet)
    historical_lines = []
    process = await asyncio.create_subprocess_exec(
        "docker", "logs", container_name,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    async for line in process.stdout:
        line_str = line.decode().strip()
        if line_str:
            historical_lines.append(line_str)
            # Existing enumeration parsing continues here unchanged

    last_historical_ts = datetime.now(timezone.utc)

    # Phase 2: Connect MQTT, replay historical, then follow real-time
    while True:
        try:
            async with aiomqtt.Client(
                hostname=MQTT_HOST, port=MQTT_PORT,
                username=MQTT_USER, password=MQTT_PASS,
            ) as mqtt:
                # Replay historical lines over MQTT
                for line_str in historical_lines:
                    log_entry = json.dumps({
                        "ts": last_historical_ts.isoformat(),  # See FR-1.2 note on timestamps
                        "line": line_str,
                    })
                    await mqtt.publish(f"taptap/{system}/logs", log_entry, qos=0, retain=False)
                historical_lines = []  # Free memory after replay

                # Follow new logs from last historical timestamp
                since_ts = last_historical_ts.isoformat()
                process = await asyncio.create_subprocess_exec(
                    "docker", "logs", "-f", "--since", since_ts, container_name,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
                )
                async for line in process.stdout:
                    line_str = line.decode().strip()
                    if line_str:
                        log_entry = json.dumps({
                            "ts": datetime.now(timezone.utc).isoformat(),
                            "line": line_str,
                        })
                        await mqtt.publish(f"taptap/{system}/logs", log_entry, qos=0, retain=False)
                        # Existing enumeration parsing continues here unchanged
        except aiomqtt.MqttError:
            await asyncio.sleep(5)  # Reconnect on MQTT failure
```

**Implementation notes:**
- The existing enumeration logic remains unchanged — log publishing is additive
- All existing error handling MUST be preserved: `FileNotFoundError`/`PermissionError` guards, `errors="replace"` in `decode()` calls, and exception wrappers around subprocess operations. See the existing `monitor_container()` for complete error handling patterns
- Phase 1 enumeration parsing only collects `temp_nodes`/`node_mappings` state into data structures (no MQTT publishing for enumeration)
- Phase 2 MUST publish initial retained state (`temp_nodes`, `node_mappings`) after MQTT connect, as the existing code does
- MQTT client MUST use keyword arguments matching existing configuration: `aiomqtt.Client(hostname=MQTT_HOST, port=MQTT_PORT, username=MQTT_USER, password=MQTT_PASS)`

#### 2. Log Service (backend)

New file: `dashboard/backend/app/log_service.py`

```python
import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class LogService:
    """Manages CCA log ingestion, persistence, and retrieval."""

    def __init__(self, log_dir: str, retention_days: int):
        self.log_dir = Path(log_dir)
        self.retention_days = retention_days
        # Per-system log stores (full 7-day window, loaded from disk on startup)
        self._logs: dict[str, list] = {}
        # WebSocket connections for log streaming
        self._connections: list[WebSocket] = []

    async def ingest(self, system: str, entry: dict) -> None:
        """Ingest a log entry: persist to disk, store in memory, broadcast."""
        # Append to daily log file (run sync I/O in thread to avoid blocking event loop)
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        log_path = self.log_dir / system / f"{date_str}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry) + "\n"
        await asyncio.to_thread(self._write_line, log_path, line)

        # Add to in-memory store
        if system not in self._logs:
            self._logs[system] = []
        self._logs[system].append(entry)

        # Broadcast to connected WebSocket clients
        await self._broadcast_entry(system, entry)

    @staticmethod
    def _write_line(path: Path, line: str) -> None:
        """Write a single line to a log file (sync, runs in thread)."""
        with open(path, "a") as f:
            f.write(line)
            f.flush()

    def add_connection(self, ws: WebSocket) -> None:
        """Add a WebSocket client for log streaming."""
        self._connections.append(ws)

    def remove_connection(self, ws: WebSocket) -> None:
        """Remove a WebSocket client."""
        if ws in self._connections:
            self._connections.remove(ws)

    async def _broadcast_entry(self, system: str, entry: dict) -> None:
        """Push a new log entry to all connected WebSocket clients."""
        msg = json.dumps({"type": "log", "system": system, "entry": entry})
        failed = []
        for ws in self._connections:
            try:
                await ws.send_text(msg)
            except Exception:
                failed.append(ws)
        for ws in failed:
            self.remove_connection(ws)

    async def _pruning_loop(self) -> None:
        """Delete old log files once per day."""
        while True:
            await asyncio.sleep(86400)  # 24 hours
            deleted = self.prune_old_logs()
            if deleted:
                logger.info(f"Pruned {deleted} old log files")
            # Reload from disk to also prune in-memory entries
            self.load_from_disk()

    def get_all_logs(self) -> dict[str, list]:
        """Return all logs by system."""
        return {
            system: list(entries) for system, entries in self._logs.items()
        }

    def get_systems(self) -> list[str]:
        """Return list of systems that have log data."""
        return list(self._logs.keys())

    def prune_old_logs(self) -> int:
        """Delete log files older than retention_days. Returns files deleted."""
        if not self.log_dir.exists():
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        deleted = 0
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            for log_file in system_dir.glob("*.log"):
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d")
                    if file_date.date() < cutoff.date():
                        log_file.unlink()
                        deleted += 1
                except ValueError:
                    pass
        return deleted

    def load_from_disk(self) -> None:
        """On startup, load all log entries within retention window from disk."""
        self.log_dir.mkdir(parents=True, exist_ok=True)
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            system = system_dir.name
            entries = []
            # Read files in chronological order
            log_files = sorted(system_dir.glob("*.log"))
            for log_file in log_files:
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d")
                    if file_date.date() < cutoff.date():
                        continue
                except ValueError:
                    continue
                for raw_line in log_file.read_text().strip().splitlines():
                    try:
                        entries.append(json.loads(raw_line))
                    except json.JSONDecodeError:
                        continue  # Skip malformed lines (NFR-1.4)
            self._logs[system] = entries
```

#### 3. MQTT Integration (backend)

The existing `MQTTClient` class gains a new `on_log` callback parameter and subscribes to `taptap/+/logs`:

```python
# Add on_log parameter to MQTTClient.__init__ (do NOT change existing param types/optionality):
# on_log: Optional[Callable[[str, dict], Awaitable[None]]] = None
# Store as self.on_log = on_log

# In _connect_loop(), add subscription:
logs_topic = f"{settings.mqtt_topic_prefix}/+/logs"
await client.subscribe(logs_topic)

# In message routing, add log handler as an `elif` BEFORE the existing `else` clause
# (the existing chain is if/elif/elif/else — add this as a new elif):
# Note: payload is ALREADY decoded from JSON by the message loop — do not double-decode
elif topic_str.endswith("/logs"):
    system = topic_str.split("/")[1]  # e.g., "primary" from "taptap/primary/logs"
    if self.on_log:
        await self.on_log(system, payload)  # payload is already a dict

# At module level in main.py (alongside existing globals like panel_service, ws_manager, mqtt_client):
# log_service: LogService | None = None

# In main.py lifespan — LogService MUST be created BEFORE the mock mode check:
global log_service
log_service = LogService(settings.log_dir, settings.log_retention_days)
log_service.load_from_disk()
log_service.prune_old_logs()
pruning_task = asyncio.create_task(log_service._pruning_loop())

if settings.use_mock_data:
    # ... existing mock setup (no MQTT client, no on_log callback)
    pass
else:
    mqtt_client = MQTTClient(
        on_message=handle_panel_message,
        on_temp_nodes=handle_temp_nodes,
        on_node_mappings=handle_node_mappings,
        on_log=log_service.ingest,  # NEW
    )

# In lifespan cleanup (after yield), cancel the pruning task alongside existing task cleanup:
# pruning_task.cancel()
# try:
#     await pruning_task
# except asyncio.CancelledError:
#     pass
```

#### 4. WebSocket Endpoint (backend)

New WebSocket endpoint `/ws/logs` in `main.py`:

```python
@app.websocket("/ws/logs")
async def logs_websocket(websocket: WebSocket):
    await websocket.accept()
    log_service.add_connection(websocket)

    try:
        # Send all logs within retention window
        initial = {
            "type": "initial",
            "systems": log_service.get_systems(),
            "logs": log_service.get_all_logs(),
        }
        await websocket.send_json(initial)

        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Log WebSocket error")
    finally:
        log_service.remove_connection(websocket)
```

The `/ws/logs` endpoint MUST use `try/except/finally` for error handling, ensuring connection cleanup always occurs in the `finally` block:
- Both `WebSocketDisconnect` and general `Exception` MUST be caught
- Connection removal MUST happen in a `finally` block to prevent leaks
- The existing `ConnectionManager` heartbeat pattern SHOULD be reused or mirrored for log connections to detect dead clients

#### 5. Frontend Log Viewer

New files:
- `dashboard/frontend/src/components/LogViewer.tsx` - Main log viewer component
- `dashboard/frontend/src/hooks/useLogWebSocket.ts` - WebSocket hook for log streaming

The `LogViewer` component structure:

```
┌─────────────────────────────────────┐
│ [Primary] [Secondary]    ← sub-tabs │  (hidden if single CCA)
├─────────────────────────────────────┤
│ 🔍 Search logs (MAC, serial...)  [X]│  ← search bar
├─────────────────────────────────────┤
│ Showing 23 of 456 entries           │  ← entry count
├─────────────────────────────────────┤
│ 14:30:07.345 Permanently enum...    │  ← log entries (newest first)
│ 14:30:06.789 Node 3 online          │
│ 14:30:05.123 Infrastructure re...   │
│ ...                                 │
└─────────────────────────────────────┘
```

The `useLogWebSocket` hook follows the same pattern as the existing `useWebSocket` hook:

```typescript
function getLogWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    // VITE_WS_URL may be a host URL (e.g., ws://host:port) — extract base and append log path
    const base = import.meta.env.VITE_WS_URL.replace(/\/ws\/.*$/, '');
    return `${base}/ws/logs`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/logs`;
}
```
Note: The regex `/\/ws\/.*$/` strips any existing `/ws/...` path suffix, making this robust regardless of whether `VITE_WS_URL` ends with `/ws/panels`, `/ws`, or has no path.

### Log File Size Estimates

| Metric | Value |
|--------|-------|
| Avg log line length | ~100 bytes |
| Lines per CCA per day (typical) | ~200-500 |
| Daily file size per CCA | ~20-50 KB |
| 7 days, 2 CCAs | ~280-700 KB |
| Maximum (heavy error days) | ~2-3 MB total |
| In-memory store (full 7 days/CCA) | ~280-700 KB |

## Task Breakdown

### Task 1: Log Publishing in temp-id-monitor

**Files:** `tigo-mqtt/temp-id-monitor/temp_id_monitor.py`

1. Add log line publishing to `monitor_container()` for both Phase 1 (historical) and Phase 2 (real-time)
2. Publish each line as JSON `{"ts": ..., "line": ...}` to `taptap/{system}/logs`
3. Use QoS 0, retain=false
4. Ensure no duplicate lines during phase transition

### Task 2: Backend Log Service

**Files:** `dashboard/backend/app/log_service.py` (new)

1. Create `LogService` class with ingestion, disk persistence, and pruning
2. JSONL file format, one file per system per day
3. Startup: load all entries within 7-day window from disk into memory
4. Daily pruning of files older than 7 days

### Task 3: Backend MQTT + WebSocket Integration

**Files:** `dashboard/backend/app/mqtt_client.py`, `dashboard/backend/app/main.py`, `dashboard/backend/app/config.py`

1. Add `on_log` callback to `MQTTClient` and subscribe to `taptap/+/logs`
2. Add `log_retention_days`, `log_dir` to `Settings`
3. Create `LogService` instance in `main.py` lifespan
4. Add `/ws/logs` WebSocket endpoint with initial payload + real-time push
5. Add `GET /api/logs/systems` and `GET /api/logs/{system}` REST endpoints
6. Add log volume mount to `docker-compose.yml`

### Task 4: Frontend Logs Tab

**Files:** `dashboard/frontend/src/components/LogViewer.tsx` (new), `dashboard/frontend/src/hooks/useLogWebSocket.ts` (new), `dashboard/frontend/src/components/TabNavigation.tsx`, `dashboard/frontend/src/components/Dashboard.tsx`

1. Create `useLogWebSocket` hook following existing `useWebSocket` pattern
2. Create `LogViewer` component with:
   - Sub-tabs for multiple CCA systems (hidden for single CCA)
   - Search bar with clear button
   - Descending timestamp log list in monospace font
   - Entry count display
   - Scroll position preservation on new entries
3. Extend `TabType` to include `'logs'`
4. Add Logs tab to `TabNavigation` (both mobile and desktop)
5. Add Logs tab routing in `Dashboard.tsx` (lazy-loaded). Note: The existing ternary chain in Dashboard.tsx that renders content based on `activeTab` MUST be updated to explicitly handle all four tab types — the current fallback `else` clause assumes editor, which would incorrectly render the editor for the logs tab.

### Task 5: Playwright Verification

1. Build and deploy containers
2. Navigate to Logs tab, verify it loads (including via `?view=logs` URL param)
3. Verify search filtering works and entry count updates (e.g., "Showing 23 of 456 entries")
4. Verify sub-tab switching (if multiple CCAs)
5. Verify real-time log entry appearance (new entries prepend to top)
6. Verify scroll position is preserved when new entries arrive while scrolled down
7. Verify timestamps display in local timezone as `HH:MM:SS.mmm` format
8. Verify the Logs tab shows an appropriate empty state when no log data exists
9. Verify `GET /api/logs/systems` returns the correct system list
10. Verify search clear button (X) resets the filter

## Related Specifications

| Spec | Relationship | Notes |
|------|--------------|-------|
| None | — | First spec in this project |

## Context / Documentation

- `tigo-mqtt/temp-id-monitor/temp_id_monitor.py` — Sidecar that reads taptap container logs (will be extended for log publishing)
- `dashboard/backend/app/mqtt_client.py` — Backend MQTT subscription handler (will add `taptap/+/logs`)
- `dashboard/backend/app/main.py` — FastAPI app with lifespan, WebSocket endpoints
- `dashboard/backend/app/websocket_manager.py` — Existing WebSocket broadcast pattern
- `dashboard/backend/app/config.py` — Pydantic settings class
- `dashboard/frontend/src/hooks/useWebSocket.ts` — Existing WebSocket hook pattern to follow
- `dashboard/frontend/src/components/TabNavigation.tsx` — Tab navigation (currently 3 tabs)
- `dashboard/frontend/src/components/Dashboard.tsx` — Main dashboard with tab routing
- `dashboard/docker-compose.yml` — Container orchestration (add log volume mount)
- `tigo-mqtt/docker-compose.yml` — taptap containers (no changes needed, temp-id-monitor already has docker socket access)
- Home Assistant MQTT docs — Confirms HA only creates entities via discovery topics (`homeassistant/...`) or explicit configuration; arbitrary topics like `taptap/*/logs` are invisible to HA

---

**Specification Version:** 1.0
**Last Updated:** February 2026
**Authors:** Ian, Claude

## Changelog

### v1.0 (February 2026)
**Summary:** Initial specification

**Changes:**
- Initial specification created
