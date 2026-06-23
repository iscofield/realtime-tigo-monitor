"""Unit tests for PR-1 of the durable node-mapping spec.

Covers FR-1 (broadened enumeration parsing) and FR-3 (no-clobber publish).
Pure unit tests: no Docker, no MQTT broker, no live taptap.state (FR-6.0).
"""
import asyncio

from temp_id_monitor import (
    ALREADY_ENUM_PATTERN,
    PERM_SERIAL_PATTERN,
    merge_mapping,
    parse_mapping,
    publish_node_mappings,
)


# --- FR-1.1 / FR-1.2: parsing both enumeration line types -------------------

def test_already_enumerated_line_extracts_node_and_serial():
    line = ("2026-06-21 11:37:04.373 DEBUG: Node id: 65 already enumerated "
            "to node name: 'D7' and serial: '4-C3F222W'")
    assert parse_mapping(line) == ("65", "4-C3F222W")


def test_permanently_enumerated_bare_line():
    line = "Permanently enumerated node id: 42 to node name: A7 device serial: 4-C3F23CR"
    assert parse_mapping(line) == ("42", "4-C3F23CR")


def test_permanently_enumerated_with_timestamp_prefix():
    line = ("2026-05-01 09:00:00.000 INFO: Permanently enumerated node id: 7 "
            "to node name: B3 device serial: 4-C3D641S")
    assert parse_mapping(line) == ("7", "4-C3D641S")


def test_already_enum_pattern_strips_surrounding_quotes():
    m = ALREADY_ENUM_PATTERN.search(
        "Node id: 3 already enumerated to node name: 'A3' and serial: '4-C3F292X'"
    )
    assert m is not None
    assert m.group(1) == "3"
    assert m.group(2) == "4-C3F292X"  # no surrounding quotes


# --- FR-1: negative cases (must NOT be treated as mappings) -----------------

def test_temp_enumeration_line_is_not_a_mapping():
    assert parse_mapping("Temporary enumerated node id: 99") is None


def test_telemetry_json_is_not_a_mapping():
    line = ('2026-06-21 11:37:00 DEBUG: {"time": "...", "nodes": '
            '{"D7": {"node_serial": "4-C3F222W"}}}')
    assert parse_mapping(line) is None


def test_sensor_reset_line_is_not_a_mapping():
    assert parse_mapping(
        "2026-06-21 11:00:00 DEBUG: Calling reset_node_sensor for node 5"
    ) is None


def test_already_pattern_does_not_match_perm_line():
    assert ALREADY_ENUM_PATTERN.search(
        "Permanently enumerated node id: 42 to node name: A7 device serial: 4-C3F23CR"
    ) is None


def test_perm_pattern_does_not_match_already_line():
    assert PERM_SERIAL_PATTERN.search(
        "Node id: 65 already enumerated to node name: 'D7' and serial: '4-C3F222W'"
    ) is None


# --- FR-3.2: merge grows/updates only, never shrinks ------------------------

def test_merge_adds_new_entry_and_reports_change():
    m = {}
    assert merge_mapping(m, "1", "S1") is True
    assert m == {"1": "S1"}


def test_merge_is_noop_when_unchanged():
    m = {"1": "S1"}
    assert merge_mapping(m, "1", "S1") is False  # gates write/publish — no storm
    assert m == {"1": "S1"}


def test_merge_updates_serial_on_reassignment():
    m = {"1": "S1"}
    assert merge_mapping(m, "1", "S2") is True
    assert m == {"1": "S2"}


def test_merge_never_shrinks_map():
    m = {"1": "S1", "2": "S2"}
    merge_mapping(m, "3", "S3")
    assert set(m) == {"1", "2", "3"}


# --- FR-3.1 / FR-3.6: no-clobber publish gate ------------------------------

class _FakeMqtt:
    def __init__(self):
        self.calls = []

    async def publish(self, topic, payload, **kwargs):
        self.calls.append((topic, payload, kwargs))


def test_publish_skipped_when_map_empty():
    m = _FakeMqtt()
    asyncio.run(publish_node_mappings(m, "primary", {}))
    assert m.calls == []  # FR-3.1: never clobber a good retained value with empty


def test_publish_when_nonempty_uses_qos1_and_retain():
    m = _FakeMqtt()
    asyncio.run(publish_node_mappings(m, "primary", {"65": "4-C3F222W"}))
    assert len(m.calls) == 1
    topic, payload, kwargs = m.calls[0]
    assert topic == "taptap/primary/node_mappings"
    assert kwargs.get("qos") == 1
    assert kwargs.get("retain") is True
    assert '"65": "4-C3F222W"' in payload
