"""Unit tests for the taptap-watchdog.

Coverage targets (from spec PR 2 task 5):
- Cooldown logic (clock starts on 2xx response)
- Circuit-breaker logic (trip on 3rd, implicit reset via SQL count, manual_webhook excluded)
- SQLite persistence (restart watchdog, verify state survives)
- MQTT-disconnect-suspends-bouncing (FR-3.12)
- Reconnect-grace short-vs-long disconnect behavior (FR-3.12)
- Manual webhook bypasses cooldown + breaker (FR-3.10)
- Webhook auth: 401 on missing/wrong token; 404 on invalid CCA path (FR-3.10)
- bounce_failed event on docker-socket-proxy 5xx (FR-3.9b)
- Topic parsing
- Config validation
"""
from __future__ import annotations

import asyncio
import os

import pytest


# ---------------------------------------------------------------------------
# Pure helpers.
# ---------------------------------------------------------------------------

class TestTopicParsing:
    def test_primary_state_topic(self):
        from app import parse_state_topic
        assert parse_state_topic("taptap/primary/state") == "primary"

    def test_secondary_state_topic(self):
        from app import parse_state_topic
        assert parse_state_topic("taptap/secondary/state") == "secondary"

    def test_node_topic_is_not_state(self):
        """Panel data must NOT be treated as a liveness signal (FR-3.2)."""
        from app import parse_state_topic
        assert parse_state_topic("taptap/primary/nodes/12345") is None

    def test_unknown_cca_rejected(self):
        from app import parse_state_topic
        assert parse_state_topic("taptap/tertiary/state") is None

    def test_garbage_topic(self):
        from app import parse_state_topic
        assert parse_state_topic("foo/bar") is None
        assert parse_state_topic("") is None
        assert parse_state_topic("taptap/primary/state/extra") is None


class TestContainerNameMapping:
    def test_primary_default(self, cfg):
        from app import container_name_for
        assert container_name_for("primary", cfg) == "taptap-primary"

    def test_secondary_default(self, cfg):
        from app import container_name_for
        assert container_name_for("secondary", cfg) == "taptap-secondary"

    def test_unknown_raises(self, cfg):
        from app import container_name_for
        with pytest.raises(ValueError):
            container_name_for("tertiary", cfg)


class TestConfigRequiredEnv:
    def test_missing_required_env_exits(self, monkeypatch):
        from app import Config
        for k in ("MQTT_SERVER", "MQTT_USER", "MQTT_PASS", "BOUNCE_TOKEN"):
            monkeypatch.delenv(k, raising=False)
        with pytest.raises(SystemExit):
            Config.required()

    def test_all_required_present(self, monkeypatch):
        from app import Config
        monkeypatch.setenv("MQTT_SERVER", "broker")
        monkeypatch.setenv("MQTT_USER", "u")
        monkeypatch.setenv("MQTT_PASS", "p")
        monkeypatch.setenv("BOUNCE_TOKEN", "t")
        secrets = Config.required()
        assert secrets["mqtt_server"] == "broker"
        assert secrets["bounce_token"] == "t"

    def test_invalid_int_env_exits(self, monkeypatch):
        """A bogus int env var should fail loudly, not silently fall back."""
        from app import _env_int
        monkeypatch.setenv("BAD", "not_an_int")
        with pytest.raises(SystemExit):
            _env_int("BAD", 0)


# ---------------------------------------------------------------------------
# Cooldown.
# ---------------------------------------------------------------------------

class TestCooldown:
    @pytest.mark.asyncio
    async def test_first_bounce_succeeds(self, watchdog, bouncer, publisher):
        result = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert result == {"ok": True, "bounced": "taptap-primary"}
        assert bouncer.calls == ["taptap-primary"]
        assert "bounce" in publisher.event_names()

    @pytest.mark.asyncio
    async def test_second_bounce_within_cooldown_skipped(
            self, watchdog, fake_clock, bouncer, cfg):
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        # Advance less than the cooldown.
        fake_clock.advance(cfg.cooldown_sec - 1)
        result = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert result == {"skipped": "cooldown", "container": "primary"}
        # Bouncer should NOT have been called twice.
        assert len(bouncer.calls) == 1

    @pytest.mark.asyncio
    async def test_cooldown_clock_starts_on_success(
            self, watchdog, fake_clock, cfg):
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        fake_clock.advance(cfg.cooldown_sec + 1)
        result = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert result.get("ok") is True

    @pytest.mark.asyncio
    async def test_cooldown_per_container(self, watchdog, fake_clock, bouncer):
        # Bouncing primary doesn't gate secondary.
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        result = await watchdog.attempt_bounce("secondary", reason="silence_threshold")
        assert result.get("ok") is True
        assert bouncer.calls == ["taptap-primary", "taptap-secondary"]

    @pytest.mark.asyncio
    async def test_failed_bounce_does_not_arm_cooldown(
            self, cfg, fake_clock, publisher):
        """FR-3.13 5b: bounce_failed must NOT update last_bounce."""
        from app import Watchdog, open_db
        from fakes import FakeBouncer
        bouncer = FakeBouncer(mode="error")
        wd = Watchdog(cfg, open_db(":memory:"), publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        result1 = await wd.attempt_bounce("primary", reason="silence_threshold")
        assert result1.get("ok") is False
        # Now flip the bouncer to ok and try again immediately — cooldown
        # must NOT block, because the prior attempt failed.
        bouncer.mode = "ok"
        result2 = await wd.attempt_bounce("primary", reason="silence_threshold")
        assert result2.get("ok") is True


# ---------------------------------------------------------------------------
# Circuit breaker.
# ---------------------------------------------------------------------------

class TestCircuitBreaker:
    @pytest.mark.asyncio
    async def test_trips_on_third_bounce_in_window(
            self, watchdog, fake_clock, cfg, publisher):
        # Three successful bounces, each spaced past cooldown but within window.
        for i in range(cfg.circuit_breaker_bounces):
            r = await watchdog.attempt_bounce("primary", reason="silence_threshold")
            assert r.get("ok") is True, f"bounce #{i} should succeed"
            fake_clock.advance(cfg.cooldown_sec + 1)
        # 4th should be blocked by the breaker.
        result = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert result == {"skipped": "circuit_breaker", "container": "primary"}
        # circuit_breaker_tripped event published exactly once.
        names = publisher.event_names()
        assert names.count("circuit_breaker_tripped") == 1

    @pytest.mark.asyncio
    async def test_trip_event_only_once_per_transition(
            self, watchdog, fake_clock, cfg, publisher):
        for i in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        # Now attempt several more times — only the FIRST transition should publish.
        for _ in range(5):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        assert publisher.event_names().count("circuit_breaker_tripped") == 1

    @pytest.mark.asyncio
    async def test_manual_webhook_excluded_from_count(
            self, watchdog, fake_clock, cfg):
        """FR-3.7: manual bounces don't count toward the breaker."""
        # 5 manual bounces in tight succession. Cooldown is bypassed by
        # override=True, breaker is bypassed by override=True, manual rows
        # are excluded from the SQL count via reason filter.
        for _ in range(5):
            r = await watchdog.attempt_bounce("primary", reason="manual_webhook",
                                              override=True)
            assert r.get("ok") is True
            fake_clock.advance(1)
        # Now try an automatic bounce — breaker should be CLOSED because
        # only manual rows exist.
        fake_clock.advance(cfg.cooldown_sec + 1)
        r = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert r.get("ok") is True

    @pytest.mark.asyncio
    async def test_breaker_resets_when_rows_age_out(
            self, watchdog, fake_clock, cfg, publisher):
        # Trip the breaker.
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert "primary" in watchdog.state.breaker_tripped

        # Advance past the rolling window so all rows age out.
        fake_clock.advance(cfg.circuit_breaker_window_sec + 1)
        # Trigger maybe_reset_breaker via a silence-loop iteration with no silence.
        # We'll just call maybe_reset_breaker directly.
        await watchdog.maybe_reset_breaker("primary")
        assert "primary" not in watchdog.state.breaker_tripped
        assert "circuit_breaker_reset" in publisher.event_names()

    @pytest.mark.asyncio
    async def test_breaker_per_container(
            self, watchdog, fake_clock, cfg, publisher):
        # Trip primary.
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        # Secondary should still bounce normally.
        result = await watchdog.attempt_bounce("secondary", reason="silence_threshold")
        assert result.get("ok") is True


# ---------------------------------------------------------------------------
# Manual webhook (FR-3.10).
# ---------------------------------------------------------------------------

class TestManualWebhook:
    @pytest.mark.asyncio
    async def test_bypasses_cooldown(self, watchdog, fake_clock):
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        # Immediately after — would normally be in cooldown.
        fake_clock.advance(5)
        result = await watchdog.attempt_bounce("primary", reason="manual_webhook",
                                               override=True)
        assert result.get("ok") is True

    @pytest.mark.asyncio
    async def test_bypasses_circuit_breaker(self, watchdog, fake_clock, cfg):
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        # Auto bounce should now be blocked.
        auto = await watchdog.attempt_bounce("primary", reason="silence_threshold")
        assert auto.get("skipped") == "circuit_breaker"
        # Manual still works.
        manual = await watchdog.attempt_bounce("primary", reason="manual_webhook",
                                               override=True)
        assert manual.get("ok") is True


# ---------------------------------------------------------------------------
# bounce_failed (FR-3.9b).
# ---------------------------------------------------------------------------

class TestBounceFailed:
    @pytest.mark.asyncio
    async def test_publishes_bounce_failed_on_proxy_error(
            self, cfg, fake_clock, publisher):
        from app import Watchdog, open_db
        from fakes import FakeBouncer
        bouncer = FakeBouncer(mode="error")
        wd = Watchdog(cfg, open_db(":memory:"), publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        result = await wd.attempt_bounce("primary", reason="silence_threshold")
        assert result.get("ok") is False
        names = publisher.event_names()
        assert "bounce_failed" in names
        assert "bounce" not in names

    @pytest.mark.asyncio
    async def test_failed_bounce_not_recorded_in_sqlite(
            self, cfg, fake_clock, publisher):
        from app import Watchdog, open_db, recent_bounces
        from fakes import FakeBouncer
        conn = open_db(":memory:")
        bouncer = FakeBouncer(mode="error")
        wd = Watchdog(cfg, conn, publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        await wd.attempt_bounce("primary", reason="silence_threshold")
        assert recent_bounces(conn, container="taptap-primary",
                              window_sec=cfg.circuit_breaker_window_sec) == 0


# ---------------------------------------------------------------------------
# SQLite persistence (FR-3.13, NFR-2.1).
# ---------------------------------------------------------------------------

class TestSqlitePersistence:
    @pytest.mark.asyncio
    async def test_breaker_state_survives_restart(
            self, tmp_path, cfg, fake_clock, publisher, bouncer):
        from app import Watchdog, open_db
        from dataclasses import replace
        db_path = str(tmp_path / "watchdog.db")
        cfg_disk = replace(cfg, db_path=db_path)

        # First instance: trip the breaker.
        conn1 = open_db(db_path)
        wd1 = Watchdog(cfg_disk, conn1, publisher, bouncer, clock=fake_clock)
        wd1.state.mqtt_connected = True
        for _ in range(cfg.circuit_breaker_bounces):
            await wd1.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        conn1.close()

        # Second instance, same DB on disk.
        conn2 = open_db(db_path)
        wd2 = Watchdog(cfg_disk, conn2, publisher, bouncer, clock=fake_clock)
        wd2.state.mqtt_connected = True
        # Even though wd2.state.last_bounce is empty, the breaker SQL count
        # should reflect the persisted history.
        result = await wd2.attempt_bounce("primary", reason="silence_threshold")
        assert result == {"skipped": "circuit_breaker", "container": "primary"}

    @pytest.mark.asyncio
    async def test_pruning_drops_old_rows(self, watchdog, fake_clock, cfg):
        from app import recent_bounces
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        # Skip the rolling window and the retention window.
        fake_clock.advance(cfg.sqlite_retention_sec + 100)
        await watchdog.prune()
        assert recent_bounces(
            watchdog.conn,
            container="taptap-primary",
            window_sec=cfg.circuit_breaker_window_sec,
            now=int(fake_clock())) == 0


# ---------------------------------------------------------------------------
# MQTT disconnect / reconnect grace (FR-3.12).
# ---------------------------------------------------------------------------

class TestMqttDisconnectSuspendsBouncing:
    @pytest.mark.asyncio
    async def test_silence_loop_no_bounce_when_disconnected(
            self, watchdog, fake_clock, cfg, bouncer):
        # Ensure CCA looks silent past threshold.
        watchdog.state.mqtt_connected = False
        for cca in ("primary", "secondary"):
            watchdog.state.last_seen[cca] = fake_clock() - cfg.silence_threshold_sec - 100
        results = await watchdog.check_silence()
        assert results == []
        assert bouncer.calls == []

    @pytest.mark.asyncio
    async def test_silence_loop_bounces_when_connected(
            self, watchdog, fake_clock, cfg, bouncer):
        for cca in ("primary", "secondary"):
            watchdog.state.last_seen[cca] = fake_clock() - cfg.silence_threshold_sec - 1
        results = await watchdog.check_silence()
        assert any(r.get("ok") for r in results)
        assert bouncer.calls  # at least one


class TestReconnectGrace:
    @pytest.mark.asyncio
    async def test_short_disconnect_preserves_last_seen(
            self, watchdog, fake_clock, cfg, publisher):
        # Pretend we last saw primary 600s ago.
        ago = fake_clock() - 600
        watchdog.state.last_seen["primary"] = ago
        # Now disconnect briefly.
        await watchdog.on_mqtt_disconnect()
        fake_clock.advance(cfg.mqtt_reconnect_grace_cutoff_sec - 1)
        await watchdog.on_mqtt_connect()
        # last_seen unchanged.
        assert watchdog.state.last_seen["primary"] == ago
        assert "reconnect_grace_applied" not in publisher.event_names()

    @pytest.mark.asyncio
    async def test_long_disconnect_resets_last_seen(
            self, watchdog, fake_clock, cfg, publisher):
        ago = fake_clock() - 600
        watchdog.state.last_seen["primary"] = ago
        await watchdog.on_mqtt_disconnect()
        # Long outage.
        fake_clock.advance(cfg.mqtt_reconnect_grace_cutoff_sec + 60)
        await watchdog.on_mqtt_connect()
        # last_seen reset to current time, NOT to ago.
        assert watchdog.state.last_seen["primary"] == fake_clock()
        names = publisher.event_names()
        assert "reconnect_grace_applied" in names


# ---------------------------------------------------------------------------
# FastAPI webhook (FR-3.10).
# ---------------------------------------------------------------------------

class TestWebhookAuth:
    def _client(self, watchdog, token="secret-token"):
        from fastapi.testclient import TestClient
        from app import build_app
        app = build_app(watchdog, bounce_token=token)
        return TestClient(app)

    def test_missing_token_returns_401(self, watchdog):
        client = self._client(watchdog)
        r = client.post("/bounce/primary")
        assert r.status_code == 401

    def test_wrong_token_returns_401(self, watchdog):
        client = self._client(watchdog)
        r = client.post("/bounce/primary",
                        headers={"X-Bounce-Token": "wrong"})
        assert r.status_code == 401

    def test_correct_token_succeeds(self, watchdog, bouncer):
        client = self._client(watchdog)
        r = client.post("/bounce/primary",
                        headers={"X-Bounce-Token": "secret-token"})
        assert r.status_code == 200
        body = r.json()
        assert body == {"ok": True, "bounced": "taptap-primary"}
        assert bouncer.calls == ["taptap-primary"]

    def test_unknown_cca_returns_404(self, watchdog):
        client = self._client(watchdog)
        r = client.post("/bounce/tertiary",
                        headers={"X-Bounce-Token": "secret-token"})
        assert r.status_code == 404

    def test_healthz_no_auth(self, watchdog):
        client = self._client(watchdog)
        r = client.get("/healthz")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] in ("ok", "degraded", "down")
        assert "primary" in body["ccas"]
        assert "secondary" in body["ccas"]

    def test_proxy_error_returns_500(self, cfg, fake_clock, publisher):
        from fastapi.testclient import TestClient
        from app import Watchdog, open_db, build_app
        from fakes import FakeBouncer
        bouncer = FakeBouncer(mode="error")
        wd = Watchdog(cfg, open_db(":memory:"), publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        client = TestClient(build_app(wd, bounce_token="t"))
        r = client.post("/bounce/primary", headers={"X-Bounce-Token": "t"})
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# Heartbeat + healthz (FR-3.11, FR-3.16).
# ---------------------------------------------------------------------------

class TestHeartbeat:
    def test_publishes_with_retain_true_qos_0(self, watchdog, publisher):
        watchdog.publish_heartbeat()
        # Find the heartbeat event.
        hbs = [e for e in publisher.events if e["topic"] == "taptap/watchdog/heartbeat"]
        assert len(hbs) == 1
        assert hbs[0]["retain"] is True
        assert hbs[0]["qos"] == 0
        payload = hbs[0]["payload"]
        assert "ts" in payload
        assert "uptime_seconds" in payload


class TestHealthz:
    @pytest.mark.asyncio
    async def test_status_ok_when_clean(self, watchdog):
        body = await watchdog.healthz()
        assert body["status"] == "ok"
        assert body["mqtt"]["connected"] is True

    @pytest.mark.asyncio
    async def test_status_down_when_disconnected(self, watchdog):
        watchdog.state.mqtt_connected = False
        body = await watchdog.healthz()
        assert body["status"] == "down"

    @pytest.mark.asyncio
    async def test_status_degraded_when_breaker_tripped(
            self, watchdog, fake_clock, cfg):
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        # Trigger trip publication.
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        body = await watchdog.healthz()
        assert body["status"] == "degraded"
        assert body["ccas"]["primary"]["circuit_breaker"] == "open"

    @pytest.mark.asyncio
    async def test_down_subsumes_degraded(self, watchdog, fake_clock, cfg):
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        watchdog.state.mqtt_connected = False
        body = await watchdog.healthz()
        assert body["status"] == "down"


# ---------------------------------------------------------------------------
# Event envelope shape (FR-3.8 / FR-3.9 / FR-3.9b).
# ---------------------------------------------------------------------------

class TestEventEnvelope:
    @pytest.mark.asyncio
    async def test_bounce_event_has_required_fields(
            self, watchdog, publisher, fake_clock, cfg):
        watchdog.state.last_seen["primary"] = fake_clock() - 350
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        bounce = next(e for e in publisher.events
                      if e["payload"].get("event") == "bounce")
        p = bounce["payload"]
        assert p["container"] == "taptap-primary"
        assert p["reason"] == "silence_threshold"
        assert p["silent_seconds"] >= 350
        assert p["ts"].endswith("Z")
        assert bounce["qos"] == 1
        assert bounce["retain"] is False

    @pytest.mark.asyncio
    async def test_circuit_breaker_event_retained(
            self, watchdog, publisher, fake_clock, cfg):
        for _ in range(cfg.circuit_breaker_bounces):
            await watchdog.attempt_bounce("primary", reason="silence_threshold")
            fake_clock.advance(cfg.cooldown_sec + 1)
        await watchdog.attempt_bounce("primary", reason="silence_threshold")
        trip = next(e for e in publisher.events
                    if e["payload"].get("event") == "circuit_breaker_tripped")
        assert trip["retain"] is True
        assert trip["qos"] == 1
        assert trip["payload"]["bounces_in_window"] == cfg.circuit_breaker_bounces

    @pytest.mark.asyncio
    async def test_bounce_failed_envelope(self, cfg, fake_clock, publisher):
        from app import Watchdog, open_db
        from fakes import FakeBouncer
        bouncer = FakeBouncer(mode="error")
        wd = Watchdog(cfg, open_db(":memory:"), publisher, bouncer, clock=fake_clock)
        wd.state.mqtt_connected = True
        await wd.attempt_bounce("primary", reason="silence_threshold")
        bf = next(e for e in publisher.events
                  if e["payload"].get("event") == "bounce_failed")
        p = bf["payload"]
        assert p["container"] == "taptap-primary"
        assert "error_class" in p
        assert "error_message" in p
        assert bf["retain"] is False


# ---------------------------------------------------------------------------
# Liveness signal (FR-3.3).
# ---------------------------------------------------------------------------

class TestLiveness:
    @pytest.mark.asyncio
    async def test_state_message_updates_last_seen(self, watchdog, fake_clock):
        before = watchdog.state.last_seen["primary"]
        fake_clock.advance(60)
        await watchdog.on_state_message("primary")
        assert watchdog.state.last_seen["primary"] > before
        assert watchdog.state.last_seen["primary"] == fake_clock()
