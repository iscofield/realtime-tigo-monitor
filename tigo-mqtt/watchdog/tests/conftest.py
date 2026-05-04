"""Shared test fixtures for the watchdog unit tests."""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import replace
from typing import Any

import pytest

# Make the watchdog source dir importable without packaging.
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Make the tests directory itself importable so test files can `from fakes import ...`.
TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
if TESTS_DIR not in sys.path:
    sys.path.insert(0, TESTS_DIR)


@pytest.fixture
def event_loop_policy():
    """Use the default policy; pytest-asyncio handles loop creation."""
    return asyncio.DefaultEventLoopPolicy()


class FakeClock:
    """Manually advanced clock for deterministic tests."""
    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.now = float(start)

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += float(seconds)


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


class RecordingPublisher:
    """Captures every publish call so tests can assert against the audit log."""
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    def publish(self, topic: str, payload: str, *, qos: int, retain: bool) -> None:
        import json
        decoded = json.loads(payload) if payload else {}
        self.events.append({
            "topic": topic,
            "qos": qos,
            "retain": retain,
            "payload": decoded,
        })

    def event_names(self, topic: str | None = None) -> list[str]:
        if topic is None:
            return [e["payload"].get("event", "") for e in self.events]
        return [e["payload"].get("event", "") for e in self.events
                if e["topic"] == topic]


@pytest.fixture
def publisher() -> RecordingPublisher:
    return RecordingPublisher()


from fakes import FakeBouncer  # re-exported for tests that import directly  # noqa: E402,F401


@pytest.fixture
def bouncer() -> FakeBouncer:
    return FakeBouncer()


@pytest.fixture
def cfg():
    """Test config with very short windows so we can exercise edge cases fast."""
    from app import Config
    # Build a config with all defaults, then override the tunables we care about.
    base = Config(
        silence_threshold_sec=300,
        cooldown_sec=900,
        circuit_breaker_bounces=3,
        circuit_breaker_window_sec=3600,
        mqtt_reconnect_grace_cutoff_sec=60,
        primary_container="taptap-primary",
        secondary_container="taptap-secondary",
        webhook_port=8080,
        docker_proxy_url="http://127.0.0.1:2375",
        db_path=":memory:",
        silence_loop_interval_sec=30,
        heartbeat_interval_sec=30,
        sqlite_retention_sec=86400,
        mqtt_keepalive_sec=60,
    )
    return base


@pytest.fixture
def watchdog(cfg, fake_clock, publisher, bouncer):
    from app import Watchdog, open_db
    conn = open_db(":memory:")
    wd = Watchdog(cfg, conn, publisher, bouncer, clock=fake_clock)
    # Pretend MQTT is connected so silence_loop is allowed to act.
    wd.state.mqtt_connected = True
    return wd


@pytest.fixture
def make_watchdog(cfg, fake_clock, publisher, bouncer):
    """Factory variant that lets a test build multiple watchdogs sharing
    one SQLite DB (for restart-survival tests)."""
    from app import Watchdog, open_db

    def factory(conn=None, cfg_override=None):
        if conn is None:
            conn = open_db(":memory:")
        cfg_use = cfg_override or cfg
        wd = Watchdog(cfg_use, conn, publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        return wd

    return factory
