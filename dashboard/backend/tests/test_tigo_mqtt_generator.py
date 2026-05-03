"""Tests for tigo_mqtt_generator (FR-2.5, static MQTT client IDs).

Covers:
- slug() helper edge cases
- generate_ini_config emits CLIENT_ID = taptap-<slug>
- generate_placeholder_ini emits CLIENT_ID = taptap-<slug>
"""

import pytest

from app.config_models import CCAConfig, MQTTConfig, Panel, PanelPosition, StringConfig
from app.tigo_mqtt_generator import (
    generate_ini_config,
    generate_placeholder_ini,
    slug,
)


class TestSlug:
    """Tests for slug() helper used to build static MQTT client IDs."""

    def test_simple_lowercase(self):
        assert slug("primary") == "primary"

    def test_already_slugged(self):
        assert slug("taptap-foo") == "taptap-foo"

    def test_uppercase_lowered(self):
        assert slug("PRIMARY") == "primary"

    def test_spaces_replaced(self):
        assert slug("House Roof") == "house-roof"

    def test_special_chars_replaced(self):
        assert slug("Backyard #2") == "backyard-2"

    def test_runs_collapsed(self):
        assert slug("a   b") == "a-b"
        assert slug("a---b") == "a-b"
        assert slug("a!!!@@@b") == "a-b"

    def test_leading_trailing_stripped(self):
        assert slug("---primary---") == "primary"
        assert slug("  primary  ") == "primary"

    def test_truncation_default_16(self):
        # exactly 16 chars
        assert slug("a" * 16) == "a" * 16
        # 17 chars truncates to 16
        assert slug("a" * 17) == "a" * 16
        # truncation at separator does not leave dangling '-'
        assert slug("aaaaaaaaaaaaaaa-bbb") == "aaaaaaaaaaaaaaa"  # 15 a's, then truncates

    def test_truncation_custom(self):
        assert slug("primary-installation", max_len=8) == "primary"  # truncates and strips '-'

    def test_underscore_preserved(self):
        assert slug("foo_bar") == "foo_bar"

    def test_digits_preserved(self):
        assert slug("cca-2024") == "cca-2024"

    def test_all_invalid_chars(self):
        # Goes to '-', which is then stripped → empty string
        assert slug("!!!") == ""

    def test_empty_string(self):
        assert slug("") == ""


def _minimal_mqtt() -> MQTTConfig:
    return MQTTConfig(server="broker.example", port=1883)


def _make_cca(name: str = "primary") -> CCAConfig:
    return CCAConfig(
        name=name,
        serial_device=f"/dev/tigo-{name}",
        strings=[StringConfig(name="A", panel_count=2)],
    )


def _make_panels(cca_name: str = "primary") -> list[Panel]:
    return [
        Panel(
            serial="4-C3F23CR",
            tigo_label="A1",
            display_label="A1",
            string="A",
            cca=cca_name,
            position=PanelPosition(x_percent=10.0, y_percent=10.0),
        ),
        Panel(
            serial="4-C3F2ACK",
            tigo_label="A2",
            display_label="A2",
            string="A",
            cca=cca_name,
            position=PanelPosition(x_percent=20.0, y_percent=10.0),
        ),
    ]


class TestGenerateIniConfigClientId:
    """generate_ini_config emits CLIENT_ID = taptap-<slug> under [MQTT]."""

    def test_primary_emits_client_id(self):
        ini = generate_ini_config(_make_cca("primary"), _make_panels("primary"), _minimal_mqtt())
        assert "CLIENT_ID = taptap-primary" in ini

    def test_secondary_emits_client_id(self):
        ini = generate_ini_config(
            _make_cca("secondary"), _make_panels("secondary"), _minimal_mqtt()
        )
        assert "CLIENT_ID = taptap-secondary" in ini

    def test_client_id_appears_under_mqtt_section(self):
        """CLIENT_ID must be inside [MQTT], not [TAPTAP] or [HA]."""
        ini = generate_ini_config(_make_cca("primary"), _make_panels("primary"), _minimal_mqtt())
        # Find section boundaries
        mqtt_start = ini.index("[MQTT]")
        taptap_start = ini.index("[TAPTAP]")
        client_id_pos = ini.index("CLIENT_ID")
        assert mqtt_start < client_id_pos < taptap_start


class TestGeneratePlaceholderIniClientId:
    """generate_placeholder_ini also emits CLIENT_ID."""

    def test_primary_emits_client_id(self):
        ini = generate_placeholder_ini(_make_cca("primary"), _minimal_mqtt())
        assert "CLIENT_ID = taptap-primary" in ini

    def test_secondary_emits_client_id(self):
        ini = generate_placeholder_ini(_make_cca("secondary"), _minimal_mqtt())
        assert "CLIENT_ID = taptap-secondary" in ini
