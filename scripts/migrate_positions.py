#!/usr/bin/env python3
"""
Migrate panel positions from legacy JSON to YAML format.

This script reads the legacy panel_mapping.json.legacy file and updates
the panels.yaml file with the position data.
"""

import json
import yaml
from pathlib import Path


def main():
    # Paths relative to project root
    project_root = Path(__file__).parent.parent
    legacy_json_path = project_root / "docs" / "archive" / "panel_mapping.json.legacy"
    panels_yaml_path = project_root / "config" / "panels.yaml"

    # Read legacy JSON
    print(f"Reading legacy JSON from: {legacy_json_path}")
    with open(legacy_json_path, "r") as f:
        legacy_data = json.load(f)

    # Build a lookup by serial number
    position_lookup = {}
    for panel in legacy_data["panels"]:
        serial = panel["sn"]
        if panel.get("position"):
            position_lookup[serial] = {
                "x_percent": panel["position"]["x_percent"],
                "y_percent": panel["position"]["y_percent"]
            }

    print(f"Found {len(position_lookup)} panels with positions in legacy JSON")

    # Read current YAML
    print(f"Reading YAML from: {panels_yaml_path}")
    with open(panels_yaml_path, "r") as f:
        yaml_data = yaml.safe_load(f)

    # Update positions in YAML data
    updated_count = 0
    for panel in yaml_data["panels"]:
        serial = panel["serial"]
        if serial in position_lookup:
            panel["position"] = position_lookup[serial]
            updated_count += 1
        else:
            print(f"Warning: No position found for serial {serial}")

    print(f"Updated {updated_count} panel positions")

    # Write updated YAML with preserved formatting
    print(f"Writing updated YAML to: {panels_yaml_path}")

    # Custom YAML representer for None values
    def represent_none(dumper, data):
        return dumper.represent_scalar('tag:yaml.org,2002:null', 'null')

    yaml.add_representer(type(None), represent_none)

    # Write with header comment
    with open(panels_yaml_path, "w") as f:
        f.write("# Panel definitions - generated during setup, can be manually edited\n")
        yaml.dump(yaml_data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)

    print("Migration complete!")

    # Verify by reading back
    with open(panels_yaml_path, "r") as f:
        verify_data = yaml.safe_load(f)

    panels_with_positions = sum(1 for p in verify_data["panels"] if p.get("position"))
    print(f"Verification: {panels_with_positions} panels now have positions")


if __name__ == "__main__":
    main()
