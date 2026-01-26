"""Backup and restore API endpoints.

REST endpoints for backup/restore functionality:
- POST /api/backup/export - Download configuration backup as ZIP
- POST /api/backup/restore - Upload and validate backup file
- POST /api/backup/restore/image/{token} - Commit temp image during restore
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from .backup_service import (
    BackupService,
    BackupServiceError,
    get_backup_service,
)


from pydantic import Field


class CommitImageRequest(BaseModel):
    """Request body for POST /api/backup/restore/image/{token}."""
    overlay_size: Optional[int] = Field(default=None, ge=20, le=200)
    image_scale: Optional[int] = Field(default=None, ge=25, le=200)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backup", tags=["backup"])

# Maximum upload size: 20MB
MAX_UPLOAD_SIZE = 20 * 1024 * 1024


def error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: list[str] | None = None
) -> HTTPException:
    """Create an HTTPException with standard error format."""
    return HTTPException(
        status_code=status_code,
        detail={
            "success": False,
            "error": error_code,
            "message": message,
            "details": details or []
        }
    )


@router.post("/export")
async def export_backup():
    """Export configuration as a downloadable ZIP backup.

    Creates a ZIP containing:
    - manifest.json with backup metadata
    - system.yaml (if exists)
    - panels.yaml (if exists)
    - layout.yaml (if exists)
    - assets/layout.png (if exists)
    """
    service = get_backup_service()

    try:
        zip_content = service.create_backup()
    except BackupServiceError as e:
        logger.error(f"Backup creation failed: {e}")
        raise error_response(500, e.error_code, e.message)
    except Exception as e:
        logger.error(f"Unexpected error during backup: {e}")
        raise error_response(500, "backup_error", str(e))

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    filename = f"solar-dashboard-backup-{timestamp}.zip"

    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\""
        }
    )


@router.post("/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Upload and validate a backup file.

    Returns the parsed configuration for user preview before applying.
    If the backup contains an image, it is stored temporarily and a
    token is returned for committing it later.

    Request: multipart/form-data with 'file' field
    Response: JSON with parsed config and optional image_token
    """
    # Validate file type
    if file.content_type not in ["application/zip", "application/x-zip-compressed"]:
        # Also accept octet-stream since some browsers use it for .zip
        if file.content_type != "application/octet-stream":
            raise error_response(
                400,
                "invalid_file_type",
                f"Expected ZIP file, got {file.content_type}"
            )

    # Read file with size limit
    try:
        contents = await file.read()
    except Exception as e:
        raise error_response(400, "read_error", f"Failed to read file: {e}")

    if len(contents) > MAX_UPLOAD_SIZE:
        raise error_response(
            400,
            "file_too_large",
            f"File exceeds maximum size of {MAX_UPLOAD_SIZE // (1024*1024)}MB"
        )

    service = get_backup_service()

    # Validate backup
    try:
        result = service.validate_backup(contents)
    except BackupServiceError as e:
        raise error_response(400, e.error_code, e.message)
    except Exception as e:
        logger.error(f"Unexpected error during validation: {e}")
        raise error_response(500, "validation_error", str(e))

    # Store temp image if present (atomic: fail entire restore if image can't be stored)
    image_token = None
    if result["has_image"] and result["image_data"]:
        try:
            image_token = service.store_temp_image(result["image_data"])
        except BackupServiceError as e:
            logger.error(f"Failed to store temp image: {e}")
            raise error_response(500, e.error_code, f"Failed to process backup image: {e.message}")

    # Build response
    response = {
        "success": True,
        "manifest": result["manifest"],
        "system": result["system"].model_dump() if result["system"] else None,
        "panels": [p.model_dump() for p in result["panels"].panels] if result["panels"] else [],
        "layout": result["layout"].model_dump() if result["layout"] else None,
        "has_image": result["has_image"],
    }

    if image_token:
        response["image_token"] = image_token

    return response


@router.post("/restore/image/{token}")
async def commit_restore_image(token: str, body: CommitImageRequest | None = None):
    """Commit a temporarily stored image to the final location.

    Called after user confirms restore in the wizard.

    Args:
        token: Token from POST /api/backup/restore response
        body: Optional request body with overlay_size and image_scale from backup

    Returns:
        Image metadata (width, height, hash)
    """
    service = get_backup_service()

    overlay_size = body.overlay_size if body else None
    image_scale = body.image_scale if body else None

    try:
        result = service.commit_temp_image(
            token,
            overlay_size=overlay_size,
            image_scale=image_scale,
        )
    except BackupServiceError as e:
        status_code = 404 if e.error_code == "not_found" else 500
        raise error_response(status_code, e.error_code, e.message)
    except Exception as e:
        logger.error(f"Unexpected error during image commit: {e}")
        raise error_response(500, "commit_error", str(e))

    return {
        "success": True,
        "width": result["width"],
        "height": result["height"],
        "hash": result["hash"],
    }
