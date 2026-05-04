"""taptap-watchdog: detect MQTT silence from taptap CCA containers and bounce
them autonomously via docker-socket-proxy.

Spec: docs/specs/2026-05-02-tigo-mqtt-self-healing.md (v1.5), FR-3 in full.

Design principles:
- The bounce decision logic is pure (cooldown, circuit-breaker math) so it can
  be tested without spinning up MQTT or HTTP.
- All state shared between the silence loop, MQTT callbacks, and the FastAPI
  webhook is funneled through a single `Watchdog` object whose mutating
  methods are protected by an `asyncio.Lock` (SQLite + in-memory dict).
- Bounces NEVER touch tigo-mqtt/data (taptap.state files). NFR-1.1.
"""
from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

import httpx
import paho.mqtt.client as mqtt
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Path, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# Configuration (env-driven; defaults from NFR-5.1).
# ---------------------------------------------------------------------------

def _env_int(key: str, default: int) -> int:
    raw = os.environ.get(key)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise SystemExit(f"invalid integer for {key}={raw!r}: {exc}")


@dataclass(frozen=True)
class Config:
    silence_threshold_sec: int = field(
        default_factory=lambda: _env_int("SILENCE_THRESHOLD_SEC", 300))
    cooldown_sec: int = field(
        default_factory=lambda: _env_int("COOLDOWN_SEC", 900))
    circuit_breaker_bounces: int = field(
        default_factory=lambda: _env_int("CIRCUIT_BREAKER_BOUNCES", 3))
    circuit_breaker_window_sec: int = field(
        default_factory=lambda: _env_int("CIRCUIT_BREAKER_WINDOW_SEC", 3600))
    mqtt_reconnect_grace_cutoff_sec: int = field(
        default_factory=lambda: _env_int("MQTT_RECONNECT_GRACE_CUTOFF_SEC", 60))
    primary_container: str = field(
        default_factory=lambda: os.environ.get("PRIMARY_CONTAINER", "taptap-primary"))
    secondary_container: str = field(
        default_factory=lambda: os.environ.get("SECONDARY_CONTAINER", "taptap-secondary"))
    webhook_port: int = field(
        default_factory=lambda: _env_int("WEBHOOK_PORT", 8080))
    docker_proxy_url: str = field(
        default_factory=lambda: os.environ.get("DOCKER_PROXY_URL", "http://127.0.0.1:2375"))
    db_path: str = field(default="/data/watchdog.db")
    silence_loop_interval_sec: int = 30
    heartbeat_interval_sec: int = 30
    sqlite_retention_sec: int = 86400
    mqtt_keepalive_sec: int = 60

    # Required (no default).
    @staticmethod
    def required() -> dict[str, str]:
        missing = []
        for key in ("MQTT_SERVER", "MQTT_USER", "MQTT_PASS", "BOUNCE_TOKEN"):
            if not os.environ.get(key):
                missing.append(key)
        if missing:
            raise SystemExit(
                f"missing required env vars: {', '.join(missing)}")
        return {
            "mqtt_server": os.environ["MQTT_SERVER"],
            "mqtt_port": _env_int("MQTT_PORT", 1883),
            "mqtt_user": os.environ["MQTT_USER"],
            "mqtt_pass": os.environ["MQTT_PASS"],
            "bounce_token": os.environ["BOUNCE_TOKEN"],
        }


CCA_NAMES: tuple[str, str] = ("primary", "secondary")
STATE_TOPIC_PREFIX = "taptap/"
STATE_TOPIC_SUFFIX = "/state"
EVENTS_TOPIC = "taptap/watchdog/events"
HEARTBEAT_TOPIC = "taptap/watchdog/heartbeat"


# ---------------------------------------------------------------------------
# Topic / payload helpers (pure — easy to unit-test).
# ---------------------------------------------------------------------------

def parse_state_topic(topic: str) -> Optional[str]:
    """Extract the CCA name (`primary` / `secondary`) from a state topic.

    Returns None for any topic that isn't `taptap/{primary|secondary}/state`.
    """
    if not topic.startswith(STATE_TOPIC_PREFIX) or not topic.endswith(STATE_TOPIC_SUFFIX):
        return None
    middle = topic[len(STATE_TOPIC_PREFIX):-len(STATE_TOPIC_SUFFIX)]
    if middle in CCA_NAMES:
        return middle
    return None


def container_name_for(cca: str, cfg: Config) -> str:
    if cca == "primary":
        return cfg.primary_container
    if cca == "secondary":
        return cfg.secondary_container
    raise ValueError(f"unknown cca: {cca!r}")


def utcnow_iso() -> str:
    """RFC-3339 timestamp with trailing Z, matching the spec event envelopes."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# SQLite persistence (FR-3.13).
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS bounces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  container TEXT NOT NULL,
  reason TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bounces_ts ON bounces(ts);
"""


def open_db(path: str) -> sqlite3.Connection:
    """Open the SQLite connection used by the watchdog.

    `check_same_thread=False` because we serialize access via an asyncio.Lock
    (FR-3.13) and may dispatch writes from `to_thread`.
    """
    if path != ":memory:":
        os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.executescript(SCHEMA)
    return conn


def prune_old_rows(conn: sqlite3.Connection, *, now: int, retention_sec: int) -> int:
    """Delete bounce rows older than the retention window. Returns rows pruned."""
    cutoff = now - retention_sec
    cur = conn.execute("DELETE FROM bounces WHERE ts < ?", (cutoff,))
    return cur.rowcount or 0


def recent_bounces(conn: sqlite3.Connection, *, container: str, window_sec: int,
                   now: Optional[int] = None) -> int:
    """Count automatic bounces of `container` within the trailing `window_sec`.

    Excludes `manual_webhook` rows — manual bounces bypass the breaker (FR-3.7).
    """
    if now is None:
        now = int(time.time())
    cutoff = now - window_sec
    cur = conn.execute(
        "SELECT COUNT(*) FROM bounces "
        "WHERE container = ? AND ts > ? AND reason != 'manual_webhook'",
        (container, cutoff),
    )
    return int(cur.fetchone()[0])


def record_bounce(conn: sqlite3.Connection, *, container: str, reason: str,
                  now: Optional[int] = None) -> None:
    """Insert a successful bounce row. Called only after Docker returns 2xx."""
    if now is None:
        now = int(time.time())
    conn.execute(
        "INSERT INTO bounces (container, reason, ts) VALUES (?, ?, ?)",
        (container, reason, now),
    )


# ---------------------------------------------------------------------------
# Watchdog core (decision logic + MQTT + HTTP glue).
# ---------------------------------------------------------------------------

@dataclass
class WatchdogState:
    """In-memory state. Initialized from config and SQLite on startup."""
    last_seen: dict[str, float] = field(default_factory=dict)
    last_bounce: dict[str, float] = field(default_factory=dict)
    breaker_tripped: set[str] = field(default_factory=set)
    mqtt_connected: bool = False
    mqtt_last_msg_at: Optional[float] = None
    mqtt_disconnected_at: Optional[float] = None
    started_at: float = field(default_factory=time.time)


class Publisher:
    """Thin wrapper around paho.mqtt.Client.publish for testability.

    Tests substitute a `RecordingPublisher` instance.
    """
    def __init__(self, client: mqtt.Client) -> None:
        self._client = client

    def publish(self, topic: str, payload: str, *, qos: int, retain: bool) -> None:
        self._client.publish(topic, payload, qos=qos, retain=retain)


class HttpBouncer:
    """Issues `POST /containers/<name>/restart` to docker-socket-proxy."""
    def __init__(self, proxy_url: str, *, timeout: float = 10.0) -> None:
        self._proxy_url = proxy_url.rstrip("/")
        self._timeout = timeout

    def restart(self, container_name: str) -> None:
        """Raise an exception on any non-2xx or transport failure.

        FR-3.13 step 2 + step 5b: callers route exceptions to the bounce_failed
        path. We do NOT swallow errors here.
        """
        url = f"{self._proxy_url}/containers/{container_name}/restart"
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(url)
            resp.raise_for_status()


class Watchdog:
    """Central state-machine. All mutating operations go through `_lock`."""

    def __init__(
        self,
        cfg: Config,
        conn: sqlite3.Connection,
        publisher: Publisher,
        bouncer: HttpBouncer,
        *,
        clock: Callable[[], float] = time.time,
        log: Optional[logging.Logger] = None,
    ) -> None:
        self.cfg = cfg
        self.conn = conn
        self.publisher = publisher
        self.bouncer = bouncer
        self._clock = clock
        self.log = log or logging.getLogger("taptap-watchdog")
        self._lock = asyncio.Lock()
        self.state = WatchdogState()
        # Initialize last_seen to startup so we don't bounce immediately (FR-3.3).
        now = self._clock()
        for cca in CCA_NAMES:
            self.state.last_seen[cca] = now
            self.state.last_bounce[cca] = 0.0

    # -- SQLite helpers under lock ------------------------------------------

    async def _recent_bounces(self, container: str) -> int:
        async with self._lock:
            return recent_bounces(
                self.conn,
                container=container,
                window_sec=self.cfg.circuit_breaker_window_sec,
                now=int(self._clock()),
            )

    async def _record_bounce(self, container: str, reason: str) -> None:
        async with self._lock:
            record_bounce(self.conn, container=container, reason=reason,
                          now=int(self._clock()))

    async def prune(self) -> int:
        async with self._lock:
            return prune_old_rows(
                self.conn,
                now=int(self._clock()),
                retention_sec=self.cfg.sqlite_retention_sec,
            )

    # -- Event publishing ---------------------------------------------------

    def publish_event(self, event: str, container: str, **fields: Any) -> None:
        """Publish a JSON envelope to taptap/watchdog/events.

        Retain=true for circuit_breaker_*; retain=false for everything else.
        QoS=1 for all events (FR-3.13 publish_event helper).
        """
        payload: dict[str, Any] = {
            "event": event,
            "container": container,
            "ts": utcnow_iso(),
        }
        payload.update(fields)
        retain = event.startswith("circuit_breaker_")
        self.publisher.publish(EVENTS_TOPIC, json.dumps(payload),
                               qos=1, retain=retain)

    # -- Liveness -----------------------------------------------------------

    async def on_state_message(self, cca: str) -> None:
        """Called from the MQTT thread (via run_coroutine_threadsafe) on every
        `taptap/{cca}/state` message. Updates last_seen[cca] = now.
        """
        async with self._lock:
            self.state.last_seen[cca] = self._clock()
            self.state.mqtt_last_msg_at = self.state.last_seen[cca]

    # -- Connection lifecycle (FR-3.12) ------------------------------------

    async def on_mqtt_connect(self) -> None:
        emit_grace = False
        elapsed = 0
        async with self._lock:
            previously_connected = self.state.mqtt_connected
            disconnected_at = self.state.mqtt_disconnected_at
            self.state.mqtt_connected = True
            self.state.mqtt_disconnected_at = None
            now = self._clock()
            cutoff = self.cfg.mqtt_reconnect_grace_cutoff_sec
            if not previously_connected and disconnected_at is not None:
                elapsed = int(now - disconnected_at)
                if elapsed > cutoff:
                    # Long disconnect: ambiguous (probably broker outage).
                    # Reset last_seen for both CCAs and emit
                    # reconnect_grace_applied (FR-3.12).
                    for cca in CCA_NAMES:
                        self.state.last_seen[cca] = now
                    emit_grace = True
        # Publish outside the critical section to avoid blocking on paho.
        if emit_grace:
            self.publish_event(
                "reconnect_grace_applied",
                container="*",
                disconnect_seconds=elapsed,
            )

    async def on_mqtt_disconnect(self) -> None:
        async with self._lock:
            if self.state.mqtt_connected:
                self.state.mqtt_disconnected_at = self._clock()
            self.state.mqtt_connected = False

    # -- Bounce (FR-3.13 ordering) ------------------------------------------

    async def attempt_bounce(self, cca: str, reason: str, *,
                             override: bool = False) -> dict[str, Any]:
        """Run the FR-3.13 bounce sequence.

        Returns one of:
          {"ok": True, "bounced": "<container_name>"}
          {"skipped": "cooldown", "container": "<cca>"}
          {"skipped": "circuit_breaker", "container": "<cca>"}
          {"ok": False, "error": "..."}    (bounce_failed event also published)
        """
        if cca not in CCA_NAMES:
            raise ValueError(f"unknown cca: {cca!r}")

        container_name = container_name_for(cca, self.cfg)
        now = self._clock()

        if not override:
            # Cooldown check.
            last = self.state.last_bounce.get(cca, 0.0)
            if now - last < self.cfg.cooldown_sec:
                self.log.info(
                    "skipping bounce of %s: cooldown (%.0fs since last)",
                    container_name, now - last)
                return {"skipped": "cooldown", "container": cca}

            # Circuit-breaker check (excludes manual_webhook).
            recent = await self._recent_bounces(container_name)
            if recent >= self.cfg.circuit_breaker_bounces:
                # Trip event only on transition closed -> open.
                if cca not in self.state.breaker_tripped:
                    self.state.breaker_tripped.add(cca)
                    self.publish_event(
                        "circuit_breaker_tripped",
                        container=container_name,
                        bounces_in_window=recent,
                    )
                self.log.warning(
                    "skipping bounce of %s: circuit breaker tripped (%d in window)",
                    container_name, recent)
                return {"skipped": "circuit_breaker", "container": cca}
        else:
            # Manual override: announce that we're bypassing.
            self.log.info("manual override bounce of %s", container_name)

        # Step 2: attempt the Docker restart.
        try:
            await asyncio.to_thread(self.bouncer.restart, container_name)
        except Exception as exc:  # noqa: BLE001 — paths covered by FR-3.9b
            self.log.warning("bounce_failed for %s: %s", container_name, exc)
            self.publish_event(
                "bounce_failed",
                container=container_name,
                error_class=type(exc).__name__,
                error_message=str(exc),
            )
            return {"ok": False, "error": str(exc)}

        # Step 3: success — record + publish.
        sql_reason = reason
        await self._record_bounce(container_name, sql_reason)
        self.state.last_bounce[cca] = now

        silent_seconds = int(now - self.state.last_seen.get(cca, now))
        fields: dict[str, Any] = {"reason": reason}
        if reason == "silence_threshold":
            fields["silent_seconds"] = silent_seconds
        elif reason == "manual_webhook":
            fields["silent_seconds"] = silent_seconds
        self.publish_event("bounce", container=container_name, **fields)

        # FR-3.7: maybe-reset the breaker. After this success, recompute the
        # in-window count. If it's now BELOW the threshold (e.g., older rows
        # aged out), publish circuit_breaker_reset.
        if cca in self.state.breaker_tripped:
            new_count = await self._recent_bounces(container_name)
            if new_count < self.cfg.circuit_breaker_bounces:
                self.state.breaker_tripped.discard(cca)
                self.publish_event(
                    "circuit_breaker_reset",
                    container=container_name,
                    bounces_in_window=new_count,
                )

        return {"ok": True, "bounced": container_name}

    # -- Maybe-reset breaker without bouncing (FR-3.7) ---------------------

    async def maybe_reset_breaker(self, cca: str) -> None:
        """If `cca` is tripped but its rolling-window count has dropped below
        the threshold (because old rows aged out), emit circuit_breaker_reset
        and clear the in-memory flag.
        """
        if cca not in self.state.breaker_tripped:
            return
        container_name = container_name_for(cca, self.cfg)
        new_count = await self._recent_bounces(container_name)
        if new_count < self.cfg.circuit_breaker_bounces:
            self.state.breaker_tripped.discard(cca)
            self.publish_event(
                "circuit_breaker_reset",
                container=container_name,
                bounces_in_window=new_count,
            )

    # -- Silence loop (FR-3.4) ---------------------------------------------

    async def check_silence(self) -> list[dict[str, Any]]:
        """One iteration of the silence-detection loop. Returns a list of
        bounce results (for logging / tests).
        """
        results: list[dict[str, Any]] = []

        if not self.state.mqtt_connected:
            # FR-3.12: don't bounce while we can't see liveness.
            self.log.debug("silence loop: MQTT disconnected, skipping")
            return results

        now = self._clock()
        for cca in CCA_NAMES:
            silent_for = now - self.state.last_seen.get(cca, now)
            if silent_for > self.cfg.silence_threshold_sec:
                self.log.info(
                    "silence threshold exceeded for %s (silent for %.0fs); attempting bounce",
                    cca, silent_for)
                result = await self.attempt_bounce(cca, reason="silence_threshold")
                results.append(result)
            else:
                # Even when we don't bounce, see if the breaker should reset
                # because old rows aged out of the window.
                await self.maybe_reset_breaker(cca)
        await self.prune()
        return results

    # -- Health snapshot (FR-3.11) -----------------------------------------

    async def healthz(self) -> dict[str, Any]:
        now = self._clock()
        ccas: dict[str, Any] = {}
        any_tripped = False
        for cca in CCA_NAMES:
            container_name = container_name_for(cca, self.cfg)
            recent = await self._recent_bounces(container_name)
            tripped = cca in self.state.breaker_tripped
            any_tripped = any_tripped or tripped
            last_seen_ts = self.state.last_seen.get(cca, now)
            ccas[cca] = {
                "last_seen": _iso_from_ts(last_seen_ts),
                "silent_seconds": int(now - last_seen_ts),
                "circuit_breaker": "open" if tripped else "closed",
                "bounces_last_hour": recent,
            }
        # Status precedence per FR-3.11.
        if not self.state.mqtt_connected:
            status = "down"
        elif any_tripped:
            status = "degraded"
        else:
            status = "ok"
        last_msg_iso = (_iso_from_ts(self.state.mqtt_last_msg_at)
                        if self.state.mqtt_last_msg_at else None)
        return {
            "status": status,
            "ccas": ccas,
            "mqtt": {
                "connected": self.state.mqtt_connected,
                "last_message_at": last_msg_iso,
            },
        }

    # -- Heartbeat (FR-3.16) -----------------------------------------------

    def publish_heartbeat(self) -> None:
        payload = {
            "ts": utcnow_iso(),
            "uptime_seconds": int(self._clock() - self.state.started_at),
        }
        self.publisher.publish(HEARTBEAT_TOPIC, json.dumps(payload),
                               qos=0, retain=True)


def _iso_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc) \
        .isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# FastAPI webhook (FR-3.10, FR-3.11).
# ---------------------------------------------------------------------------

def build_app(watchdog: Watchdog, bounce_token: str) -> FastAPI:
    app = FastAPI(title="taptap-watchdog")

    @app.exception_handler(RequestValidationError)
    async def remap_validation_to_404(request: Request, exc: RequestValidationError):
        """Pattern-fail on `/bounce/{cca}` returns 404, not 422 (FR-3.10)."""
        return JSONResponse(status_code=404, content={"detail": "unknown CCA"})

    def require_token(x_bounce_token: str = Header(default="")) -> None:
        if not hmac.compare_digest(x_bounce_token, bounce_token):
            raise HTTPException(status_code=401, detail="invalid bounce token")

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        return await watchdog.healthz()

    @app.post("/bounce/{cca}", dependencies=[Depends(require_token)])
    async def manual_bounce(cca: str = Path(pattern="^(primary|secondary)$")):
        result = await watchdog.attempt_bounce(cca, reason="manual_webhook",
                                               override=True)
        if "ok" in result and not result["ok"]:
            raise HTTPException(status_code=500, detail=result.get("error"))
        return result

    return app


# ---------------------------------------------------------------------------
# MQTT integration.
# ---------------------------------------------------------------------------

class MqttBridge:
    """Owns the paho client and forwards events to the Watchdog via the
    asyncio loop that owns it.
    """
    def __init__(self, watchdog: Watchdog, *, host: str, port: int,
                 user: str, password: str, keepalive: int = 60,
                 client_id: str = "taptap-watchdog") -> None:
        self.watchdog = watchdog
        self.host = host
        self.port = port
        self.keepalive = keepalive
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self.client = mqtt.Client(client_id=client_id)
        self.client.username_pw_set(user, password)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def start(self) -> None:
        self.client.connect_async(self.host, self.port, keepalive=self.keepalive)
        self.client.loop_start()

    def stop(self) -> None:
        with contextlib.suppress(Exception):
            self.client.loop_stop()
        with contextlib.suppress(Exception):
            self.client.disconnect()

    # paho callbacks run on its own thread; bounce decisions go through the loop.
    def _on_connect(self, client, _userdata, _flags, rc):
        if rc == 0:
            client.subscribe([
                (f"taptap/{cca}/state", 0) for cca in CCA_NAMES
            ])
            self._dispatch(self.watchdog.on_mqtt_connect())
        else:
            logging.getLogger("taptap-watchdog").warning(
                "MQTT connect rc=%s", rc)

    def _on_disconnect(self, _client, _userdata, rc):
        logging.getLogger("taptap-watchdog").warning(
            "MQTT disconnect rc=%s", rc)
        self._dispatch(self.watchdog.on_mqtt_disconnect())

    def _on_message(self, _client, _userdata, msg):
        cca = parse_state_topic(msg.topic)
        if cca is None:
            return
        self._dispatch(self.watchdog.on_state_message(cca))

    def _dispatch(self, coro) -> None:
        if self._loop is None:
            return
        with contextlib.suppress(Exception):
            asyncio.run_coroutine_threadsafe(coro, self._loop)


# ---------------------------------------------------------------------------
# Background task helpers.
# ---------------------------------------------------------------------------

async def silence_loop(watchdog: Watchdog) -> None:
    interval = watchdog.cfg.silence_loop_interval_sec
    while True:
        try:
            await watchdog.check_silence()
        except Exception:  # noqa: BLE001
            watchdog.log.exception("silence_loop iteration failed")
        await asyncio.sleep(interval)


async def heartbeat_loop(watchdog: Watchdog) -> None:
    interval = watchdog.cfg.heartbeat_interval_sec
    while True:
        try:
            watchdog.publish_heartbeat()
        except Exception:  # noqa: BLE001
            watchdog.log.exception("heartbeat publish failed")
        await asyncio.sleep(interval)


# ---------------------------------------------------------------------------
# Entry point.
# ---------------------------------------------------------------------------

def configure_logging() -> None:
    fmt = "%(asctime)sZ %(levelname)s %(name)s %(message)s"
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format=fmt,
        stream=sys.stdout,
    )
    logging.Formatter.converter = time.gmtime  # NFR-3.2: UTC


async def amain() -> None:
    configure_logging()
    cfg = Config()
    secrets = Config.required()

    log = logging.getLogger("taptap-watchdog")
    log.info("starting taptap-watchdog (silence=%ds cooldown=%ds breaker=%d/%ds)",
             cfg.silence_threshold_sec, cfg.cooldown_sec,
             cfg.circuit_breaker_bounces, cfg.circuit_breaker_window_sec)

    conn = open_db(cfg.db_path)
    # Prune on startup before reconstructing counters.
    prune_old_rows(conn, now=int(time.time()),
                   retention_sec=cfg.sqlite_retention_sec)

    bouncer = HttpBouncer(cfg.docker_proxy_url)
    bridge = MqttBridge(
        None,  # filled in below
        host=secrets["mqtt_server"],
        port=secrets["mqtt_port"],
        user=secrets["mqtt_user"],
        password=secrets["mqtt_pass"],
        keepalive=cfg.mqtt_keepalive_sec,
    )
    publisher = Publisher(bridge.client)
    watchdog = Watchdog(cfg, conn, publisher, bouncer, log=log)
    bridge.watchdog = watchdog
    bridge.attach_loop(asyncio.get_running_loop())
    bridge.start()

    app = build_app(watchdog, secrets["bounce_token"])

    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=cfg.webhook_port,
        log_config=None,
        access_log=False,
    )
    server = uvicorn.Server(config)
    server.config.setup_event_loop()  # idempotent

    silence_task = asyncio.create_task(silence_loop(watchdog), name="silence_loop")
    heartbeat_task = asyncio.create_task(heartbeat_loop(watchdog), name="heartbeat_loop")
    try:
        await server.serve()
    finally:
        silence_task.cancel()
        heartbeat_task.cancel()
        bridge.stop()
        with contextlib.suppress(asyncio.CancelledError):
            await silence_task
        with contextlib.suppress(asyncio.CancelledError):
            await heartbeat_task


def main() -> None:
    try:
        asyncio.run(amain())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
