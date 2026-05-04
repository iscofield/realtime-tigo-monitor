# Troubleshooting Guide

This guide covers common issues and their solutions.

## Quick Diagnostic Commands

Run these commands to quickly assess system status:

### Check Container Status

```bash
# On Raspberry Pi (tigo-mqtt)
docker ps --filter name=taptap

# On Dashboard server
docker ps --filter name=dashboard
```

### Check API Health

```bash
curl -s http://your-server:3050/api/health
```

### Check Panel Data

```bash
curl -s "http://your-server:3050/api/panels" | python3 -c "
import sys, json
data = json.load(sys.stdin)
panels = data.get('panels', [])
with_data = [p for p in panels if p.get('watts') is not None]
print(f'Total panels: {len(panels)}')
print(f'Panels with data: {len(with_data)}')
print(f'Panels without data: {len(panels) - len(with_data)}')
"
```

### View Logs

```bash
# tigo-mqtt logs
ssh pi@raspberry-pi "docker logs taptap-primary --tail 50"

# Dashboard backend logs
docker logs dashboard-backend-1 --tail 50
```

## Common Issues

### Dashboard Shows "-" for All Panels

**Symptoms:** All panel values show "-" or no data.

**Possible Causes:**

1. **tigo-mqtt not running**
   ```bash
   ssh pi@raspberry-pi "docker ps --filter name=taptap"
   ```
   If containers aren't running, start them:
   ```bash
   ssh pi@raspberry-pi "cd solar_tigo_viewer/tigo-mqtt && docker compose up -d"
   ```

2. **MQTT connection failed**
   Check backend logs for MQTT errors:
   ```bash
   docker logs dashboard-backend-1 | grep -i mqtt
   ```
   Verify MQTT credentials in `backend/.env`.

3. **It's nighttime**
   Tigo optimizers don't report data when panels aren't producing power. This is normal behavior.

4. **Topic prefix mismatch**
   Ensure `MQTT_TOPIC_PREFIX` matches in both tigo-mqtt and dashboard configurations.

### Panels Show as Stale

**Symptoms:** Panels have a yellow/orange "stale" indicator.

**Explanation:** Panels are marked stale when they haven't reported data within the threshold (default: 5 minutes).

**Normal Causes:**
- Panels in shade
- Low-light conditions (dawn/dusk)
- Tigo optimizers reporting at longer intervals

**Abnormal Causes:**
- tigo-mqtt service stopped
- MQTT broker issues
- USB disconnection from CCA

**Solution:**
1. Check tigo-mqtt is running and publishing
2. Verify MQTT broker is accessible
3. Check USB connections on Raspberry Pi

### Container Restart Policy: taptap-* stays dead despite `restart: always`

**Symptoms:** A `taptap-primary` or `taptap-secondary` container with `restart: always` (or `unless-stopped`) is in `Exited` state and is not being restarted by the Docker daemon, even though Docker should auto-restart on any exit.

**Background — the 2026-04-20 outage:**

Both `taptap-primary` and `taptap-secondary` exited at exactly the same millisecond on 2026-04-20 16:00:13 (after a broker disconnect, rc=7) and stayed dead for 12 days. The fault chain was:

1. MQTT broker disconnected both clients (rc=7 from paho).
2. taptap-mqtt called `sys.exit(1)` rather than reconnecting.
3. The previous entrypoint cleanup (`rm -f /run/taptap/taptap.run`) didn't handle a leftover `/run/taptap` *directory* with stale contents. On restart, taptap-mqtt's `os.makedirs("/run/taptap")` raised `[Errno 17] File exists`.
4. Docker's `restart: always` *did* try to restart (RestartCount went from 0 → 1) but the container failed to come back, and after that single retry the daemon stopped looping.

**FR-1.2 forensic findings (2026-05-03):**

12 days after the failure, evidence is stale:

- `docker inspect taptap-{primary,secondary} --format '{{.RestartCount}}'` → both report `1`. Docker tried to restart at least once.
- `journalctl -u docker --since '2026-04-20 15:00' --until '2026-04-20 17:00'` → empty. systemd-journald's default retention had rolled the relevant window.
- `docker events --since '2026-04-20T15:00:00' --until '2026-04-20T17:00:00'` → empty. Docker's event history is in-memory and does not persist across daemon restarts.

**Why `restart: always` did not loop:** indeterminate from available evidence. The most plausible explanation given RestartCount=1: the daemon hit Docker's exponential backoff cap after the first failed restart attempt, and subsequent retries were spaced far enough apart that they never reached steady state. An alternative explanation — that an admin issued `docker stop` (which sets a `manuallyStopped` flag suppressing auto-restart) — is unsupported by any evidence and inconsistent with the symmetric exit timestamps on both containers.

**Mitigation (shipped in PR 1, FR-1.1):**

The entrypoint now does `rm -rf /run/taptap/* /run/taptap/.[!.]* && mkdir -p /run/taptap` instead of just `rm -f /run/taptap/taptap.run`, which handles the directory-with-stale-contents case the old entrypoint missed. The watchdog (PR 2) is the authoritative recovery mechanism going forward; `restart: always` is best-effort.

**If you encounter this again:**

1. Capture forensics *immediately* — `journalctl` and `docker events` history is short-lived:
   ```bash
   docker inspect taptap-primary taptap-secondary --format '{{.Name}}: RestartCount={{.RestartCount}} Exit={{.State.ExitCode}} Finished={{.State.FinishedAt}}'
   sudo journalctl -u docker --since '15 minutes ago' > /tmp/docker-daemon.log
   sudo docker events --since '15m' &  # capture going forward
   ```
2. Rebuild and redeploy if the entrypoint or Dockerfile has changed:
   ```bash
   cd tigo-mqtt
   docker compose build --no-cache taptap-primary taptap-secondary
   docker compose up -d
   ```
3. If the watchdog (PR 2+) is deployed, manually trigger a bounce via its webhook to confirm recovery works end-to-end.

### Watchdog circuit breaker tripped

**Symptoms:** Home Assistant fires the "Tigo: watchdog gave up on \<container\>" notification, OR the dashboard shows persistent silence on a CCA without watchdog bounces happening, OR `curl http://<PI_HOST>:8080/healthz | jq` returns `"circuit_breaker": "open"` for one or both CCAs.

**What it means:** The watchdog auto-bounced the same container 3 times within an hour without restoring data flow. The circuit breaker is intentionally hard-stopping further automatic bounces — the failure is most likely persistent (bad serial cable, dead CCA, network issue between Pi and NAS) and bouncing more won't help.

**Diagnostic steps (in order):**

1. **Confirm the breaker is actually tripped.**
   ```sh
   curl http://<PI_HOST>:8080/healthz | jq '.ccas'
   ```
   Look for `"circuit_breaker": "open"` and `"bounces_last_hour": >= 3`.

2. **Check the watchdog logs for what happened.**
   ```sh
   ssh solar-assistant@<PI_HOST> "sudo docker logs --since 2h taptap-watchdog 2>&1" \
     | grep -E "bounce|circuit_breaker"
   ```
   Look for `bounce_failed` events (docker-socket-proxy errored) versus `bounce` events (Docker said OK but the container went silent again).

3. **Check the underlying taptap container.**
   ```sh
   ssh solar-assistant@<PI_HOST> "sudo docker ps -a --filter name=taptap-"
   ```
   If the container is in `Restarting` or `Exited`, see "Container Restart Policy" above.

4. **Check the serial cable and CCA.** If the watchdog is healthy but bounces don't fix the CCA, the problem is below the watchdog — likely a hardware fault. Inspect the USB cable to the CCA and confirm `/dev/tigo-{primary,secondary}` resolve on the Pi.

**Recovery:**

The breaker is implicit (computed from a SQL count of recent bounces). Once the rolling window (default 60 min) ages out and old bounces drop off, the breaker clears automatically — the watchdog publishes a `circuit_breaker_reset` event when this happens.

To force an immediate manual recovery (bypassing the breaker):

```sh
curl -X POST -H "X-Bounce-Token: $BOUNCE_TOKEN" \
    http://<PI_HOST>:8080/bounce/primary
```

(Manual webhook bounces are excluded from the breaker count, so you can fire as many as you want without re-tripping it.)

To clear the breaker count entirely (only if you've fixed the underlying issue and want a clean slate):

```sh
ssh solar-assistant@<PI_HOST> \
  "sudo docker exec taptap-watchdog sqlite3 /data/watchdog.db 'DELETE FROM bounces;'"
```

This is destructive — you lose audit history. Prefer the manual bounce approach for normal recovery.

### HA notifications not arriving for Tigo watchdog events

**Symptoms:** A bounce, breaker trip, or unrecovered event clearly happened (visible in `taptap/watchdog/events` MQTT messages and in the watchdog logs), but no notification arrived on the user's mobile device.

**Common causes (in order of frequency):**

1. **The opt-out boolean is off.** Check Developer Tools → States in HA for `input_boolean.tigo_bounce_alerts`, `tigo_unrecovered_alerts`, `tigo_escalation_alerts`, `tigo_watchdog_alerts`. All four default to `on` per FR-4.8 — toggle on if any are off.

2. **HA isn't subscribed to the broker.** Verify HA's MQTT integration is connected and shows `taptap/watchdog/events` in the recent messages list. If HA disconnected, retained `circuit_breaker_*` events will arrive on reconnect, but non-retained `bounce` events that fired during the outage are lost.

3. **`<NOTIFY_SERVICE>` placeholder wasn't substituted.** Look in `automations.yaml` for any literal `notify.<NOTIFY_SERVICE>` — there should be 4 occurrences, all replaced with the operator's actual `notify.mobile_app_<device>` entity name. Discover via `python3 dashboards/scripts/query_entities.py --filter mobile_app`.

4. **The mobile device's HA Companion app is unauthorized or backgrounded too long.** Verify by sending a test notification from Developer Tools → Services → `notify.mobile_app_<device>`.

5. **Watchdog dead detection false-positive.** If `binary_sensor.taptap_watchdog_dead` is `on` but `docker logs taptap-watchdog` shows the watchdog is fine, the problem is between HA and the broker. The heartbeat sensor uses `value_template: "{{ value_json.ts }}"` to extract the embedded timestamp — if it instead uses `last_changed`, retain semantics will silently break the detection. Verify the YAML matches `tigo-mqtt/ha-integration/sensors.yaml`.

**Diagnostic command:** Watch the events topic live during a manual bounce:

```sh
mosquitto_sub -h <MQTT_BROKER_HOST> -u <MQTT_USER> -P <MQTT_PASS> \
    -t 'taptap/watchdog/events' -t 'taptap/watchdog/heartbeat' -v
```

If events appear here but not in HA, the issue is HA-side (steps 2 and 3 above). If events DON'T appear here, the watchdog isn't publishing — see "Watchdog circuit breaker tripped" or check the watchdog container logs.

### NAS mount fails on boot ("Network is unreachable")

**Symptoms after a Pi reboot:**

- `/mnt/nas/` exists but appears empty (or shows only stub directories)
- Docker containers with bind mounts from `/mnt/nas/` either fail to start or come up with missing data
- `systemctl status mnt-nas.mount` shows `failed` with `Result: exit-code` and `Network is unreachable` in the journal
- `mount | grep nas` returns nothing

**Root cause (observed 2026-05-03):**

The systemd `mnt-nas.mount` unit triggers when `network-online.target` is reached, but on this Pi `network-online.target` is reached before the network is actually *routable*. CIFS attempts the mount, hits `Network is unreachable`, and systemd's default `StartLimit` (5 retries within 10 seconds) exhausts before the network finishes coming up. The mount then stays failed for the entire uptime.

**Diagnose:**

```bash
ssh <PI_HOST>
systemctl status mnt-nas.mount --no-pager
journalctl -u mnt-nas.mount --no-pager | tail -20
ping -c 3 <MQTT_BROKER_HOST>   # confirm NAS is now reachable
```

**Recover the current uptime:**

```bash
sudo systemctl reset-failed mnt-nas.mount mnt-nas.automount
sudo systemctl restart mnt-nas.mount
mount | grep nas               # confirm mount succeeded
```

After the mount is up, restart any containers that depend on it:

```bash
cd /mnt/nas/solar_tigo_viewer/tigo-mqtt && sudo docker compose up -d
sudo docker start ppg_primary_top ppg_primary_bottom ppg_secondary_top
```

**Permanent fix:**

Run the boot-hardening installer once on the Pi. It installs systemd drop-ins that:
- Make `mnt-nas.mount` ping the NAS in a `ExecStartPre` loop before attempting the mount
- Widen `StartLimitBurst` from 5 to 20 retries
- Make `docker.service` depend on `mnt-nas.mount` so containers don't start before storage is available

```bash
ssh <PI_HOST>
cd /mnt/nas/solar_tigo_viewer/tigo-mqtt/scripts
sudo ./install-pi-boot-hardening.sh
```

The script is idempotent (safe to re-run) and writes only systemd drop-ins (under `*.d/`), so it's reversible by deleting those directories.

### Container exits immediately when serial device is missing

**Symptoms:** `taptap-{primary,secondary}` containers fail to start or restart-loop with errors about `/dev/tigo-{primary,secondary}` not existing, even though `lsusb` shows the WCH adapter is present.

**Root cause:** Cold-boot race — the container starts before udev has finished creating the `/dev/tigo-*` symlinks.

**Fix (already in `tigo-mqtt/entrypoint.sh`):** the entrypoint now reads the `SERIAL` config value and waits up to 60 seconds for the device to appear. This eliminates the race for any post-boot start. Configurable via the `SERIAL_WAIT_SECONDS` env var if a different timeout is needed.

If the device still never appears, it's a hardware issue — see "USB Serial Disconnect" below.

### MQTT Connection Issues

**Symptoms:** Backend logs show "Connection refused" or "Authentication failed".

**Solutions:**

1. **Verify broker is running:**
   ```bash
   # Test connection with mosquitto_sub
   mosquitto_sub -h your-broker -p 1883 -u user -P password -t '#' -v
   ```

2. **Check firewall:**
   Ensure port 1883 is open between the dashboard server and MQTT broker.

3. **Verify credentials:**
   Double-check username and password in `backend/.env`.

4. **Check broker logs:**
   ```bash
   # For Home Assistant Mosquitto
   # Check add-on logs in Home Assistant UI

   # For standalone Mosquitto
   docker logs mosquitto
   ```

### USB Serial Disconnect

**Symptoms:** tigo-mqtt stops receiving data, logs show device errors.

**Diagnosis:**
```bash
# Check for USB events
dmesg | grep -i 'ttyACM\|usb' | tail -20

# Verify serial devices exist
ls -la /dev/ttyACM*
```

**Solutions:**

1. **Reconnect USB cable** — Unplug and replug the CCA USB connection

2. **Check power supply** — Ensure the Pi has adequate power (use official power supply)

3. **Restart tigo-mqtt:**
   ```bash
   docker compose restart
   ```

4. **If device path changed** — Update the serial device path in your configuration

### Container Won't Start

**Error: "Unable to write to file"**
```bash
cd tigo-mqtt
docker compose down
docker compose build --no-cache
docker compose up -d
```

**Error: "Volume mount errors"**
```bash
docker rm -f taptap-primary taptap-secondary
docker compose build
docker compose up -d
```

**Error: "Port already in use"**
```bash
# Find what's using the port
sudo lsof -i :5174
# or
sudo netstat -tlnp | grep 5174

# Stop the conflicting service or change the port in docker-compose.yml
```

### WebSocket Disconnections

**Symptoms:** Dashboard shows "Disconnected" or data stops updating.

**Solutions:**

1. **Check backend is running:**
   ```bash
   docker ps --filter name=backend
   ```

2. **Check for errors in browser console:**
   Open browser DevTools (F12) → Console tab

3. **Verify WebSocket endpoint:**
   The frontend should connect to `/ws` on the backend.

4. **Reverse proxy issues:**
   If using a reverse proxy, ensure WebSocket upgrade is configured:
   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```

### Setup Wizard Issues

**Can't test MQTT connection:**
- Verify MQTT broker is running and accessible
- Check firewall rules
- Try using IP address instead of hostname

**Panel discovery shows no panels:**
- Ensure tigo-mqtt is running on the Raspberry Pi
- Wait a few minutes for panels to report (requires daylight)
- Check MQTT topic prefix matches

**Configuration not saving:**
- Check backend logs for errors
- Verify the config directory is writable
- Ensure adequate disk space

### Layout Image Issues

**Image not displaying:**
- Verify the image was uploaded successfully
- Check file format (PNG, JPEG, or WebP)
- Maximum file size is 10MB

**Panels not appearing on layout:**
- Ensure panels have positions assigned
- Check the Layout Editor for unpositioned panels
- Try refreshing the page

## Log Analysis

### Understanding tigo-mqtt Logs

```
INFO - Connected to MQTT broker at <MQTT_BROKER_HOST>:1883
INFO - Publishing to taptap/inverter1/state
INFO - 8 nodes reporting
```
This indicates normal operation.

```
ERROR - Failed to connect to MQTT broker
WARNING - No data from CCA for 60 seconds
```
These indicate issues requiring attention.

### Understanding Backend Logs

```
INFO - Connected to MQTT broker
INFO - WebSocket client connected
INFO - Received panel update: 8 panels
```
Normal operation.

```
ERROR - MQTT connection lost, reconnecting...
WARNING - Panel A1 marked stale (no update for 300s)
```
Issues to investigate.

## Performance Issues

### Dashboard Loading Slowly

1. **Check network connection** between your device and the dashboard server
2. **Reduce number of visible columns** in Table View
3. **Check server resources:**
   ```bash
   docker stats
   ```

### High CPU Usage

1. **Check container resource usage:**
   ```bash
   docker stats --no-stream
   ```

2. **Reduce WebSocket batch interval** (increase `WS_BATCH_INTERVAL_MS`)

3. **Check for runaway processes:**
   ```bash
   top -c
   ```

## Getting Help

If you can't resolve an issue:

1. **Check existing issues:** [GitHub Issues](https://github.com/iscofield/solar_tigo_viewer/issues)

2. **Gather diagnostic information:**
   - Container logs
   - Browser console errors
   - System configuration

3. **Open a new issue** with:
   - Description of the problem
   - Steps to reproduce
   - Relevant logs
   - System information (OS, Docker version, etc.)

## Reset and Recovery

### Factory Reset

To completely reset the dashboard configuration:

1. Open the Settings menu
2. Select "Re-run Setup Wizard"
3. Choose to keep or delete the layout image
4. Reconfigure through the wizard

### Restore from Backup

If you have a backup:

1. Open the dashboard
2. Click Settings → Restore Configuration
3. Select your backup ZIP file
4. Follow the wizard to complete restoration

### Manual Reset

If the UI is inaccessible:

```bash
cd dashboard
docker compose down

# Remove configuration files
rm -rf backend/config/*.yaml
rm -rf backend/assets/layout.png

docker compose up -d
```

The setup wizard will appear on next access.
