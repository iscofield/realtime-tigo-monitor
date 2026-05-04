# taptap-watchdog

Pi-side sidecar that detects MQTT silence from `taptap-{primary,secondary}`
containers and bounces them autonomously, with cooldown and circuit-breaker
safety rails.

Specification: `docs/specs/2026-05-02-tigo-mqtt-self-healing.md`

## What it does

- Subscribes to `taptap/primary/state` and `taptap/secondary/state` (the
  upstream taptap heartbeat) and tracks the last-seen timestamp for each CCA.
- If a CCA has been silent for more than `SILENCE_THRESHOLD_SEC` (default
  `300` = 5 min), restarts its container via `docker-socket-proxy`.
- Refuses to bounce the same container twice within `COOLDOWN_SEC` (default
  `900` = 15 min).
- Trips a circuit breaker if more than `CIRCUIT_BREAKER_BOUNCES` (default 3)
  automatic bounces occur in `CIRCUIT_BREAKER_WINDOW_SEC` (default 1 hr).
- Publishes every decision (bounce, bounce_failed, circuit_breaker_tripped,
  circuit_breaker_reset, reconnect_grace_applied) to
  `taptap/watchdog/events`. Heartbeats every 30s to
  `taptap/watchdog/heartbeat`.
- Exposes `POST /bounce/{primary|secondary}` (token-authenticated) and
  `GET /healthz` on port `8080`.

## Safety boundaries

- **State files are NEVER touched.** The watchdog does not mount the
  `tigo-mqtt/data` volume. See spec NFR-1.1.
- **Least-privilege Docker.** The watchdog talks to `docker-socket-proxy`
  bound to loopback only, which restricts it to `POST
  /containers/<name>/restart`.
- **MQTT-aware.** When the broker is unreachable, the watchdog stops bouncing
  (it can't see liveness signals, and bouncing won't fix a broker outage).

## Quick reference

```sh
# View logs
sudo docker logs taptap-watchdog

# Inspect state
curl http://<PI_HOST>:8080/healthz | jq

# Manual bounce (requires the BOUNCE_TOKEN from the Pi's tigo-mqtt/.env)
curl -X POST -H "X-Bounce-Token: $BOUNCE_TOKEN" http://<PI_HOST>:8080/bounce/primary

# Disable for planned maintenance
sudo docker compose -f /mnt/nas/solar_tigo_viewer/tigo-mqtt/docker-compose.yml \
    stop taptap-watchdog
```

## Files

| Path | Purpose |
|---|---|
| `app.py` | The watchdog itself: state machine, MQTT bridge, FastAPI webhook. |
| `requirements.txt` | Pinned dependencies (paho-mqtt, fastapi, uvicorn, httpx). |
| `Dockerfile` | Build context for the `taptap-watchdog` service. |
| `tests/test_app.py` | Unit tests for cooldown, breaker, persistence, webhook auth. |

## Running tests

```sh
cd tigo-mqtt/watchdog
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt pytest pytest-asyncio
pytest tests/ -v
```
