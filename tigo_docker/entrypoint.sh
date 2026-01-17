#!/bin/sh
# Generate config.ini from template + environment variables at startup

CONFIG_FILE="/app/config.ini"
TEMPLATE_FILE="/app/config-template.ini"

# Check required env vars
if [ -z "$MQTT_SERVER" ] || [ -z "$MQTT_USER" ] || [ -z "$MQTT_PASS" ]; then
    echo "ERROR: Required environment variables not set: MQTT_SERVER, MQTT_USER, MQTT_PASS"
    exit 1
fi

# Generate config from template with env var substitution
sed -e "s|\${MQTT_SERVER}|${MQTT_SERVER}|g" \
    -e "s|\${MQTT_PORT}|${MQTT_PORT:-1883}|g" \
    -e "s|\${MQTT_USER}|${MQTT_USER}|g" \
    -e "s|\${MQTT_PASS}|${MQTT_PASS}|g" \
    "$TEMPLATE_FILE" > "$CONFIG_FILE"

echo "Generated config.ini from template"

# Run taptap-mqtt
exec python3 taptap-mqtt.py config.ini
