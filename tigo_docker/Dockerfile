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
ARG TAPTAP_MQTT_COMMIT=bbac4720d50fc2b73f4d4190a0601f9b49ee2990
WORKDIR /app
RUN curl -L "https://github.com/litinoveweedle/taptap-mqtt/archive/${TAPTAP_MQTT_COMMIT}.tar.gz" \
    | tar -xz --strip-components=1

# requirements.txt verified to exist at pinned commit bbac472
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
