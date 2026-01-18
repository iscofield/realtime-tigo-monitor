import pytest
import json
from pathlib import Path
import tempfile


@pytest.fixture
def valid_panel_mapping():
    """Valid panel mapping configuration for testing."""
    return {
        "panels": [
            {
                "sn": "4-C3F23CR",
                "tigo_label": "A1",
                "display_label": "A1",
                "string": "A",
                "system": "primary",
                "position": {"x_percent": 15.5, "y_percent": 23.2}
            },
            {
                "sn": "4-C3F2ACK",
                "tigo_label": "A2",
                "display_label": "A2",
                "string": "A",
                "system": "primary",
                "position": {"x_percent": 18.5, "y_percent": 23.2}
            }
        ],
        "translations": {}
    }


@pytest.fixture
def temp_config_file(valid_panel_mapping):
    """Create a temporary config file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(valid_panel_mapping, f)
        return Path(f.name)


@pytest.fixture
def invalid_panel_mapping_duplicate_sn():
    """Panel mapping with duplicate serial numbers."""
    return {
        "panels": [
            {
                "sn": "4-C3F23CR",
                "tigo_label": "A1",
                "display_label": "A1",
                "string": "A",
                "system": "primary",
                "position": {"x_percent": 15.5, "y_percent": 23.2}
            },
            {
                "sn": "4-C3F23CR",  # Duplicate!
                "tigo_label": "A2",
                "display_label": "A2",
                "string": "A",
                "system": "primary",
                "position": {"x_percent": 18.5, "y_percent": 23.2}
            }
        ],
        "translations": {}
    }


@pytest.fixture
def invalid_panel_mapping_out_of_range():
    """Panel mapping with out-of-range position coordinates."""
    return {
        "panels": [
            {
                "sn": "4-C3F23CR",
                "tigo_label": "A1",
                "display_label": "A1",
                "string": "A",
                "system": "primary",
                "position": {"x_percent": 150.0, "y_percent": 23.2}  # Out of range!
            }
        ],
        "translations": {}
    }
