# TapTap-MQTT Docker Testing Guide

This guide documents how to deploy, test, and iterate on the taptap-mqtt Docker containers on the Raspberry Pi.

## Environment

| Component | Value |
|-----------|-------|
| Raspberry Pi IP | <PI_HOST> |
| SSH User | solar-assistant |
| Project Path (Pi) | /path/to/solar_tigo_viewer/tigo_docker |
| Project Path (NAS) | /path/to/solar_tigo_viewer/tigo_docker |
| Primary Serial | /dev/ttyACM2 |
| Secondary Serial | /dev/ttyACM3 |
| MQTT Broker | <MQTT_HOST>:1883 |

## Prerequisites

The Raspberry Pi has a NAS mount that mirrors the project directory, so file changes on the NAS are immediately available on the Pi.

## SSH Access

### Basic SSH Command
```bash
ssh $PI_USER@$PI_HOST
```

### Run Command via SSH
```bash
ssh $PI_USER@$PI_HOST "command here"
```

## Common Operations

### Check Container Status
```bash
ssh $PI_USER@$PI_HOST "sudo docker ps --filter name=taptap"
```

### View Logs
```bash
# Primary container logs (last 50 lines)
ssh $PI_USER@$PI_HOST "sudo docker logs taptap-primary --tail 50"

# Secondary container logs (last 50 lines)
ssh $PI_USER@$PI_HOST "sudo docker logs taptap-secondary --tail 50"

# Follow logs in real-time (Ctrl+C to stop)
ssh $PI_USER@$PI_HOST "sudo docker logs -f taptap-primary"
```

### Restart Containers
```bash
# Restart both containers (picks up config changes)
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose restart"

# Restart single container
ssh $PI_USER@$PI_HOST "sudo docker restart taptap-primary"
```

### Stop/Start Containers
```bash
# Stop all
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose down"

# Start all
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose up -d"
```

### Rebuild Images
```bash
# Rebuild after Dockerfile changes
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose build"

# Rebuild with no cache (force fresh download)
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose build --no-cache"

# Rebuild and restart
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose build && sudo docker compose up -d"
```

## Debugging

### Check Config File Inside Container
```bash
ssh $PI_USER@$PI_HOST "sudo docker run --rm --entrypoint cat -v /path/to/solar_tigo_viewer/tigo_docker/config-primary.ini:/app/config.ini:ro tigo_docker-taptap-primary /app/config.ini"
```

### Interactive Shell in Container
```bash
sshpass -p '<SSH_PASSWORD>' ssh -t solar-assistant@<PI_HOST> "sudo docker exec -it taptap-primary /bin/bash"
```

### Check Serial Devices
```bash
ssh $PI_USER@$PI_HOST "ls -la /dev/ttyACM*"
```

### Test taptap Binary Directly
```bash
# Run taptap binary directly (outside Docker) to verify serial works
ssh $PI_USER@$PI_HOST "sudo timeout 10 /usr/local/bin/taptap observe --serial /dev/ttyACM2 || true"
```

### Check Health Status
```bash
ssh $PI_USER@$PI_HOST "sudo docker inspect taptap-primary --format='{{.State.Health.Status}}'"
```

## MQTT Verification

### Subscribe to Topics (requires mosquitto-clients)
```bash
# Install mosquitto-clients if needed
ssh $PI_USER@$PI_HOST "sudo apt-get install -y mosquitto-clients"

# Subscribe to all taptap topics
ssh $PI_USER@$PI_HOST "timeout 30 mosquitto_sub -h <MQTT_HOST> -u homeassistant -P '<MQTT_PASSWORD>' -t 'taptap/#' -v"
```

## Iterating on Config Changes

Config files are mounted from the NAS, so changes are immediate:

1. Edit config on your local machine:
   ```
   /path/to/solar_tigo_viewer/tigo_docker/config-primary.ini
   /path/to/solar_tigo_viewer/tigo_docker/config-secondary.ini
   ```

2. Restart containers to pick up changes:
   ```bash
   ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose restart"
   ```

3. Check logs to verify:
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker logs taptap-primary --tail 20"
   ```

## Iterating on Dockerfile Changes

1. Edit Dockerfile locally:
   ```
   /path/to/solar_tigo_viewer/tigo_docker/Dockerfile
   ```

2. Rebuild and restart:
   ```bash
   ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo_docker && sudo docker compose build && sudo docker compose up -d"
   ```

## Known Issues

### ADDRESS Parameter Bug
The taptap-mqtt.py script has a validation bug that requires `ADDRESS` to be present in the config even when using serial mode. Workaround: set `ADDRESS =` (empty value) in the config file.

### Memory Limit Warning
The Pi's kernel doesn't support memory limits:
```
Your kernel does not support memory limit capabilities or the cgroup is not mounted.
```
This is just a warning - containers still run fine.

### Docker Compose Version Warning
```
the attribute `version` is obsolete, it will be ignored
```
This is informational only - can be ignored or remove `version: '3.8'` from docker-compose.yml.

## Quick Status Check (All-in-One)
```bash
ssh $PI_USER@$PI_HOST "echo '=== CONTAINERS ===' && sudo docker ps --filter name=taptap && echo '' && echo '=== PRIMARY (last 10) ===' && sudo docker logs taptap-primary --tail 10 && echo '' && echo '=== SECONDARY (last 10) ===' && sudo docker logs taptap-secondary --tail 10"
```
