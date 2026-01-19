from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


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
    mock_watts: int = 100
    mock_voltage: float = 45.0

    # WebSocket Configuration
    ws_heartbeat_interval: int = 30  # FR-3.4: Ping/pong every 30 seconds
    ws_batch_interval_ms: int = 500  # FR-3.2: Batch updates for 500ms

    # Staleness Configuration
    staleness_threshold_seconds: int = 300  # 5 minutes to match Tigo reporting interval

    # TapTap State File Paths (for bootstrapping status check)
    # These should be mounted from the taptap container data directories
    taptap_primary_state_file: str | None = None
    taptap_secondary_state_file: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
