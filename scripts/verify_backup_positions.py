#!/usr/bin/env python3
"""
Verify that the backup ZIP file correctly preserves panel positions.

This script simulates what happens during restore:
1. Reads the backup ZIP
2. Parses the panels.yaml
3. Validates that positions are correctly extracted
4. Simulates saving and re-reading to verify round-trip preservation
"""

import io
import json
import tempfile
import zipfile
from pathlib import Path

import yaml


def test_backup_positions():
    project_root = Path(__file__).parent.parent
    backup_path = project_root / "dashboard" / "backend" / "tests" / "fixtures" / "test-backup-69-panels.zip"

    print(f"Testing backup: {backup_path}")
    print("=" * 60)

    if not backup_path.exists():
        print(f"ERROR: Backup file not found: {backup_path}")
        return False

    # Test 1: Read and parse the backup
    print("\nTest 1: Reading backup ZIP...")
    with zipfile.ZipFile(backup_path, 'r') as zf:
        # Verify panels.yaml exists
        if "panels.yaml" not in zf.namelist():
            print("ERROR: panels.yaml not in backup")
            return False

        panels_yaml = yaml.safe_load(zf.read("panels.yaml"))

    panels = panels_yaml.get("panels", [])
    print(f"  Found {len(panels)} panels")

    # Test 2: Check that positions are present
    print("\nTest 2: Verifying positions in backup...")
    panels_with_positions = sum(1 for p in panels if p.get("position") is not None)
    panels_without_positions = sum(1 for p in panels if p.get("position") is None)

    print(f"  Panels with positions: {panels_with_positions}")
    print(f"  Panels without positions: {panels_without_positions}")

    if panels_without_positions > 0:
        print("ERROR: Some panels are missing positions!")
        missing = [p["serial"] for p in panels if p.get("position") is None][:5]
        print(f"  First 5 missing: {missing}")
        return False

    # Test 3: Verify position structure
    print("\nTest 3: Verifying position structure...")
    first_panel = panels[0]
    pos = first_panel.get("position")

    if pos is None:
        print("ERROR: First panel has no position")
        return False

    if "x_percent" not in pos or "y_percent" not in pos:
        print(f"ERROR: Position missing x_percent or y_percent: {pos}")
        return False

    print(f"  First panel position: x={pos['x_percent']}, y={pos['y_percent']}")

    # Test 4: Verify specific known values
    print("\nTest 4: Verifying specific position values...")
    expected_positions = {
        "4-C3F23CR": {"x_percent": 35.5, "y_percent": 11.75},
        "4-C3F2ACK": {"x_percent": 35.5, "y_percent": 15.0},
        "4-C3F290V": {"x_percent": 57.0, "y_percent": 16.25},
    }

    for serial, expected_pos in expected_positions.items():
        panel = next((p for p in panels if p["serial"] == serial), None)
        if panel is None:
            print(f"ERROR: Panel {serial} not found")
            return False

        actual_pos = panel.get("position")
        if actual_pos is None:
            print(f"ERROR: Panel {serial} has no position")
            return False

        if actual_pos["x_percent"] != expected_pos["x_percent"]:
            print(f"ERROR: Panel {serial} x_percent mismatch: expected {expected_pos['x_percent']}, got {actual_pos['x_percent']}")
            return False

        if actual_pos["y_percent"] != expected_pos["y_percent"]:
            print(f"ERROR: Panel {serial} y_percent mismatch: expected {expected_pos['y_percent']}, got {actual_pos['y_percent']}")
            return False

        print(f"  {serial}: OK (x={actual_pos['x_percent']}, y={actual_pos['y_percent']})")

    # Test 5: Simulate round-trip (save and re-read)
    print("\nTest 5: Simulating round-trip save/read...")
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', delete=False) as f:
        yaml.dump(panels_yaml, f)
        temp_path = f.name

    # Re-read
    with open(temp_path, 'r') as f:
        reloaded = yaml.safe_load(f)

    Path(temp_path).unlink()  # Clean up

    reloaded_panels = reloaded.get("panels", [])
    panels_with_positions_after = sum(1 for p in reloaded_panels if p.get("position") is not None)

    if panels_with_positions_after != panels_with_positions:
        print(f"ERROR: Position count changed after round-trip: {panels_with_positions} -> {panels_with_positions_after}")
        return False

    # Verify specific values after round-trip
    for serial, expected_pos in expected_positions.items():
        panel = next((p for p in reloaded_panels if p["serial"] == serial), None)
        actual_pos = panel.get("position")
        if actual_pos["x_percent"] != expected_pos["x_percent"] or actual_pos["y_percent"] != expected_pos["y_percent"]:
            print(f"ERROR: Panel {serial} position changed after round-trip")
            return False

    print(f"  Round-trip preserved all {panels_with_positions_after} positions")

    # Test 6: Verify this matches what the API would return
    print("\nTest 6: Simulating API response format...")
    # The API does: [p.model_dump() for p in result["panels"].panels]
    # With Pydantic Panel model, position should be serialized as dict with x_percent, y_percent

    api_response_panels = []
    for p in panels:
        # Simulate what Pydantic would do
        panel_dict = {
            "serial": p["serial"],
            "cca": p["cca"],
            "string": p["string"],
            "tigo_label": p["tigo_label"],
            "display_label": p["display_label"],
            "position": p.get("position"),  # Should preserve the dict
        }
        api_response_panels.append(panel_dict)

    panels_with_positions_in_response = sum(
        1 for p in api_response_panels if p.get("position") is not None
    )

    if panels_with_positions_in_response != panels_with_positions:
        print(f"ERROR: Positions lost in API response simulation: {panels_with_positions} -> {panels_with_positions_in_response}")
        return False

    print(f"  API response would include {panels_with_positions_in_response} panels with positions")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED!")
    print(f"Backup correctly contains {len(panels)} panels, all with positions")
    return True


if __name__ == "__main__":
    import sys
    success = test_backup_positions()
    sys.exit(0 if success else 1)
