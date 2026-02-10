import asyncio
import json
import logging
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypedDict, NotRequired
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

VALID_LOG_LEVELS: set[str] = set(LEVEL_VALUES.keys())

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

MAX_DISK_QUERY_ENTRIES: int = 50_000

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
    level: NotRequired[str]
    category: NotRequired[str]


class LogService:
    """Manages CCA log ingestion, persistence, and retrieval."""

    def __init__(self, log_dir: str, retention: timedelta, buffer_size: int = 500):
        self.log_dir = Path(log_dir)
        self.retention = retention
        self.buffer_size = buffer_size
        self._logs: dict[str, deque[LogEntry]] = {}
        self._connections: dict[WebSocket, tuple[int, set[str]]] = {}  # ws → (min_level_value, excluded_categories)
        self._last_seq: dict[str, int] = {}
        self._has_debug: dict[str, bool] = {}
        self._last_disk_warning_time: float = 0.0

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
        except OSError:
            now = time.monotonic()
            if now - self._last_disk_warning_time > 60:
                logger.warning(f"Disk write failed for {system}, continuing in-memory only")
                self._last_disk_warning_time = now

        if system not in self._logs:
            self._logs[system] = deque(maxlen=self.buffer_size)
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

    def _compute_prune_interval(self) -> float:
        total_seconds = self.retention.total_seconds()
        if total_seconds >= 86400:
            return 86400.0
        elif total_seconds >= 3600:
            return 3600.0
        else:
            return 600.0

    async def _pruning_loop(self) -> None:
        interval = self._compute_prune_interval()
        while True:
            try:
                await asyncio.sleep(interval)
                deleted = self.prune_old_logs()
                if deleted:
                    logger.info(f"Pruned {deleted} old log files")
                self._prune_memory()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in pruning loop")

    def _prune_memory(self) -> None:
        """Remove expired entries and clean up empty systems.

        CRITICAL: Must rebuild as deque(maxlen=...), NOT a list.
        Using a list comprehension without wrapping in deque() would
        silently revert to unbounded memory growth.
        """
        cutoff = datetime.now(timezone.utc) - self.retention
        cutoff_str = cutoff.isoformat()
        empty_systems = []
        for system, buf in self._logs.items():
            pruned = deque(
                (e for e in buf if e.get("ts", "") >= cutoff_str),
                maxlen=self.buffer_size,
            )
            self._logs[system] = pruned
            if not pruned:
                empty_systems.append(system)
        for system in empty_systems:
            del self._logs[system]
            self._has_debug.pop(system, None)
            self._last_seq.pop(system, None)

    def get_all_logs(self) -> dict[str, list[LogEntry]]:
        return {
            system: list(entries) for system, entries in self._logs.items()
        }

    def get_logs_for_system(self, system: str) -> list[LogEntry]:
        return list(self._logs.get(system, []))

    def get_systems(self) -> list[str]:
        """Return merged system list from buffer + disk."""
        buffer_systems = set(self._logs.keys())
        disk_systems = set(self.get_disk_systems())
        return sorted(buffer_systems | disk_systems)

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
        cutoff = datetime.now(timezone.utc) - self.retention
        safe_cutoff_date = cutoff.date() - timedelta(days=1)
        deleted = 0
        empty_dirs = []
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            if not self._validate_system(system_dir.name):
                continue
            for log_file in list(system_dir.glob("*.log")):
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                except ValueError:
                    continue
                if file_date < safe_cutoff_date:
                    try:
                        log_file.unlink()
                        deleted += 1
                    except OSError:
                        logger.warning(f"Cannot delete {log_file}")
            if not any(system_dir.iterdir()):
                try:
                    system_dir.rmdir()
                    empty_dirs.append(system_dir.name)
                except OSError:
                    pass
        return deleted

    def load_from_disk(self) -> None:
        """On startup, populate the capped buffer with the most recent entries."""
        try:
            self.log_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            logger.error(f"Cannot create log directory {self.log_dir}: {e}")
            return
        cutoff = datetime.now(timezone.utc) - self.retention
        cutoff_date = cutoff.date()
        cutoff_str = cutoff.isoformat()
        for system_dir in self.log_dir.iterdir():
            if not system_dir.is_dir():
                continue
            system = system_dir.name
            if not self._validate_system(system):
                logger.warning(f"Skipping invalid system directory: {system!r}")
                continue
            buf: deque[LogEntry] = deque(maxlen=self.buffer_size)
            has_debug = False
            for log_file in sorted(system_dir.glob("*.log")):
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                    if file_date < cutoff_date:
                        continue
                except ValueError:
                    continue
                try:
                    f = open(log_file, "r")
                except OSError:
                    logger.warning(f"Cannot open {log_file}, skipping")
                    continue
                with f:
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
                            and type(data.get("seq")) is int
                            and data.get("seq") >= 0
                        ):
                            if data.get("ts", "") < cutoff_str:
                                continue
                            data["level"] = self._parse_level(data.get("line", ""))
                            if data["level"] == "debug":
                                has_debug = True
                            data["category"] = self._classify_category(data.get("line", ""))
                            buf.append(data)
            if buf:
                self._logs[system] = buf
                last_entry = buf[-1]
                self._last_seq[system] = last_entry["seq"]
                if has_debug:
                    self._has_debug[system] = True

    def query_logs_from_disk(
        self,
        system: str,
        retention: timedelta | None = None,
        min_level: str = "info",
        excluded_categories: set[str] | None = None,
    ) -> tuple[list[LogEntry], bool]:
        """Read and filter log entries from JSONL files on disk.

        Returns a tuple of (entries sorted by timestamp descending, capped)
        where `capped` is True if the 50,000 entry cap was reached.
        If retention is None, uses self.retention.
        """
        if not self._validate_system(system):
            return ([], False)
        system_dir = self.log_dir / system
        if not system_dir.is_dir():
            return ([], False)

        cutoff = datetime.now(timezone.utc) - (retention or self.retention)
        cutoff_date = cutoff.date()
        cutoff_str = cutoff.isoformat()
        excluded = excluded_categories or set()

        MAX_ENTRIES = MAX_DISK_QUERY_ENTRIES
        entries: list[LogEntry] = []
        # Read files in REVERSE chronological order (newest first) so that
        # if the 50K cap triggers, we keep the most recent entries.
        for log_file in sorted(system_dir.glob("*.log"), reverse=True):
            try:
                file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                if file_date < cutoff_date:
                    continue
            except ValueError:
                continue
            try:
                f = open(log_file, "r")
            except OSError:
                logger.warning(f"Cannot open {log_file}, skipping")
                continue
            with f:
                for raw_line in f:
                    raw_line = raw_line.strip()
                    if not raw_line:
                        continue
                    try:
                        data = json.loads(raw_line)
                    except json.JSONDecodeError:
                        logger.debug(f"Skipping malformed line in {log_file}")
                        continue
                    if not (
                        isinstance(data, dict)
                        and isinstance(data.get("ts"), str)
                        and data.get("ts")
                        and isinstance(data.get("line"), str)
                        and type(data.get("seq")) is int
                        and data.get("seq") >= 0
                    ):
                        continue
                    # Always re-parse level and category for consistency
                    data["level"] = self._parse_level(data.get("line", ""))
                    data["category"] = self._classify_category(data.get("line", ""))
                    # Apply timestamp cutoff
                    if data.get("ts", "") < cutoff_str:
                        continue
                    # Apply level filter
                    entry_level_val = LEVEL_VALUES.get(data.get("level", "info"), 20)
                    min_level_val = LEVEL_VALUES.get(min_level, 20)
                    if entry_level_val < min_level_val:
                        continue
                    # Apply category filter
                    entry_cat = data.get("category", CATEGORY_GENERAL)
                    if entry_cat in ALWAYS_HIDDEN or entry_cat in excluded:
                        continue
                    entries.append(data)
                    if len(entries) >= MAX_ENTRIES:
                        break
            if len(entries) >= MAX_ENTRIES:
                break

        capped = len(entries) >= MAX_ENTRIES
        # Sort newest first
        entries.sort(key=lambda e: e.get("ts", ""), reverse=True)
        return entries, capped

    def get_disk_systems(self) -> list[str]:
        """Return system names that have log directories on disk."""
        if not self.log_dir.exists():
            return []
        systems = []
        for d in self.log_dir.iterdir():
            if d.is_dir() and self._validate_system(d.name):
                if any(d.glob("*.log")):
                    systems.append(d.name)
        return systems
