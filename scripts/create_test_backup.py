#!/usr/bin/env python3
"""
Create a test backup ZIP file with panel positions.

This creates a backup that can be used for testing the restore functionality.
"""

import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import yaml


def main():
    project_root = Path(__file__).parent.parent

    # Read the panels.yaml with positions
    panels_yaml_path = project_root / "config" / "panels.yaml"
    layout_yaml_path = project_root / "config" / "layout.yaml"
    system_yaml_path = project_root / "config" / "system.yaml"
    layout_image_path = project_root / "assets" / "layout.png"
    output_path = project_root / "dashboard" / "backend" / "tests" / "fixtures" / "test-backup-69-panels.zip"

    print(f"Reading panels.yaml from: {panels_yaml_path}")
    with open(panels_yaml_path, "r") as f:
        panels_yaml_content = f.read()
        panels_data = yaml.safe_load(panels_yaml_content)

    # Verify positions exist
    panels_with_positions = sum(1 for p in panels_data["panels"] if p.get("position"))
    print(f"Found {len(panels_data['panels'])} panels, {panels_with_positions} with positions")

    if panels_with_positions == 0:
        print("ERROR: No panels have positions! Run migrate_positions.py first.")
        return

    # Read layout.yaml if exists
    layout_yaml_content = None
    if layout_yaml_path.exists():
        print(f"Reading layout.yaml from: {layout_yaml_path}")
        with open(layout_yaml_path, "r") as f:
            layout_yaml_content = f.read()

    # Read system.yaml if exists
    system_yaml_content = None
    if system_yaml_path.exists():
        print(f"Reading system.yaml from: {system_yaml_path}")
        with open(system_yaml_path, "r") as f:
            system_yaml_content = f.read()

    # Read layout image if exists
    layout_image_data = None
    layout_image_hash = None
    if layout_image_path.exists():
        print(f"Reading layout.png from: {layout_image_path}")
        layout_image_data = layout_image_path.read_bytes()
        layout_image_hash = f"sha256:{hashlib.sha256(layout_image_data).hexdigest()}"

    # Build manifest
    manifest = {
        "backup_version": 1,
        "app_version": "0.1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "panel_count": len(panels_data["panels"]),
        "has_layout_image": layout_image_data is not None,
        "contains_sensitive_data": False,
    }

    if layout_image_hash:
        manifest["layout_image_hash"] = layout_image_hash

    # Create ZIP
    print(f"Creating backup at: {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add manifest
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Add panels.yaml
        zf.writestr("panels.yaml", panels_yaml_content)

        # Add system.yaml if exists
        if system_yaml_content:
            zf.writestr("system.yaml", system_yaml_content)

        # Add layout.yaml if exists
        if layout_yaml_content:
            zf.writestr("layout.yaml", layout_yaml_content)

        # Add layout image if exists
        if layout_image_data:
            zf.writestr("assets/layout.png", layout_image_data)

    # Verify the backup
    print("\nVerifying backup...")
    with zipfile.ZipFile(output_path, 'r') as zf:
        # List contents
        print("Contents:")
        for info in zf.infolist():
            print(f"  {info.filename}: {info.file_size} bytes")

        # Parse and verify panels
        panels_yaml_from_zip = yaml.safe_load(zf.read("panels.yaml"))
        panels_with_positions = sum(1 for p in panels_yaml_from_zip["panels"] if p.get("position"))
        print(f"\nVerification: {panels_with_positions} panels have positions in backup")

        # Show a few sample positions
        print("\nSample positions:")
        for i, panel in enumerate(panels_yaml_from_zip["panels"][:5]):
            pos = panel.get("position")
            if pos:
                print(f"  {panel['serial']}: x={pos['x_percent']}, y={pos['y_percent']}")

    print(f"\nBackup created successfully: {output_path}")


if __name__ == "__main__":
    main()
