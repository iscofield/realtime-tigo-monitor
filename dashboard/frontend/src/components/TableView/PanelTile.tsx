import type { CSSProperties } from 'react';
import type { PanelData } from '../../hooks/useWebSocket';
import type { Density } from '../../hooks/useTablePreferences';

interface PanelTileProps {
  panel: PanelData;
  visibleColumns: Set<string>;
  density: Density;
  isMismatched: boolean;
  isWrongCca: boolean;
  isTemporary: boolean;
}

// Field rendering order (fixed sequence per FR-5.3)
const FIELD_ORDER = [
  'watts',
  'voltage_in',
  'voltage_out',
  'current_in',
  'current_out',
  'temperature',
  'duty_cycle',
  'rssi',
  'energy',
];

// Column short labels
const COLUMN_SHORT_LABELS: Record<string, string> = {
  voltage_in: 'Vin',
  voltage_out: 'Vout',
  current_in: 'Ain',
  current_out: 'Aout',
};

// Format values for display
function formatValue(key: string, value: unknown): string {
  if (value == null) return '—';

  switch (key) {
    case 'watts':
      return `${Math.round(value as number)}W`;
    case 'voltage_in':
    case 'voltage_out':
      return `${(value as number).toFixed(1)}V`;
    case 'current_in':
    case 'current_out':
      return `${(value as number).toFixed(2)}A`;
    case 'temperature':
      return `${(value as number).toFixed(1)}°C`;
    case 'duty_cycle':
      return `${(value as number).toFixed(1)}%`;
    case 'rssi':
      return `${value}dB`;
    case 'energy':
      return `${(value as number).toFixed(2)}kWh`;
    default:
      return String(value);
  }
}

// Format relative time
function formatAge(lastUpdate: string | undefined): string {
  if (!lastUpdate) return '—';

  const timestamp = new Date(lastUpdate);
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 0) return '0s';
  if (diffSeconds < 60) return `${diffSeconds}s`;
  if (diffSeconds < 600) return `${Math.floor(diffSeconds / 60)}m`;
  return '>10m';
}

// Determine if labels are needed (FR-4.6, FR-4.7)
function needsLabel(column: string, visibleColumns: Set<string>): boolean {
  if (column === 'voltage_in' && visibleColumns.has('voltage_out')) return true;
  if (column === 'voltage_out' && visibleColumns.has('voltage_in')) return true;
  if (column === 'current_in' && visibleColumns.has('current_out')) return true;
  if (column === 'current_out' && visibleColumns.has('current_in')) return true;
  return false;
}

// Get tile style based on status (FR-6.5 priority)
export function getTileStyle(
  isMismatched: boolean,
  isWrongCca: boolean,
  isTemporary: boolean,
  density: Density
): CSSProperties {
  const baseStyle: CSSProperties = {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: density === 'compact' ? '8px' : '12px',
    marginBottom: density === 'compact' ? '6px' : '8px',
    border: '1px solid #444',
  };

  // Apply in reverse priority order (lowest first, highest overwrites)
  if (isTemporary) {
    baseStyle.borderColor = '#ffaa00';
    baseStyle.backgroundColor = '#3d3d22';
  }
  if (isWrongCca) {
    baseStyle.borderColor = '#9944ff';
    baseStyle.backgroundColor = '#3d2244';
  }
  if (isMismatched) {
    baseStyle.borderColor = '#ff4444';
    baseStyle.backgroundColor = '#3d2222';
  }

  return baseStyle;
}

export function PanelTile({
  panel,
  visibleColumns,
  density,
  isMismatched,
  isWrongCca,
  isTemporary,
}: PanelTileProps) {
  const tileStyle = getTileStyle(isMismatched, isWrongCca, isTemporary, density);

  // Row 1 styles
  const row1Style: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: density === 'compact' ? '4px' : '8px',
  };

  const panelIdStyle: CSSProperties = {
    fontWeight: 'bold',
    fontSize: density === 'compact' ? '14px' : '16px',
  };

  const ccaStyle: CSSProperties = {
    fontSize: density === 'compact' ? '12px' : '14px',
    color: '#888',
  };

  const ageStyle: CSSProperties = {
    fontSize: density === 'compact' ? '12px' : '14px',
    color: '#888',
  };

  // Get visible data fields in order
  const visibleFields = FIELD_ORDER.filter(field => visibleColumns.has(field));

  // Row 2 styles - equal width distribution with flexbox
  const row2Style: CSSProperties = {
    display: visibleFields.length > 0 ? 'flex' : 'none',
    flexWrap: 'wrap',
    gap: '8px',
  };

  // Calculate field width based on count (FR-4.4)
  const getFieldStyle = (fieldCount: number): CSSProperties => {
    // For 1-3 fields, flex:1 auto-distributes
    // For 4+ fields, calculate width for 4 per row with gap handling
    if (fieldCount <= 3) {
      return { flex: 1, minWidth: 0 };
    }
    // For 4+ fields: calc(25% - 6px) to account for gaps
    return {
      width: 'calc(25% - 6px)',
      flexShrink: 0,
    };
  };

  const fieldStyle = getFieldStyle(visibleFields.length);

  const fieldContainerStyle: CSSProperties = {
    ...fieldStyle,
    textAlign: 'center',
    fontSize: density === 'compact' ? '13px' : '14px',
  };

  const powerFieldStyle: CSSProperties = {
    ...fieldContainerStyle,
    fontWeight: 'bold',
    color: '#4a90d9',
    fontSize: density === 'compact' ? '14px' : '16px',
  };

  const labelStyle: CSSProperties = {
    fontSize: '10px',
    color: '#666',
    display: 'block',
  };

  // Get panel value with fallback
  const getValue = (key: string): unknown => {
    const data = panel as unknown as Record<string, unknown>;
    let value = data[key];
    // Handle voltage_in fallback to voltage
    if (key === 'voltage_in' && value == null) {
      value = panel.voltage;
    }
    return value;
  };

  return (
    <div style={tileStyle} data-testid={`panel-tile-${panel.display_label}`}>
      {/* Row 1: Panel ID, CCA Source (if visible), Age */}
      <div style={row1Style}>
        <span style={panelIdStyle}>
          {panel.display_label}
          {isTemporary && (
            <span
              role="img"
              aria-label="Temporarily enumerated"
              style={{ color: '#ffc107', marginLeft: '4px' }}
              title="Panel is temporarily enumerated"
            >
              ⚠
            </span>
          )}
        </span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {visibleColumns.has('actual_system') && panel.actual_system && (
            <span style={ccaStyle}>
              {panel.actual_system.charAt(0).toUpperCase() + panel.actual_system.slice(1)}
            </span>
          )}
          <span style={ageStyle}>{formatAge(panel.last_update)}</span>
        </div>
      </div>

      {/* Row 2: Data fields */}
      <div style={row2Style}>
        {visibleFields.map(field => {
          const value = getValue(field);
          const showLabel = needsLabel(field, visibleColumns);
          const isPower = field === 'watts';

          return (
            <div key={field} style={isPower ? powerFieldStyle : fieldContainerStyle}>
              {showLabel && (
                <span style={labelStyle}>{COLUMN_SHORT_LABELS[field]}</span>
              )}
              <span>
                {isPower && '⚡'}
                {formatValue(field, value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
