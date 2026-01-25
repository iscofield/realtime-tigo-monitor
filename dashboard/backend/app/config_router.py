"""Configuration API endpoints (Phase 1 spec FR-5).

REST endpoints for configuration management:
- GET/PUT /api/config/system
- GET/PUT /api/config/panels
- GET /api/config/status
- POST /api/config/generate-tigo-mqtt
- POST /api/config/mqtt/test
- POST /api/config/validate
"""

import asyncio
import logging
from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
import io

from .config_models import (
    SystemConfig,
    PanelsConfig,
    Panel,
    ConfigStatusResponse,
    ErrorResponse,
    SuccessResponse,
    MQTTTestRequest,
    MQTTTestResponse,
    ValidationRequest,
    ValidationResponse,
    ValidationResultItem,
    ValidationSummary,
    GenerateConfigRequest,
    DiscoveredPanel,
    match_discovered_panel,
)
from .config_service import (
    ConfigService,
    ConfigServiceError,
    get_config_service,
)
from .tigo_mqtt_generator import generate_tigo_mqtt_zip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["configuration"])


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


@router.get("/status", response_model=ConfigStatusResponse)
async def get_config_status():
    """Check configuration status (FR-3.1, FR-5.1).

    Returns whether configuration exists, has panels, and if legacy config
    is available for migration.
    """
    service = get_config_service()
    return service.get_config_status()


@router.get("/system", response_model=SystemConfig)
async def get_system_config():
    """Get current system configuration (FR-5.1)."""
    service = get_config_service()
    try:
        return service.load_system_config()
    except ConfigServiceError as e:
        raise error_response(400 if e.error_code == "no_config" else 500, e.error_code, e.message)


@router.put("/system", response_model=SuccessResponse)
async def update_system_config(config: SystemConfig):
    """Update system configuration (FR-5.1)."""
    service = get_config_service()
    try:
        service.save_system_config(config)
        return SuccessResponse(message="System configuration saved")
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)


@router.get("/panels")
async def get_panels_config():
    """Get panel configuration (FR-5.1)."""
    service = get_config_service()
    try:
        config = service.load_panels_config()
        return {"panels": [p.model_dump() for p in config.panels]}
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)


@router.put("/panels", response_model=SuccessResponse)
async def update_panels_config(data: dict):
    """Update panel configuration (FR-5.1)."""
    service = get_config_service()
    try:
        # Parse panels from request
        panels = [Panel(**p) for p in data.get("panels", [])]
        translations = data.get("translations", {})
        config = PanelsConfig(panels=panels, translations=translations)
        service.save_panels_config(config)
        return SuccessResponse(message="Panels configuration saved")
    except ValidationError as e:
        errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
        raise error_response(400, "validation_error", "Invalid panel configuration", errors)
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)


@router.post("/generate-tigo-mqtt")
async def generate_tigo_mqtt_config(request: GenerateConfigRequest = None):
    """Generate tigo-mqtt deployment files as ZIP (FR-2.4, FR-5.1).

    Can be called with:
    - Full config in request body (during wizard before config is saved)
    - Empty body to use saved config
    """
    service = get_config_service()

    # Determine config source
    if request and request.mqtt and request.ccas:
        # Use provided config
        try:
            system_config = SystemConfig(
                version=1,
                mqtt=request.mqtt,
                ccas=request.ccas
            )
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise error_response(400, "validation_error", "Invalid configuration", errors)
        panels = request.panels or []
    else:
        # Use saved config
        try:
            system_config = service.load_system_config()
        except ConfigServiceError as e:
            if e.error_code == "no_config":
                raise error_response(
                    400,
                    "no_config",
                    "No saved configuration found. Provide config in request body."
                )
            raise error_response(500, e.error_code, e.message)

        try:
            panels_config = service.load_panels_config()
            panels = panels_config.panels
        except ConfigServiceError:
            panels = []

    # Generate ZIP
    try:
        zip_content = generate_tigo_mqtt_zip(system_config, panels)
    except Exception as e:
        logger.error(f"Failed to generate tigo-mqtt config: {e}")
        raise error_response(500, "generation_error", f"Failed to generate config: {e}")

    # Return as downloadable ZIP
    return StreamingResponse(
        io.BytesIO(zip_content),
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=tigo-mqtt-config.zip"
        }
    )


@router.post("/mqtt/test", response_model=MQTTTestResponse)
async def test_mqtt_connection(request: MQTTTestRequest):
    """Test MQTT broker connectivity (FR-3.2, FR-5.1).

    Attempts to connect to the MQTT broker with provided credentials.
    """
    try:
        import aiomqtt

        # Attempt connection with short timeout
        try:
            async with asyncio.timeout(10):
                async with aiomqtt.Client(
                    hostname=request.server,
                    port=request.port,
                    username=request.username,
                    password=request.password,
                ) as client:
                    # Connection successful
                    return MQTTTestResponse(
                        success=True,
                        message="Connected successfully"
                    )
        except asyncio.TimeoutError:
            return MQTTTestResponse(
                success=False,
                error="timeout",
                message="Connection timed out - check server address and port"
            )

    except Exception as e:
        error_str = str(e).lower()

        # Categorize error
        if "auth" in error_str or "not authorized" in error_str or "bad user" in error_str:
            return MQTTTestResponse(
                success=False,
                error="auth_failed",
                message="Authentication failed: bad username or password"
            )
        elif "refused" in error_str or "connection refused" in error_str:
            return MQTTTestResponse(
                success=False,
                error="connection_refused",
                message="Connection refused - check if broker is running"
            )
        elif "getaddrinfo" in error_str or "name or service not known" in error_str:
            return MQTTTestResponse(
                success=False,
                error="dns_error",
                message="DNS lookup failed - check server address"
            )
        else:
            logger.error(f"MQTT test failed: {e}")
            return MQTTTestResponse(
                success=False,
                error="connection_error",
                message=f"Connection failed: {e}"
            )


@router.post("/validate", response_model=ValidationResponse)
async def validate_panels(request: ValidationRequest):
    """Validate discovered panels against topology (FR-5.1, FR-6.3).

    Matches discovered panels to expected configuration and identifies:
    - Matched panels (by serial or topology)
    - Unmatched panels (need translation)
    - Possible wiring issues
    """
    # Parse topology
    try:
        topology = SystemConfig(**request.topology)
    except ValidationError as e:
        errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
        raise error_response(400, "validation_error", "Invalid topology", errors)

    # Load known panels (if any exist)
    service = get_config_service()
    try:
        panels_config = service.load_panels_config()
        known_panels = panels_config.panels
    except ConfigServiceError:
        known_panels = []

    # Match each discovered panel
    results: list[ValidationResultItem] = []
    summary = {
        "total": len(request.discovered_panels),
        "matched": 0,
        "unmatched": 0,
        "possible_wiring_issues": 0
    }

    for dp_dict in request.discovered_panels:
        # Create DiscoveredPanel from dict
        discovered = DiscoveredPanel(
            serial=dp_dict.get("serial", ""),
            cca=dp_dict.get("cca", ""),
            tigo_label=dp_dict.get("tigo_label", ""),
            watts=dp_dict.get("watts", 0.0),
            voltage=dp_dict.get("voltage", 0.0),
            discovered_at=dp_dict.get("discovered_at", ""),
            last_seen_at=dp_dict.get("last_seen_at", "")
        )

        # Match against topology
        match_result = match_discovered_panel(discovered, topology, known_panels)

        # Convert to response item
        result_item = ValidationResultItem(
            status=match_result.status,
            panel=match_result.panel,
            suggested_label=match_result.suggested_label,
            confidence=match_result.confidence,
            tigo_label=match_result.tigo_label,
            needs_translation=match_result.needs_translation,
            error=match_result.error,
            reported_cca=match_result.reported_cca,
            expected_cca=match_result.expected_cca,
            warning=match_result.warning
        )
        results.append(result_item)

        # Update summary
        if match_result.status == "matched":
            summary["matched"] += 1
        elif match_result.status == "possible_wiring_issue":
            summary["possible_wiring_issues"] += 1
        else:
            summary["unmatched"] += 1

    return ValidationResponse(
        success=True,
        results=results,
        summary=ValidationSummary(**summary)
    )


@router.post("/migrate")
async def migrate_from_legacy(mqtt_config: dict):
    """Migrate from legacy JSON to YAML configuration (FR-1.5).

    Requires MQTT config since it's not stored in legacy JSON.
    """
    service = get_config_service()
    try:
        system_config, panels_config = service.migrate_from_legacy(mqtt_config)
        return {
            "success": True,
            "message": "Migration completed successfully",
            "system": system_config.model_dump(),
            "panels_count": len(panels_config.panels)
        }
    except ConfigServiceError as e:
        raise error_response(400 if e.error_code == "no_config" else 500, e.error_code, e.message)


@router.delete("/reset")
async def reset_config(delete_image: bool = True):
    """Reset all configuration to factory defaults.

    Deletes all YAML config files and optionally the layout image.
    Backups are created before deletion.

    Query params:
        delete_image: Whether to also delete the layout image (default: true)

    Returns:
        Information about what was deleted
    """
    service = get_config_service()
    try:
        deleted = service.reset_config(delete_image=delete_image)
        return {
            "success": True,
            "message": "Configuration reset to factory defaults",
            "deleted": deleted
        }
    except ConfigServiceError as e:
        raise error_response(500, e.error_code, e.message)
