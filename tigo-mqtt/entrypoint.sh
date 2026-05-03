#!/bin/sh
# Generate config.ini from template + environment variables at startup

CONFIG_FILE="/app/config.ini"
TEMPLATE_FILE="/app/config-template.ini"

# Check required env vars
if [ -z "$MQTT_SERVER" ] || [ -z "$MQTT_USER" ] || [ -z "$MQTT_PASS" ]; then
    echo "ERROR: Required environment variables not set: MQTT_SERVER, MQTT_USER, MQTT_PASS"
    exit 1
fi

# Generate config from template with env var substitution.
# MQTT_CLIENT_ID is optional — empty string causes paho to auto-generate
# a random client ID (preserving prior behavior).
sed -e "s|\${MQTT_SERVER}|${MQTT_SERVER}|g" \
    -e "s|\${MQTT_PORT}|${MQTT_PORT:-1883}|g" \
    -e "s|\${MQTT_USER}|${MQTT_USER}|g" \
    -e "s|\${MQTT_PASS}|${MQTT_PASS}|g" \
    -e "s|\${MQTT_CLIENT_ID}|${MQTT_CLIENT_ID:-}|g" \
    "$TEMPLATE_FILE" > "$CONFIG_FILE"

echo "Generated config.ini from template"

# Clean any stale state from a previous instance to prevent "File exists"
# errors on restart after crash/MQTT disconnect. The directory itself is
# created by the Dockerfile but its contents (e.g. taptap.run) may persist
# across an in-place restart of the same container under restart: always.
rm -rf /run/taptap/* /run/taptap/.[!.]* 2>/dev/null || true
mkdir -p /run/taptap

# Wait for the serial device to enumerate. The udev symlink (e.g.
# /dev/tigo-primary) is created when the WCH USB-serial adapter is detected
# by the kernel — typically within a few seconds of boot, but a cold-start
# race can put the container ahead of udev. Without this wait, the container
# would exit immediately when /dev/tigo-* is missing and rely on Docker's
# restart-on-failure backoff, which can stall recovery for minutes.
SERIAL_DEVICE=$(grep -E '^SERIAL\s*=' "$CONFIG_FILE" | sed -E 's/^SERIAL\s*=\s*//' | tr -d '[:space:]')
if [ -n "$SERIAL_DEVICE" ]; then
    WAIT_MAX=${SERIAL_WAIT_SECONDS:-60}
    elapsed=0
    while [ ! -e "$SERIAL_DEVICE" ] && [ "$elapsed" -lt "$WAIT_MAX" ]; do
        echo "Waiting for serial device $SERIAL_DEVICE (elapsed=${elapsed}s, max=${WAIT_MAX}s)..."
        sleep 2
        elapsed=$((elapsed + 2))
    done
    if [ ! -e "$SERIAL_DEVICE" ]; then
        echo "ERROR: serial device $SERIAL_DEVICE did not appear within ${WAIT_MAX}s. USB enumeration may have failed; check 'lsusb' and 'dmesg' on the host."
        exit 1
    fi
    echo "Serial device $SERIAL_DEVICE is present."
fi

# Run taptap-mqtt
exec python3 taptap-mqtt.py config.ini
