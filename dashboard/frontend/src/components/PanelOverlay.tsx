import type { CSSProperties } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { interpolateColor, calculatePercentage, MAX_WATTS, MAX_VOLTAGE } from '../utils/colors';

export type DisplayMode = 'watts' | 'voltage' | 'sn';

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
  // online defaults to true if not provided
  if (panel.online === false) {
    // In SN mode, show serial number even when offline (SN is static config data)
    if (mode === 'sn') {
      const snLast4 = panel.sn ? panel.sn.slice(-4) : '----';
      return (
        <div
          data-testid={`panel-${panel.display_label}`}
          style={{ ...offlineStyle, ...positionStyle }}
        >
          <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
          <div>{snLast4}</div>
        </div>
      );
    }
    // For other modes, show red X icon
    return (
      <div
        data-testid={`panel-${panel.display_label}`}
        style={{ ...offlineStyle, ...positionStyle }}
      >
        <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
        <div style={{ color: '#ff4444', fontSize: '1.2em', fontWeight: 'bold' }}>✕</div>
      </div>
    );
  }

  // Handle SN mode - display last 4 characters of serial number
  if (mode === 'sn') {
    const snLast4 = panel.sn ? panel.sn.slice(-4) : '----';
    // stale defaults to false if not provided
    const staleOpacity = panel.stale === true ? 0.5 : 1;
    return (
      <div
        data-testid={`panel-${panel.display_label}`}
        style={{
          ...baseStyle,
          ...positionStyle,
          backgroundColor: '#4a90d9',
          opacity: staleOpacity,
        }}
      >
        <div style={{ fontWeight: 'bold' }}>{panel.display_label}</div>
        <div>{snLast4}</div>
      </div>
    );
  }

  // Get value based on display mode (FR-3.3)
  // FR-M.2: Accept both voltage and voltage_in for transition period
  const voltage = panel.voltage_in ?? panel.voltage;
  const value = mode === 'watts' ? panel.watts : voltage;
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
  // stale defaults to false if not provided
  const staleOpacity = panel.stale === true ? 0.5 : 1;

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
