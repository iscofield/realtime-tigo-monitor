"""Backup and restore service for configuration files.

Provides functionality to:
- Create ZIP backups of configuration files with manifest
- Validate backup files with security checks (ZIP bomb, path traversal, symlinks)
- Manage temporary image storage during restore workflow
"""

import hashlib
import io
import json
import logging
import os
import shutil
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from pydantic import ValidationError

from . import VERSION
from .config_models import SystemConfig, PanelsConfig, LayoutConfig
from .config_service import ConfigService, ConfigServiceError, get_config_service

logger = logging.getLogger(__name__)

# Backup format constants
BACKUP_VERSION = 1
MAX_TOTAL_SIZE = 100 * 1024 * 1024  # 100MB total
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB per file
TEMP_IMAGE_EXPIRY_SECONDS = 3600  # 1 hour

# Image magic bytes for validation
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
JPEG_MAGIC = b'\xff\xd8\xff'


class BackupServiceError(Exception):
    """Base exception for backup service errors."""
    def __init__(self, message: str, error_code: str = "backup_error"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class BackupService:
    """Service for creating and restoring configuration backups."""

    def __init__(
        self,
        config_service: Optional[ConfigService] = None,
        config_dir: Path = Path("config"),
        assets_dir: Path = Path("assets"),
        data_dir: Path = Path("data"),
    ):
        self.config_service = config_service or get_config_service()
        self.config_dir = config_dir
        self.assets_dir = assets_dir
        self.data_dir = data_dir
        self.temp_dir = data_dir / "restore-temp"

    def create_backup(self) -> bytes:
        """Create a ZIP backup of all configuration files.

        Returns:
            bytes: ZIP file contents

        Raises:
            BackupServiceError: If backup creation fails
        """
        # Read configuration files
        system_yaml_path = self.config_dir / "system.yaml"
        panels_yaml_path = self.config_dir / "panels.yaml"
        layout_yaml_path = self.config_dir / "layout.yaml"
        layout_image_path = self.assets_dir / "layout.png"

        # Load and validate configs
        system_config = None
        panels_config = None
        layout_config = None

        try:
            if system_yaml_path.exists():
                system_config = self.config_service.load_system_config()
        except ConfigServiceError as e:
            logger.warning(f"Could not load system.yaml: {e}")

        try:
            panels_config = self.config_service.load_panels_config()
        except ConfigServiceError as e:
            logger.warning(f"Could not load panels.yaml: {e}")
            panels_config = PanelsConfig(panels=[], translations={})

        try:
            layout_config = self.config_service.load_layout_config()
        except ConfigServiceError as e:
            logger.warning(f"Could not load layout.yaml: {e}")
            layout_config = LayoutConfig()

        # Check for layout image
        has_layout_image = layout_image_path.exists()
        layout_image_hash = None
        layout_image_data = None

        if has_layout_image:
            try:
                layout_image_data = layout_image_path.read_bytes()
                layout_image_hash = f"sha256:{hashlib.sha256(layout_image_data).hexdigest()}"
            except OSError as e:
                logger.warning(f"Could not read layout image: {e}")
                has_layout_image = False

        # Check for sensitive data (MQTT credentials)
        contains_sensitive_data = False
        if system_config and system_config.mqtt:
            contains_sensitive_data = bool(
                system_config.mqtt.username or system_config.mqtt.password
            )

        # Build manifest
        manifest = {
            "backup_version": BACKUP_VERSION,
            "app_version": VERSION,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "panel_count": len(panels_config.panels) if panels_config else 0,
            "has_layout_image": has_layout_image,
            "contains_sensitive_data": contains_sensitive_data,
        }

        if layout_image_hash:
            manifest["layout_image_hash"] = layout_image_hash

        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add manifest
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))

            # Add config files
            if system_yaml_path.exists():
                zf.write(system_yaml_path, "system.yaml")

            if panels_yaml_path.exists():
                zf.write(panels_yaml_path, "panels.yaml")

            if layout_yaml_path.exists():
                zf.write(layout_yaml_path, "layout.yaml")

            # Add layout image if present
            if has_layout_image and layout_image_data:
                zf.writestr("assets/layout.png", layout_image_data)

        return zip_buffer.getvalue()

    def validate_backup(self, zip_data: bytes) -> dict:
        """Validate a backup ZIP file and return parsed configuration.

        Performs security checks:
        - ZIP bomb protection (total and per-file size limits)
        - Path traversal prevention
        - Symlink detection
        - Image magic byte validation

        Args:
            zip_data: Raw ZIP file bytes

        Returns:
            dict with keys:
                - manifest: Parsed manifest.json
                - system: SystemConfig or None
                - panels: PanelsConfig or None
                - layout: LayoutConfig or None
                - has_image: bool
                - image_data: bytes or None

        Raises:
            BackupServiceError: If validation fails
        """
        try:
            zip_buffer = io.BytesIO(zip_data)
            with zipfile.ZipFile(zip_buffer, 'r') as zf:
                # Security check 1: ZIP bomb protection
                total_size = sum(info.file_size for info in zf.infolist())
                if total_size > MAX_TOTAL_SIZE:
                    raise BackupServiceError(
                        f"Backup too large: {total_size} bytes exceeds {MAX_TOTAL_SIZE} limit",
                        error_code="zip_bomb_detected"
                    )

                for info in zf.infolist():
                    # Per-file size check
                    if info.file_size > MAX_FILE_SIZE:
                        raise BackupServiceError(
                            f"File '{info.filename}' too large: {info.file_size} bytes",
                            error_code="file_too_large"
                        )

                    # Security check 2: Path traversal
                    if ".." in info.filename or info.filename.startswith("/"):
                        raise BackupServiceError(
                            f"Invalid path in backup: {info.filename}",
                            error_code="path_traversal_detected"
                        )

                    # Security check 3: Symlink detection
                    # External attributes use Unix format when high bits are set
                    external_attr = info.external_attr >> 16
                    if external_attr != 0:
                        file_type = external_attr & 0o170000
                        if file_type == 0o120000:  # S_IFLNK - symlink
                            raise BackupServiceError(
                                f"Symlink detected in backup: {info.filename}",
                                error_code="symlink_detected"
                            )

                # Validate manifest exists
                if "manifest.json" not in zf.namelist():
                    raise BackupServiceError(
                        "Missing manifest.json in backup",
                        error_code="invalid_backup"
                    )

                # Parse and validate manifest
                try:
                    manifest_data = zf.read("manifest.json")
                    manifest = json.loads(manifest_data)
                except json.JSONDecodeError as e:
                    raise BackupServiceError(
                        f"Invalid manifest.json: {e}",
                        error_code="invalid_manifest"
                    )

                # Validate backup version
                backup_version = manifest.get("backup_version")
                if backup_version is None or backup_version > BACKUP_VERSION:
                    raise BackupServiceError(
                        f"Unsupported backup version: {backup_version}",
                        error_code="unsupported_version"
                    )

                # Parse config files
                system_config = None
                panels_config = None
                layout_config = None

                if "system.yaml" in zf.namelist():
                    try:
                        system_data = yaml.safe_load(zf.read("system.yaml"))
                        system_config = SystemConfig(**system_data)
                    except (yaml.YAMLError, ValidationError) as e:
                        raise BackupServiceError(
                            f"Invalid system.yaml: {e}",
                            error_code="invalid_system_config"
                        )

                if "panels.yaml" in zf.namelist():
                    try:
                        panels_data = yaml.safe_load(zf.read("panels.yaml"))
                        if panels_data:
                            panels_config = PanelsConfig(**panels_data)
                        else:
                            panels_config = PanelsConfig(panels=[], translations={})
                    except (yaml.YAMLError, ValidationError) as e:
                        raise BackupServiceError(
                            f"Invalid panels.yaml: {e}",
                            error_code="invalid_panels_config"
                        )

                if "layout.yaml" in zf.namelist():
                    try:
                        layout_data = yaml.safe_load(zf.read("layout.yaml"))
                        if layout_data:
                            layout_config = LayoutConfig(**layout_data)
                        else:
                            layout_config = LayoutConfig()
                    except (yaml.YAMLError, ValidationError) as e:
                        raise BackupServiceError(
                            f"Invalid layout.yaml: {e}",
                            error_code="invalid_layout_config"
                        )

                # Check for and validate layout image
                has_image = False
                image_data = None

                if "assets/layout.png" in zf.namelist():
                    image_data = zf.read("assets/layout.png")

                    # Validate image magic bytes
                    if not (image_data.startswith(PNG_MAGIC) or
                            image_data.startswith(JPEG_MAGIC)):
                        raise BackupServiceError(
                            "Invalid image format: not a valid PNG or JPEG",
                            error_code="invalid_image"
                        )

                    has_image = True

                    # Verify hash if present in manifest
                    if "layout_image_hash" in manifest:
                        expected_hash = manifest["layout_image_hash"]
                        actual_hash = f"sha256:{hashlib.sha256(image_data).hexdigest()}"
                        if expected_hash != actual_hash:
                            logger.warning(
                                f"Image hash mismatch: expected {expected_hash}, got {actual_hash}"
                            )
                            # Don't fail, just log - hash might have been corrupted

                return {
                    "manifest": manifest,
                    "system": system_config,
                    "panels": panels_config,
                    "layout": layout_config,
                    "has_image": has_image,
                    "image_data": image_data,
                }

        except zipfile.BadZipFile:
            raise BackupServiceError(
                "Invalid ZIP file",
                error_code="invalid_zip"
            )

    def store_temp_image(self, image_bytes: bytes) -> str:
        """Store image temporarily during restore workflow.

        Args:
            image_bytes: Raw image data

        Returns:
            Token (UUID4) to retrieve/commit the image

        Raises:
            BackupServiceError: If storage fails
        """
        # Ensure temp directory exists
        try:
            self.temp_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise BackupServiceError(
                f"Cannot create temp directory: {e}",
                error_code="storage_error"
            )

        # Generate unique token
        token = str(uuid.uuid4())
        image_path = self.temp_dir / f"{token}.png"
        timestamp_path = self.temp_dir / f"{token}.timestamp"

        try:
            # Write image atomically
            fd, temp_path = tempfile.mkstemp(
                dir=self.temp_dir,
                prefix=".img.",
                suffix=".tmp"
            )
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(image_bytes)
            except Exception:
                os.close(fd)
                raise

            os.rename(temp_path, image_path)

            # Write timestamp file
            timestamp_path.write_text(
                datetime.now(timezone.utc).isoformat()
            )

            logger.info(f"Stored temp image with token: {token}")
            return token

        except OSError as e:
            # Clean up on failure
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

            raise BackupServiceError(
                f"Failed to store temp image: {e}",
                error_code="storage_error"
            )

    def commit_temp_image(self, token: str) -> dict:
        """Commit a temporary image to the final location.

        Args:
            token: Token from store_temp_image

        Returns:
            dict with keys: width, height, hash

        Raises:
            BackupServiceError: If commit fails
        """
        from PIL import Image

        image_path = self.temp_dir / f"{token}.png"
        timestamp_path = self.temp_dir / f"{token}.timestamp"

        if not image_path.exists():
            raise BackupServiceError(
                f"Temp image not found: {token}",
                error_code="not_found"
            )

        try:
            # Read image and get dimensions
            image_data = image_path.read_bytes()

            img = Image.open(io.BytesIO(image_data))
            width, height = img.size

            # Compute hash
            image_hash = f"sha256:{hashlib.sha256(image_data).hexdigest()}"

            # Ensure assets directory exists
            self.assets_dir.mkdir(parents=True, exist_ok=True)

            # Move to final location (copy then delete for cross-filesystem support)
            final_path = self.assets_dir / "layout.png"

            # Backup existing image if present
            if final_path.exists():
                backup_path = self.assets_dir / "layout.backup.png"
                shutil.copy2(final_path, backup_path)

            shutil.copy2(image_path, final_path)

            # Update layout.yaml
            try:
                layout_config = self.config_service.load_layout_config()
            except ConfigServiceError:
                layout_config = LayoutConfig()

            layout_config.image_path = "/static/layout.png"
            layout_config.image_width = width
            layout_config.image_height = height
            layout_config.image_hash = image_hash
            layout_config.aspect_ratio = width / height if height > 0 else None
            layout_config.last_modified = datetime.now(timezone.utc).isoformat()

            self.config_service.save_layout_config(layout_config)

            # Clean up temp files
            try:
                image_path.unlink()
                if timestamp_path.exists():
                    timestamp_path.unlink()
            except OSError:
                pass

            logger.info(f"Committed temp image: {token} -> {final_path}")

            return {
                "width": width,
                "height": height,
                "hash": image_hash,
            }

        except Exception as e:
            if isinstance(e, BackupServiceError):
                raise
            raise BackupServiceError(
                f"Failed to commit temp image: {e}",
                error_code="commit_error"
            )

    def cleanup_expired_images(self) -> int:
        """Delete temporary images older than 1 hour.

        Returns:
            Number of files cleaned up
        """
        if not self.temp_dir.exists():
            return 0

        cleaned = 0
        now = datetime.now(timezone.utc)

        try:
            for timestamp_file in self.temp_dir.glob("*.timestamp"):
                try:
                    timestamp_str = timestamp_file.read_text().strip()
                    created_at = datetime.fromisoformat(timestamp_str)

                    # Make timezone-aware if needed
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)

                    age_seconds = (now - created_at).total_seconds()

                    if age_seconds > TEMP_IMAGE_EXPIRY_SECONDS:
                        # Get corresponding image file
                        token = timestamp_file.stem
                        image_file = self.temp_dir / f"{token}.png"

                        # Delete both files
                        if image_file.exists():
                            image_file.unlink()
                            cleaned += 1

                        timestamp_file.unlink()
                        logger.debug(f"Cleaned up expired temp image: {token}")

                except (ValueError, OSError) as e:
                    logger.warning(f"Error processing {timestamp_file}: {e}")

        except OSError as e:
            logger.error(f"Error during cleanup: {e}")

        if cleaned > 0:
            logger.info(f"Cleaned up {cleaned} expired temp images")

        return cleaned


# Singleton instance
_backup_service: Optional[BackupService] = None


def get_backup_service() -> BackupService:
    """Get or create the singleton BackupService instance."""
    global _backup_service
    if _backup_service is None:
        _backup_service = BackupService()
    return _backup_service
