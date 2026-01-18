FROM python:3.11-slim

# Install Docker CLI (static binary) for log monitoring
# We only need the CLI to run 'docker logs', not the daemon
ARG DOCKER_VERSION=27.0.3
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && curl -fsSL "https://download.docker.com/linux/static/stable/$(uname -m)/docker-${DOCKER_VERSION}.tgz" \
       | tar -xz --strip-components=1 -C /usr/local/bin docker/docker \
    && apt-get purge -y curl && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY temp_id_monitor.py .

CMD ["python", "-u", "temp_id_monitor.py"]
