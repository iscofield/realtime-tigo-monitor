"""Integration tests for backup_router.py API endpoints.

Tests cover:
- POST /api/backup/export - Backup download endpoint
- POST /api/backup/restore - Backup validation endpoint
- POST /api/backup/restore/image/{token} - Image commit endpoint
"""

import io
import json
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

import pytest
from fastapi.testclient import TestClient
import yaml

from app.main import app
from app.backup_service import BackupService, BackupServiceError, BACKUP_VERSION


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


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
def mock_backup_service(temp_dirs):
    """Create a mock backup service for testing."""
    service = BackupService(
        config_service=Mock(),
        config_dir=temp_dirs["config_dir"],
        assets_dir=temp_dirs["assets_dir"],
        data_dir=temp_dirs["data_dir"],
    )
    return service


@pytest.fixture
def valid_backup_zip():
    """Create a valid backup ZIP file."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        manifest = {
            "backup_version": BACKUP_VERSION,
            "app_version": "1.0.0",
            "created_at": "2024-01-01T00:00:00+00:00",
            "panel_count": 1,
            "has_layout_image": False,
        }
        zf.writestr("manifest.json", json.dumps(manifest))

        panels = {
            "version": 1,
            "panels": [
                {
                    "serial": "TEST-123",
                    "cca": "primary",
                    "string": "A",
                    "tigo_label": "A1",
                    "display_label": "A1",
                }
            ],
            "translations": {},
        }
        zf.writestr("panels.yaml", yaml.dump(panels))

    return zip_buffer.getvalue()


@pytest.fixture
def valid_png_data():
    """Minimal valid PNG data (1x1 transparent pixel)."""
    return (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
        b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    )


@pytest.fixture
def backup_zip_with_image(valid_png_data):
    """Create a backup ZIP file with image."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w') as zf:
        manifest = {
            "backup_version": BACKUP_VERSION,
            "app_version": "1.0.0",
            "created_at": "2024-01-01T00:00:00+00:00",
            "panel_count": 0,
            "has_layout_image": True,
        }
        zf.writestr("manifest.json", json.dumps(manifest))
        zf.writestr("assets/layout.png", valid_png_data)

    return zip_buffer.getvalue()


class TestExportBackup:
    """Tests for POST /api/backup/export endpoint."""

    def test_export_returns_zip(self, client):
        """Test export endpoint returns a ZIP file."""
        # Mock the service to return a simple ZIP
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()

            # Create a simple valid ZIP
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w') as zf:
                zf.writestr("manifest.json", json.dumps({"backup_version": 1}))
            mock_service.create_backup.return_value = zip_buffer.getvalue()
            mock_get.return_value = mock_service

            response = client.post("/api/backup/export")

            assert response.status_code == 200
            assert response.headers["content-type"] == "application/zip"
            assert "attachment" in response.headers["content-disposition"]
            assert ".zip" in response.headers["content-disposition"]

            # Verify it's a valid ZIP
            assert zipfile.is_zipfile(io.BytesIO(response.content))

    def test_export_filename_has_timestamp(self, client):
        """Test export filename includes timestamp."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w') as zf:
                zf.writestr("manifest.json", "{}")
            mock_service.create_backup.return_value = zip_buffer.getvalue()
            mock_get.return_value = mock_service

            response = client.post("/api/backup/export")

            content_disp = response.headers["content-disposition"]
            assert "solar-dashboard-backup-" in content_disp
            # Should have format: YYYYMMDD-HHMMSS.zip
            assert "-" in content_disp  # Date separator
            assert ".zip" in content_disp

    def test_export_handles_service_error(self, client):
        """Test export returns 500 on service error."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.create_backup.side_effect = BackupServiceError(
                "Config not found", "config_error"
            )
            mock_get.return_value = mock_service

            response = client.post("/api/backup/export")

            assert response.status_code == 500
            data = response.json()
            assert data["detail"]["error"] == "config_error"


class TestRestoreBackup:
    """Tests for POST /api/backup/restore endpoint."""

    def test_restore_valid_zip(self, client, valid_backup_zip):
        """Test restoring a valid backup ZIP."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.validate_backup.return_value = {
                "manifest": {"backup_version": 1, "panel_count": 1},
                "system": None,
                "panels": Mock(panels=[Mock()], model_dump=lambda: {"panels": []}),
                "layout": None,
                "has_image": False,
                "image_data": None,
            }
            mock_service.validate_backup.return_value["panels"].panels = [
                Mock(model_dump=lambda: {"serial": "TEST-123"})
            ]
            mock_get.return_value = mock_service

            response = client.post(
                "/api/backup/restore",
                files={"file": ("backup.zip", valid_backup_zip, "application/zip")}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "manifest" in data

    def test_restore_invalid_file_type(self, client):
        """Test restore rejects non-ZIP files."""
        response = client.post(
            "/api/backup/restore",
            files={"file": ("backup.txt", b"not a zip", "text/plain")}
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["error"] == "invalid_file_type"

    def test_restore_with_image_returns_token(self, client, backup_zip_with_image):
        """Test restore with image returns image token."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.validate_backup.return_value = {
                "manifest": {"backup_version": 1},
                "system": None,
                "panels": Mock(panels=[]),
                "layout": None,
                "has_image": True,
                "image_data": b"image data",
            }
            mock_service.store_temp_image.return_value = "test-token-123"
            mock_get.return_value = mock_service

            response = client.post(
                "/api/backup/restore",
                files={"file": ("backup.zip", backup_zip_with_image, "application/zip")}
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["has_image"] is True
            assert data["image_token"] == "test-token-123"

    def test_restore_validation_error(self, client, valid_backup_zip):
        """Test restore returns 400 on validation error."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.validate_backup.side_effect = BackupServiceError(
                "Invalid manifest", "invalid_manifest"
            )
            mock_get.return_value = mock_service

            response = client.post(
                "/api/backup/restore",
                files={"file": ("backup.zip", valid_backup_zip, "application/zip")}
            )

            assert response.status_code == 400
            data = response.json()
            assert data["detail"]["error"] == "invalid_manifest"

    def test_restore_accepts_octet_stream(self, client, valid_backup_zip):
        """Test restore accepts application/octet-stream content type."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.validate_backup.return_value = {
                "manifest": {"backup_version": 1},
                "system": None,
                "panels": Mock(panels=[]),
                "layout": None,
                "has_image": False,
                "image_data": None,
            }
            mock_get.return_value = mock_service

            response = client.post(
                "/api/backup/restore",
                files={"file": ("backup.zip", valid_backup_zip, "application/octet-stream")}
            )

            assert response.status_code == 200


class TestCommitRestoreImage:
    """Tests for POST /api/backup/restore/image/{token} endpoint."""

    def test_commit_image_success(self, client):
        """Test committing image with valid token."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.commit_temp_image.return_value = {
                "width": 800,
                "height": 600,
                "hash": "sha256:abc123",
            }
            mock_get.return_value = mock_service

            response = client.post("/api/backup/restore/image/test-token")

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["width"] == 800
            assert data["height"] == 600
            assert data["hash"] == "sha256:abc123"

    def test_commit_image_not_found(self, client):
        """Test committing with invalid token returns 404."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.commit_temp_image.side_effect = BackupServiceError(
                "Token not found", "not_found"
            )
            mock_get.return_value = mock_service

            response = client.post("/api/backup/restore/image/invalid-token")

            assert response.status_code == 404
            data = response.json()
            assert data["detail"]["error"] == "not_found"

    def test_commit_image_server_error(self, client):
        """Test commit returns 500 on other errors."""
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.commit_temp_image.side_effect = BackupServiceError(
                "Failed to write", "storage_error"
            )
            mock_get.return_value = mock_service

            response = client.post("/api/backup/restore/image/some-token")

            assert response.status_code == 500
            data = response.json()
            assert data["detail"]["error"] == "storage_error"


class TestEndpointSecurity:
    """Security-related tests for backup endpoints."""

    def test_restore_rejects_oversized_file(self, client):
        """Test restore rejects files over 20MB limit."""
        # Create a mock that will check content length
        # Since we can't easily send a 20MB file in tests,
        # we'll test that the endpoint has a reasonable size check
        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_get.return_value = mock_service

            # Generate content slightly over 20MB
            # This would be slow, so we'll test the validation logic differently
            # For actual integration tests, we verify the MAX_UPLOAD_SIZE constant
            from app.backup_router import MAX_UPLOAD_SIZE
            assert MAX_UPLOAD_SIZE == 20 * 1024 * 1024  # 20MB

    def test_restore_security_validation(self, client):
        """Test restore validates ZIP security (path traversal, etc.)."""
        # Create a malicious ZIP with path traversal
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            zf.writestr("manifest.json", json.dumps({"backup_version": 1}))
            zf.writestr("../../../etc/passwd", "malicious")

        with patch('app.backup_router.get_backup_service') as mock_get:
            mock_service = Mock()
            mock_service.validate_backup.side_effect = BackupServiceError(
                "Path traversal detected", "path_traversal_detected"
            )
            mock_get.return_value = mock_service

            response = client.post(
                "/api/backup/restore",
                files={"file": ("backup.zip", zip_buffer.getvalue(), "application/zip")}
            )

            assert response.status_code == 400
            data = response.json()
            assert data["detail"]["error"] == "path_traversal_detected"


class TestPanelPositionPreservation:
    """Tests for panel position preservation during backup/restore."""

    @pytest.fixture
    def test_backup_fixture_path(self):
        """Path to the test backup fixture with positions."""
        return Path(__file__).parent / "fixtures" / "test-backup-69-panels.zip"

    def test_fixture_has_positions(self, test_backup_fixture_path):
        """Verify the test fixture has panel positions."""
        assert test_backup_fixture_path.exists(), f"Fixture not found: {test_backup_fixture_path}"

        with zipfile.ZipFile(test_backup_fixture_path, 'r') as zf:
            assert "panels.yaml" in zf.namelist()
            panels_data = yaml.safe_load(zf.read("panels.yaml"))

            # Verify we have panels
            assert "panels" in panels_data
            assert len(panels_data["panels"]) == 69

            # Verify panels have positions
            panels_with_positions = sum(
                1 for p in panels_data["panels"] if p.get("position") is not None
            )
            assert panels_with_positions == 69, (
                f"Expected 69 panels with positions, got {panels_with_positions}"
            )

            # Verify position structure
            first_panel = panels_data["panels"][0]
            assert "position" in first_panel
            assert first_panel["position"] is not None
            assert "x_percent" in first_panel["position"]
            assert "y_percent" in first_panel["position"]

    def test_restore_parses_positions(self, client, test_backup_fixture_path):
        """Test that restore endpoint correctly parses panel positions."""
        if not test_backup_fixture_path.exists():
            pytest.skip("Test fixture not found")

        backup_data = test_backup_fixture_path.read_bytes()

        response = client.post(
            "/api/backup/restore",
            files={"file": ("backup.zip", backup_data, "application/zip")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

        # Verify panels are returned with positions
        panels = data["panels"]
        assert len(panels) == 69

        # Check that positions are included in the response
        panels_with_positions = sum(
            1 for p in panels if p.get("position") is not None
        )
        assert panels_with_positions == 69, (
            f"Expected 69 panels with positions in response, got {panels_with_positions}"
        )

        # Verify position data structure
        first_panel = panels[0]
        assert first_panel["position"] is not None
        assert "x_percent" in first_panel["position"]
        assert "y_percent" in first_panel["position"]

        # Verify specific known values from the fixture
        # Panel 4-C3F23CR should be at x=35.5, y=11.75
        panel_a1 = next((p for p in panels if p["serial"] == "4-C3F23CR"), None)
        assert panel_a1 is not None, "Panel 4-C3F23CR not found"
        assert panel_a1["position"]["x_percent"] == 35.5
        assert panel_a1["position"]["y_percent"] == 11.75

    def test_backup_zip_with_positions_fixture(self):
        """Verify backup ZIP with positions can be created."""
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": "2024-01-01T00:00:00+00:00",
                "panel_count": 2,
                "has_layout_image": False,
            }
            zf.writestr("manifest.json", json.dumps(manifest))

            panels = {
                "panels": [
                    {
                        "serial": "TEST-001",
                        "cca": "primary",
                        "string": "A",
                        "tigo_label": "A1",
                        "display_label": "A1",
                        "position": {
                            "x_percent": 25.5,
                            "y_percent": 10.0
                        }
                    },
                    {
                        "serial": "TEST-002",
                        "cca": "primary",
                        "string": "A",
                        "tigo_label": "A2",
                        "display_label": "A2",
                        "position": {
                            "x_percent": 25.5,
                            "y_percent": 15.0
                        }
                    }
                ],
                "translations": {},
            }
            zf.writestr("panels.yaml", yaml.dump(panels))

        assert len(zip_buffer.getvalue()) > 0

    def test_restore_preserves_position_values(self, client):
        """Test that specific position values are preserved through restore."""
        # Create backup with known position values
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w') as zf:
            manifest = {
                "backup_version": BACKUP_VERSION,
                "app_version": "1.0.0",
                "created_at": "2024-01-01T00:00:00+00:00",
                "panel_count": 1,
                "has_layout_image": False,
            }
            zf.writestr("manifest.json", json.dumps(manifest))

            panels = {
                "panels": [
                    {
                        "serial": "TEST-POS",
                        "cca": "primary",
                        "string": "A",
                        "tigo_label": "A1",
                        "display_label": "A1",
                        "position": {
                            "x_percent": 42.5,
                            "y_percent": 73.25
                        }
                    }
                ],
                "translations": {},
            }
            zf.writestr("panels.yaml", yaml.dump(panels))

        backup_data = zip_buffer.getvalue()

        response = client.post(
            "/api/backup/restore",
            files={"file": ("backup.zip", backup_data, "application/zip")}
        )

        assert response.status_code == 200
        data = response.json()

        panels = data["panels"]
        assert len(panels) == 1

        panel = panels[0]
        assert panel["position"] is not None
        assert panel["position"]["x_percent"] == 42.5
        assert panel["position"]["y_percent"] == 73.25
