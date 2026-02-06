# TapTap State File Backups

This folder contains timestamped backups of taptap state files and infrastructure report logs.

**IMPORTANT:** This folder is git-ignored. These files are critical and should never be committed.

## Folder Structure

Each backup is stored in a timestamped folder (YYYYMMDD-HHMMSS):

```
backups/
├── 20260206-172829/
│   ├── primary-taptap.state      # Primary CCA state file (47 nodes)
│   ├── secondary-taptap.state    # Secondary CCA state file (22 nodes)
│   ├── primary-infra-report.log  # Primary infrastructure report logs
│   └── secondary-infra-report.log # Secondary infrastructure report logs
```

## When to Create Backups

Create a backup BEFORE:
- Any mutagen sync operation
- Copying files to/from NAS
- Docker volume operations
- Any operation that could overwrite state files

## How to Create a Backup

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="tigo-mqtt/backups/${TIMESTAMP}"
mkdir -p "${BACKUP_DIR}"

# Copy from NAS (authoritative source)
cp /Users/ian/code/nas_docker/solar_tigo_viewer/tigo-mqtt/data/primary/taptap.state "${BACKUP_DIR}/primary-taptap.state"
cp /Users/ian/code/nas_docker/solar_tigo_viewer/tigo-mqtt/data/secondary/taptap.state "${BACKUP_DIR}/secondary-taptap.state"

# Capture infrastructure logs (optional but helpful)
sshpass -p 'solar123' ssh solar-assistant@192.168.2.93 \
  "sudo docker logs taptap-primary 2>&1 | grep -iE 'Discovered|permanent|infrastructure'" \
  > "${BACKUP_DIR}/primary-infra-report.log"

sshpass -p 'solar123' ssh solar-assistant@192.168.2.93 \
  "sudo docker logs taptap-secondary 2>&1 | grep -iE 'Discovered|permanent|infrastructure'" \
  > "${BACKUP_DIR}/secondary-infra-report.log"
```

## How to Restore

1. Stop the taptap containers on the Pi
2. Copy the state files back to the NAS
3. Restart the containers

```bash
# Stop containers
sshpass -p 'solar123' ssh solar-assistant@192.168.2.93 "sudo docker stop taptap-primary taptap-secondary"

# Restore from backup (replace TIMESTAMP with actual folder name)
BACKUP_DIR="tigo-mqtt/backups/TIMESTAMP"
cp "${BACKUP_DIR}/primary-taptap.state" /Users/ian/code/nas_docker/solar_tigo_viewer/tigo-mqtt/data/primary/taptap.state
cp "${BACKUP_DIR}/secondary-taptap.state" /Users/ian/code/nas_docker/solar_tigo_viewer/tigo-mqtt/data/secondary/taptap.state

# Restart containers
sshpass -p 'solar123' ssh solar-assistant@192.168.2.93 "sudo docker start taptap-primary taptap-secondary"
```

## Verifying State Files

Check node counts match expected values (Primary: 47, Secondary: 22):

```bash
cat primary-taptap.state | python3 -c "import json,sys; d=json.load(sys.stdin); print('Nodes:', sum(len(n) for n in d.get('gateway_node_tables',{}).values()))"
```
