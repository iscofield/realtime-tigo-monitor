# Realtime Tigo Monitor Troubleshooting Guide

This guide covers common issues, diagnostic steps, and resolutions for the Realtime Tigo Monitor system.

## System Architecture Overview

Understanding the data flow is critical for troubleshooting:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Raspberry Pi (<PI_HOST>)                         │
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐        │
│  │ Tigo CCA     │     │ Tigo CCA     │     │                  │        │
│  │ (Primary)    │     │ (Secondary)  │     │  temp-id-monitor │        │
│  │ /dev/ttyACM2 │     │ /dev/ttyACM3 │     │                  │        │
│  └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘        │
│         │                    │                      │                   │
│  ┌──────▼───────┐     ┌──────▼───────┐              │                   │
│  │ taptap-      │     │ taptap-      │◄─────────────┘                   │
│  │ primary      │     │ secondary    │  (monitors logs)                 │
│  └──────┬───────┘     └──────┬───────┘                                  │
│         │                    │                                          │
│         └─────────┬──────────┘                                          │
│                   │ MQTT Publish                                        │
└───────────────────┼─────────────────────────────────────────────────────┘
                    ▼
             ┌─────────────┐
             │ MQTT Broker │ (<MQTT_HOST>:1883)
             └──────┬──────┘
                    │ MQTT Subscribe
┌───────────────────┼─────────────────────────────────────────────────────┐
│                   ▼           NAS / Server                              │
│            ┌─────────────┐                                              │
│            │  Backend    │ (FastAPI, port 3050)                         │
│            │  Container  │                                              │
│            └──────┬──────┘                                              │
│                   │ WebSocket                                           │
│            ┌──────▼──────┐                                              │
│            │  Frontend   │ (nginx, port 5174)                           │
│            │  Container  │                                              │
│            └─────────────┘                                              │
│                                                                         │
│            Access: https://your-domain.example.com                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Diagnostic Commands

### All-in-One Status Check (Raspberry Pi)
```bash
ssh $PI_USER@$PI_HOST "echo '=== CONTAINERS ===' && sudo docker ps --filter name=taptap && echo '' && echo '=== PRIMARY (last 10) ===' && sudo docker logs taptap-primary --tail 10 && echo '' && echo '=== SECONDARY (last 10) ===' && sudo docker logs taptap-secondary --tail 10"
```

### Check API Data Status
```bash
curl -s "https://your-domain.example.com/api/panels" | python3 -c "
import sys,json
data=json.load(sys.stdin)
primary=[p for p in data['panels'] if p['system']=='primary']
secondary=[p for p in data['panels'] if p['system']=='secondary']
p_data=[p for p in primary if p['watts'] is not None]
s_data=[p for p in secondary if p['watts'] is not None]
print(f'Primary: {len(p_data)}/{len(primary)} panels with data')
print(f'Secondary: {len(s_data)}/{len(secondary)} panels with data')
"
```

---

## Common Issues and Resolutions

### Issue 1: Frontend Shows "-" for All Panels

**Symptom:** The web interface displays "-" instead of watts/voltage values for all panels.

**Diagnostic Steps:**

1. **Check if taptap containers are running:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker ps --filter name=taptap"
   ```

   If no containers are listed, they've crashed. See [Container Crash Recovery](#container-crash-recovery).

2. **Check if backend is receiving MQTT data:**
   ```bash
   curl -s "https://your-domain.example.com/api/panels" | head -c 500
   ```

   If all `watts` values are `null`, the backend isn't receiving data from MQTT.

3. **Check backend logs (on NAS/server):**
   ```bash
   cd /path/to/dashboard && docker compose logs backend --tail 50
   ```

   Look for:
   - `Connected to MQTT broker` - confirms MQTT connection
   - `Received temp_nodes` / `Received node_mappings` - confirms some MQTT traffic
   - No `Received state` messages = taptap not publishing power data

4. **Check taptap logs for "came online" messages:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker logs taptap-primary 2>&1 | grep 'came online' | wc -l"
   ```

   If 0, panels haven't reported data yet (could be nighttime or communication issue).

---

### Issue 2: Container Crash / Won't Start

**Symptom:** Containers show as exited or keep restarting.

**Common Error Messages:**

#### "Unable to write to file: /run/taptap/taptap.run error: [Errno 17] File exists"
**Cause:** Usually indicates a volume mount path issue, often after repo restructuring.

**Resolution:**
```bash
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose down && sudo docker compose build --no-cache && sudo docker compose up -d"
```

#### "mount src=... not a directory: Are you trying to mount a directory onto a file"
**Cause:** Docker has stale container configuration with old volume paths.

**Resolution:** Force remove old containers and rebuild:
```bash
ssh $PI_USER@$PI_HOST "sudo docker rm -f taptap-primary taptap-secondary temp-id-monitor 2>/dev/null; cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose build && sudo docker compose up -d"
```

---

### Issue 3: Primary Works, Secondary Shows No Data

**Symptom:** Primary container has panels online, secondary has 0.

**Diagnostic Steps:**

1. **Check secondary container status:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker ps --filter name=taptap-secondary --format '{{.Names}}: {{.Status}}'"
   ```

2. **Check if secondary enumerated nodes:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker logs taptap-secondary 2>&1 | grep 'Permanently enumerated' | wc -l"
   ```

   Should show 27 nodes for secondary. If 0, there's a serial communication issue.

3. **Check if nodes came online:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker logs taptap-secondary 2>&1 | grep 'came online' | wc -l"
   ```

   If enumerated but none online:
   - Could be normal (panels in shade, different sun angle)
   - Could be stale container - try rebuilding

4. **Verify serial device exists:**
   ```bash
   ssh $PI_USER@$PI_HOST "ls -la /dev/ttyACM3"
   ```

**Resolution:** If container was created before a repo restructure, rebuild:
```bash
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose down && sudo docker compose build && sudo docker compose up -d"
```

---

### Issue 4: USB Serial Disconnect

**Symptom:** Containers crash simultaneously, logs show communication errors.

**Diagnostic Steps:**

1. **Check dmesg for USB events:**
   ```bash
   ssh $PI_USER@$PI_HOST "dmesg | grep -i 'ttyACM\|usb' | tail -20"
   ```

   Look for `USB disconnect` followed by `New USB device found`.

2. **Check system logs around crash time:**
   ```bash
   ssh $PI_USER@$PI_HOST "journalctl --since '2026-01-18 10:15:00' --until '2026-01-18 10:25:00' | grep -i 'docker\|taptap' | head -30"
   ```

3. **Verify serial devices are present:**
   ```bash
   ssh $PI_USER@$PI_HOST "ls -la /dev/ttyACM*"
   ```

   Should show: ttyACM0, ttyACM1, ttyACM2, ttyACM3

**Resolution:**
- With correct paths, containers should auto-restart via `restart: unless-stopped`
- If they don't restart, manually restart:
  ```bash
  ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose restart"
  ```

---

### Issue 5: Temporary Node IDs Detected

**Symptom:** Dashboard shows panels with "temp" indicator or temp-id-monitor alerts.

**Diagnostic Steps:**

1. **Check temp-id-monitor logs:**
   ```bash
   ssh $PI_USER@$PI_HOST "sudo docker logs temp-id-monitor --tail 30"
   ```

   Look for `Published temp_nodes for primary: [...]` with non-empty arrays.

2. **Check MQTT for temp_nodes:**
   ```bash
   # Subscribe to temp_nodes topics
   ssh $PI_USER@$PI_HOST "timeout 10 mosquitto_sub -h <MQTT_HOST> -u homeassistant -P '<MQTT_PASSWORD>' -t 'taptap/+/temp_nodes' -v"
   ```

**Resolution:** Temporary IDs usually resolve themselves after the CCA completes enumeration. If persistent:
1. Check if panel is physically communicating with the CCA
2. May need to restart the affected taptap container
3. In severe cases, may need to reset the CCA

---

## Container Crash Recovery

### Standard Recovery
```bash
# SSH to Pi and restart containers
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose restart"
```

### Full Rebuild (after repo changes or persistent issues)
```bash
ssh $PI_USER@$PI_HOST "cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose down && sudo docker compose build --no-cache && sudo docker compose up -d"
```

### Nuclear Option (force remove everything)
```bash
ssh $PI_USER@$PI_HOST "sudo docker rm -f taptap-primary taptap-secondary temp-id-monitor 2>/dev/null; cd /path/to/solar_tigo_viewer/tigo-mqtt && sudo docker compose build --no-cache && sudo docker compose up -d"
```

---

## Key File Locations

### Raspberry Pi (<PI_HOST>)

| Item | Path |
|------|------|
| Project root | `/path/to/solar_tigo_viewer/tigo-mqtt` |
| Primary config | `./config-primary.ini` |
| Secondary config | `./config-secondary.ini` |
| Primary state file | `./data/primary/taptap.state` |
| Secondary state file | `./data/secondary/taptap.state` |
| Primary run file | `./run/primary/taptap.run` |
| Secondary run file | `./run/secondary/taptap.run` |
| Primary serial device | `/dev/ttyACM2` |
| Secondary serial device | `/dev/ttyACM3` |

### NAS/Server (Dashboard)

| Item | Path |
|------|------|
| Dashboard root | `/path/to/dashboard/` |
| Backend code | `./backend/app/` |
| Frontend code | `./frontend/src/` |
| Panel mapping | `../config/panel_mapping.json` |

### Local Development

| Item | Path |
|------|------|
| Topology backups | `tigo-mqtt/topology_backups/` |
| State comparison | Compare `*.state` files with backups |

---

## Health Check Indicators

### Healthy System Signs
- Both containers show `(healthy)` status
- `taptap.run` files updated within last 2 minutes
- Nodes showing "came online" in logs
- API returns non-null watts values
- Frontend displays numeric values (not "-")

### Warning Signs
- Container status shows `(unhealthy)`
- No "came online" messages after 5+ minutes of daylight
- `taptap.run` file not being updated
- MQTT connection errors in logs
- USB disconnect messages in dmesg

---

## MQTT Topics Reference

| Topic | Purpose | Publisher |
|-------|---------|-----------|
| `taptap/primary/state` | Panel power/voltage data | taptap-primary |
| `taptap/secondary/state` | Panel power/voltage data | taptap-secondary |
| `taptap/primary/temp_nodes` | Temporary node ID list | temp-id-monitor |
| `taptap/secondary/temp_nodes` | Temporary node ID list | temp-id-monitor |
| `taptap/primary/node_mappings` | Node ID → Serial mapping | temp-id-monitor |
| `taptap/secondary/node_mappings` | Node ID → Serial mapping | temp-id-monitor |

### Subscribe to All taptap Topics
```bash
ssh $PI_USER@$PI_HOST "timeout 30 mosquitto_sub -h <MQTT_HOST> -u homeassistant -P '<MQTT_PASSWORD>' -t 'taptap/#' -v"
```

---

## Comparing Infrastructure State

To check if node IDs have changed (useful after CCA resets or power outages):

```bash
# Compare current state with backup
diff <(cat tigo-mqtt/topology_backups/primary-YYYY-MM-DD.state | python3 -c "
import sys,json
d=json.load(sys.stdin)
nodes={}
for gw in d.get('gateway_node_tables',{}).values():
    for n in gw:
        nodes[str(n['node_id'])] = n['long_address']
print(json.dumps(nodes, indent=2, sort_keys=True))
") <(cat tigo-mqtt/data/primary/taptap.state | python3 -c "
import sys,json
d=json.load(sys.stdin)
nodes={}
for gw in d.get('gateway_node_tables',{}).values():
    for n in gw:
        nodes[str(n['node_id'])] = n['long_address']
print(json.dumps(nodes, indent=2, sort_keys=True))
")
```

No output = no changes. Any diff indicates node ID reassignment.

---

## When to Escalate

Contact for help if:
- USB devices don't re-enumerate after multiple attempts
- State files show persistent node ID changes
- CCA hardware appears unresponsive
- MQTT broker is unreachable from Pi
- NAS mount issues affecting config files
