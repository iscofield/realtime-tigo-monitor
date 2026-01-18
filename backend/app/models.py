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
    display_label: str
    string: str
    sn: str  # Serial number for display
    watts: Optional[float] = None
    voltage: Optional[float] = None
    online: bool = True
    stale: bool = False
    position: Position


class WebSocketMessage(BaseModel):
    timestamp: str
    panels: list[PanelData]


class MQTTNodeData(BaseModel):
    state_online: str = "online"
    timestamp: Optional[str] = None
    voltage_in: Optional[float] = None
    power: Optional[float] = None
    node_serial: str
