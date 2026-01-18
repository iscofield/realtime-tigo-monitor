import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from .models import PanelMapping, PanelConfig, PanelData, Position
from .config import get_settings

logger = logging.getLogger(__name__)


class PanelService:
    def __init__(self, config_path: str = "config/panel_mapping.json"):
        self.config_path = Path(config_path)
        self.panel_mapping: Optional[PanelMapping] = None
        self.panels_by_sn: dict[str, PanelConfig] = {}
        self.panel_state: dict[str, PanelData] = {}
        self.last_update: dict[str, datetime] = {}
        self.unknown_serials_logged: set[str] = set()
        self._config_mtime: float = 0

    def load_config(self) -> None:
        """Load and validate panel mapping configuration (FR-1.5)."""
        if not self.config_path.exists():
            raise FileNotFoundError(f"Panel mapping config not found: {self.config_path}")

        with open(self.config_path, "r") as f:
            data = json.load(f)

        # Pydantic validation handles FR-1.5 requirements
        self.panel_mapping = PanelMapping(**data)
        self._config_mtime = self.config_path.stat().st_mtime

        # Build lookup by serial number
        self.panels_by_sn = {p.sn: p for p in self.panel_mapping.panels}

        # Preserve existing watts/voltage/online state when reloading
        old_state = {k: v for k, v in self.panel_state.items()}

        # Initialize panel state with no data (or preserve existing values)
        for panel in self.panel_mapping.panels:
            old = old_state.get(panel.display_label)
            self.panel_state[panel.display_label] = PanelData(
                display_label=panel.display_label,
                string=panel.string,
                sn=panel.sn,
                watts=old.watts if old else None,
                voltage=old.voltage if old else None,
                online=old.online if old else True,
                stale=old.stale if old else False,
                position=panel.position,
            )

        logger.info(f"Loaded {len(self.panel_mapping.panels)} panels from config")

    def check_and_reload_config(self) -> bool:
        """Check if config file has changed and reload if necessary."""
        if not self.config_path.exists():
            return False
        current_mtime = self.config_path.stat().st_mtime
        if current_mtime > self._config_mtime:
            logger.info("Config file changed, reloading...")
            self.load_config()
            settings = get_settings()
            if settings.use_mock_data:
                self.apply_mock_data()
            return True
        return False

    def get_panel_by_sn(self, sn: str) -> Optional[PanelConfig]:
        """Look up panel by serial number (FR-2.4)."""
        return self.panels_by_sn.get(sn)

    def update_panel(
        self,
        sn: str,
        watts: Optional[float] = None,
        voltage: Optional[float] = None,
        online: bool = True,
        timestamp: Optional[str] = None,
    ) -> bool:
        """Update panel data from MQTT message (FR-2.4, FR-2.5)."""
        panel_config = self.get_panel_by_sn(sn)

        if panel_config is None:
            # FR-2.5: Log unknown serial numbers once per session
            if sn not in self.unknown_serials_logged:
                logger.warning(f"Unknown serial number received: {sn}")
                self.unknown_serials_logged.add(sn)
            return False

        display_label = panel_config.display_label
        self.last_update[display_label] = datetime.now(timezone.utc)

        self.panel_state[display_label] = PanelData(
            display_label=display_label,
            string=panel_config.string,
            watts=watts,
            voltage=voltage,
            online=online,
            stale=False,
            position=panel_config.position,
        )
        return True

    def check_staleness(self) -> None:
        """Mark stale panels based on last update time (FR-2.6)."""
        settings = get_settings()
        threshold = settings.staleness_threshold_seconds
        now = datetime.now(timezone.utc)

        for display_label, panel_data in self.panel_state.items():
            last = self.last_update.get(display_label)
            if last is not None:
                age_seconds = (now - last).total_seconds()
                panel_data.stale = age_seconds > threshold

    def get_all_panels(self) -> list[PanelData]:
        """Get current state of all panels."""
        self.check_and_reload_config()  # Hot-reload if config changed
        self.check_staleness()
        return list(self.panel_state.values())

    def apply_mock_data(self) -> None:
        """Apply mock data to all panels (FR-2.3)."""
        settings = get_settings()
        for panel in self.panel_mapping.panels:
            self.update_panel(
                sn=panel.sn,
                watts=settings.mock_watts,
                voltage=settings.mock_voltage,
                online=True,
            )
        logger.info(f"Applied mock data: {settings.mock_watts}W, {settings.mock_voltage}V")
