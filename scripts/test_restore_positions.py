#!/usr/bin/env python3
"""Test restore flow preserves panel positions and overlay_size."""
import json
import requests

BACKUP_FILE = "/Users/ian/code/local-sync/solar_tigo_viewer/dashboard/backend/tests/fixtures/test-backup-69-panels.zip"
BASE_URL = "http://localhost:5174"


def main():
    print("=== Step 1: Upload backup and get restore data ===")
    with open(BACKUP_FILE, "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/api/backup/restore",
            files={"file": ("backup.zip", f, "application/zip")}
        )

    if resp.status_code != 200:
        print(f"ERROR: Restore failed with {resp.status_code}: {resp.text}")
        return False

    restore_data = resp.json()
    panels = restore_data.get("panels", [])
    layout = restore_data.get("layout", {})
    image_token = restore_data.get("image_token")

    with_pos = sum(1 for p in panels if p.get("position"))
    print(f"Panels with positions in restore response: {with_pos}/{len(panels)}")

    backup_overlay_size = layout.get("overlay_size") if layout else None
    print(f"Overlay size in backup: {backup_overlay_size}")

    if panels and panels[0].get("position"):
        p = panels[0]
        print(f"First panel: {p['serial']} position: {p['position']}")

    print("\n=== Step 2: Simulate frontend save (with positions) ===")
    # Build payload like the fixed frontend would
    backend_panels = []
    for p in panels:
        backend_panels.append({
            "serial": p["serial"],
            "cca": p["cca"],
            "string": p["string"],
            "tigo_label": p["tigo_label"],
            "display_label": p["display_label"],
            "position": p.get("position"),  # Include position!
        })

    save_payload = {"panels": backend_panels}
    resp = requests.put(f"{BASE_URL}/api/config/panels", json=save_payload)

    if resp.status_code != 200:
        print(f"ERROR: Save failed with {resp.status_code}: {resp.text}")
        return False

    print(f"Save response: {resp.json()}")

    # Commit the image with overlay_size if we have a token
    if image_token:
        print("\n=== Step 2b: Commit image with overlay_size ===")
        resp = requests.post(
            f"{BASE_URL}/api/backup/restore/image/{image_token}",
            json={"overlay_size": backup_overlay_size}
        )
        if resp.status_code == 200:
            print(f"Image commit response: {resp.json()}")
        else:
            print(f"Image commit failed (may be expected): {resp.status_code}")

    print("\n=== Step 3: Verify saved panels have positions ===")
    resp = requests.get(f"{BASE_URL}/api/config/panels")
    saved_data = resp.json()
    saved_panels = saved_data.get("panels", [])
    saved_with_pos = sum(1 for p in saved_panels if p.get("position"))
    print(f"Panels with positions after save: {saved_with_pos}/{len(saved_panels)}")

    if saved_panels and saved_panels[0].get("position"):
        p = saved_panels[0]
        print(f"First panel: {p['serial']} position: {p['position']}")

    if saved_with_pos != len(saved_panels):
        print(f"\nERROR: Only {saved_with_pos}/{len(saved_panels)} panels have positions!")
        return False

    print("\n=== Step 4: Verify overlay_size was preserved ===")
    resp = requests.get(f"{BASE_URL}/api/layout")
    layout_data = resp.json()
    restored_overlay_size = layout_data.get("overlay_size")
    print(f"Overlay size after restore: {restored_overlay_size}")

    if backup_overlay_size is not None and restored_overlay_size != backup_overlay_size:
        print(f"\nERROR: Overlay size mismatch! Expected {backup_overlay_size}, got {restored_overlay_size}")
        return False

    print("\n=== SUCCESS: All panels have positions and overlay_size preserved after restore! ===")
    return True


if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)
