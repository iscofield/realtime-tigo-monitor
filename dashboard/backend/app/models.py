from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class Position(BaseModel):
    x_percent: float = Field(..., ge=0.0, le=100.0)
    y_percent: float = Field(..., ge=0.0, le=100.0)


class PanelConfig(BaseModel):
    sn: str
    tigo_label: str
    display_label: str
    string: str
    system: str
    position: Position


class PanelMapping(BaseModel):
    panels: list[PanelConfig]
    translations: dict[str, str] = Field(default_factory=dict)

    @field_validator("panels")
    @classmethod
    def validate_unique_serial_numbers(cls, panels: list[PanelConfig]) -> list[PanelConfig]:
        sns = [p.sn for p in panels]
        if len(sns) != len(set(sns)):
            duplicates = [sn for sn in sns if sns.count(sn) > 1]
            raise ValueError(f"Duplicate serial numbers found: {set(duplicates)}")
        return panels


class PanelData(BaseModel):
    """Extended panel data model per FR-7.2.

    For backward compatibility during migration (FR-M.5):
    - voltage_in is aliased as "voltage" for serialization
    - Use model_dump(by_alias=True) for old clients
    - Use model_dump() for new clients expecting voltage_in
    """
    display_label: str
    tigo_label: Optional[str] = None
    string: str
    system: str
    sn: str  # Serial number for display
    node_id: Optional[str] = None
    watts: Optional[float] = None
    voltage_in: Optional[float] = Field(None, serialization_alias="voltage")
    voltage_out: Optional[float] = None
    current_in: Optional[float] = None
    current_out: Optional[float] = None
    temperature: Optional[float] = None
    duty_cycle: Optional[float] = None
    rssi: Optional[float] = None
    energy: Optional[float] = None
    online: bool = True
    stale: bool = False
    is_temporary: bool = False
    actual_system: Optional[str] = None  # Which CCA actually sent data for this panel
    last_update: Optional[datetime] = None  # When panel data was last received
    position: Position


class WebSocketMessage(BaseModel):
    timestamp: str
    panels: list[PanelData]


class MQTTNodeData(BaseModel):
    """MQTT payload structure from taptap-mqtt.

    All available fields from taptap-mqtt are captured here.
    """
    state_online: str = "online"
    timestamp: Optional[str] = None
    voltage_in: Optional[float] = None
    voltage_out: Optional[float] = None
    current_in: Optional[float] = None
    current_out: Optional[float] = None
    power: Optional[float] = None
    temperature: Optional[float] = None
    duty_cycle: Optional[float] = None
    rssi: Optional[float] = None
    energy: Optional[float] = None
    node_serial: str
    node_id: Optional[str] = None
    node_name: Optional[str] = None  # Tigo's label for the panel
