#!/usr/bin/env python3
"""
Temporary ID Monitor Sidecar

Monitors taptap container logs for enumeration events and publishes:
1. The current list of temporarily-enumerated node IDs (temp_nodes topic)
2. Node ID → serial number mappings (node_mappings topic)

This helps detect panels with incorrect IDs and provides node_id data
that isn't available in the standard taptap-mqtt messages.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Set

try:
    import aiomqtt
except ModuleNotFoundError:  # pure helpers (parsing/merge) stay importable for unit tests
    aiomqtt = None

# Configuration via environment variables
# Support both MQTT_HOST and MQTT_SERVER for compatibility
MQTT_HOST = os.environ.get("MQTT_HOST") or os.environ.get("MQTT_SERVER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER")
MQTT_PASS = os.environ.get("MQTT_PASS")
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "taptap")

MAX_LINE_LENGTH = 10240

# Max lines to load from container history on startup (override with HISTORY_TAIL_LINES env var)
HISTORY_TAIL_LINES = int(os.environ.get("HISTORY_TAIL_LINES", "2000"))

# Directory for the persistent node_id -> serial cache (FR-2). Regenerable;
# this is NOT taptap.state — losing it only triggers re-learning from logs.
CACHE_DIR = os.environ.get("CACHE_DIR", "/data")
# Interval (seconds) for the idle re-publish + state cross-check tick (FR-5.2).
REPUBLISH_INTERVAL = int(os.environ.get("REPUBLISH_INTERVAL", "300"))

# Batch size for historical log replay (lines per MQTT message)
HISTORY_BATCH_SIZE = 50

# Max seconds to buffer real-time log lines before flushing
REALTIME_FLUSH_INTERVAL = 1.0

# Sensor reset prefixes — these lines are ALWAYS_HIDDEN in the frontend
# and constitute ~88% of taptap log volume at debug level.  Filtering at
# the source avoids publishing, transmitting, and storing lines that are
# never displayed to users.
_RESET_PREFIXES = (
    "Calling reset_node_sensor",
    "Calling reset_stat_sensor",
    "Calling reset_sensor_integral",
    "Calling reset_stats_tele",
)

# Regex to strip timestamp+level prefix from taptap log lines
# Example: "2025-01-15 12:34:56.789 INFO: Calling reset_node_sensor" -> "Calling reset_node_sensor"
_TS_LEVEL_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\w+:?\s+(.*)"
)


def _is_sensor_reset(line: str) -> bool:
    """Return True if *line* is a sensor-reset message that the frontend never shows."""
    # Fast pre-check: skip regex if the line can't possibly contain a reset prefix.
    # The prefix always appears either at start (no timestamp) or after the
    # timestamp+level (e.g. "2025-01-15 12:34:56.789 INFO: Calling reset_...").
    if "Calling reset_" not in line:
        return False
    m = _TS_LEVEL_RE.match(line)
    msg = m.group(1) if m else line
    return msg.startswith(_RESET_PREFIXES)

# asyncio StreamReader line buffer limit for `docker logs -f` output.
# Taptap telemetry JSON dumps are ~460 bytes/panel. At 1MB limit this
# supports ~2,200 panels. If you run more panels than that and see
# "Separator is not found, and chunk exceed the limit" errors, increase
# this value.
STREAM_LINE_LIMIT = 1024 * 1024  # 1MB

# Log patterns for enumeration events
# Pattern: "Temporary enumerated node id: 42 to node name: A7"
TEMP_PATTERN = re.compile(r"Temporary enumerated node id: (\d+)")
# Pattern: "Permanently enumerated node id: 42 to node name: A7 device serial: 4-C3F23CR"
PERM_PATTERN = re.compile(r"Permanently enumerated node id: (\d+)")
# Full pattern to extract node_id and serial from permanent enumeration
PERM_SERIAL_PATTERN = re.compile(
    r"Permanently enumerated node id: (\d+).*?(?:device )?serial[:\s]+(\S+)"
)
# Steady-state line taptap logs every poll for each enumerated node, e.g.:
#   "Node id: 65 already enumerated to node name: 'D7' and serial: '4-C3F222W'"
# Unlike PERM_SERIAL_PATTERN (emitted only at fresh enumeration), this line is
# always present in normal running logs, so the map stays recoverable (FR-1).
ALREADY_ENUM_PATTERN = re.compile(
    r"Node id: (\d+) already enumerated.*?serial[:\s]+'?([0-9A-Za-z-]+)'?"
)


def parse_mapping(line: str):
    """Return (node_id, serial) from any enumeration line, else None (FR-1)."""
    if m := PERM_SERIAL_PATTERN.search(line):
        return m.group(1), m.group(2)
    if m := ALREADY_ENUM_PATTERN.search(line):
        return m.group(1), m.group(2)
    return None


def merge_mapping(mappings: Dict[str, str], node_id: str, serial: str) -> bool:
    """Grow/update only (FR-3.2). Returns True iff the map changed.

    Never deletes an entry here, so the map cannot silently shrink; a node_id
    reassigned to a new serial is updated in place.
    """
    if mappings.get(node_id) == serial:
        return False
    mappings[node_id] = serial
    return True

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)


def cache_path(system: str) -> Path:
    return Path(CACHE_DIR) / f"node_serials_{system}.json"


def load_cache(path: Path) -> Dict[str, str]:
    """Load the persisted node_id -> serial map. Returns {} on missing/invalid (FR-2.4)."""
    try:
        doc = json.loads(path.read_text())
        if doc.get("schema_version") == 1 and isinstance(doc.get("mappings"), dict):
            return {str(k): str(v) for k, v in doc["mappings"].items()}
        logger.warning(f"{path}: unexpected cache schema; starting empty")
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.warning(f"{path}: unreadable cache ({e}); starting empty")
    return {}


def save_cache(path: Path, system: str, mappings: Dict[str, str]) -> None:
    """Atomically persist the map (FR-2.3): write temp in same dir, then os.replace."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({
            "schema_version": 1,
            "system": system,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "mappings": mappings,
        }))
        os.replace(tmp, path)
    except Exception as e:
        logger.warning(f"{path}: failed to write cache ({e})")


def read_state_node_ids(state_file: str | None) -> set | None:
    """Return the authoritative node_id set from taptap.state, READ-ONLY (FR-4).

    Returns None if unconfigured/absent/unparseable (cross-check is then skipped).
    NEVER writes, locks, or modifies the state file (NFR-1).
    """
    if not state_file:
        return None
    try:
        doc = json.loads(Path(state_file).read_text())
    except FileNotFoundError:
        return None
    except Exception as e:
        logger.info(f"State cross-check skipped ({state_file}): {e}")
        return None
    ids = set()
    for entries in doc.get("gateway_node_tables", {}).values():
        for entry in entries:
            try:
                ids.add(str(entry[0]))  # entry = [node_id, [addr_bytes...]]
            except (TypeError, IndexError, KeyError):
                continue
    return ids or None


def cross_check(system: str, learned: set, state_ids: set | None) -> None:
    """Log missing/extra node_ids vs the authoritative state set (FR-4.2). Observability only."""
    if not state_ids:
        return
    missing = state_ids - learned
    extra = learned - state_ids
    if missing or extra:
        logger.warning(
            f"[{system}] node_mappings cross-check: learned {len(learned)}/{len(state_ids)}"
            + (f"; missing {sorted(missing)}" if missing else "")
            + (f"; extra {sorted(extra)}" if extra else "")
        )
    else:
        logger.info(
            f"[{system}] node_mappings cross-check: learned {len(learned)}/{len(state_ids)} (complete)"
        )


async def publish_temp_nodes(mqtt: aiomqtt.Client, system: str, nodes: Set[int]):
    """Publish current list of temporarily enumerated nodes with retain flag."""
    topic = f"{MQTT_TOPIC_PREFIX}/{system}/temp_nodes"
    payload = json.dumps(sorted(list(nodes)))
    # Retained message ensures new subscribers get current state immediately
    await mqtt.publish(topic, payload, retain=True)
    logger.info(f"Published temp_nodes for {system}: {payload}")


async def publish_node_mappings(mqtt: aiomqtt.Client, system: str, mappings: Dict[str, str]):
    """Publish node_id → serial mappings with retain flag.

    This provides the node_id data that isn't included in taptap-mqtt's
    standard MQTT messages, allowing the dashboard to display node IDs.

    Topic: {MQTT_TOPIC_PREFIX}/{system}/node_mappings
    Payload: {"42": "4-C3F23CR", "57": "4-XYZ123", ...}

    Never publishes an empty map (FR-3.1): a transient empty state must not
    clobber a known-good retained value. Uses qos=1 (FR-3.6).
    """
    if not mappings:
        return
    topic = f"{MQTT_TOPIC_PREFIX}/{system}/node_mappings"
    payload = json.dumps(mappings)
    await mqtt.publish(topic, payload, qos=1, retain=True)
    logger.info(f"Published node_mappings for {system}: {len(mappings)} nodes")


async def monitor_container(container_name: str, system: str):
    """Monitor a container's logs and publish temp node status, mappings, and log lines."""
    temp_nodes: Set[int] = set()
    cache_p = cache_path(system)
    node_mappings: Dict[str, str] = load_cache(cache_p)  # FR-2.2: seed from cache first
    if node_mappings:
        logger.info(f"Loaded {len(node_mappings)} cached node_mappings for {system} from {cache_p}")
    state_file = os.environ.get(f"{system.upper()}_STATE_FILE")  # FR-4: read-only cross-check
    seq = 0
    log_topic = f"{MQTT_TOPIC_PREFIX}/{system}/logs"

    # Scan historical logs to recover enumeration state (temp nodes + mappings).
    # We only extract enumeration events — we do NOT replay log lines to MQTT,
    # since the frontend doesn't need historical logs on startup.
    logger.info(f"Scanning historical logs for {container_name} enumeration state...")
    try:
        hist_process = await asyncio.create_subprocess_exec(
            "docker", "logs", "--tail", str(HISTORY_TAIL_LINES), container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await hist_process.communicate()

        for line in stdout.decode(errors="replace").splitlines():
            line_stripped = line.strip()
            if not line_stripped:
                continue

            # Only parse enumeration events — skip everything else
            if temp_match := TEMP_PATTERN.search(line_stripped):
                temp_nodes.add(int(temp_match.group(1)))
            elif mapping := parse_mapping(line_stripped):
                node_id, serial = mapping
                temp_nodes.discard(int(node_id))
                merge_mapping(node_mappings, node_id, serial)

        if hist_process.returncode == 0:
            logger.info(
                f"Recovered from {container_name} history: "
                f"{len(temp_nodes)} temp nodes, {len(node_mappings)} mappings"
            )
        else:
            logger.warning(f"Docker logs failed for {container_name} (exit code {hist_process.returncode})")

    except FileNotFoundError:
        logger.error("Docker CLI not found - is Docker installed?")
        raise
    except PermissionError as e:
        logger.error(f"Docker socket permission denied: {e}")
        raise
    except Exception as e:
        logger.warning(f"Failed to parse historical logs for {container_name}: {e}")

    # Persist + cross-check the recovered map before connecting (FR-2.3, FR-4.2).
    if node_mappings:
        save_cache(cache_p, system, node_mappings)
    cross_check(system, set(node_mappings), read_state_node_ids(state_file))

    # Follow only new logs from this point forward
    backoff = 5
    while True:
        try:
            logger.info(f"Starting real-time log monitoring for {container_name}...")

            async with aiomqtt.Client(
                hostname=MQTT_HOST,
                port=MQTT_PORT,
                username=MQTT_USER,
                password=MQTT_PASS,
            ) as mqtt:
                # Publish initial retained state on connect
                await publish_temp_nodes(mqtt, system, temp_nodes)
                await publish_node_mappings(mqtt, system, node_mappings)

                # Follow only NEW logs (--tail 0 skips all existing lines)
                process = await asyncio.create_subprocess_exec(
                    "docker", "logs", "-f", "--tail", "0", container_name,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    limit=STREAM_LINE_LIMIT,
                )

                realtime_buf: list[dict] = []
                last_flush = asyncio.get_event_loop().time()
                lines_since_yield = 0

                async def flush_buf():
                    nonlocal realtime_buf, last_flush
                    if realtime_buf:
                        await mqtt.publish(log_topic, json.dumps(realtime_buf), qos=0, retain=False)
                        realtime_buf = []
                    last_flush = asyncio.get_event_loop().time()

                # Readline + timeout so the idle re-publish/cross-check tick
                # (FR-5.2.1) can fire while the stream is quiet, instead of
                # blocking forever in `async for`.
                entered = asyncio.get_event_loop().time()
                while True:
                    try:
                        raw = await asyncio.wait_for(
                            process.stdout.readline(), timeout=REPUBLISH_INTERVAL
                        )
                    except asyncio.TimeoutError:
                        # FR-5.2 idle tick: re-publish current map + re-run cross-check.
                        await flush_buf()
                        await publish_node_mappings(mqtt, system, node_mappings)
                        cross_check(system, set(node_mappings), read_state_node_ids(state_file))
                        continue

                    if not raw:
                        break  # EOF -> stream ended

                    line_str = raw.decode(errors="replace").strip()
                    if not line_str:
                        continue

                    if len(line_str) > MAX_LINE_LENGTH:
                        line_str = line_str[:MAX_LINE_LENGTH] + " [truncated]"

                    # Enumeration parsing (always runs, even for filtered lines)
                    if temp_match := TEMP_PATTERN.search(line_str):
                        node_id = int(temp_match.group(1))
                        if node_id not in temp_nodes:
                            temp_nodes.add(node_id)
                            logger.info(f"[{system}] Node {node_id} temporarily enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)
                    elif mapping := parse_mapping(line_str):
                        node_id_str, serial = mapping
                        node_id_int = int(node_id_str)
                        if node_id_int in temp_nodes:
                            temp_nodes.discard(node_id_int)
                            logger.info(f"[{system}] Node {node_id_str} permanently enumerated")
                            await publish_temp_nodes(mqtt, system, temp_nodes)
                        if merge_mapping(node_mappings, node_id_str, serial):
                            logger.info(f"[{system}] Node {node_id_str} -> serial {serial}")
                            save_cache(cache_p, system, node_mappings)  # FR-2.3
                            await publish_node_mappings(mqtt, system, node_mappings)

                    # Filter sensor_reset lines (never shown in frontend)
                    if _is_sensor_reset(line_str):
                        lines_since_yield += 1
                        if lines_since_yield >= 50:
                            lines_since_yield = 0
                            await asyncio.sleep(0)
                        continue

                    # Buffer log entry for batched publish
                    realtime_buf.append({
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "line": line_str,
                        "seq": seq,
                    })
                    seq += 1

                    # Yield to event loop periodically to avoid pegging CPU
                    lines_since_yield += 1
                    if lines_since_yield >= 50:
                        lines_since_yield = 0
                        await asyncio.sleep(0)

                    # Flush buffer if interval elapsed
                    now = asyncio.get_event_loop().time()
                    if now - last_flush >= REALTIME_FLUSH_INTERVAL:
                        await flush_buf()

                # Flush any remaining buffered lines
                await flush_buf()
                await process.wait()
                logger.warning(f"Log stream for {container_name} ended")

            # FR-5.1 backoff: reset after a sustained healthy follow, else escalate.
            if asyncio.get_event_loop().time() - entered >= 120:
                backoff = 5
            else:
                backoff = min(backoff * 2, 60)

        except aiomqtt.MqttError as e:
            logger.error(f"MQTT connection failed for {system}: {e}")
            backoff = min(backoff * 2, 60)
        except (OSError, asyncio.CancelledError):
            raise
        except Exception as e:
            logger.error(f"Error monitoring {container_name}: {e}")
            backoff = min(backoff * 2, 60)

        logger.warning(f"Restarting monitor for {container_name} in {backoff}s...")
        await asyncio.sleep(backoff)


def get_containers_config() -> dict:
    """
    Build container configuration from environment variables.

    Environment variable precedence:
      1. PRIMARY_CONTAINER=custom-name -> uses custom container name for primary
      2. SECONDARY_CONTAINER=custom-name -> uses custom container name for secondary
      3. ENABLE_SECONDARY=false -> no secondary monitoring (single-inverter setup)
      4. Defaults: taptap-primary, taptap-secondary
    """
    containers = {}

    # Primary container (always enabled)
    primary_name = os.environ.get("PRIMARY_CONTAINER", "taptap-primary")
    containers[primary_name] = "primary"

    # Secondary container (configurable)
    if os.environ.get("SECONDARY_CONTAINER"):
        containers[os.environ["SECONDARY_CONTAINER"]] = "secondary"
    elif os.environ.get("ENABLE_SECONDARY", "true").lower() == "true":
        containers["taptap-secondary"] = "secondary"

    return containers


async def main():
    """Main entry point - starts monitors for all configured containers."""
    containers = get_containers_config()

    logger.info("Temp ID Monitor starting...")
    logger.info(f"MQTT: {MQTT_HOST}:{MQTT_PORT}")
    logger.info(f"Monitoring containers: {containers}")

    if not containers:
        logger.error("No containers configured - exiting")
        return

    tasks = [
        monitor_container(container, system)
        for container, system in containers.items()
    ]

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Shutting down...")
