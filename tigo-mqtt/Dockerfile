FROM python:3.11-slim-bookworm

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tar \
    && rm -rf /var/lib/apt/lists/*

# Download and extract taptap binary (pinned version)
# NOTE: This downloads ARM64 binary. Image MUST be built on ARM64 host
# or using: docker buildx build --platform linux/arm64 .
ARG TAPTAP_VERSION=v0.2.6
RUN curl -L "https://github.com/litinoveweedle/taptap/releases/download/${TAPTAP_VERSION}/taptap-Linux-musl-arm64.tar.gz" \
    | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/taptap

# Download taptap-mqtt from pinned commit for reproducibility
ARG TAPTAP_MQTT_COMMIT=c656d6b31247e906bf7186f28df36385018c8979
WORKDIR /app
RUN curl -L "https://github.com/litinoveweedle/taptap-mqtt/archive/${TAPTAP_MQTT_COMMIT}.tar.gz" \
    | tar -xz --strip-components=1

# Patch upstream taptap-mqtt.py to read CLIENT_ID from config (FR-2.3 / FR-2.4).
# Upstream calls `mqtt.Client()` with no arguments at exactly one site (line 1711
# in commit c656d6b) — verified via raw GitHub fetch. The sed below rewrites
# that one site to honor the new [MQTT] CLIENT_ID config key, with empty string
# fallback so existing deployments without the env var keep working
# (paho-mqtt 1.6.1 treats empty string identically to None — auto-generates
# a client ID — verified against paho.mqtt.python v1.6.1 source).
#
# Build fails loudly if the upstream commit ever changes the constructor line
# (e.g., adds an arg, multi-lines it) so we never ship a silently un-patched
# image. `diff -q` catches "no change made"; `grep` catches "patched but
# substring isn't what we expected".
RUN cp taptap-mqtt.py taptap-mqtt.py.bak \
    && sed -i 's|mqtt\.Client()|mqtt.Client(client_id=config.get("MQTT", "CLIENT_ID", fallback=""))|' taptap-mqtt.py \
    && if diff -q taptap-mqtt.py taptap-mqtt.py.bak > /dev/null; then \
        echo "ERROR: sed patch did not modify taptap-mqtt.py — upstream may have changed the mqtt.Client() call site" >&2; \
        exit 1; \
    fi \
    && grep -q 'mqtt\.Client(client_id=config\.get("MQTT", "CLIENT_ID"' taptap-mqtt.py \
        || (echo "ERROR: post-patch verification failed — patched line is not in expected form" >&2 && exit 1) \
    && rm taptap-mqtt.py.bak

# requirements.txt verified to exist at pinned commit c656d6b
# Contains: paho-mqtt==1.6.1, python-dateutil==2.8.1, uptime==3.0.1
RUN pip install --no-cache-dir -r requirements.txt

# Create directories for state and run files
RUN mkdir -p /data /run/taptap

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set unbuffered output for real-time logging
ENV PYTHONUNBUFFERED=1

# Entrypoint generates config.ini from template + env vars, then runs taptap-mqtt
ENTRYPOINT ["/app/entrypoint.sh"]
