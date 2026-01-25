"""Configuration file service for multi-user setup (Phase 1 spec).

Handles reading/writing YAML configuration files with:
- Atomic writes (write to temp, then rename)
- Backup creation before overwrites
- Legacy JSON format support for backward compatibility
"""

import json
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml
from pydantic import ValidationError

from .config_models import (
    SystemConfig,
    PanelsConfig,
    Panel,
    PanelPosition,
    ConfigStatusResponse,
    LayoutConfig,
)

logger = logging.getLogger(__name__)

# Default paths relative to working directory
DEFAULT_CONFIG_DIR = Path("config")
DEFAULT_SYSTEM_YAML = DEFAULT_CONFIG_DIR / "system.yaml"
DEFAULT_PANELS_YAML = DEFAULT_CONFIG_DIR / "panels.yaml"
DEFAULT_LAYOUT_YAML = DEFAULT_CONFIG_DIR / "layout.yaml"
DEFAULT_LEGACY_JSON = DEFAULT_CONFIG_DIR / "panel_mapping.json"
DEFAULT_ASSETS_DIR = Path("assets")
DEFAULT_LAYOUT_IMAGE = DEFAULT_ASSETS_DIR / "layout.png"


class ConfigServiceError(Exception):
    """Base exception for configuration service errors."""
    def __init__(self, message: str, error_code: str = "unknown"):
        self.message = message
        self.error_code = error_code
        super().__init__(message)


class ConfigService:
    """Service for managing configuration files."""

    def __init__(
        self,
        config_dir: Path = DEFAULT_CONFIG_DIR,
        system_yaml_path: Optional[Path] = None,
        panels_yaml_path: Optional[Path] = None,
        layout_yaml_path: Optional[Path] = None,
        legacy_json_path: Optional[Path] = None,
        assets_dir: Optional[Path] = None,
    ):
        self.config_dir = config_dir
        self.system_yaml_path = system_yaml_path or (config_dir / "system.yaml")
        self.panels_yaml_path = panels_yaml_path or (config_dir / "panels.yaml")
        self.layout_yaml_path = layout_yaml_path or (config_dir / "layout.yaml")
        self.legacy_json_path = legacy_json_path or (config_dir / "panel_mapping.json")
        self.assets_dir = assets_dir or DEFAULT_ASSETS_DIR
        self.layout_image_path = self.assets_dir / "layout.png"

    def get_config_status(self) -> ConfigStatusResponse:
        """Check configuration status (FR-3.1, FR-5.1).

        Returns status indicating:
        - configured: true if system.yaml exists and is valid
        - has_panels: true if panels.yaml exists and has panels
        - legacy_detected: true if panel_mapping.json exists
        - migration_available: true if legacy exists and no YAML
        """
        system_exists = self.system_yaml_path.exists()
        panels_exists = self.panels_yaml_path.exists()
        legacy_exists = self.legacy_json_path.exists()

        configured = False
        has_panels = False

        if system_exists:
            try:
                self.load_system_config()
                configured = True
            except Exception as e:
                logger.warning(f"system.yaml exists but is invalid: {e}")

        if panels_exists:
            try:
                panels_config = self.load_panels_config()
                has_panels = len(panels_config.panels) > 0
            except Exception as e:
                logger.warning(f"panels.yaml exists but is invalid: {e}")

        return ConfigStatusResponse(
            configured=configured,
            has_panels=has_panels,
            legacy_detected=legacy_exists,
            migration_available=legacy_exists and not system_exists,
        )

    def load_system_config(self) -> SystemConfig:
        """Load system configuration from YAML file.

        Raises:
            ConfigServiceError: If file doesn't exist or is invalid
        """
        if not self.system_yaml_path.exists():
            raise ConfigServiceError(
                "System configuration not found",
                error_code="no_config"
            )

        try:
            with open(self.system_yaml_path, "r") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ConfigServiceError(
                f"Configuration file is corrupted: {e}",
                error_code="parse_error"
            )

        try:
            return SystemConfig(**data)
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise ConfigServiceError(
                f"Configuration validation failed: {'; '.join(errors)}",
                error_code="validation_error"
            )

    def save_system_config(self, config: SystemConfig) -> None:
        """Save system configuration to YAML file with atomic write.

        Creates backup of existing file before overwriting.

        Raises:
            ConfigServiceError: If write fails
        """
        self._ensure_config_dir()
        self._atomic_write_yaml(
            self.system_yaml_path,
            config.model_dump(),
            header="# Solar Tigo Viewer System Configuration\n"
        )
        logger.info(f"Saved system config to {self.system_yaml_path}")

    def load_panels_config(self) -> PanelsConfig:
        """Load panels configuration from YAML file.

        Raises:
            ConfigServiceError: If file doesn't exist or is invalid
        """
        if not self.panels_yaml_path.exists():
            # Return empty config if file doesn't exist
            return PanelsConfig(panels=[], translations={})

        try:
            with open(self.panels_yaml_path, "r") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ConfigServiceError(
                f"Panels configuration file is corrupted: {e}",
                error_code="parse_error"
            )

        if data is None:
            return PanelsConfig(panels=[], translations={})

        try:
            return PanelsConfig(**data)
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise ConfigServiceError(
                f"Panels configuration validation failed: {'; '.join(errors)}",
                error_code="validation_error"
            )

    def save_panels_config(self, config: PanelsConfig) -> None:
        """Save panels configuration to YAML file with atomic write.

        Creates backup of existing file before overwriting.

        Raises:
            ConfigServiceError: If write fails
        """
        self._ensure_config_dir()
        self._atomic_write_yaml(
            self.panels_yaml_path,
            config.model_dump(),
            header="# Panel definitions - generated during setup, can be manually edited\n"
        )
        logger.info(f"Saved panels config to {self.panels_yaml_path}")

    def load_layout_config(self) -> LayoutConfig:
        """Load layout configuration from YAML file.

        Returns default config if file doesn't exist.
        """
        if not self.layout_yaml_path.exists():
            return LayoutConfig()

        try:
            with open(self.layout_yaml_path, "r") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise ConfigServiceError(
                f"Layout configuration file is corrupted: {e}",
                error_code="parse_error"
            )

        if data is None:
            return LayoutConfig()

        try:
            return LayoutConfig(**data)
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise ConfigServiceError(
                f"Layout configuration validation failed: {'; '.join(errors)}",
                error_code="validation_error"
            )

    def save_layout_config(self, config: LayoutConfig) -> None:
        """Save layout configuration to YAML file with atomic write.

        Creates backup of existing file before overwriting.

        Raises:
            ConfigServiceError: If write fails
        """
        self._ensure_config_dir()
        self._atomic_write_yaml(
            self.layout_yaml_path,
            config.model_dump(),
            header="# Layout editor configuration\n"
        )
        logger.info(f"Saved layout config to {self.layout_yaml_path}")

    def get_layout_image_path(self) -> Optional[Path]:
        """Get the path to the layout image if it exists."""
        if self.layout_image_path.exists():
            return self.layout_image_path
        return None

    def save_layout_image(
        self,
        image_data: bytes,
        content_type: str
    ) -> tuple[int, int, str]:
        """Save layout image with backup of existing.

        Args:
            image_data: Raw image bytes
            content_type: MIME type of image

        Returns:
            Tuple of (width, height, sha256_hash)

        Raises:
            ConfigServiceError: If image is invalid or write fails
        """
        import hashlib
        from PIL import Image
        import io

        # Validate image
        try:
            img = Image.open(io.BytesIO(image_data))
            width, height = img.size
        except Exception as e:
            raise ConfigServiceError(
                f"Invalid image file: {e}",
                error_code="invalid_image"
            )

        # Compute hash
        image_hash = f"sha256:{hashlib.sha256(image_data).hexdigest()}"

        # Ensure assets directory exists
        if not self.assets_dir.exists():
            try:
                self.assets_dir.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise ConfigServiceError(
                    f"Cannot create assets directory: {e}",
                    error_code="permission_denied"
                )

        # Backup existing image
        if self.layout_image_path.exists():
            backup_path = self.assets_dir / "layout.backup.png"
            try:
                import shutil
                shutil.copy2(self.layout_image_path, backup_path)
                logger.debug(f"Created image backup: {backup_path}")
            except OSError as e:
                logger.warning(f"Could not create image backup: {e}")

        # Write new image atomically
        try:
            fd, temp_path = tempfile.mkstemp(
                dir=self.assets_dir,
                prefix=".layout.",
                suffix=".tmp"
            )
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(image_data)
            except Exception:
                os.close(fd)
                raise

            os.rename(temp_path, self.layout_image_path)
            logger.info(f"Saved layout image: {self.layout_image_path}")

        except OSError as e:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

            raise ConfigServiceError(
                f"Failed to save layout image: {e}",
                error_code="write_error"
            )

        return width, height, image_hash

    def delete_layout_image(self) -> bool:
        """Delete layout image if it exists.

        Returns:
            True if image was deleted, False if it didn't exist
        """
        if not self.layout_image_path.exists():
            return False

        try:
            self.layout_image_path.unlink()
            logger.info(f"Deleted layout image: {self.layout_image_path}")
            return True
        except OSError as e:
            raise ConfigServiceError(
                f"Failed to delete layout image: {e}",
                error_code="delete_error"
            )

    def reset_config(self, delete_image: bool = True) -> dict:
        """Reset all configuration to factory defaults.

        Deletes system.yaml, panels.yaml, layout.yaml, and optionally layout.png.
        Creates backups before deletion.

        Args:
            delete_image: Whether to also delete the layout image

        Returns:
            Dict with deleted file information

        Raises:
            ConfigServiceError: If reset fails
        """
        deleted = {
            "system_yaml": False,
            "panels_yaml": False,
            "layout_yaml": False,
            "layout_image": False,
        }

        # Delete each config file with backup
        for path, key in [
            (self.system_yaml_path, "system_yaml"),
            (self.panels_yaml_path, "panels_yaml"),
            (self.layout_yaml_path, "layout_yaml"),
        ]:
            if path.exists():
                try:
                    # Create backup
                    backup_path = path.with_suffix(path.suffix + ".reset-backup")
                    import shutil
                    shutil.copy2(path, backup_path)
                    logger.debug(f"Created reset backup: {backup_path}")

                    # Delete original
                    path.unlink()
                    deleted[key] = True
                    logger.info(f"Deleted config file: {path}")
                except OSError as e:
                    raise ConfigServiceError(
                        f"Failed to delete {path}: {e}",
                        error_code="delete_error"
                    )

        # Optionally delete layout image
        if delete_image and self.layout_image_path.exists():
            try:
                # Backup
                backup_path = self.assets_dir / "layout.reset-backup.png"
                import shutil
                shutil.copy2(self.layout_image_path, backup_path)
                logger.debug(f"Created image reset backup: {backup_path}")

                # Delete
                self.layout_image_path.unlink()
                deleted["layout_image"] = True
                logger.info(f"Deleted layout image: {self.layout_image_path}")
            except OSError as e:
                raise ConfigServiceError(
                    f"Failed to delete layout image: {e}",
                    error_code="delete_error"
                )

        return deleted

    def load_legacy_json(self) -> Optional[PanelsConfig]:
        """Load legacy panel_mapping.json and convert to PanelsConfig.

        Returns None if file doesn't exist.

        Raises:
            ConfigServiceError: If file exists but is invalid
        """
        if not self.legacy_json_path.exists():
            return None

        try:
            with open(self.legacy_json_path, "r") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise ConfigServiceError(
                f"Legacy JSON configuration is corrupted: {e}",
                error_code="parse_error"
            )

        # Convert legacy format to new Panel format
        panels = []
        for p in data.get("panels", []):
            position = None
            if "position" in p:
                position = PanelPosition(
                    x_percent=p["position"]["x_percent"],
                    y_percent=p["position"]["y_percent"]
                )
            panels.append(Panel(
                serial=p["sn"],
                cca=p.get("system", "primary"),  # Legacy uses "system"
                string=p["string"],
                tigo_label=p["tigo_label"],
                display_label=p["display_label"],
                position=position,
            ))

        return PanelsConfig(
            panels=panels,
            translations=data.get("translations", {})
        )

    def migrate_from_legacy(self, mqtt_config: dict) -> tuple[SystemConfig, PanelsConfig]:
        """Migrate from legacy JSON to new YAML format.

        Args:
            mqtt_config: MQTT settings (not in legacy JSON, must be provided)

        Returns:
            Tuple of (SystemConfig, PanelsConfig) created from legacy data

        Raises:
            ConfigServiceError: If legacy file doesn't exist or migration fails
        """
        panels_config = self.load_legacy_json()
        if panels_config is None:
            raise ConfigServiceError(
                "No legacy configuration found to migrate",
                error_code="no_config"
            )

        # Infer CCA topology from panel data
        ccas_dict: dict[str, dict[str, int]] = {}  # cca_name -> {string_name -> max_position}

        for panel in panels_config.panels:
            cca_name = panel.cca
            if cca_name not in ccas_dict:
                ccas_dict[cca_name] = {}

            # Parse tigo_label to get string and position
            from .config_models import parse_tigo_label
            parsed = parse_tigo_label(panel.tigo_label)
            if parsed:
                string_name, position = parsed
                current_max = ccas_dict[cca_name].get(string_name, 0)
                ccas_dict[cca_name][string_name] = max(current_max, position)

        # Build CCA configs from inferred topology
        from .config_models import CCAConfig, StringConfig, MQTTConfig

        ccas = []
        # Assign default serial devices based on CCA name
        device_map = {"primary": "/dev/ttyACM2", "secondary": "/dev/ttyACM3"}

        for cca_name, strings_dict in ccas_dict.items():
            strings = [
                StringConfig(name=s_name, panel_count=max_pos)
                for s_name, max_pos in sorted(strings_dict.items())
            ]
            ccas.append(CCAConfig(
                name=cca_name,
                serial_device=device_map.get(cca_name, f"/dev/ttyACM{len(ccas) + 2}"),
                strings=strings,
            ))

        system_config = SystemConfig(
            version=1,
            mqtt=MQTTConfig(**mqtt_config),
            ccas=ccas,
        )

        # Backup legacy file
        backup_path = self.legacy_json_path.with_suffix(".json.backup")
        if backup_path.exists():
            logger.warning(f"Existing backup file replaced: {backup_path}")
        self.legacy_json_path.rename(backup_path)
        logger.info(f"Legacy config backed up to {backup_path}")

        # Save new configs
        self.save_system_config(system_config)
        self.save_panels_config(panels_config)

        return system_config, panels_config

    def _ensure_config_dir(self) -> None:
        """Ensure config directory exists."""
        if not self.config_dir.exists():
            try:
                self.config_dir.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise ConfigServiceError(
                    f"Cannot create config directory: {e}",
                    error_code="permission_denied"
                )

    def _atomic_write_yaml(
        self,
        path: Path,
        data: dict,
        header: str = ""
    ) -> None:
        """Write YAML file atomically with backup.

        1. Create backup of existing file
        2. Write to temp file
        3. Rename temp to target (atomic on POSIX)

        Raises:
            ConfigServiceError: If write fails
        """
        # Create backup if file exists
        if path.exists():
            backup_path = path.with_suffix(path.suffix + ".bak")
            try:
                # Copy instead of rename to preserve original during write
                import shutil
                shutil.copy2(path, backup_path)
                logger.debug(f"Created backup: {backup_path}")
            except OSError as e:
                logger.warning(f"Could not create backup: {e}")

        # Write to temp file in same directory (for atomic rename)
        try:
            fd, temp_path = tempfile.mkstemp(
                dir=path.parent,
                prefix=f".{path.name}.",
                suffix=".tmp"
            )
            try:
                with os.fdopen(fd, 'w') as f:
                    if header:
                        f.write(header)
                    yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            except Exception:
                os.close(fd)
                raise

            # Atomic rename
            os.rename(temp_path, path)
            logger.debug(f"Atomic write completed: {path}")

        except OSError as e:
            # Clean up temp file if it exists
            if 'temp_path' in locals() and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

            if e.errno == 28:  # ENOSPC - No space left on device
                raise ConfigServiceError(
                    "Disk full - cannot save configuration",
                    error_code="disk_full"
                )
            elif e.errno == 13:  # EACCES - Permission denied
                raise ConfigServiceError(
                    f"Permission denied writing to {path}",
                    error_code="permission_denied"
                )
            else:
                raise ConfigServiceError(
                    f"Failed to write configuration: {e}",
                    error_code="write_error"
                )


# Singleton instance
_config_service: Optional[ConfigService] = None


def get_config_service() -> ConfigService:
    """Get or create the singleton ConfigService instance."""
    global _config_service
    if _config_service is None:
        _config_service = ConfigService()
    return _config_service
