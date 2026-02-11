import asyncio
import ctypes
import gc
import json
import logging
import os
import re
import resource
import sys
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TextIO, TypedDict, NotRequired
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

    def __init__(self, log_dir: str, retention: timedelta, buffer_size: int = 500,
                 mem_soft_limit_mb: int = 150, mem_hard_limit_mb: int = 500):
        self.log_dir = Path(log_dir)
        self.retention = retention
        self.buffer_size = buffer_size
        self.mem_soft_limit_mb = mem_soft_limit_mb
        self.mem_hard_limit_mb = mem_hard_limit_mb
        self._logs: dict[str, deque[LogEntry]] = {}
        self._connections: dict[WebSocket, tuple[int, set[str]]] = {}  # ws → (min_level_value, excluded_categories)
        self._last_seq: dict[str, int] = {}
        self._has_debug: dict[str, bool] = {}
        self._last_disk_warning_time: float = 0.0
        # Persistent file handles for write path (avoids open/close per entry)
        self._write_handles: dict[str, TextIO] = {}  # "system/date" → file handle

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
        line = json.dumps(entry) + "\n"
        try:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(self._write_line, log_path, line, system, date_str)
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

    def _write_line(self, path: Path, line: str, system: str, date_str: str) -> None:
        """Write a single line to a log file.

        Keeps file handles open to avoid open/close per entry.
        Called via asyncio.to_thread to avoid blocking the event loop.
        """
        handle_key = f"{system}/{date_str}"
        fh = self._write_handles.get(handle_key)
        if fh is None or fh.closed:
            # Close any stale handle for this system (previous date)
            for key in list(self._write_handles):
                if key.startswith(f"{system}/") and key != handle_key:
                    try:
                        self._write_handles.pop(key).close()
                    except OSError:
                        pass
            fh = open(path, "a")
            self._write_handles[handle_key] = fh
        fh.write(line)
        fh.flush()

    @staticmethod
    def _reverse_readline(filepath: Path, buf_size: int = 65536):
        """Yield lines from a file in reverse order (last line first).

        Reads in chunks from the end, so only as much of the file is read
        as needed.  Ideal for getting the most recent log entries without
        loading the entire file into memory.
        """
        with open(filepath, "rb") as f:
            f.seek(0, 2)  # seek to end
            remaining = f.tell()
            if remaining == 0:
                return

            carry = b""
            while remaining > 0:
                read_size = min(buf_size, remaining)
                remaining -= read_size
                f.seek(remaining)
                block = f.read(read_size) + carry
                lines = block.split(b"\n")

                # First element may be a partial line if not at file start
                if remaining > 0:
                    carry = lines[0]
                    start = 1
                else:
                    carry = b""
                    start = 0

                for i in range(len(lines) - 1, start - 1, -1):
                    line = lines[i].strip()
                    if line:
                        yield line.decode("utf-8", errors="replace")

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

    @staticmethod
    def _get_rss_mb() -> float:
        """Return current RSS in MB. Uses /proc on Linux, ru_maxrss on macOS."""
        try:
            # Linux: read current RSS from /proc (not peak)
            with open("/proc/self/status") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        return int(line.split()[1]) / 1024  # KB → MB
        except FileNotFoundError:
            pass
        # macOS fallback: ru_maxrss (peak, in bytes)
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return rss / (1024 * 1024)

    def _try_release_memory(self, rss_mb: float) -> float:
        """Attempt to release memory back to the OS. Returns new RSS."""
        logger.warning(
            f"[mem] RSS={rss_mb:.1f}MB exceeds soft limit "
            f"({self.mem_soft_limit_mb}MB) — attempting remediation"
        )
        # 1. Force Python garbage collection
        gc.collect()
        # 2. Prune expired entries from in-memory buffers
        self._prune_memory()
        # 3. Close all file handles (they'll reopen on next write)
        for key in list(self._write_handles):
            try:
                self._write_handles.pop(key).close()
            except OSError:
                pass
        # 4. Tell glibc to release free pages back to OS (Linux only)
        try:
            libc = ctypes.CDLL("libc.so.6")
            libc.malloc_trim(0)
            logger.info("[mem] malloc_trim(0) called")
        except (OSError, AttributeError):
            pass  # not Linux / glibc
        new_rss = self._get_rss_mb()
        logger.info(f"[mem] after remediation: RSS={new_rss:.1f}MB")
        return new_rss

    async def _memory_monitor_loop(self) -> None:
        """Periodically log RSS and buffer stats. Takes action on threshold breach."""
        while True:
            try:
                await asyncio.sleep(60)  # every 60s during debugging
                rss_mb = self._get_rss_mb()
                peak_bytes = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                if os.uname().sysname == "Darwin":
                    peak_mb = peak_bytes / (1024 * 1024)
                else:
                    peak_mb = peak_bytes / 1024
                buf_entries = sum(len(d) for d in self._logs.values())
                ws_clients = len(self._connections)
                open_handles = len(self._write_handles)
                logger.info(
                    f"[mem] RSS={rss_mb:.1f}MB  peak={peak_mb:.1f}MB  "
                    f"buf_entries={buf_entries}  "
                    f"ws_clients={ws_clients}  "
                    f"open_handles={open_handles}  "
                    f"systems={len(self._logs)}"
                )
                # Soft limit: try to free memory
                if self.mem_soft_limit_mb and rss_mb > self.mem_soft_limit_mb:
                    rss_mb = self._try_release_memory(rss_mb)
                # Hard limit: force exit (Docker restart: unless-stopped will revive us)
                if self.mem_hard_limit_mb and rss_mb > self.mem_hard_limit_mb:
                    logger.critical(
                        f"[mem] RSS={rss_mb:.1f}MB still exceeds hard limit "
                        f"({self.mem_hard_limit_mb}MB) after remediation — "
                        f"forcing exit for container restart"
                    )
                    os._exit(1)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in memory monitor loop")

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
        """On startup, populate the capped buffer with the most recent entries.

        Uses reverse file reading to collect only buffer_size entries from
        the newest files, avoiding iteration through millions of old lines.
        """
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
            entries: list[LogEntry] = []
            has_debug = False
            done = False
            # Process files newest-first; read lines from end of each file
            for log_file in sorted(system_dir.glob("*.log"), reverse=True):
                try:
                    file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                    if file_date < cutoff_date:
                        continue
                except ValueError:
                    continue
                for raw_line in self._reverse_readline(log_file):
                    try:
                        data = json.loads(raw_line)
                    except json.JSONDecodeError:
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
                    if data["ts"] < cutoff_str:
                        break  # remaining entries in this file are older
                    data["level"] = self._parse_level(data.get("line", ""))
                    if data["level"] == "debug":
                        has_debug = True
                    data["category"] = self._classify_category(data.get("line", ""))
                    entries.append(data)
                    if len(entries) >= self.buffer_size:
                        done = True
                        break
                if done:
                    break
            if entries:
                # entries are newest-first; reverse to chronological for the deque
                entries.reverse()
                buf: deque[LogEntry] = deque(entries, maxlen=self.buffer_size)
                self._logs[system] = buf
                self._last_seq[system] = buf[-1]["seq"]
                if has_debug:
                    self._has_debug[system] = True

    def query_logs_from_disk(
        self,
        system: str,
        retention: timedelta | None = None,
        min_level: str = "info",
        excluded_categories: set[str] | None = None,
        offset: int = 0,
        limit: int = 200,
    ) -> tuple[list[LogEntry], bool]:
        """Read and filter log entries from JSONL files on disk.

        Uses reverse file reading so that only as much data as needed is
        actually read.  Returns ``(entries_newest_first, has_more)``.
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
        min_level_val = LEVEL_VALUES.get(min_level, 20)

        entries: list[LogEntry] = []
        skipped = 0
        need = limit + 1  # collect one extra to detect has_more

        for log_file in sorted(system_dir.glob("*.log"), reverse=True):
            try:
                file_date = datetime.strptime(log_file.stem, "%Y-%m-%d").date()
                if file_date < cutoff_date:
                    continue
            except ValueError:
                continue

            for raw_line in self._reverse_readline(log_file):
                try:
                    data = json.loads(raw_line)
                except json.JSONDecodeError:
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
                data["level"] = self._parse_level(data.get("line", ""))
                data["category"] = self._classify_category(data.get("line", ""))
                if data["ts"] < cutoff_str:
                    break  # remaining entries in this file are older
                if LEVEL_VALUES.get(data["level"], 20) < min_level_val:
                    continue
                entry_cat = data.get("category", CATEGORY_GENERAL)
                if entry_cat in ALWAYS_HIDDEN or entry_cat in excluded:
                    continue

                # Pagination: skip `offset` entries, then collect `limit`
                if skipped < offset:
                    skipped += 1
                    continue
                entries.append(data)
                if len(entries) >= need:
                    # Got limit+1 → there are more entries on disk
                    return (entries[:limit], True)

            # If we've filled the page, stop reading more files
            if len(entries) >= need:
                return (entries[:limit], True)

        return (entries, False)

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

    def has_older_on_disk(self, system: str) -> bool:
        """Fast check: are there log entries on disk beyond the in-memory buffer?"""
        system_dir = self.log_dir / system
        if not system_dir.is_dir():
            return False
        buf = self._logs.get(system)
        # If the buffer is at capacity, there are almost certainly more on disk
        if buf and len(buf) >= self.buffer_size:
            return True
        # Otherwise check if any log files exist at all
        return any(system_dir.glob("*.log"))
