"""Unit tests for PR-2 (persistent cache) and PR-3 (state cross-check).

Covers FR-2.x (cache load/save) and FR-4.x (read-only state cross-check).
Pure unit tests: no Docker, no MQTT broker, no live taptap.state (FR-6.0).
"""
import json
import logging

from temp_id_monitor import (
    cross_check,
    load_cache,
    read_state_node_ids,
    save_cache,
)


# --- FR-2: cache round-trip / atomicity / robustness -----------------------

def test_cache_roundtrip(tmp_path):
    p = tmp_path / "node_serials_primary.json"
    save_cache(p, "primary", {"1": "S1", "65": "4-C3F222W"})
    assert load_cache(p) == {"1": "S1", "65": "4-C3F222W"}


def test_save_leaves_no_temp_file(tmp_path):
    p = tmp_path / "node_serials_primary.json"
    save_cache(p, "primary", {"1": "S1"})
    assert p.exists()
    assert not (tmp_path / "node_serials_primary.json.tmp").exists()


def test_save_creates_parent_dir(tmp_path):
    p = tmp_path / "sub" / "node_serials_primary.json"
    save_cache(p, "primary", {"1": "S1"})
    assert load_cache(p) == {"1": "S1"}


def test_load_missing_returns_empty(tmp_path):
    assert load_cache(tmp_path / "nope.json") == {}


def test_load_malformed_returns_empty(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{ not valid json")
    assert load_cache(p) == {}


def test_load_wrong_schema_returns_empty(tmp_path):
    p = tmp_path / "old.json"
    p.write_text(json.dumps({"schema_version": 99, "mappings": {"1": "S1"}}))
    assert load_cache(p) == {}


def test_load_coerces_keys_and_values_to_str(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps({"schema_version": 1, "mappings": {"65": "4-C3F222W"}}))
    out = load_cache(p)
    assert out == {"65": "4-C3F222W"}
    assert all(isinstance(k, str) and isinstance(v, str) for k, v in out.items())


# --- FR-4: read-only state cross-check -------------------------------------

def _write_state(tmp_path, node_ids):
    p = tmp_path / "taptap.state"
    p.write_text(json.dumps({
        "gateway_node_tables": {"gw1": [[nid, [0, 0, 0]] for nid in node_ids]}
    }))
    return p


def test_read_state_node_ids_from_gateway_tables(tmp_path):
    p = _write_state(tmp_path, [65, 42, 7])
    assert read_state_node_ids(str(p)) == {"65", "42", "7"}


def test_read_state_unconfigured_returns_none():
    assert read_state_node_ids(None) is None


def test_read_state_missing_returns_none():
    assert read_state_node_ids("/no/such/taptap.state") is None


def test_read_state_malformed_returns_none(tmp_path):
    p = tmp_path / "taptap.state"
    p.write_text("{ broken")
    assert read_state_node_ids(str(p)) is None


def test_cross_check_warns_on_missing(caplog):
    with caplog.at_level(logging.WARNING):
        cross_check("primary", {"1", "2"}, {"1", "2", "3"})
    msgs = [r.getMessage() for r in caplog.records]
    assert any("missing" in m and "'3'" in m for m in msgs)


def test_cross_check_warns_on_extra(caplog):
    with caplog.at_level(logging.WARNING):
        cross_check("primary", {"1", "2", "9"}, {"1", "2"})
    assert any("extra" in r.getMessage() for r in caplog.records)


def test_cross_check_complete_emits_no_warning(caplog):
    with caplog.at_level(logging.WARNING):
        cross_check("primary", {"1", "2"}, {"1", "2"})
    assert [r for r in caplog.records if r.levelno >= logging.WARNING] == []


def test_cross_check_skipped_when_no_state(caplog):
    with caplog.at_level(logging.INFO):
        cross_check("primary", {"1"}, None)
    assert caplog.records == []
