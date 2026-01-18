import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Set

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
        # Temporary ID tracking (FR-5.4)
        self.temp_nodes: dict[str, Set[int]] = {}  # system -> set of temp node IDs
        self.node_id_to_panel: dict[str, str] = {}  # node_id -> display_label
        # Node mappings from sidecar: system -> {node_id: serial}
        self.node_mappings: dict[str, dict[str, str]] = {}

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
                tigo_label=panel.tigo_label,
                string=panel.string,
                system=panel.system,
                sn=panel.sn,
                node_id=old.node_id if old else None,
                watts=old.watts if old else None,
                voltage_in=old.voltage_in if old else None,
                voltage_out=old.voltage_out if old else None,
                current_in=old.current_in if old else None,
                current_out=old.current_out if old else None,
                temperature=old.temperature if old else None,
                duty_cycle=old.duty_cycle if old else None,
                rssi=old.rssi if old else None,
                energy=old.energy if old else None,
                online=old.online if old else True,
                stale=old.stale if old else False,
                is_temporary=old.is_temporary if old else False,
                position=panel.position,
            )

        logger.info(f"Loaded {len(self.panel_mapping.panels)} panels from config")

    def check_and_reload_config(self) -> bool:
        """Check if config file has changed and reload if necessary.

        Uses a 2-second tolerance to avoid spurious reloads on NAS mounts
        where mtime can fluctuate due to network timing issues.
        """
        if not self.config_path.exists():
            return False
        current_mtime = self.config_path.stat().st_mtime
        # Require at least 2 seconds difference to avoid NAS timing jitter
        if current_mtime > self._config_mtime + 2.0:
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
        voltage_in: Optional[float] = None,
        voltage_out: Optional[float] = None,
        current_in: Optional[float] = None,
        current_out: Optional[float] = None,
        temperature: Optional[float] = None,
        duty_cycle: Optional[float] = None,
        rssi: Optional[int] = None,
        energy: Optional[float] = None,
        online: bool = True,
        timestamp: Optional[str] = None,
        node_id: Optional[str] = None,
        actual_system: Optional[str] = None,
    ) -> bool:
        """Update panel data from MQTT message (FR-2.4, FR-2.5, FR-7.3)."""
        panel_config = self.get_panel_by_sn(sn)

        if panel_config is None:
            # FR-2.5: Log unknown serial numbers once per session
            if sn not in self.unknown_serials_logged:
                logger.warning(f"Unknown serial number received: {sn}")
                self.unknown_serials_logged.add(sn)
            return False

        display_label = panel_config.display_label
        self.last_update[display_label] = datetime.now(timezone.utc)

        # Preserve existing node_id if not provided (node_id comes from sidecar, not MQTT)
        existing = self.panel_state.get(display_label)
        effective_node_id = node_id if node_id is not None else (existing.node_id if existing else None)

        # Track node_id → display_label mapping for temp ID detection (FR-5.4)
        if effective_node_id:
            self.node_id_to_panel[effective_node_id] = display_label

        # Determine if panel is temporarily enumerated (FR-5.4)
        is_temporary = False
        if effective_node_id:
            system = panel_config.system
            temp_node_ids = self.temp_nodes.get(system, set())
            try:
                is_temporary = int(effective_node_id) in temp_node_ids
            except (ValueError, TypeError):
                pass

        self.panel_state[display_label] = PanelData(
            display_label=display_label,
            tigo_label=panel_config.tigo_label,
            string=panel_config.string,
            system=panel_config.system,
            sn=panel_config.sn,
            node_id=effective_node_id,
            watts=watts,
            voltage_in=voltage_in,
            voltage_out=voltage_out,
            current_in=current_in,
            current_out=current_out,
            temperature=temperature,
            duty_cycle=duty_cycle,
            rssi=rssi,
            energy=energy,
            online=online,
            stale=False,
            is_temporary=is_temporary,
            actual_system=actual_system,
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
                voltage_in=settings.mock_voltage,
                online=True,
            )
        logger.info(f"Applied mock data: {settings.mock_watts}W, {settings.mock_voltage}V")

    def update_temp_nodes(self, system: str, node_ids: List[int]) -> None:
        """Update the list of temporarily-enumerated nodes for a system (FR-5.4).

        When the sidecar publishes an updated list of temp_nodes, this method:
        1. Stores the new temp_nodes list for the system
        2. Updates is_temporary for all panels that have a node_id

        Args:
            system: The system name ("primary" or "secondary")
            node_ids: List of node IDs that are temporarily enumerated
        """
        self.temp_nodes[system] = set(node_ids)
        logger.info(f"Updated temp_nodes for {system}: {node_ids}")

        # Update is_temporary for all panels in this system that have a node_id
        for display_label, panel_data in self.panel_state.items():
            if panel_data.system != system:
                continue
            if not panel_data.node_id:
                continue

            try:
                node_id_int = int(panel_data.node_id)
                panel_data.is_temporary = node_id_int in self.temp_nodes[system]
            except (ValueError, TypeError):
                pass

    def update_node_mappings(self, system: str, mappings: dict[str, str]) -> None:
        """Update node_id → serial mappings from the sidecar.

        This provides node_id data that isn't available in taptap-mqtt's MQTT
        messages. The sidecar parses taptap logs for enumeration events and
        publishes the mappings.

        Args:
            system: The system name ("primary" or "secondary")
            mappings: Dict mapping node_id (str) to serial number
        """
        self.node_mappings[system] = mappings
        logger.info(f"Updated node_mappings for {system}: {len(mappings)} nodes")

        # Reverse mapping: serial -> node_id
        serial_to_node_id = {v: k for k, v in mappings.items()}

        # Debug: log sample serials from mappings
        sample_serials = list(serial_to_node_id.keys())[:3]
        logger.debug(f"Sample serials from mappings: {sample_serials}")

        # Update node_id for all panels in this system
        matched_count = 0
        for display_label, panel_data in self.panel_state.items():
            if panel_data.system != system:
                continue

            # Look up node_id by serial number
            node_id = serial_to_node_id.get(panel_data.sn)
            if node_id:
                panel_data.node_id = node_id
                matched_count += 1

                # Also update is_temporary based on new node_id
                try:
                    node_id_int = int(node_id)
                    temp_node_ids = self.temp_nodes.get(system, set())
                    panel_data.is_temporary = node_id_int in temp_node_ids
                except (ValueError, TypeError):
                    pass
            else:
                # Debug: log first few unmatched panels
                if matched_count == 0:
                    logger.debug(f"No match for panel {display_label} (sn={panel_data.sn})")

        logger.info(f"Matched {matched_count} panels with node_ids for {system}")
