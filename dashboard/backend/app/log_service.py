import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypedDict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Allowlist pattern for system names — alphanumeric, hyphens, underscores only
VALID_SYSTEM_RE = re.compile(r"^[a-zA-Z0-9_-]+$")

# Pattern to extract log level from taptap log lines
# Formats: "2026-02-08 11:06:43 INFO     message text"
#           "2026-02-08 21:36:18.913 DEBUG: message text"
LEVEL_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL):?\s+",
    re.IGNORECASE,
)

LEVEL_VALUES = {
    "debug": 10,
    "info": 20,
    "warning": 30,
    "error": 40,
    "critical": 50,
}

# Log categories for filtering
CATEGORY_SENSOR_RESET = "sensor_reset"
CATEGORY_TELEMETRY_JSON = "telemetry_json"
CATEGORY_POLLING = "polling"
CATEGORY_NODE_STATUS = "node_status"
CATEGORY_MQTT = "mqtt"
CATEGORY_GENERAL = "general"

# Categories that are always hidden (never sent to clients)
ALWAYS_HIDDEN = {CATEGORY_SENSOR_RESET}

# All filterable categories with human-readable labels and defaults
FILTERABLE_CATEGORIES = {
    CATEGORY_TELEMETRY_JSON: {"label": "Telemetry dumps", "default": False},
    CATEGORY_POLLING: {"label": "Polling loop", "default": False},
    CATEGORY_NODE_STATUS: {"label": "Node status", "default": True},
    CATEGORY_MQTT: {"label": "MQTT messages", "default": True},
}

# Pre-compiled patterns for category classification
_NODE_STATUS_RE = re.compile(r"^Node \w+ is (?:offline|online)")
_RESET_PREFIXES = (
    "Calling reset_node_sensor",
    "Calling reset_stat_sensor",
    "Calling reset_sensor_integral",
    "Calling reset_stats_tele",
)
_POLLING_EXACT = {"stats file updated"}
_POLLING_PREFIXES = ("Calling run_file", "Calling taptap_tele")


class LogEntry(TypedDict):
    ts: str
    line: str
    seq: int
    level: str


class LogService:
    """Manages CCA log ingestion, persistence, and retrieval."""

    def __init__(self, log_dir: str, retention_days: int):
        self.log_dir = Path(log_dir)
        self.retention_days = retention_days
        self._logs: dict[str, list[LogEntry]] = {}
        self._connections: dict[WebSocket, tuple[int, set[str]]] = {}  # ws → (min_level_value, excluded_categories)
        self._last_seq: dict[str, int] = {}
        self._has_debug: dict[str, bool] = {}

    @staticmethod
    def _parse_level(line: str) -> str:
        """Extract log level from a taptap log line. Defaults to 'info'."""
        m = LEVEL_RE.match(line)
        return m.group(1).lower() if m else "info"

    @staticmethod
    def _classify_category(line: str) -> str:
        """Classify a log line into a category for filtering."""
        # Strip timestamp+level prefix to get message body
        m = re.match(
            r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\w+:?\s+(.*)",
            line,
        )
        msg = m.group(1) if m else line

        if msg.startswith(_RESET_PREFIXES):
            return CATEGORY_SENSOR_RESET
        if msg.startswith("{") and '"nodes"' in msg:
            return CATEGORY_TELEMETRY_JSON
        if msg in _POLLING_EXACT or msg.startswith(_POLLING_PREFIXES):
            return CATEGORY_POLLING
        if _NODE_STATUS_RE.match(msg) or "nodes reported online" in msg or "nodes were find identified" in msg:
            return CATEGORY_NODE_STATUS
        if "MQTT" in msg or "mqtt" in msg:
            return CATEGORY_MQTT
        return CATEGORY_GENERAL

    @staticmethod
    def _validate_system(system: str) -> bool:
        """Validate system name against allowlist to prevent path traversal."""
        return bool(VALID_SYSTEM_RE.match(system)) and len(system) <= 64

    async def ingest(self, system: str, entry: dict) -> bool:
        """Ingest a log entry: persist to disk, store in memory, broadcast.
        Returns True if accepted, False if validation failed.
        """
        if not self._validate_system(system):
            logger.warning(f"Rejected log entry with invalid system name: {system!r}")
            return False

        if (
            not isinstance(entry, dict)
            or not isinstance(entry.get("ts"), str)
            or not entry.get("ts")
            or not isinstance(entry.get("line"), str)
            or not isinstance(entry.get("seq"), int)
            or entry.get("seq") < 0
        ):
            logger.warning(f"Rejected log entry with invalid schema: {entry!r}")
            return False

        # Detect seq gaps and publisher restarts
        prev = self._last_seq.get(system)
        if prev is not None:
            if entry["seq"] < prev:
                logger.info(f"Publisher restart detected for {system} (seq {entry['seq']} < {prev})")
            elif entry["seq"] != prev + 1:
                logger.warning(f"Seq gap for {system}: expected {prev + 1}, got {entry['seq']}")
        self._last_seq[system] = entry["seq"]

        # Parse and attach level before persisting
        if not entry.get("level"):
            entry["level"] = self._parse_level(entry.get("line", ""))
        if entry["level"] == "debug":
            self._has_debug[system] = True

        # Classify category
        if not entry.get("category"):
            entry["category"] = self._classify_category(entry.get("line", ""))

        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        log_path = self.log_dir / system / f"{date_str}.log"
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            line = json.dumps(entry) + "\n"
            self._write_line(log_path, line)
        except OSError as e:
            logger.error(f"Failed to write log entry to {log_path}: {e}")

        if system not in self._logs:
            self._logs[system] = []
        self._logs[system].append(entry)

        await self._broadcast_entry(system, entry)
        return True

    @staticmethod
    def _write_line(path: Path, line: str) -> None:
        """Write a single line to a log file (synchronous, inline on event loop)."""
        with open(path, "a") as f:
            f.write(line)
            f.flush()

    def add_connection(self, ws: WebSocket, min_level: str = "info", excluded_categories: set[str] | None = None) -> None:
        self._connections[ws] = (LEVEL_VALUES.get(min_level, 20), excluded_categories or set())

    def remove_connection(self, ws: WebSocket) -> None:
        self._connections.pop(ws, None)

    async def _broadcast_entry(self, system: str, entry: dict) -> None:
        entry_level_value = LEVEL_VALUES.get(entry.get("level", "info"), 20)
        entry_cat = entry.get("category", CATEGORY_GENERAL)
        # Never broadcast always-hidden categories
        if entry_cat in ALWAYS_HIDDEN:
            return
        msg = json.dumps({"type": "log", "system": system, "entry": entry})
        # Filter connections by level and excluded categories
        targets = [
            ws for ws, (min_val, excluded) in self._connections.items()
            if entry_level_value >= min_val and entry_cat not in excluded
        ]
        if not targets:
            return
        results = await asyncio.gather(
            *[ws.send_text(msg) for ws in targets],
            return_exceptions=True,
        )
        for ws, result in zip(targets, results):
            if isinstance(result, Exception):
                logger.debug(f"Removing log WS client after send error: {result}")
                self._connections.pop(ws, None)

    async def _pruning_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(86400)
                deleted = self.prune_old_logs()
                if deleted:
                    logger.info(f"Pruned {deleted} old log files")
                self._prune_memory()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in pruning loop")

    def _prune_memory(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        cutoff_str = cutoff.isoformat()
        for system in list(self._logs.keys()):
            self._logs[system] = [
                e for e in self._logs[system]
                if e.get("ts", "") >= cutoff_str
            ]
            if not self._logs[system]:
                del self._logs[system]
                self._last_seq.pop(system, None)

    def get_all_logs(self) -> dict[str, list[LogEntry]]:
        return {
            system: list(entries) for system, entries in self._logs.items()
        }

    def get_logs_for_system(self, system: str) -> list[LogEntry]:
        return list(self._logs.get(system, []))

    def get_systems(self) -> list[str]:
        return list(self._logs.keys())

    def get_has_debug(self) -> dict[str, bool]:
        return dict(self._has_debug)

    @staticmethod
    def filter_by_level(entries: list[LogEntry], min_level: str) -> list[LogEntry]:
        """Filter entries to those at or above the given level."""
        min_val = LEVEL_VALUES.get(min_level, 20)
        if min_val <= 10:  # debug — no filtering needed
            return entries
        return [e for e in entries if LEVEL_VALUES.get(e.get("level", "info"), 20) >= min_val]

    @staticmethod
    def filter_by_category(entries: list[LogEntry], excluded: set[str]) -> list[LogEntry]:
        """Remove entries whose category is in the excluded set or always hidden."""
        hide = excluded | ALWAYS_HIDDEN
        return [e for e in entries if e.get("category", CATEGORY_GENERAL) not in hide]

    def prune_old_logs(self) -> int:
        if not self.log_dir.exists():
            return 0
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        cutoff_date = cutoff.date()
        deleted = 0
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            for log_file in system_dir.glob("*.log"):
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                    if file_date < cutoff_date:
                        log_file.unlink()
                        deleted += 1
                except ValueError:
                    pass
            try:
                if system_dir.is_dir() and not any(system_dir.iterdir()):
                    system_dir.rmdir()
            except OSError:
                pass
        return deleted

    def load_from_disk(self) -> None:
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.error(f"Cannot create log directory {self.log_dir}: {e}")
            return
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.retention_days)
        cutoff_date = cutoff.date()
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            system = system_dir.name
            if not self._validate_system(system):
                logger.warning(f"Skipping invalid system directory: {system!r}")
                continue
            entries: list[LogEntry] = []
            has_debug = False
            log_files = sorted(system_dir.glob("*.log"))
            for log_file in log_files:
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                    if file_date < cutoff_date:
                        continue
                except ValueError:
                    continue
                with open(log_file, "r") as f:
                    for raw_line in f:
                        raw_line = raw_line.strip()
                        if not raw_line:
                            continue
                        try:
                            data = json.loads(raw_line)
                        except json.JSONDecodeError:
                            logger.debug(f"Skipping malformed line in {log_file}")
                            continue
                        if (
                            isinstance(data, dict)
                            and isinstance(data.get("ts"), str)
                            and data.get("ts")
                            and isinstance(data.get("line"), str)
                            and isinstance(data.get("seq"), int)
                            and data.get("seq") >= 0
                        ):
                            # Always re-parse level from line text on load
                            data["level"] = self._parse_level(data.get("line", ""))
                            if data["level"] == "debug":
                                has_debug = True
                            # Classify category
                            data["category"] = self._classify_category(data.get("line", ""))
                            entries.append(data)
                        else:
                            logger.debug(f"Skipping invalid entry in {log_file}")
            if entries:
                self._logs[system] = entries
                if has_debug:
                    self._has_debug[system] = True
