import re
from datetime import timedelta

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


def parse_retention(value: str) -> timedelta:
    """Parse a duration string into a timedelta.

    Supported formats: '7d' (days), '8h' (hours), '30m' (minutes).
    Plain integers are treated as days for backward compatibility.
    Validates bounds: minimum 10 minutes, maximum 30 days.
    """
    value = value.strip().lower()
    match = re.fullmatch(r"(\d+)\s*([dhm])?", value)
    if not match:
        raise ValueError(f"Invalid retention format: {value!r}. Use e.g. '7d', '8h', '30m'")
    amount = int(match.group(1))
    if amount == 0:
        raise ValueError("Retention must be greater than zero")
    unit = match.group(2) or "d"
    if unit == "d":
        td = timedelta(days=amount)
    elif unit == "h":
        td = timedelta(hours=amount)
    elif unit == "m":
        td = timedelta(minutes=amount)
    else:
        raise ValueError(f"Unknown unit: {unit}")
    if td < timedelta(minutes=10):
        raise ValueError("LOG_RETENTION must be at least 10m")
    if td > timedelta(days=30):
        raise ValueError("LOG_RETENTION must be at most 30d")
    return td


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # MQTT Configuration
    mqtt_broker_host: str = "mosquitto"
    mqtt_broker_port: int = 1883
    mqtt_topic_prefix: str = "taptap"
    mqtt_username: str | None = None
    mqtt_password: str | None = None

    # Application Configuration
    log_level: str = "INFO"
    use_mock_data: bool = True  # FR-2.3: Mock data until MQTT integration complete

    # WebSocket Configuration
    ws_heartbeat_interval: int = 30  # FR-3.4: Ping/pong every 30 seconds
    ws_batch_interval_ms: int = 500  # FR-3.2: Batch updates for 500ms

    # Staleness Configuration
    staleness_threshold_seconds: int = 300  # 5 minutes to match Tigo reporting interval

    # Log Configuration
    log_retention: str = Field(default="1d")
    log_buffer_size: int = Field(default=500, ge=100, le=5000)
    log_dir: str = "/app/logs"

    # Memory guard thresholds (MB). Set to 0 to disable.
    # Soft: gc.collect + malloc_trim + prune buffers. Hard: force exit.
    mem_soft_limit_mb: int = Field(default=100, ge=0)
    mem_hard_limit_mb: int = Field(default=200, ge=0)

    @field_validator("log_retention")
    @classmethod
    def validate_retention(cls, v: str) -> str:
        parse_retention(v)
        return v

    @property
    def retention_timedelta(self) -> timedelta:
        """Parsed retention as timedelta."""
        return parse_retention(self.log_retention)

    # TapTap State File Paths (for bootstrapping status check)
    # These should be mounted from the taptap container data directories
    taptap_primary_state_file: str | None = None
    taptap_secondary_state_file: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
