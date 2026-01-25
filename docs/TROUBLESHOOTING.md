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
INFO - Connected to MQTT broker at 192.168.1.100:1883
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

1. **Check existing issues:** [GitHub Issues](https://github.com/yourusername/solar_tigo_viewer/issues)

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
