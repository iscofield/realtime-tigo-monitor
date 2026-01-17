import type { CSSProperties } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { interpolateColor, calculatePercentage, MAX_WATTS, MAX_VOLTAGE } from '../utils/colors';

export type DisplayMode = 'watts' | 'voltage';

interface PanelOverlayProps {
  panel: PanelData;
  mode: DisplayMode;
}

const baseStyle: CSSProperties = {
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  padding: '3px 6px',
  borderRadius: '4px',
  fontSize: 'clamp(10px, 2vw, 18px)',
  textAlign: 'center',
  lineHeight: '1.2',
  whiteSpace: 'nowrap',
  color: 'white',
  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
};

const offlineStyle: CSSProperties = {
  ...baseStyle,
  backgroundColor: '#808080',
};

const noDataStyle: CSSProperties = {
  ...baseStyle,
  backgroundColor: '#808080',
};

export function PanelOverlay({ panel, mode }: PanelOverlayProps) {
  const positionStyle: CSSProperties = {
    left: `${panel.position.x_percent}%`,
    top: `${panel.position.y_percent}%`,
  };

  // Handle offline panels (FR-2.8)
  if (!panel.online) {
    return (
      <div
        data-testid={`panel-${panel.display_label}`}
        style={{ ...offlineStyle, ...positionStyle }}
      >
        <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
        <div>OFFLINE</div>
      </div>
    );
  }

  // Get value based on display mode (FR-3.3)
  const value = mode === 'watts' ? panel.watts : panel.voltage;
  const maxValue = mode === 'watts' ? MAX_WATTS : MAX_VOLTAGE;

  // Handle no data received yet (FR-4.7)
  if (value === null || value === undefined) {
    return (
      <div
        data-testid={`panel-${panel.display_label}`}
        style={{ ...noDataStyle, ...positionStyle }}
      >
        <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
        <div>—</div>
      </div>
    );
  }

  const percentage = calculatePercentage(value, maxValue);
  const backgroundColor = interpolateColor(percentage);

  // Format value: watts as integer, voltage with 1 decimal
  const formattedValue = mode === 'watts'
    ? Math.round(value)
    : value.toFixed(1);

  // Apply stale styling (FR-4.7: 50% opacity + ⏱ indicator)
  const staleOpacity = panel.stale ? 0.5 : 1;

  return (
    <div
      data-testid={`panel-${panel.display_label}`}
      style={{
        ...baseStyle,
        ...positionStyle,
        backgroundColor,
        opacity: staleOpacity,
      }}
    >
      <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
      <div>{formattedValue}</div>
    </div>
  );
}
