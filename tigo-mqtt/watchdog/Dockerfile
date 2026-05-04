# taptap-watchdog: Pi-side sidecar that auto-restarts silent taptap CCA
# containers via docker-socket-proxy. See docs/specs/2026-05-02-tigo-mqtt-self-healing.md
# (FR-3) for the full requirement set.
FROM python:3.11-slim-bookworm

# tini as PID 1 so SIGTERM propagates cleanly to uvicorn / paho threads.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Persistent SQLite volume mount point. The compose file binds this to
# ./watchdog-data on the host. NEVER mount tigo-mqtt/data here — state files
# live there and NFR-1.1 forbids the watchdog from touching them.
VOLUME ["/data"]

EXPOSE 8080

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-u", "app.py"]
