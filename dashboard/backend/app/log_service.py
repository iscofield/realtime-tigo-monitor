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


class LogEntry(TypedDict):
    ts: str
    line: str
    seq: int


class LogService:
    """Manages CCA log ingestion, persistence, and retrieval."""

    def __init__(self, log_dir: str, retention_days: int):
        self.log_dir = Path(log_dir)
        self.retention_days = retention_days
        self._logs: dict[str, list[LogEntry]] = {}
        self._connections: set[WebSocket] = set()
        self._last_seq: dict[str, int] = {}

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

    def add_connection(self, ws: WebSocket) -> None:
        self._connections.add(ws)

    def remove_connection(self, ws: WebSocket) -> None:
        self._connections.discard(ws)

    async def _broadcast_entry(self, system: str, entry: dict) -> None:
        msg = json.dumps({"type": "log", "system": system, "entry": entry})
        connections = set(self._connections)
        if not connections:
            return
        results = await asyncio.gather(
            *[ws.send_text(msg) for ws in connections],
            return_exceptions=True,
        )
        for ws, result in zip(connections, results):
            if isinstance(result, Exception):
                logger.debug(f"Removing log WS client after send error: {result}")
                self._connections.discard(ws)

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
                            entries.append(data)
                        else:
                            logger.debug(f"Skipping invalid entry in {log_file}")
            if entries:
                self._logs[system] = entries
