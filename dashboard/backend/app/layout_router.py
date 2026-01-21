"""Layout Editor API endpoints (Phase 2 spec).

REST endpoints for layout image and configuration:
- GET /api/layout - Get layout configuration
- PUT /api/layout - Update layout configuration (overlay size)
- POST /api/layout/image - Upload layout image
- GET /api/layout/image - Get layout image
- DELETE /api/layout/image - Delete layout image
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from .config_models import (
    LayoutConfig,
    LayoutConfigResponse,
    LayoutImageMetadata,
    LayoutImageUploadResponse,
    LayoutUpdateRequest,
    SuccessResponse,
)
from .config_service import (
    ConfigServiceError,
    get_config_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/layout", tags=["layout"])

# Maximum upload size: 10MB
MAX_UPLOAD_SIZE = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}


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


@router.get("", response_model=LayoutConfigResponse)
async def get_layout_config():
    """Get layout configuration (FR-1.4).

    Returns layout metadata including image info and overlay size.
    """
    service = get_config_service()
    try:
        config = service.load_layout_config()
        return LayoutConfigResponse(
            image_path=config.image_path,
            image_width=config.image_width,
            image_height=config.image_height,
            image_hash=config.image_hash,
            aspect_ratio=config.aspect_ratio,
            overlay_size=config.overlay_size,
            last_modified=config.last_modified,
        )
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)


@router.put("", response_model=SuccessResponse)
async def update_layout_config(request: LayoutUpdateRequest):
    """Update layout configuration (FR-5.2).

    Updates overlay size. Image is updated via separate endpoint.
    """
    service = get_config_service()
    try:
        # Load existing config to preserve other fields
        config = service.load_layout_config()
        config.overlay_size = request.overlay_size
        config.last_modified = datetime.now(timezone.utc).isoformat()
        service.save_layout_config(config)
        return SuccessResponse(message="Layout configuration saved")
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)


@router.post("/image", response_model=LayoutImageUploadResponse)
async def upload_layout_image(file: UploadFile = File(...)):
    """Upload a new layout image (FR-1.1).

    Accepts PNG, JPEG, or WebP images up to 10MB.
    Previous image is backed up before overwrite.
    """
    service = get_config_service()

    # Validate content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise error_response(
            400,
            "invalid_format",
            f"File must be PNG, JPEG, or WebP. Received: {file.content_type}"
        )

    # Read file content
    try:
        content = await file.read()
    except Exception as e:
        logger.error(f"Failed to read uploaded file: {e}")
        raise error_response(500, "read_error", f"Failed to read file: {e}")

    # Validate size
    if len(content) > MAX_UPLOAD_SIZE:
        raise error_response(
            400,
            "file_too_large",
            f"File exceeds 10MB limit. Size: {len(content) / (1024*1024):.1f}MB"
        )

    # Save image and get metadata
    try:
        width, height, image_hash = service.save_layout_image(content, file.content_type)
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)

    # Update layout config with new image metadata
    try:
        config = service.load_layout_config()
        config.image_path = "assets/layout.png"
        config.image_width = width
        config.image_height = height
        config.image_hash = image_hash
        config.aspect_ratio = round(width / height, 4) if height > 0 else 0
        config.last_modified = datetime.now(timezone.utc).isoformat()
        service.save_layout_config(config)
    except ConfigServiceError as e:
        logger.error(f"Failed to update layout config after image upload: {e}")
        # Image was saved but config update failed - continue anyway

    metadata = LayoutImageMetadata(
        width=width,
        height=height,
        size_bytes=len(content),
        hash=image_hash,
        aspect_ratio=round(width / height, 4) if height > 0 else 0,
    )

    return LayoutImageUploadResponse(success=True, metadata=metadata)


@router.get("/image")
async def get_layout_image():
    """Get the current layout image (FR-1.2).

    Returns the layout image with caching headers.
    """
    service = get_config_service()
    image_path = service.get_layout_image_path()

    if image_path is None:
        raise error_response(404, "not_found", "No layout image configured")

    return FileResponse(
        path=image_path,
        media_type="image/png",
        headers={"Cache-Control": "max-age=3600"},
    )


@router.delete("/image", response_model=SuccessResponse)
async def delete_layout_image():
    """Delete the current layout image (FR-1.3).

    Panel positions are preserved when image is deleted.
    """
    service = get_config_service()

    try:
        deleted = service.delete_layout_image()
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)

    if not deleted:
        raise error_response(404, "not_found", "No layout image to delete")

    # Clear image metadata from config but preserve overlay_size
    try:
        config = service.load_layout_config()
        config.image_path = None
        config.image_width = None
        config.image_height = None
        config.image_hash = None
        config.aspect_ratio = None
        config.last_modified = datetime.now(timezone.utc).isoformat()
        service.save_layout_config(config)
    except ConfigServiceError as e:
        logger.error(f"Failed to update layout config after image delete: {e}")

    return SuccessResponse(message="Layout image deleted")
