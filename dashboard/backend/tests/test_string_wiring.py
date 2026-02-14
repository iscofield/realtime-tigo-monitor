"""Tests for StringConfig series-parallel wiring configuration.

Tests cover:
- Model validator: both fields, one field, neither, invalid invariant, non-divisor
- Model serializer: default omitted, non-default preserved, explicit default normalized
- Properties: effective_series, effective_parallel
- Forward compatibility: unknown fields silently ignored (FR-5.3-T1)
- Round-trip fidelity through model_dump/model_validate
"""

import pytest
from pydantic import ValidationError

from app.config_models import StringConfig, SystemConfig, CCAConfig, MQTTConfig


# --- Validator: both fields provided ---

class TestValidatorBothFields:
    def test_valid_invariant(self):
        """Both fields present and S*P == panel_count."""
        sc = StringConfig(name="A", panel_count=10, series_count=5, parallel_count=2)
        assert sc.series_count == 5
        assert sc.parallel_count == 2

    def test_invalid_invariant(self):
        """Both fields present but S*P != panel_count raises ValueError."""
        with pytest.raises(ValidationError, match="must equal panel_count"):
            StringConfig(name="A", panel_count=10, series_count=5, parallel_count=3)

    def test_all_series_explicit(self):
        """Explicitly setting all-series (S=panel_count, P=1)."""
        sc = StringConfig(name="A", panel_count=10, series_count=10, parallel_count=1)
        assert sc.series_count == 10
        assert sc.parallel_count == 1

    def test_all_parallel_explicit(self):
        """Explicitly setting all-parallel (S=1, P=panel_count)."""
        sc = StringConfig(name="A", panel_count=10, series_count=1, parallel_count=10)
        assert sc.series_count == 1
        assert sc.parallel_count == 10

    def test_single_panel_both(self):
        """Single panel with both fields set to 1."""
        sc = StringConfig(name="A", panel_count=1, series_count=1, parallel_count=1)
        assert sc.series_count == 1
        assert sc.parallel_count == 1


# --- Validator: one field provided (derives the other) ---

class TestValidatorOneField:
    def test_series_only_derives_parallel(self):
        """series_count provided, parallel_count derived."""
        sc = StringConfig(name="A", panel_count=10, series_count=5)
        assert sc.series_count == 5
        assert sc.parallel_count == 2

    def test_parallel_only_derives_series(self):
        """parallel_count provided, series_count derived."""
        sc = StringConfig(name="A", panel_count=10, parallel_count=2)
        assert sc.series_count == 5
        assert sc.parallel_count == 2

    def test_series_only_non_divisor_raises(self):
        """series_count doesn't evenly divide panel_count."""
        with pytest.raises(ValidationError, match="must evenly divide"):
            StringConfig(name="A", panel_count=10, series_count=3)

    def test_parallel_only_non_divisor_raises(self):
        """parallel_count doesn't evenly divide panel_count."""
        with pytest.raises(ValidationError, match="must evenly divide"):
            StringConfig(name="A", panel_count=10, parallel_count=3)

    def test_series_equals_panel_count(self):
        """series_count == panel_count -> parallel_count = 1."""
        sc = StringConfig(name="A", panel_count=10, series_count=10)
        assert sc.parallel_count == 1

    def test_parallel_equals_panel_count(self):
        """parallel_count == panel_count -> series_count = 1."""
        sc = StringConfig(name="A", panel_count=10, parallel_count=10)
        assert sc.series_count == 1


# --- Validator: neither field provided ---

class TestValidatorNeitherField:
    def test_both_none(self):
        """Neither field provided - all-series default."""
        sc = StringConfig(name="A", panel_count=10)
        assert sc.series_count is None
        assert sc.parallel_count is None

    def test_explicit_none(self):
        """Explicitly setting both to None."""
        sc = StringConfig(name="A", panel_count=10, series_count=None, parallel_count=None)
        assert sc.series_count is None
        assert sc.parallel_count is None


# --- Properties ---

class TestEffectiveProperties:
    def test_effective_series_with_value(self):
        sc = StringConfig(name="A", panel_count=10, series_count=5, parallel_count=2)
        assert sc.effective_series == 5

    def test_effective_series_default(self):
        sc = StringConfig(name="A", panel_count=10)
        assert sc.effective_series == 10

    def test_effective_parallel_with_value(self):
        sc = StringConfig(name="A", panel_count=10, series_count=5, parallel_count=2)
        assert sc.effective_parallel == 2

    def test_effective_parallel_default(self):
        sc = StringConfig(name="A", panel_count=10)
        assert sc.effective_parallel == 1

    def test_effective_single_panel(self):
        sc = StringConfig(name="A", panel_count=1)
        assert sc.effective_series == 1
        assert sc.effective_parallel == 1


# --- Serializer ---

class TestSerializer:
    def test_default_wiring_omitted(self):
        """Default wiring (both None) should not appear in serialized output."""
        sc = StringConfig(name="A", panel_count=10)
        d = sc.model_dump()
        assert "series_count" not in d
        assert "parallel_count" not in d
        assert d == {"name": "A", "panel_count": 10}

    def test_non_default_wiring_preserved(self):
        """Non-default wiring should be preserved in serialized output."""
        sc = StringConfig(name="G", panel_count=10, series_count=5, parallel_count=2)
        d = sc.model_dump()
        assert d["series_count"] == 5
        assert d["parallel_count"] == 2

    def test_explicit_default_normalized(self):
        """Explicitly setting all-series default should be stripped on serialization."""
        sc = StringConfig(name="A", panel_count=10, series_count=10, parallel_count=1)
        d = sc.model_dump()
        assert "series_count" not in d
        assert "parallel_count" not in d

    def test_one_field_round_trip(self):
        """series_count=5 on 10-panel -> derives parallel_count=2 -> both preserved."""
        sc = StringConfig(name="G", panel_count=10, series_count=5)
        assert sc.parallel_count == 2  # Derived by validator
        d = sc.model_dump()
        assert d["series_count"] == 5
        assert d["parallel_count"] == 2

    def test_all_parallel_preserved(self):
        """All-parallel (S=1, P=panel_count) is non-default, should be preserved."""
        sc = StringConfig(name="A", panel_count=10, series_count=1, parallel_count=10)
        d = sc.model_dump()
        assert d["series_count"] == 1
        assert d["parallel_count"] == 10

    def test_single_panel_omitted(self):
        """Single panel: 1S1P is the only option, same as default, should be omitted."""
        sc = StringConfig(name="A", panel_count=1, series_count=1, parallel_count=1)
        d = sc.model_dump()
        assert "series_count" not in d
        assert "parallel_count" not in d


# --- Round-trip fidelity ---

class TestRoundTrip:
    def test_default_round_trip(self):
        """Default -> dump -> validate -> both None, functionally equivalent."""
        sc1 = StringConfig(name="A", panel_count=10)
        d = sc1.model_dump()
        sc2 = StringConfig.model_validate(d)
        assert sc2.series_count is None
        assert sc2.parallel_count is None
        assert sc2.effective_series == sc1.effective_series
        assert sc2.effective_parallel == sc1.effective_parallel

    def test_explicit_default_round_trip(self):
        """Explicit default -> dump (stripped) -> validate -> both None."""
        sc1 = StringConfig(name="A", panel_count=10, series_count=10, parallel_count=1)
        d = sc1.model_dump()
        sc2 = StringConfig.model_validate(d)
        assert sc2.series_count is None
        assert sc2.parallel_count is None
        # Functionally equivalent
        assert sc2.effective_series == 10
        assert sc2.effective_parallel == 1

    def test_non_default_round_trip(self):
        """Non-default preserves exact values through round-trip."""
        sc1 = StringConfig(name="G", panel_count=10, series_count=5, parallel_count=2)
        d = sc1.model_dump()
        sc2 = StringConfig.model_validate(d)
        assert sc2.series_count == 5
        assert sc2.parallel_count == 2

    def test_nested_in_system_config_round_trip(self):
        """Wiring fields round-trip through full SystemConfig serialization."""
        config = SystemConfig(
            version=1,
            mqtt=MQTTConfig(server="mqtt.local", port=1883),
            ccas=[
                CCAConfig(
                    name="primary",
                    serial_device="/dev/ttyACM0",
                    strings=[
                        StringConfig(name="A", panel_count=10),  # default
                        StringConfig(name="G", panel_count=10, series_count=5, parallel_count=2),
                    ]
                )
            ]
        )
        d = config.model_dump()
        # String A should not have wiring fields
        string_a = d["ccas"][0]["strings"][0]
        assert "series_count" not in string_a
        assert "parallel_count" not in string_a
        # String G should have wiring fields
        string_g = d["ccas"][0]["strings"][1]
        assert string_g["series_count"] == 5
        assert string_g["parallel_count"] == 2

        # Round-trip
        config2 = SystemConfig.model_validate(d)
        assert config2.ccas[0].strings[0].series_count is None
        assert config2.ccas[0].strings[1].series_count == 5
        assert config2.ccas[0].strings[1].parallel_count == 2


# --- Forward compatibility (FR-5.3-T1) ---

class TestForwardCompatibility:
    def test_unknown_fields_ignored_on_string_config(self):
        """Unknown fields in StringConfig should be silently ignored."""
        sc = StringConfig.model_validate({
            "name": "A",
            "panel_count": 10,
            "future_field": True,
            "another_unknown": "value",
        })
        assert sc.name == "A"
        assert sc.panel_count == 10
        assert not hasattr(sc, "future_field")

    def test_unknown_fields_ignored_on_system_config(self):
        """Unknown fields in nested SystemConfig should be silently ignored."""
        data = {
            "version": 1,
            "mqtt": {"server": "mqtt.local", "port": 1883},
            "ccas": [{
                "name": "primary",
                "serial_device": "/dev/ttyACM0",
                "strings": [{
                    "name": "A",
                    "panel_count": 10,
                    "future_field": True,
                }]
            }]
        }
        config = SystemConfig.model_validate(data)
        assert config.ccas[0].strings[0].panel_count == 10


# --- Pre-feature backup compatibility ---

class TestPreFeatureBackupCompat:
    def test_pre_feature_yaml_no_wiring_fields(self):
        """Pre-feature YAML (no wiring fields) loads correctly."""
        data = {
            "version": 1,
            "mqtt": {"server": "mqtt.local", "port": 1883},
            "ccas": [{
                "name": "primary",
                "serial_device": "/dev/ttyACM0",
                "strings": [
                    {"name": "A", "panel_count": 10},
                    {"name": "B", "panel_count": 8},
                ]
            }]
        }
        config = SystemConfig.model_validate(data)
        for string in config.ccas[0].strings:
            assert string.series_count is None
            assert string.parallel_count is None
            assert string.effective_parallel == 1
            assert string.effective_series == string.panel_count

    def test_post_feature_yaml_with_wiring_fields(self):
        """Post-feature YAML with wiring fields loads correctly."""
        data = {
            "version": 1,
            "mqtt": {"server": "mqtt.local", "port": 1883},
            "ccas": [{
                "name": "secondary",
                "serial_device": "/dev/ttyACM1",
                "strings": [
                    {"name": "G", "panel_count": 10, "series_count": 5, "parallel_count": 2},
                ]
            }]
        }
        config = SystemConfig.model_validate(data)
        g = config.ccas[0].strings[0]
        assert g.series_count == 5
        assert g.parallel_count == 2
        assert g.effective_series == 5
        assert g.effective_parallel == 2


# --- Edge cases ---

class TestEdgeCases:
    def test_field_constraint_series_count_zero(self):
        """series_count=0 rejected by ge=1 constraint."""
        with pytest.raises(ValidationError):
            StringConfig(name="A", panel_count=10, series_count=0)

    def test_field_constraint_parallel_count_zero(self):
        """parallel_count=0 rejected by ge=1 constraint."""
        with pytest.raises(ValidationError):
            StringConfig(name="A", panel_count=10, parallel_count=0)

    def test_field_constraint_negative_series(self):
        """Negative series_count rejected by ge=1."""
        with pytest.raises(ValidationError):
            StringConfig(name="A", panel_count=10, series_count=-1)

    def test_field_constraint_negative_parallel(self):
        """Negative parallel_count rejected by ge=1."""
        with pytest.raises(ValidationError):
            StringConfig(name="A", panel_count=10, parallel_count=-1)

    def test_large_panel_count(self):
        """Large panel count with valid wiring."""
        sc = StringConfig(name="A", panel_count=60, series_count=12, parallel_count=5)
        assert sc.series_count == 12
        assert sc.parallel_count == 5

    def test_prime_panel_count_non_trivial_wiring_fails(self):
        """Prime panel_count with non-trivial wiring should fail."""
        with pytest.raises(ValidationError):
            StringConfig(name="A", panel_count=7, series_count=3, parallel_count=2)

    def test_prime_panel_count_valid_options(self):
        """Prime panel_count allows only all-series or all-parallel."""
        sc1 = StringConfig(name="A", panel_count=7, series_count=7, parallel_count=1)
        assert sc1.series_count == 7
        sc2 = StringConfig(name="A", panel_count=7, series_count=1, parallel_count=7)
        assert sc2.parallel_count == 7
