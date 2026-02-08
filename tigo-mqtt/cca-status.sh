#!/bin/bash
# cca-status.sh - Comprehensive CCA diagnostic and status report
#
# Auto-discovers taptap containers and runs diagnostics remotely on the Pi.
# Container names are discovered by prefix (default: "taptap-"), excluding
# known non-CCA services like temp-id-monitor.
#
# Usage: ./cca-status.sh [options]
#   --backup          Create a timestamped backup of state files and logs
#   --env FILE        Path to env file with PI_HOST, PI_USER, PI_PASS
#                     (default: .env.pi in script dir, or ../.claude/env)
#   --data-dir PATH   Remote path to state file data dir
#                     (default: auto-detect from docker volume mounts)
#   --prefix PREFIX   Container name prefix to discover (default: taptap-)
#   --backup-dir DIR  Local directory for backups (default: ./backups/)
#   --nas-dir DIR     Local NAS mount path for state files (for --backup)
#                     If not set, state files are copied via SSH instead

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
ENV_FILE=""
REMOTE_DATA_DIR=""
CONTAINER_PREFIX="taptap-"
BACKUP_DIR="$SCRIPT_DIR/backups"
NAS_LOCAL=""
DO_BACKUP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --backup)    DO_BACKUP=true; shift ;;
        --env)       ENV_FILE="$2"; shift 2 ;;
        --data-dir)  REMOTE_DATA_DIR="$2"; shift 2 ;;
        --prefix)    CONTAINER_PREFIX="$2"; shift 2 ;;
        --backup-dir) BACKUP_DIR="$2"; shift 2 ;;
        --nas-dir)   NAS_LOCAL="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,/^$/s/^# \?//p' "$0"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Find env file: explicit arg > .env.pi > .claude/env
if [ -z "$ENV_FILE" ]; then
    if [ -f "$SCRIPT_DIR/.env.pi" ]; then
        ENV_FILE="$SCRIPT_DIR/.env.pi"
    elif [ -f "$PROJECT_DIR/.claude/env" ]; then
        ENV_FILE="$PROJECT_DIR/.claude/env"
    else
        echo "ERROR: No env file found. Create .env.pi or use --env FILE"
        echo "Required variables: PI_HOST, PI_USER, PI_PASS"
        exit 1
    fi
fi

# Load credentials
PI_HOST=$(grep "^PI_HOST=" "$ENV_FILE" | cut -d= -f2)
PI_USER=$(grep "^PI_USER=" "$ENV_FILE" | cut -d= -f2)
PI_PASS=$(grep "^PI_PASS=" "$ENV_FILE" | cut -d= -f2)

if [ -z "$PI_HOST" ] || [ -z "$PI_USER" ] || [ -z "$PI_PASS" ]; then
    echo "ERROR: PI_HOST, PI_USER, and PI_PASS must be set in $ENV_FILE"
    exit 1
fi

SSH="sshpass -p $PI_PASS ssh -o StrictHostKeyChecking=no ${PI_USER}@${PI_HOST}"
SCP="sshpass -p $PI_PASS scp -o StrictHostKeyChecking=no"

echo "========================================"
echo "  CCA Status Report - $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Host: ${PI_HOST}"
echo "========================================"
echo ""

# Run all diagnostics in a single SSH session
REPORT=$($SSH bash -s "$CONTAINER_PREFIX" "$REMOTE_DATA_DIR" <<'REMOTE_SCRIPT'
CONTAINER_PREFIX="$1"
REMOTE_DATA_DIR="$2"

# Discover taptap containers by prefix, excluding known non-CCA services
CONTAINERS=$(sudo docker ps --format '{{.Names}}' | grep "^${CONTAINER_PREFIX}" | grep -v "monitor\|helper\|proxy" | sort)

if [ -z "$CONTAINERS" ]; then
    echo "!! No containers found matching prefix '${CONTAINER_PREFIX}' !!"
    exit 1
fi

echo "--- Container Status ---"
sudo docker ps --filter "name=${CONTAINER_PREFIX}" --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"
echo ""

for CONTAINER in $CONTAINERS; do
    # Derive the CCA label from the container name (strip prefix)
    CCA_LABEL="${CONTAINER#${CONTAINER_PREFIX}}"

    # Auto-detect data directory from the container's /data volume mount
    if [ -n "$REMOTE_DATA_DIR" ]; then
        STATE_FILE="${REMOTE_DATA_DIR}/${CCA_LABEL}/taptap.state"
    else
        HOST_DATA_DIR=$(sudo docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
        if [ -n "$HOST_DATA_DIR" ]; then
            STATE_FILE="${HOST_DATA_DIR}/taptap.state"
        else
            STATE_FILE=""
        fi
    fi

    echo "========================================"
    echo "  ${CCA_LABEL^^} CCA (${CONTAINER})"
    echo "========================================"
    echo ""

    # Check if container is running
    if ! sudo docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
        echo "  !! Container ${CONTAINER} is NOT running !!"
        echo ""
        continue
    fi

    # --- Enumeration status ---
    echo "--- Enumeration Status ---"
    PERM_COUNT=$(sudo docker logs "$CONTAINER" 2>&1 | grep -c "Permanently enumerated" || true)
    TEMP_COUNT=$(sudo docker logs "$CONTAINER" 2>&1 | grep -c "Temporarily enumerated\|Temporary enumerated" || true)
    echo "  Permanently enumerated: ${PERM_COUNT}"
    echo "  Temporarily enumerated: ${TEMP_COUNT}"

    if [ "$TEMP_COUNT" -gt 0 ]; then
        echo ""
        echo "  !! TEMPORARILY ENUMERATED PANELS:"
        sudo docker logs "$CONTAINER" 2>&1 | grep -i "Temporarily enumerated\|Temporary enumerated" | sed 's/^/    /'
    fi
    echo ""

    # --- Startup info ---
    echo "--- Last Startup ---"
    sudo docker logs "$CONTAINER" 2>&1 | grep -E "TapTap process started|Reading config|MQTT client connected" | tail -3 | sed 's/^/  /'
    echo ""

    # --- Permanently enumerated panels (from most recent startup) ---
    echo "--- Permanently Enumerated Panels ---"
    # Find the last "TapTap process started" line number and only show enumerations after it
    LAST_START_LINE=$(sudo docker logs "$CONTAINER" 2>&1 | grep -n "TapTap process started" | tail -1 | cut -d: -f1)
    if [ -n "$LAST_START_LINE" ]; then
        sudo docker logs "$CONTAINER" 2>&1 | tail -n +"$LAST_START_LINE" | grep "Permanently enumerated" | \
            sed 's/.*node id: \([0-9]*\) to node name: \([^ ]*\) and serial: \(.*\)/  \2 (node \1) = \3/' | sort
    else
        sudo docker logs "$CONTAINER" 2>&1 | grep "Permanently enumerated" | \
            sed 's/.*node id: \([0-9]*\) to node name: \([^ ]*\) and serial: \(.*\)/  \2 (node \1) = \3/' | sort
    fi
    echo ""

    # --- State file analysis ---
    echo "--- State File ---"
    if [ -n "$STATE_FILE" ] && [ -f "$STATE_FILE" ]; then
        echo "  Path: ${STATE_FILE}"
        echo "  Size: $(stat -c%s "$STATE_FILE" 2>/dev/null || wc -c < "$STATE_FILE") bytes"
        echo "  Modified: $(stat -c%y "$STATE_FILE" 2>/dev/null || stat -f%Sm "$STATE_FILE" 2>/dev/null)"
        echo ""

        python3 -c "
import json, sys
d = json.load(open('$STATE_FILE'))
tables = d.get('gateway_node_tables', {})
identities = d.get('gateway_identities', {})
versions = d.get('gateway_versions', {})

total = sum(len(n) for n in tables.values())
print(f'  Total nodes in state file: {total}')
print(f'  Gateways with nodes: {sum(1 for n in tables.values() if len(n) > 0)}')
print(f'  Gateway identities: {len(identities)}')
print(f'  Gateway versions: {len(versions)}')
print()

# Gateway details
print('  Gateway Details:')
for gw_id in sorted(tables.keys(), key=int):
    nodes = tables[gw_id]
    has_identity = gw_id in identities
    has_version = gw_id in versions
    node_count = len(nodes) if isinstance(nodes, list) else 0
    flags = []
    if not has_identity: flags.append('NO IDENTITY')
    if not has_version: flags.append('NO VERSION')
    if node_count == 0: flags.append('EMPTY')
    flag_str = '  [' + ', '.join(flags) + ']' if flags else ''
    print(f'    Gateway {gw_id}: {node_count} nodes{flag_str}')

# Check for identity-only gateways (potential TAPs)
identity_only = set(identities.keys()) - set(tables.keys())
if identity_only:
    print()
    print('  Identity-only gateways (potential TAP repeaters):')
    for gw_id in sorted(identity_only, key=int):
        mac = identities[gw_id]
        mac_hex = ':'.join(f'{b:02X}' for b in mac)
        for other_id, other_mac in identities.items():
            if other_id != gw_id and other_mac == mac:
                print(f'    Gateway {gw_id} ({mac_hex}) = duplicate of Gateway {other_id}')
                break
        else:
            print(f'    Gateway {gw_id} ({mac_hex})')
"
    elif [ -z "$STATE_FILE" ]; then
        echo "  !! Could not detect state file path (no /data volume mount found) !!"
    else
        echo "  !! State file NOT FOUND at ${STATE_FILE} !!"
    fi
    echo ""

    # --- State file backups on remote ---
    if [ -n "$STATE_FILE" ]; then
        DATA_DIR="$(dirname "$STATE_FILE")"
        echo "--- State Files on Disk ---"
        ls -la "$DATA_DIR/" 2>/dev/null | grep -v "^total\|^\.$\|^\.\.$" | sed 's/^/  /'
        echo ""
    fi

    # --- Recent gateway/TAP messages ---
    echo "--- Recent Gateway/TAP Messages (last 10) ---"
    sudo docker logs --tail 2000 "$CONTAINER" 2>&1 | grep -iE "gateway|TAP" | tail -10 | sed 's/^/  /'
    GATEWAY_COUNT=$(sudo docker logs "$CONTAINER" 2>&1 | grep -ic "gateway\|TAP" || true)
    echo "  (${GATEWAY_COUNT} total gateway/TAP messages in logs)"
    echo ""
done

echo "========================================"
echo "  Report complete"
echo "========================================"
REMOTE_SCRIPT
)

echo "$REPORT"

# --- Backup mode ---
if [ "$DO_BACKUP" = true ]; then
    echo ""
    echo "========================================"
    echo "  Creating Backup"
    echo "========================================"

    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    DEST_DIR="${BACKUP_DIR}/${TIMESTAMP}"
    mkdir -p "$DEST_DIR"

    echo "  Backup dir: ${DEST_DIR}"
    echo ""

    # Discover containers again (locally this time)
    CONTAINERS=$($SSH "sudo docker ps --format '{{.Names}}' | grep '^${CONTAINER_PREFIX}' | grep -v 'monitor\|helper\|proxy' | sort")

    for CONTAINER in $CONTAINERS; do
        CCA_LABEL="${CONTAINER#${CONTAINER_PREFIX}}"

        # Find the remote data dir for this container
        if [ -n "$REMOTE_DATA_DIR" ]; then
            REMOTE_STATE="${REMOTE_DATA_DIR}/${CCA_LABEL}/taptap.state"
        else
            REMOTE_STATE=$($SSH "sudo docker inspect $CONTAINER --format '{{range .Mounts}}{{if eq .Destination \"/data\"}}{{.Source}}{{end}}{{end}}' 2>/dev/null")/taptap.state
        fi

        echo "  Backing up ${CCA_LABEL}..."

        # Copy state file: prefer local NAS mount, fall back to SCP
        if [ -n "$NAS_LOCAL" ] && [ -f "${NAS_LOCAL}/${CCA_LABEL}/taptap.state" ]; then
            cp "${NAS_LOCAL}/${CCA_LABEL}/taptap.state" "${DEST_DIR}/${CCA_LABEL}-taptap.state"
        else
            $SCP "${PI_USER}@${PI_HOST}:${REMOTE_STATE}" "${DEST_DIR}/${CCA_LABEL}-taptap.state"
        fi

        # Capture infra-related logs
        $SSH "sudo docker logs $CONTAINER 2>&1 | grep -iE 'Discovered|permanent|infrastructure|gateway|TAP'" \
            > "${DEST_DIR}/${CCA_LABEL}-infra-report.log" 2>/dev/null || true
    done

    # Verify
    echo ""
    echo "  Verifying backup..."
    for STATE_FILE in "${DEST_DIR}"/*-taptap.state; do
        LABEL=$(basename "$STATE_FILE" | sed 's/-taptap.state//')
        NODES=$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(sum(len(n) for n in d.get('gateway_node_tables',{}).values()))")
        SIZE=$(wc -c < "$STATE_FILE" | tr -d ' ')
        echo "    ${LABEL}: ${NODES} nodes, ${SIZE} bytes"
    done

    echo ""
    echo "  Backup complete: ${DEST_DIR}"
    echo ""
    echo "  NOTE: Raw infrastructure_report JSON is not yet captured."
    echo "  See tigo-mqtt/backups/README.md for details on this TODO."
fi
