# TapTap State File Backups

This folder contains timestamped backups of taptap state files and infrastructure report logs.

**IMPORTANT:** Backup data folders are git-ignored. Only this README is tracked.

## Folder Structure

Each backup is stored in a timestamped folder (YYYYMMDD-HHMMSS) with one state file and one log file per CCA:

```
backups/
├── README.md
├── 20260206-172829/
│   ├── primary-taptap.state       # Primary CCA state file
│   ├── secondary-taptap.state     # Secondary CCA state file
│   ├── primary-infra-report.log   # Primary infrastructure report logs
│   └── secondary-infra-report.log # Secondary infrastructure report logs
```

CCA names are auto-discovered from running containers — the number and names of files will vary by setup.

## When to Create Backups

Create a backup BEFORE:
- Any file sync operation (mutagen, rsync, etc.)
- Copying files to/from NAS or between hosts
- Docker volume operations (remove, recreate)
- Any operation that could overwrite state files

## How to Create a Backup

Use the `cca-status.sh` script with the `--backup` flag:

```bash
# Status report + backup in one command
./tigo-mqtt/cca-status.sh --backup

# With local NAS mount for faster state file copies
./tigo-mqtt/cca-status.sh --backup --nas-dir /path/to/nas/tigo-mqtt/data
```

The script auto-discovers all taptap containers on the Pi, copies their state files, and captures infrastructure-related logs.

See `cca-status.sh --help` for all options, or the CLAUDE.md project docs for full usage.

## How to Restore

1. Stop the taptap containers on the Pi
2. Copy the state files back to the data directory
3. Restart the containers

```bash
# Load Pi credentials from your env file
source <(grep -E '^PI_' tigo-mqtt/.env.pi)
SSH="sshpass -p $PI_PASS ssh -o StrictHostKeyChecking=no ${PI_USER}@${PI_HOST}"

# Stop containers (adjust names to match your setup)
$SSH "sudo docker stop taptap-primary taptap-secondary"

# Restore from backup (replace TIMESTAMP and paths for your setup)
BACKUP_DIR="tigo-mqtt/backups/TIMESTAMP"
scp "${BACKUP_DIR}/primary-taptap.state" "${PI_USER}@${PI_HOST}:/path/to/data/primary/taptap.state"
scp "${BACKUP_DIR}/secondary-taptap.state" "${PI_USER}@${PI_HOST}:/path/to/data/secondary/taptap.state"

# Restart containers
$SSH "sudo docker start taptap-primary taptap-secondary"
```

## TODO: Capture Raw Infrastructure Reports

The current backup process only captures **processed** log lines (grep'd "Permanently enumerated" messages) and the state file (byte-array format without barcodes). The **raw infrastructure_report JSON** that taptap emits on stdout — which contains human-readable hex MAC addresses, barcodes, and gateway version info — is not being saved.

The raw format looks like:
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

In the future, `taptap-mqtt.py` should be updated to write the raw infrastructure_report JSON to a file (e.g., `/data/infrastructure_report.json`) when received, so that backups can include it. This would preserve the most complete representation of the CCA topology including readable addresses and barcodes.

## Verifying State Files

Check node counts in a backup:

```bash
cat primary-taptap.state | python3 -c "import json,sys; d=json.load(sys.stdin); print('Nodes:', sum(len(n) for n in d.get('gateway_node_tables',{}).values()))"
```
