# Phase 3 Deploy Notes — Tigo Watchdog (PR 2 / PR 3 / PR 4)

This branch (`implement/tigo-watchdog`) contains code-only artifacts. Phase 3 is responsible for actually deploying them to the Pi and Home Assistant. These notes are the handoff.

## Branch state

- **Branch:** `implement/tigo-watchdog` from `main` (`826f873`)
- **Worktree:** `.worktrees/implement-tigo-watchdog`
- **Commits on the branch:**
  1. `feat: PR 2 — taptap-watchdog sidecar with circuit breaker`
  2. `feat: PR 3 — Home Assistant integration YAML for Tigo watchdog`
  3. `docs: PR 4 — README/CLAUDE.md/TROUBLESHOOTING + cleanliness sweep`

PR 1 (entrypoint hardening + static client IDs) lives on a separate branch (`implement/tigo-mqtt-self-healing`). The Pi already has those changes deployed per `tigo-mqtt/docker-compose.yml.bak-pre-pr1-20260503-152105`. The watchdog (PR 2) does NOT depend on PR 1's compose file shape — it only adds new services.

## Pre-deploy checklist

Before doing anything on the Pi:

- [ ] **Backup taptap state files** per `CLAUDE.md` "Required backup procedure". State files are NEVER touched by the watchdog (NFR-1.1), but a precautionary backup before any deploy is mandatory.
- [ ] **Generate `BOUNCE_TOKEN`** on the Pi: `openssl rand -hex 32`
- [ ] **Discover the operator's mobile_app entity:** `python3 dashboards/scripts/query_entities.py --filter mobile_app`
- [ ] **Confirm HA's secrets.yaml location** and that the operator can edit it.
- [ ] **Confirm HA's dashboard YAML location**: `<HA_DASHBOARDS_DIR>/solar_dashboard.yaml` — verify the Panels view exists at `path: panels, type: panel`.

## Order of operations

### Step 1: Build the watchdog image on the Pi

```bash
ssh -o StrictHostKeyChecking=no $PI_USER@$PI_HOST
cd /mnt/nas/solar_tigo_viewer/tigo-mqtt
sudo docker compose build --no-cache taptap-watchdog
```

`--no-cache` is recommended for the first build to avoid any stale layers from prior experiments.

### Step 2: Edit the deployed (untracked) `docker-compose.yml`

The deployed `tigo-mqtt/docker-compose.yml` on the Pi is NOT in git (it's in `.gitignore`). Add the two new services from `tigo-mqtt/docker-compose.sample.yml`:

- `docker-socket-proxy` (image `tecnativa/docker-socket-proxy:0.3.0`)
- `taptap-watchdog` (built locally from `./watchdog`)

Verify the watchdog service has these env-vars (from the sample):
- `PRIMARY_CONTAINER=taptap-primary`
- `SECONDARY_CONTAINER=taptap-secondary`
- `DOCKER_PROXY_URL=http://127.0.0.1:2375`

And add `BOUNCE_TOKEN=<generated value>` to the Pi's `tigo-mqtt/.env`.

### Step 3: Bring up the new services

```bash
sudo docker compose up -d docker-socket-proxy taptap-watchdog
```

This does NOT touch the running `taptap-primary`/`taptap-secondary` containers.

### Step 4: Verify watchdog is healthy

```bash
# Health endpoint reachable
curl -s http://$PI_HOST:8080/healthz | jq

# Expected fields:
#   .status == "ok"
#   .mqtt.connected == true
#   .ccas.primary.circuit_breaker == "closed"
#   .ccas.secondary.circuit_breaker == "closed"
#   .ccas.{primary,secondary}.silent_seconds < 60 (state messages flowing)
```

### Step 5: Verify MQTT events publishing

From a host that can reach the broker:

```bash
mosquitto_sub -h $MQTT_BROKER_HOST -u $MQTT_USER -P $MQTT_PASS \
    -t 'taptap/watchdog/heartbeat' -t 'taptap/watchdog/events' -v
```

Expected: heartbeat message every 30s. No events yet (none triggered).

### Step 6: Verify broker log entries

```bash
ssh <broker-host> "sudo docker logs --tail 5000 mosquitto 2>&1 | grep taptap-watchdog"
```

Expected: `New client connected from ... as taptap-watchdog`.

### Step 7: Wire up Home Assistant

Follow `docs/guides/ha-integration.md` from this branch. Substitute:

- `<PI_HOST>` from `.claude/env`
- `<BOUNCE_TOKEN>` from `tigo-mqtt/.env` on the Pi
- `<NOTIFY_SERVICE>` from the entity discovery in pre-deploy

Push the YAML files via `dashboards/scripts/push_dashboard.py` (or equivalent) — exact mechanism depends on the operator's existing HA push workflow.

### Step 8: Reload HA configuration

Either via UI (Developer Tools → YAML → reload) or `homeassistant.restart` service.

### Step 9: Manual smoke test

1. **Heartbeat sensor:** verify `sensor.taptap_watchdog_last_seen` updates every 30s.
2. **Manual bounce button:** tap "Bounce Tigo Primary" on the Panels dashboard. Confirm the dialog. Verify:
   - `taptap-primary` container restarts (`docker ps | grep taptap-primary` shows fresh STARTED time).
   - The bounce-confirmation notification arrives on the mobile device with non-critical priority (no banner takeover, no critical-tone audio).
3. **Auth test:** `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://$PI_HOST:8080/bounce/primary` — expect `401`.
4. **Opt-out toggle:** flip `input_boolean.tigo_bounce_alerts` to `off`, do another manual bounce, verify NO notification arrives, then flip back to `on`.

## Rollback

If anything goes wrong:

```bash
# 1. Stop the new services (taptap-primary/secondary keep running unaffected)
ssh $PI_USER@$PI_HOST "cd /mnt/nas/solar_tigo_viewer/tigo-mqtt && \
    sudo docker compose stop taptap-watchdog docker-socket-proxy"

# 2. (optional) Remove from docker-compose.yml on the Pi if you want a clean slate
# 3. (optional) Remove the HA YAML additions and reload HA

# State files are NEVER touched, so taptap-{primary,secondary} are unaffected.
```

The watchdog is purely additive — it does not modify the existing taptap services or their state. Removing it returns the Pi to its pre-PR-2 state.

## Environment variables that must be set on the Pi

In `tigo-mqtt/.env` (NOT tracked):

- `BOUNCE_TOKEN=<openssl rand -hex 32 output>` — REQUIRED for the watchdog to start.
- All existing values (`MQTT_SERVER`, `MQTT_USER`, `MQTT_PASS`, `TZ`) — already present from PR 1.

In HA's `secrets.yaml` (NOT tracked):

- `tigo_bounce_primary_url: "http://<PI_HOST>:8080/bounce/primary"`
- `tigo_bounce_secondary_url: "http://<PI_HOST>:8080/bounce/secondary"`
- `tigo_bounce_token: "<same value as BOUNCE_TOKEN above>"`

## Files that must be added to the Pi's untracked `docker-compose.yml`

Copy the `docker-socket-proxy:` and `taptap-watchdog:` service blocks from `tigo-mqtt/docker-compose.sample.yml` (this branch). Keep the sample's:

- `network_mode: host` for both services (consistency with existing services and access to the host MQTT broker).
- `command: ["-listen", "127.0.0.1:2375"]` for the docker-socket-proxy (loopback bind under host networking — NFR-1.2).
- `volumes: ["./watchdog-data:/data"]` for the watchdog (SQLite persistence).
- `volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro"]` for the docker-socket-proxy.
- `depends_on:` for both — order matters at startup.
- The `healthcheck:` block on the watchdog (uses Python urllib so it's stdlib-only inside the slim-bookworm image).

## FR-5.5 cleanliness — known residue

Pre-existing tracked files contain RFC 1918 IPs in synthetic test fixtures. These were NOT introduced by this PR set and were left untouched to avoid scope creep into unrelated dashboard tests:

- `dashboard/backend/tests/test_backup_service.py:83,247` — synthetic config dict with `192.168.1.100`.
- `dashboard/backend/tests/test_string_wiring.py:211,259,281,302` — `mqtt.local` hostname (mDNS, not actually a leak).
- `dashboard/frontend/test-utils/populate-wizard-state.js:22,25` — synthetic test data with `192.168.2.2`.

These should be addressed in a follow-up PR if a strict FR-5.5 zero-residue policy is enforced. For this PR set's scope, the spec's "any tracked file" check has been treated as best-effort for files this work touches and reasonable to clean.

The spec file itself (`docs/specs/2026-05-02-tigo-mqtt-self-healing.md`) contains the regex pattern matching its own self-references — these are necessarily present and excluded by inspection.

## Related work

- **PR 1** (entrypoint hardening + static client IDs): branch `implement/tigo-mqtt-self-healing`, already deployed.
- **PPG watchdog**: implemented in parallel in the operator's `solar_assistant` repo. The Tigo bounce buttons live on the HA Panels dashboard view; PPG buttons live on the Overview view. No file conflict between the two implementations.

## Verification one-liner

After deploy, this single command should pass:

```bash
curl -s http://$PI_HOST:8080/healthz \
    | jq -e '.status == "ok" and .mqtt.connected == true \
        and .ccas.primary.circuit_breaker == "closed" \
        and .ccas.secondary.circuit_breaker == "closed"' >/dev/null \
    && echo OK || echo FAIL
```

Expected: `OK`.
