"""Configuration models for multi-user setup (Phase 1 spec).

These Pydantic models define the YAML configuration schema and related types.
All API responses use snake_case for consistency with TypeScript interfaces.
"""

import re
from dataclasses import dataclass
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# Reserved CCA names that conflict with Docker or system conventions
RESERVED_CCA_NAMES = frozenset([
    "build", "test", "temp", "default", "host", "none", "bridge"
])


def parse_tigo_label(label: str) -> tuple[str, int] | None:
    """Parse a Tigo label into string name and position number.

    String names are normalized to uppercase (Tigo reports uppercase).

    Valid inputs:
        "A1" -> ("A", 1)
        "AA12" -> ("AA", 12)
        "B10" -> ("B", 10)
        "a1" -> ("A", 1)     # lowercase normalized to uppercase
        "A01" -> ("A", 1)    # leading zeros stripped by int()

    Invalid inputs (returns None):
        "" -> None           # empty string
        "1A" -> None         # number first
        "A" -> None          # no number
        "123" -> None        # no letters
        "A-1" -> None        # hyphen
        "A 1" -> None        # space
        "A1B" -> None        # letter after number
    """
    if not label:
        return None
    match = re.match(r'^([A-Za-z]+)(\d+)$', label)
    if match:
        string_part, num_part = match.groups()
        return (string_part.upper(), int(num_part))
    return None


class StringConfig(BaseModel):
    """A string of panels connected in series."""
    name: str = Field(..., min_length=1, max_length=2)
    panel_count: int = Field(..., ge=1)

    @field_validator("name")
    @classmethod
    def validate_string_name(cls, v: str) -> str:
        """Validate and normalize string name to uppercase."""
        v = v.upper()
        if not re.match(r'^[A-Z]{1,2}$', v):
            raise ValueError(
                f"String name must be 1-2 uppercase letters, got: {v}"
            )
        return v


class CCAConfig(BaseModel):
    """Configuration for a Tigo CCA device."""
    name: str = Field(..., min_length=1, max_length=32)
    serial_device: str = Field(..., min_length=1)
    strings: list[StringConfig] = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def validate_cca_name(cls, v: str) -> str:
        """Validate CCA name for Docker compatibility."""
        v = v.lower()
        if not re.match(r'^[a-z][a-z0-9-]*$', v):
            raise ValueError(
                f"CCA name must start with letter and contain only "
                f"lowercase letters, numbers, and hyphens, got: {v}"
            )
        if v.startswith('_'):
            raise ValueError("CCA name cannot start with underscore")
        if v in RESERVED_CCA_NAMES:
            raise ValueError(f"CCA name '{v}' is reserved")
        return v

    @field_validator("serial_device")
    @classmethod
    def validate_serial_device(cls, v: str) -> str:
        """Validate serial device path format."""
        if not re.match(r'^/dev/(ttyACM|ttyUSB)\d+$', v):
            raise ValueError(
                f"Serial device must be /dev/ttyACMn or /dev/ttyUSBn, got: {v}"
            )
        return v

    @field_validator("strings")
    @classmethod
    def validate_unique_string_names(cls, v: list[StringConfig]) -> list[StringConfig]:
        """Ensure string names are unique within a CCA."""
        names = [s.name for s in v]
        if len(names) != len(set(names)):
            duplicates = [n for n in names if names.count(n) > 1]
            raise ValueError(f"Duplicate string names: {set(duplicates)}")
        return v


class MQTTConfig(BaseModel):
    """MQTT broker connection settings."""
    server: str = Field(..., min_length=1)
    port: int = Field(..., ge=1, le=65535)
    username: Optional[str] = None
    password: Optional[str] = None


class SystemConfig(BaseModel):
    """Top-level system configuration."""
    version: int = Field(default=1, ge=1)
    mqtt: MQTTConfig
    ccas: list[CCAConfig] = Field(..., min_length=1)

    @field_validator("ccas")
    @classmethod
    def validate_unique_cca_names(cls, v: list[CCAConfig]) -> list[CCAConfig]:
        """Ensure CCA names are unique."""
        names = [c.name for c in v]
        if len(names) != len(set(names)):
            duplicates = [n for n in names if names.count(n) > 1]
            raise ValueError(f"Duplicate CCA names: {set(duplicates)}")
        return v

    @field_validator("ccas")
    @classmethod
    def validate_unique_serial_devices(cls, v: list[CCAConfig]) -> list[CCAConfig]:
        """Ensure serial devices are unique."""
        devices = [c.serial_device for c in v]
        if len(devices) != len(set(devices)):
            duplicates = [d for d in devices if devices.count(d) > 1]
            raise ValueError(f"Duplicate serial devices: {set(duplicates)}")
        return v


class PanelPosition(BaseModel):
    """Panel position as percentages of layout image."""
    x_percent: float = Field(..., ge=0.0, le=100.0)
    y_percent: float = Field(..., ge=0.0, le=100.0)


class LayoutConfig(BaseModel):
    """Layout editor configuration stored in config/layout.yaml."""
    image_path: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    image_hash: Optional[str] = None
    aspect_ratio: Optional[float] = None
    overlay_size: int = Field(default=50, ge=20, le=200)
    last_modified: Optional[str] = None


class LayoutConfigResponse(BaseModel):
    """Response for GET /api/layout."""
    image_path: Optional[str] = None
    image_width: Optional[int] = None
    image_height: Optional[int] = None
    image_hash: Optional[str] = None
    aspect_ratio: Optional[float] = None
    overlay_size: int = 50
    last_modified: Optional[str] = None


class LayoutImageMetadata(BaseModel):
    """Metadata returned after image upload."""
    width: int
    height: int
    size_bytes: int
    hash: str
    aspect_ratio: float


class LayoutImageUploadResponse(BaseModel):
    """Response for POST /api/layout/image."""
    success: bool = True
    metadata: LayoutImageMetadata


class LayoutUpdateRequest(BaseModel):
    """Request body for PUT /api/layout."""
    overlay_size: int = Field(..., ge=20, le=200)


class Panel(BaseModel):
    """A configured panel with serial and label info."""
    serial: str = Field(..., min_length=1)
    cca: str = Field(..., min_length=1)
    string: str = Field(..., min_length=1, max_length=2)
    tigo_label: str = Field(..., min_length=1)
    display_label: str = Field(..., min_length=1)
    position: Optional[PanelPosition] = None

    @field_validator("string")
    @classmethod
    def normalize_string_name(cls, v: str) -> str:
        """Normalize string name to uppercase."""
        return v.upper()


class PanelsConfig(BaseModel):
    """Panel configuration file schema."""
    panels: list[Panel] = Field(default_factory=list)
    translations: dict[str, str] = Field(default_factory=dict)

    @field_validator("panels")
    @classmethod
    def validate_unique_serials(cls, v: list[Panel]) -> list[Panel]:
        """Ensure panel serial numbers are unique."""
        serials = [p.serial for p in v]
        if len(serials) != len(set(serials)):
            duplicates = [s for s in serials if serials.count(s) > 1]
            raise ValueError(f"Duplicate panel serial numbers: {set(duplicates)}")
        return v


# Discovery and validation types

@dataclass
class DiscoveredPanel:
    """A panel discovered via MQTT during the setup wizard.

    Note: This is a backend-internal type used for tracking discovered panels.
    It is NOT directly serialized to the frontend. The frontend builds its own
    DiscoveredPanel objects from PanelDiscoveredEvent data + client-side timestamps.
    """
    serial: str
    cca: str
    tigo_label: str
    watts: float
    voltage: float
    discovered_at: str  # ISO timestamp
    last_seen_at: str   # For stale panel detection


@dataclass
class MatchResult:
    """Result of matching a discovered panel to expected configuration.

    Return semantics by status:
    - 'matched' with confidence='high': panel field populated (known serial)
    - 'matched' with confidence='medium': suggested_label populated (new panel by topology)
    - 'possible_wiring_issue': tigo_label, reported_cca, expected_cca, warning populated
    - 'unmatched': tigo_label populated, may have needs_translation=True or error set
    """
    status: Literal['matched', 'unmatched', 'possible_wiring_issue']
    panel: Optional[Panel] = None
    suggested_label: Optional[str] = None
    confidence: Optional[Literal['high', 'medium', 'low']] = None
    tigo_label: Optional[str] = None
    needs_translation: bool = False
    error: Optional[str] = None
    reported_cca: Optional[str] = None
    expected_cca: Optional[str] = None
    warning: Optional[str] = None


def match_discovered_panel(
    discovered: DiscoveredPanel,
    expected_topology: SystemConfig,
    known_panels: list[Panel]
) -> MatchResult:
    """Match a discovered panel to expected configuration."""

    # First, try matching by serial number (if we've seen this panel before)
    for panel in known_panels:
        if panel.serial == discovered.serial:
            return MatchResult(
                status="matched",
                panel=panel,
                confidence="high"
            )

    # Parse the Tigo label using robust regex
    parsed = parse_tigo_label(discovered.tigo_label)
    if parsed is None:
        return MatchResult(
            status="unmatched",
            tigo_label=discovered.tigo_label,
            error="Invalid label format - expected pattern like 'A1' or 'AA12'"
        )

    string_name, position = parsed

    # Try matching to the CCA that reported this panel first
    for cca in expected_topology.ccas:
        if cca.name == discovered.cca:
            for string in cca.strings:
                if string.name == string_name:
                    if position <= string.panel_count:
                        return MatchResult(
                            status="matched",
                            suggested_label=discovered.tigo_label,
                            confidence="medium",
                            tigo_label=discovered.tigo_label
                        )

    # Fallback: Check ALL CCAs - might be a wiring issue
    for cca in expected_topology.ccas:
        if cca.name != discovered.cca:  # Skip already-checked CCA
            for string in cca.strings:
                if string.name == string_name:
                    if position <= string.panel_count:
                        return MatchResult(
                            status="possible_wiring_issue",
                            tigo_label=discovered.tigo_label,
                            reported_cca=discovered.cca,
                            expected_cca=cca.name,
                            warning=f"Panel reports from '{discovered.cca}' but "
                                    f"string '{string_name}' is configured on '{cca.name}'"
                        )

    # No match in any CCA - needs translation
    return MatchResult(
        status="unmatched",
        tigo_label=discovered.tigo_label,
        needs_translation=True
    )


# API response models

class ConfigStatusResponse(BaseModel):
    """Response for GET /api/config/status."""
    configured: bool
    has_panels: bool
    legacy_detected: bool
    migration_available: bool


class ErrorResponse(BaseModel):
    """Standard error response format."""
    success: bool = False
    error: str
    message: str
    details: list[str] = Field(default_factory=list)


class SuccessResponse(BaseModel):
    """Standard success response format."""
    success: bool = True
    message: str = "Operation completed successfully"


class MQTTTestRequest(BaseModel):
    """Request body for POST /api/config/mqtt/test."""
    server: str
    port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None


class MQTTTestResponse(BaseModel):
    """Response for POST /api/config/mqtt/test."""
    success: bool
    error: Optional[str] = None
    message: str


class ValidationRequest(BaseModel):
    """Request body for POST /api/config/validate."""
    discovered_panels: list[dict]
    topology: dict


class ValidationResultItem(BaseModel):
    """Individual panel validation result."""
    status: Literal['matched', 'unmatched', 'possible_wiring_issue']
    panel: Optional[Panel] = None
    suggested_label: Optional[str] = None
    confidence: Optional[Literal['high', 'medium', 'low']] = None
    tigo_label: Optional[str] = None
    needs_translation: bool = False
    error: Optional[str] = None
    reported_cca: Optional[str] = None
    expected_cca: Optional[str] = None
    warning: Optional[str] = None


class ValidationSummary(BaseModel):
    """Summary of validation results."""
    total: int
    matched: int
    unmatched: int
    possible_wiring_issues: int


class ValidationResponse(BaseModel):
    """Response for POST /api/config/validate."""
    success: bool = True
    results: list[ValidationResultItem]
    summary: ValidationSummary


class GenerateConfigRequest(BaseModel):
    """Request body for POST /api/config/generate-tigo-mqtt."""
    mqtt: Optional[MQTTConfig] = None
    ccas: Optional[list[CCAConfig]] = None
    panels: Optional[list[Panel]] = None
