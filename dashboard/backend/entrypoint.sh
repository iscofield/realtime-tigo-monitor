#!/bin/sh
set -e

# --- Config-mount readiness guard -------------------------------------------
# When this container starts before its bind-mount source is ready (for example
# the host's NFS remote that holds the repo hasn't mounted yet at boot), Docker
# silently substitutes an EMPTY stand-in directory for /app/config. The backend
# then finds no system.yaml and falls back to the first-run setup wizard,
# hiding the real (intact) configuration that lives on the unmounted share.
#
# The repo always ships example files in config/ (git-tracked, synced to the
# host). Their presence proves the bind mount resolved to the REAL directory
# rather than an empty stand-in. A genuinely-unconfigured fresh install still
# has the example files, so the setup wizard shows normally in that case; only
# a broken/empty mount lacks them.
#
# If the sentinel never appears we exit non-zero so Docker's restart policy
# relaunches the container, which re-resolves the bind mount once the host
# mount is finally present. (A bind mount is only resolved at container start,
# so an in-place wait cannot see a late mount on the SAME run — the restart is
# what actually fixes it.)
SENTINEL="${CONFIG_MOUNT_SENTINEL:-/app/config/system.example.yaml}"
WAIT_TIMEOUT="${CONFIG_MOUNT_WAIT_SECONDS:-45}"

waited=0
while [ ! -f "$SENTINEL" ]; do
    if [ "$waited" -ge "$WAIT_TIMEOUT" ]; then
        echo "[entrypoint] FATAL: config mount not ready after ${WAIT_TIMEOUT}s" \
             "(sentinel '$SENTINEL' missing). Exiting so the container restarts" \
             "and re-resolves the bind mount." >&2
        exit 1
    fi
    echo "[entrypoint] Waiting for config mount: '$SENTINEL' not present yet" \
         "(${waited}s/${WAIT_TIMEOUT}s)..."
    sleep 3
    waited=$((waited + 3))
done

echo "[entrypoint] Config mount present ('$SENTINEL' found). Starting backend."
exec "$@"
