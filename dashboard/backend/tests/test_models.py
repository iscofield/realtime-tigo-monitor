import pytest
from pydantic import ValidationError

from app.models import PanelMapping, PanelConfig, Position, PanelData


class TestPosition:
    def test_valid_position(self):
        pos = Position(x_percent=50.0, y_percent=75.5)
        assert pos.x_percent == 50.0
        assert pos.y_percent == 75.5

    def test_position_at_boundaries(self):
        pos_min = Position(x_percent=0.0, y_percent=0.0)
        pos_max = Position(x_percent=100.0, y_percent=100.0)
        assert pos_min.x_percent == 0.0
        assert pos_max.x_percent == 100.0

    def test_position_out_of_range_high(self):
        with pytest.raises(ValidationError):
            Position(x_percent=100.1, y_percent=50.0)

    def test_position_out_of_range_low(self):
        with pytest.raises(ValidationError):
            Position(x_percent=-0.1, y_percent=50.0)


class TestPanelMapping:
    def test_valid_mapping(self, valid_panel_mapping):
        mapping = PanelMapping(**valid_panel_mapping)
        assert len(mapping.panels) == 2
        assert mapping.panels[0].sn == "4-C3F23CR"

    def test_duplicate_serial_numbers(self, invalid_panel_mapping_duplicate_sn):
        with pytest.raises(ValidationError) as exc_info:
            PanelMapping(**invalid_panel_mapping_duplicate_sn)
        assert "Duplicate serial numbers" in str(exc_info.value)

    def test_out_of_range_position(self, invalid_panel_mapping_out_of_range):
        with pytest.raises(ValidationError):
            PanelMapping(**invalid_panel_mapping_out_of_range)

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            PanelMapping(panels=[{"sn": "test"}])  # Missing other fields


class TestPanelData:
    def test_panel_data_with_values(self):
        data = PanelData(
            display_label="A1",
            string="A",
            watts=385.0,
            voltage=42.5,
            online=True,
            stale=False,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.watts == 385.0
        assert data.voltage == 42.5
        assert data.online is True
        assert data.stale is False

    def test_panel_data_with_null_values(self):
        data = PanelData(
            display_label="A1",
            string="A",
            watts=None,
            voltage=None,
            online=True,
            stale=False,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.watts is None
        assert data.voltage is None
