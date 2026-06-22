FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create static directory for layout image
RUN mkdir -p static config

# Config-mount readiness guard — see entrypoint.sh. Prevents the backend from
# starting against an empty stand-in /app/config (host mount not ready at boot)
# and falling back to the setup wizard.
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

# Liveness only: the process is serving HTTP. Does NOT gate on configuration,
# so a legitimately-unconfigured fresh install still reports healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
