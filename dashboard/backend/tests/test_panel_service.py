import pytest
import json
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta

from app.panel_service import PanelService
from app.config import get_settings


class TestPanelService:
    def test_load_valid_config(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        assert len(service.panels_by_sn) == 2
        assert "4-C3F23CR" in service.panels_by_sn
        assert service.panels_by_sn["4-C3F23CR"].display_label == "A1"

    def test_load_missing_config(self):
        service = PanelService(config_path="/nonexistent/path.json")
        with pytest.raises(FileNotFoundError):
            service.load_config()

    def test_load_invalid_config_duplicate_sn(self, invalid_panel_mapping_duplicate_sn):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(invalid_panel_mapping_duplicate_sn, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        with pytest.raises(Exception) as exc_info:
            service.load_config()
        assert "Duplicate serial numbers" in str(exc_info.value)

    def test_get_panel_by_sn(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        panel = service.get_panel_by_sn("4-C3F23CR")
        assert panel is not None
        assert panel.display_label == "A1"

        unknown = service.get_panel_by_sn("unknown-sn")
        assert unknown is None

    def test_update_panel(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        result = service.update_panel(
            sn="4-C3F23CR",
            watts=385.0,
            voltage_in=42.5,
            online=True
        )
        assert result is True

        panel_data = service.panel_state["A1"]
        assert panel_data.watts == 385.0
        assert panel_data.voltage_in == 42.5

    def test_update_unknown_panel(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        # First call logs the warning
        result1 = service.update_panel(sn="unknown-sn", watts=100.0, voltage_in=45.0)
        assert result1 is False
        assert "unknown-sn" in service.unknown_serials_logged

        # Second call should not log again (already logged)
        result2 = service.update_panel(sn="unknown-sn", watts=100.0, voltage_in=45.0)
        assert result2 is False

    def test_staleness_detection(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        # Update panel
        service.update_panel(sn="4-C3F23CR", watts=385.0, voltage_in=42.5)

        # Simulate time passing beyond staleness threshold (use actual setting + buffer)
        settings = get_settings()
        stale_seconds = settings.staleness_threshold_seconds + 50
        service.last_update["A1"] = datetime.now(timezone.utc) - timedelta(seconds=stale_seconds)

        service.check_staleness()
        assert service.panel_state["A1"].stale is True

    def test_get_all_panels(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()

        panels = service.get_all_panels()
        assert len(panels) == 2
        assert all(p.display_label in ["A1", "A2"] for p in panels)

    def test_apply_mock_data(self, valid_panel_mapping):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(valid_panel_mapping, f)
            config_path = f.name

        service = PanelService(config_path=config_path)
        service.load_config()
        service.apply_mock_data()

        for panel in service.get_all_panels():
            assert panel.watts is not None
            assert 180 <= panel.watts <= 420  # ~200-400 base ±5%
            assert panel.voltage_in is not None
            assert 40 <= panel.voltage_in <= 50  # ~42-48 base ±3%
            assert panel.online is True
