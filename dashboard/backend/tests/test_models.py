import json
import pytest
from datetime import datetime, timezone
from pydantic import ValidationError

from app.models import PanelMapping, PanelConfig, Position, PanelData, MQTTNodeData, WebSocketMessage


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
            system="primary",
            sn="4-TEST123",
            watts=385.0,
            voltage_in=42.5,
            online=True,
            stale=False,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.watts == 385.0
        assert data.voltage_in == 42.5
        assert data.online is True
        assert data.stale is False

    def test_panel_data_with_null_values(self):
        data = PanelData(
            display_label="A1",
            string="A",
            system="primary",
            sn="4-TEST123",
            watts=None,
            voltage_in=None,
            online=True,
            stale=False,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.watts is None
        assert data.voltage_in is None

    def test_panel_data_accepts_float_rssi(self):
        """Ensure rssi accepts float values (actual MQTT data sends floats like 229.5)."""
        data = PanelData(
            display_label="A1",
            string="A",
            system="primary",
            sn="4-TEST123",
            rssi=229.5,  # Float value from actual MQTT data
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.rssi == 229.5

    def test_panel_data_accepts_datetime_last_update(self):
        """Ensure last_update accepts datetime objects."""
        now = datetime.now(timezone.utc)
        data = PanelData(
            display_label="A1",
            string="A",
            system="primary",
            sn="4-TEST123",
            last_update=now,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        assert data.last_update == now

    def test_panel_data_json_serialization_with_datetime(self):
        """Ensure PanelData can be JSON serialized when containing datetime fields."""
        now = datetime.now(timezone.utc)
        data = PanelData(
            display_label="A1",
            string="A",
            system="primary",
            sn="4-TEST123",
            last_update=now,
            position=Position(x_percent=15.5, y_percent=23.2)
        )
        # This is what websocket_manager uses - must not raise
        json_dict = data.model_dump(mode='json', by_alias=True)
        # Verify it's actually JSON serializable
        json_str = json.dumps(json_dict)
        assert isinstance(json_str, str)
        # Verify datetime was converted to string
        assert isinstance(json_dict['last_update'], str)


class TestMQTTNodeData:
    """Tests for MQTTNodeData model - validates actual MQTT payload format."""

    def test_mqtt_node_data_accepts_float_rssi(self):
        """Ensure rssi accepts float values (actual MQTT data sends floats like 229.5)."""
        data = MQTTNodeData(
            node_serial="4-C3F23CR",
            rssi=191.5,  # Float value from actual MQTT data
            power=385.0,
            voltage_in=42.5,
        )
        assert data.rssi == 191.5

    def test_mqtt_node_data_realistic_payload(self):
        """Test with a realistic MQTT payload structure."""
        payload = {
            "node_serial": "4-C3F23CR",
            "node_id": "12345",
            "node_name": "A1",
            "state_online": "online",
            "voltage_in": 42.5,
            "voltage_out": 40.2,
            "current_in": 9.1,
            "current_out": 9.5,
            "power": 385.0,
            "temperature": 45.3,
            "duty_cycle": 95.5,
            "rssi": 176.5,  # Float - this was the bug
            "energy": 12.5,
        }
        data = MQTTNodeData(**payload)
        assert data.rssi == 176.5
        assert data.power == 385.0


class TestWebSocketMessage:
    """Tests for WebSocketMessage serialization."""

    def test_websocket_message_json_serialization(self):
        """Ensure WebSocketMessage can be fully JSON serialized."""
        now = datetime.now(timezone.utc)
        panels = [
            PanelData(
                display_label="A1",
                string="A",
                system="primary",
                sn="4-TEST123",
                watts=385.0,
                rssi=229.5,
                last_update=now,
                position=Position(x_percent=15.5, y_percent=23.2)
            )
        ]
        message = WebSocketMessage(
            timestamp=now.isoformat(),
            panels=panels,
        )
        # This must not raise - it's what websocket_manager.broadcast() does
        json_dict = message.model_dump(mode='json', by_alias=True)
        json_str = json.dumps(json_dict)
        assert isinstance(json_str, str)
        # Verify nested datetime was serialized
        assert isinstance(json_dict['panels'][0]['last_update'], str)
