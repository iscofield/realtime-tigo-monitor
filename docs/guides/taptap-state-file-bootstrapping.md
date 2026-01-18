# TapTap State File Bootstrapping Guide

This guide explains how taptap state files work and how to bootstrap them when starting fresh.

## Overview

The taptap binary uses state files to persist infrastructure topology (the mapping between node IDs and panel serial numbers). Without proper state files, taptap uses "temporary enumeration" which assigns random node IDs to panels, causing incorrect data display.

## How State Files Work

### Normal Operation

1. **On startup**: taptap reads the state file and emits an `infrastructure_report` event
2. **During operation**: taptap listens for infrastructure changes from the Tigo hardware
3. **On infrastructure change**: taptap writes an updated state file

### The Problem

taptap only writes state files when infrastructure **changes** (new nodes discovered, topology updates). The initial infrastructure report from Tigo hardware can take hours or days to arrive, during which panels show scrambled data.

### File Locations

| Container | State File Path (container) | Host Path |
|-----------|---------------------------|-----------|
| taptap-primary | /data/taptap.state | data/primary/taptap.state |
| taptap-secondary | /data/taptap.state | data/secondary/taptap.state |

## Bootstrapping Process

When you need to create or recreate state files (fresh install, corruption, etc.):

### Option 1: Capture Infrastructure Reports (Recommended)

Use the provided capture script to run taptap directly and capture infrastructure reports:

```bash
# On the Raspberry Pi (or machine with serial access to CCAs)
cd /home/solar-assistant/nas_docker/solar_tigo_viewer/tigo-mqtt

# Capture primary CCA infrastructure (waits up to 10 minutes)
./capture-infrastructure.sh /dev/ttyACM2 data/primary/taptap.state

# Capture secondary CCA infrastructure
./capture-infrastructure.sh /dev/ttyACM3 data/secondary/taptap.state
```

The script will:
1. Run taptap directly on the serial port
2. Wait for an infrastructure_report event
3. Convert it to the proper state file format
4. Save to the specified location

### Option 2: Manual Capture and Conversion

If you have previously captured infrastructure_report JSON:

```bash
# Convert infrastructure_report JSON to state file format
python3 convert_infra_to_state.py /path/to/infrastructure_report.json data/primary/taptap.state
```

### Option 3: Wait for Organic Discovery

If you can tolerate incorrect data temporarily:
1. Start the containers normally
2. Wait for taptap to receive infrastructure_report events from the Tigo hardware (can take hours)
3. Once received, taptap will write the state file and future restarts will be instant

## State File Format

### Infrastructure Report Format (taptap output)

```json
{
  "event_type": "infrastructure_report",
  "gateways": {
    "4609": {"address": "04:C0:5B:30:00:04:B3:8C", "version": "..."}
  },
  "nodes": {
    "4609": {
      "42": {"address": "04:C0:5B:40:00:C3:F2:C9", "barcode": "4-C3F2C9H"}
    }
  }
}
```

### PersistentState Format (state file)

```json
{
  "gateway_node_tables": {
    "4609": [[42, [4, 192, 91, 64, 0, 195, 242, 201]]]
  },
  "gateway_identities": {
    "4609": [4, 192, 91, 48, 0, 4, 179, 140]
  },
  "gateway_versions": {
    "4609": "Mgate Version H1.0004..."
  }
}
```

The key differences:
- Addresses are byte arrays instead of hex strings
- Structure uses `gateway_node_tables`, `gateway_identities`, `gateway_versions`
- Barcodes are not stored (computed from addresses)

## Verifying State File Loading

After starting containers with state files:

```bash
# Check for "Permanently enumerated" (good) vs "Temporary enumerated" (bad)
docker logs taptap-primary 2>&1 | grep -E 'Permanently|Temporary' | head -5

# Check for infrastructure_report event at startup
docker logs taptap-primary 2>&1 | grep 'infrastructure_report' | head -1
```

**Good output:**
```
INFO: Permanently enumerated node id: 42 to node name: A7 and serial: 4-C3F2C9H
```

**Bad output (needs bootstrapping):**
```
INFO: Temporary enumerated node id: 42 to node name: A7
```

## Troubleshooting

### State file not being read

1. Check file exists and has content:
   ```bash
   ls -la data/primary/taptap.state
   ```

2. Check file is readable inside container:
   ```bash
   docker exec taptap-primary cat /data/taptap.state | head -5
   ```

3. Verify JSON is valid:
   ```bash
   python3 -m json.tool data/primary/taptap.state > /dev/null && echo "Valid JSON"
   ```

### Gateway identities missing

If the state file has empty `gateway_identities`, taptap may not load it properly. Ensure all gateways that have nodes also have identity entries. You may need to copy gateway data from another source or wait for a full infrastructure report.

## Files Reference

| File | Purpose |
|------|---------|
| `convert_infra_to_state.py` | Converts infrastructure_report JSON to state file format |
| `capture-infrastructure.sh` | Captures infrastructure from CCA and creates state file |
| `data/primary/taptap.state` | Primary CCA state file |
| `data/secondary/taptap.state` | Secondary CCA state file |
