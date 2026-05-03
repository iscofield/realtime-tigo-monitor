#!/bin/sh
# Install boot-time hardening on the Pi running tigo-mqtt and PPG containers.
#
# Fixes two boot-time race conditions observed on 2026-05-03:
#   1. The CIFS mount unit (/etc/systemd/system/mnt-nas.mount) tried to mount
#      before the network was actually routable, hit "Network is unreachable",
#      retried 5 times in seconds, and gave up. Result: NAS not mounted, all
#      Docker bind-mounts that depend on it failed.
#   2. Docker started before the NAS mount was ready, so docker-compose with
#      bind mounts from /mnt/nas could see empty paths.
#
# This script is idempotent — safe to re-run.
#
# Usage:
#   sudo ./install-pi-boot-hardening.sh
#
# Requires:
#   - Run as root (uses systemctl + writes to /etc/systemd/system)
#   - The unit file /etc/systemd/system/mnt-nas.mount must already exist
#     (this script edits it via drop-in, doesn't create it from scratch)
#
# To revert:
#   sudo rm -rf /etc/systemd/system/mnt-nas.mount.d /etc/systemd/system/docker.service.d/wait-for-mnt-nas.conf
#   sudo systemctl daemon-reload

set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: must run as root (use sudo)" >&2
    exit 1
fi

# Where the NAS is — read from the existing mount unit. The 'What=' line
# looks like 'What=//192.168.2.199/docker' (CIFS) or 'What=192.168.2.199:/docker'
# (NFS). Extract just the host portion. The ping-loop in the drop-in needs
# an IP or hostname that resolves on the boot-time network — DNS may not be
# fully ready, so a literal IP is safest.
NAS_HOST=$(grep '^What=' /etc/systemd/system/mnt-nas.mount 2>/dev/null \
    | sed -E -e 's|^What=//([^/]+)/.*|\1|' -e 's|^What=([^:]+):.*|\1|')
if [ -z "${NAS_HOST}" ] || [ "${NAS_HOST}" = "$(grep '^What=' /etc/systemd/system/mnt-nas.mount)" ]; then
    echo "ERROR: could not extract NAS host from /etc/systemd/system/mnt-nas.mount" >&2
    echo "       set NAS_HOST in this script manually and re-run." >&2
    exit 1
fi

echo "Detected NAS host: ${NAS_HOST}"

# --- Drop-in 1: make mnt-nas.mount wait for the NAS to actually be reachable ---

DROPIN_MOUNT_DIR=/etc/systemd/system/mnt-nas.mount.d
DROPIN_MOUNT_FILE="${DROPIN_MOUNT_DIR}/wait-for-network.conf"

mkdir -p "${DROPIN_MOUNT_DIR}"
cat > "${DROPIN_MOUNT_FILE}" <<EOF
# Installed by tigo-mqtt/scripts/install-pi-boot-hardening.sh
#
# Boot-time race: 'network-online.target' is reached before the network is
# actually routable on this Pi. CIFS hits 'Network is unreachable', systemd
# retries 5x in seconds (the default StartLimit), and gives up — leaving
# the NAS unmounted for the rest of the uptime.
#
# Fix: ping the NAS in a pre-mount loop so we don't even attempt the mount
# until the NAS is reachable. Also widen the systemd retry limits.

[Unit]
StartLimitIntervalSec=300
StartLimitBurst=20

[Mount]
ExecStartPre=/bin/sh -c 'until ping -c1 -W2 ${NAS_HOST} >/dev/null 2>&1; do echo "waiting for NAS ${NAS_HOST}..."; sleep 2; done'
TimeoutSec=120
EOF

echo "Wrote ${DROPIN_MOUNT_FILE}"

# --- Drop-in 2: make docker.service wait for the NAS mount ---

DROPIN_DOCKER_DIR=/etc/systemd/system/docker.service.d
DROPIN_DOCKER_FILE="${DROPIN_DOCKER_DIR}/wait-for-mnt-nas.conf"

mkdir -p "${DROPIN_DOCKER_DIR}"
cat > "${DROPIN_DOCKER_FILE}" <<'EOF'
# Installed by tigo-mqtt/scripts/install-pi-boot-hardening.sh
#
# Boot-time race: docker.service starts as soon as basic.target is reached,
# which happens before mnt-nas.mount is ready. Containers with bind mounts
# from /mnt/nas would then see empty paths and either crash or come up with
# missing data.
#
# Fix: make docker depend on the NAS mount before it starts.

[Unit]
RequiresMountsFor=/mnt/nas
After=mnt-nas.mount
EOF

echo "Wrote ${DROPIN_DOCKER_FILE}"

# --- Apply changes ---

systemctl daemon-reload
echo "Reloaded systemd."

cat <<EOF

Done.

Verify with:
  systemctl cat mnt-nas.mount     # should show the drop-in at the bottom
  systemctl cat docker.service    # should show the drop-in at the bottom

The next reboot will use these. To test without rebooting:
  sudo systemctl reset-failed mnt-nas.mount
  sudo systemctl restart mnt-nas.mount

To revert:
  sudo rm -rf ${DROPIN_MOUNT_DIR} ${DROPIN_DOCKER_FILE}
  sudo systemctl daemon-reload
EOF
