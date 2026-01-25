"""Unit tests for backup_service.py.

Tests cover:
- create_backup() - ZIP creation with manifest and config files
- validate_backup() - Security checks and config parsing
- store_temp_image() - Temporary image storage
- commit_temp_image() - Committing temp images to final location
- cleanup_expired_images() - Cleanup of old temp images
"""

import io
import json
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest
import yaml

from app.backup_service import (
    BackupService,
    BackupServiceError,
    BACKUP_VERSION,
    MAX_TOTAL_SIZE,
    MAX_FILE_SIZE,
    PNG_MAGIC,
    JPEG_MAGIC,
    TEMP_IMAGE_EXPIRY_SECONDS,
)
from app.config_models import SystemConfig, PanelsConfig, LayoutConfig, MQTTConfig


@pytest.fixture
def temp_dirs():
    """Create temporary directories for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        config_dir = tmpdir / "config"
        assets_dir = tmpdir / "assets"
        data_dir = tmpdir / "data"

        config_dir.mkdir()
        assets_dir.mkdir()
        data_dir.mkdir()

        yield {
            "config_dir": config_dir,
            "assets_dir": assets_dir,
            "data_dir": data_dir,
        }


@pytest.fixture
def mock_config_service():
    """Create a mock config service."""
    service = Mock()
    service.load_system_config.return_value = None
    service.load_panels_config.return_value = PanelsConfig(panels=[], translations={})
    service.load_layout_config.return_value = LayoutConfig()
    return service


@pytest.fixture
def backup_service(temp_dirs, mock_config_service):
    """Create a BackupService with test directories."""
    return BackupService(
        config_service=mock_config_service,
        config_dir=temp_dirs["config_dir"],
        assets_dir=temp_dirs["assets_dir"],
        data_dir=temp_dirs["data_dir"],
    )


@pytest.fixture
def sample_system_config():
    """Sample system configuration."""
    return {
        "mqtt": {
            "server": "192.168.1.100",
            "port": 1883,
            "username": "user",
            "password": "pass",
        },
        "ccas": [
            {
                "name": "primary",
                "serial_device": "/dev/ttyACM0",
                "strings": [{"name": "A", "panel_count": 10}],
            }
        ],
    }


@pytest.fixture
def sample_panels_config():
    """Sample panels configuration."""
    return {
        "version": 1,
        "panels": [
            {
                "serial": "TEST-123",
                "cca": "primary",
                "string": "A",
                "tigo_label": "A1",
                "display_label": "A1",
            },
        ],
        "translations": {},
    }


@pytest.fixture
def valid_png_data():
    """Minimal valid PNG data (1x1 transparent pixel)."""
    # This is a minimal valid PNG file
    return (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
        b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    )


@pytest.fixture
def valid_jpeg_data():
    """Minimal valid JPEG data."""
    # Minimal valid JPEG (1x1 pixel)
    return (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08'
        b'\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e'
        b'\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9televsn;televsn'
        b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00'
        b'\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00'
        b'\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xc4\x00'
        b'\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00'
        b'\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa\x07"q\x142\x81'
        b'\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n\x16\x17\x18\x19'
        b'\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz\x83\x84\x85'
        b'\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99\x9a\xa2\xa3'
        b'\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7\xb8\xb9\xba'
        b'\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5\xd6\xd7\xd8'
        b'\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1\xf2\xf3\xf4'
        b'\xf5\xf6\xf7\xf8\xf9\xfa\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb'
        b'\xd2\x8a(\x03\xff\xd9'
    )


class TestCreateBackup:
    """Tests for create_backup() method."""

    def test_create_backup_empty_config(self, backup_service, temp_dirs):
        """Test creating backup with minimal configuration."""
        zip_data = backup_service.create_backup()

        # Verify it's a valid ZIP
        assert zipfile.is_zipfile(io.BytesIO(zip_data))

        with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
            # Should have manifest
            assert "manifest.json" in zf.namelist()

            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["backup_version"] == BACKUP_VERSION
            assert "app_version" in manifest
            assert "created_at" in manifest
            assert manifest["panel_count"] == 0
            assert manifest["has_layout_image"] is False

    def test_create_backup_with_system_config(self, backup_service, temp_dirs, sample_system_config, mock_config_service):
        """Test creating backup with system configuration."""
        # Write system.yaml
        system_path = temp_dirs["config_dir"] / "system.yaml"
        with open(system_path, 'w') as f:
            yaml.dump(sample_system_config, f)

        mock_config_service.load_system_config.return_value = SystemConfig(**sample_system_config)

        zip_data = backup_service.create_backup()

        with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
            assert "system.yaml" in zf.namelist()

            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["contains_sensitive_data"] is True  # Has MQTT credentials

    def test_create_backup_with_layout_image(self, backup_service, temp_dirs, valid_png_data):
        """Test creating backup with layout image."""
        # Write layout image
        image_path = temp_dirs["assets_dir"] / "layout.png"
        image_path.write_bytes(valid_png_data)

        zip_data = backup_service.create_backup()

        with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zf:
            assert "assets/layout.png" in zf.namelist()

            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["has_layout_image"] is True
            assert "layout_image_hash" in manifest
            assert manifest["layout_image_hash"].startswith("sha256:")


class TestValidateBackup:
    """Tests for validate_backup() method."""

    def test_validate_valid_backup(self, backup_service):
        """Test validating a properly formed backup."""
        # Create a valid backup
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "panel_count": 0,
                "has_layout_image": False,
            }
            zf.writestr("manifest.json", json.dumps(manifest))

        result = backup_service.validate_backup(zip_buffer.getvalue())

        assert result["manifest"]["backup_version"] == BACKUP_VERSION
        assert result["has_image"] is False

    def test_validate_backup_with_configs(self, backup_service, sample_system_config, sample_panels_config):
        """Test validating backup with configuration files."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "panel_count": 1,
                "has_layout_image": False,
            }
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("system.yaml", yaml.dump(sample_system_config))
            zf.writestr("panels.yaml", yaml.dump(sample_panels_config))

        result = backup_service.validate_backup(zip_buffer.getvalue())

        assert result["system"] is not None
        assert result["system"].mqtt.server == "192.168.1.100"
        assert result["panels"] is not None
        assert len(result["panels"].panels) == 1

    def test_validate_backup_with_png_image(self, backup_service, valid_png_data):
        """Test validating backup with PNG image."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "panel_count": 0,
                "has_layout_image": True,
            }
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("assets/layout.png", valid_png_data)

        result = backup_service.validate_backup(zip_buffer.getvalue())

        assert result["has_image"] is True
        assert result["image_data"] == valid_png_data

    def test_validate_backup_with_jpeg_image(self, backup_service, valid_jpeg_data):
        """Test validating backup with JPEG image."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "panel_count": 0,
                "has_layout_image": True,
            }
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("assets/layout.png", valid_jpeg_data)

        result = backup_service.validate_backup(zip_buffer.getvalue())

        assert result["has_image"] is True

    def test_validate_invalid_zip(self, backup_service):
        """Test validation fails for invalid ZIP data."""
        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(b"not a zip file")

        assert exc_info.value.error_code == "invalid_zip"

    def test_validate_missing_manifest(self, backup_service):
        """Test validation fails when manifest is missing."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            zf.writestr("some_file.txt", "content")

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "invalid_backup"

    def test_validate_invalid_manifest_json(self, backup_service):
        """Test validation fails for invalid JSON in manifest."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            zf.writestr("manifest.json", "not valid json {")

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "invalid_manifest"

    def test_validate_unsupported_version(self, backup_service):
        """Test validation fails for unsupported backup version."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": 999}
            zf.writestr("manifest.json", json.dumps(manifest))

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "unsupported_version"


class TestSecurityChecks:
    """Tests for security validation in validate_backup()."""

    def test_zip_bomb_total_size(self, backup_service):
        """Test detection of ZIP bomb (total size exceeds limit)."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": BACKUP_VERSION}
            zf.writestr("manifest.json", json.dumps(manifest))
            # Add a large file that exceeds total size limit
            large_data = b"x" * (MAX_TOTAL_SIZE + 1)
            zf.writestr("large_file.bin", large_data)

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "zip_bomb_detected"

    def test_file_too_large(self, backup_service):
        """Test detection of oversized individual file."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": BACKUP_VERSION}
            zf.writestr("manifest.json", json.dumps(manifest))
            # Add file exceeding per-file limit
            large_data = b"x" * (MAX_FILE_SIZE + 1)
            zf.writestr("large_file.bin", large_data)

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "file_too_large"

    def test_path_traversal_dotdot(self, backup_service):
        """Test detection of path traversal with '..'."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": BACKUP_VERSION}
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("../etc/passwd", "malicious")

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "path_traversal_detected"

    def test_path_traversal_absolute(self, backup_service):
        """Test detection of absolute path."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": BACKUP_VERSION}
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("/etc/passwd", "malicious")

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "path_traversal_detected"

    def test_invalid_image_format(self, backup_service):
        """Test detection of invalid image (wrong magic bytes)."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {"backup_version": BACKUP_VERSION, "has_layout_image": True}
            zf.writestr("manifest.json", json.dumps(manifest))
            # Not a valid image - just text
            zf.writestr("assets/layout.png", b"This is not an image")

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.validate_backup(zip_buffer.getvalue())

        assert exc_info.value.error_code == "invalid_image"


class TestTempImageStorage:
    """Tests for store_temp_image() and commit_temp_image()."""

    def test_store_temp_image(self, backup_service, valid_png_data):
        """Test storing a temporary image."""
        token = backup_service.store_temp_image(valid_png_data)

        # Token should be a valid UUID
        assert uuid.UUID(token)

        # Image file should exist
        image_path = backup_service.temp_dir / f"{token}.png"
        assert image_path.exists()
        assert image_path.read_bytes() == valid_png_data

        # Timestamp file should exist
        timestamp_path = backup_service.temp_dir / f"{token}.timestamp"
        assert timestamp_path.exists()

    def test_commit_temp_image(self, backup_service, temp_dirs, valid_png_data, mock_config_service):
        """Test committing a temporary image."""
        # First store the image
        token = backup_service.store_temp_image(valid_png_data)

        # Mock the layout config save
        mock_config_service.save_layout_config.return_value = None

        # Use PIL mock for dimensions - patch where it's imported (inside the function)
        with patch('PIL.Image.open') as mock_open:
            mock_img = MagicMock()
            mock_img.size = (800, 600)
            mock_open.return_value = mock_img

            result = backup_service.commit_temp_image(token)

        assert result["width"] == 800
        assert result["height"] == 600
        assert result["hash"].startswith("sha256:")

        # Final image should exist
        final_path = temp_dirs["assets_dir"] / "layout.png"
        assert final_path.exists()

        # Temp files should be cleaned up
        image_path = backup_service.temp_dir / f"{token}.png"
        timestamp_path = backup_service.temp_dir / f"{token}.timestamp"
        assert not image_path.exists()
        assert not timestamp_path.exists()

    def test_commit_temp_image_not_found(self, backup_service):
        """Test committing non-existent temp image fails."""
        fake_token = str(uuid.uuid4())

        with pytest.raises(BackupServiceError) as exc_info:
            backup_service.commit_temp_image(fake_token)

        assert exc_info.value.error_code == "not_found"


class TestCleanupExpiredImages:
    """Tests for cleanup_expired_images() method."""

    def test_cleanup_expired_images(self, backup_service, valid_png_data):
        """Test cleanup removes expired images."""
        # Store an image
        token = backup_service.store_temp_image(valid_png_data)

        # Manipulate timestamp to be expired
        timestamp_path = backup_service.temp_dir / f"{token}.timestamp"
        expired_time = datetime.now(timezone.utc) - timedelta(seconds=TEMP_IMAGE_EXPIRY_SECONDS + 100)
        timestamp_path.write_text(expired_time.isoformat())

        # Run cleanup
        cleaned = backup_service.cleanup_expired_images()

        assert cleaned == 1

        # Files should be gone
        image_path = backup_service.temp_dir / f"{token}.png"
        assert not image_path.exists()
        assert not timestamp_path.exists()

    def test_cleanup_keeps_recent_images(self, backup_service, valid_png_data):
        """Test cleanup keeps non-expired images."""
        # Store an image (will have recent timestamp)
        token = backup_service.store_temp_image(valid_png_data)

        # Run cleanup
        cleaned = backup_service.cleanup_expired_images()

        assert cleaned == 0

        # Files should still exist
        image_path = backup_service.temp_dir / f"{token}.png"
        timestamp_path = backup_service.temp_dir / f"{token}.timestamp"
        assert image_path.exists()
        assert timestamp_path.exists()

    def test_cleanup_empty_directory(self, backup_service):
        """Test cleanup handles empty temp directory."""
        cleaned = backup_service.cleanup_expired_images()
        assert cleaned == 0

    def test_cleanup_missing_directory(self, backup_service, temp_dirs):
        """Test cleanup handles non-existent temp directory."""
        # Remove the temp dir
        backup_service.temp_dir = temp_dirs["data_dir"] / "nonexistent"

        cleaned = backup_service.cleanup_expired_images()
        assert cleaned == 0


class TestBackupServiceError:
    """Tests for BackupServiceError exception."""

    def test_error_with_message_and_code(self):
        """Test error has message and code."""
        error = BackupServiceError("Test message", "test_code")

        assert error.message == "Test message"
        assert error.error_code == "test_code"
        assert str(error) == "Test message"

    def test_error_default_code(self):
        """Test error has default code."""
        error = BackupServiceError("Test message")

        assert error.error_code == "backup_error"
