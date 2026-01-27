import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PanelData } from '../../hooks/useWebSocket';
import type { SortState, Density } from '../../hooks/useTablePreferences';

// Column definitions
export interface ColumnDef {
  key: string;
  label: string;
  shortLabel: string;
  format?: (value: unknown) => string;
}

export const COLUMN_DEFINITIONS: ColumnDef[] = [
  { key: 'display_label', label: 'Panel ID', shortLabel: 'ID' },
  { key: 'tigo_label', label: 'Tigo ID', shortLabel: 'Tigo' },
  { key: 'node_id', label: 'Node ID', shortLabel: 'Node' },
  { key: 'sn', label: 'Serial', shortLabel: 'SN' },
  { key: 'actual_system', label: 'CCA', shortLabel: 'CCA', format: (v) => v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : '—' },
  { key: 'voltage_in', label: 'V In', shortLabel: 'Vin', format: (v) => v != null ? `${(v as number).toFixed(1)}` : '—' },
  { key: 'voltage_out', label: 'V Out', shortLabel: 'Vout', format: (v) => v != null ? `${(v as number).toFixed(1)}` : '—' },
  { key: 'current_in', label: 'A In', shortLabel: 'Ain', format: (v) => v != null ? `${(v as number).toFixed(2)}` : '—' },
  { key: 'current_out', label: 'A Out', shortLabel: 'Aout', format: (v) => v != null ? `${(v as number).toFixed(2)}` : '—' },
  { key: 'watts', label: 'Power', shortLabel: 'W', format: (v) => v != null ? `${Math.round(v as number)}` : '—' },
  { key: 'temperature', label: 'Temp', shortLabel: '°C', format: (v) => v != null ? `${(v as number).toFixed(1)}` : '—' },
  { key: 'duty_cycle', label: 'Duty', shortLabel: '%', format: (v) => v != null ? `${(v as number).toFixed(1)}` : '—' },
  { key: 'rssi', label: 'RSSI', shortLabel: 'dB', format: (v) => v != null ? `${v}` : '—' },
  { key: 'energy', label: 'Energy', shortLabel: 'kWh', format: (v) => v != null ? `${(v as number).toFixed(2)}` : '—' },
  { key: 'is_temporary', label: 'Temp ID', shortLabel: '⚠' },
];

// String to inverter mapping
const STRING_TO_INVERTER: Record<string, 'primary' | 'secondary'> = {
  'A': 'primary',
  'B': 'primary',
  'C': 'primary',
  'D': 'primary',
  'E': 'primary',
  'I': 'primary',
  'F': 'secondary',
  'G': 'secondary',
  'H': 'secondary',
};

interface TableLayoutProps {
  panels: PanelData[];
  visibleColumns: Set<string>;
  sortState: SortState;
  onSort: (column: string) => void;
  density: Density;
  summary: {
    voltage: number;
    power: number;
    current: number | null;
    onlineCount: number;
    totalCount: number;
  };
}

// Component that auto-updates for seconds display
interface RelativeTimeCellProps {
  lastUpdate: string | undefined;
  style: CSSProperties;
}

function formatRelativeTime(isoTimestamp: string | undefined): { text: string; isSeconds: boolean } {
  if (!isoTimestamp) {
    return { text: '—', isSeconds: false };
  }

  const timestamp = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 0) {
    return { text: '0s', isSeconds: true };
  }

  if (diffSeconds < 60) {
    return { text: `${diffSeconds}s`, isSeconds: true };
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  return { text: `${diffMinutes} min`, isSeconds: false };
}

function RelativeTimeCell({ lastUpdate, style }: RelativeTimeCellProps) {
  const [, setTick] = useState(0);

  const { text, isSeconds } = formatRelativeTime(lastUpdate);

  useEffect(() => {
    if (!isSeconds || !lastUpdate) {
      return;
    }

    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSeconds, lastUpdate]);

  return <td style={style}>{text}</td>;
}

// Sortable header component
interface SortableHeaderProps {
  column: string;
  label: string;
  sortState: SortState;
  onSort: (column: string) => void;
  style: CSSProperties;
}

function SortableHeader({ column, label, sortState, onSort, style }: SortableHeaderProps) {
  const isActive = sortState.column === column;
  const indicator = isActive
    ? (sortState.direction === 'asc' ? '▲' : '▼')
    : '↕';

  const ariaSort = isActive
    ? (sortState.direction === 'asc' ? 'ascending' : 'descending')
    : 'none';

  const buttonResetStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const indicatorStyle: CSSProperties = {
    opacity: isActive ? 1 : 0.4,
    fontSize: '10px',
  };

  return (
    <th style={style} aria-sort={ariaSort}>
      <button
        onClick={() => onSort(column)}
        style={buttonResetStyle}
        aria-label={isActive
          ? `Sort by ${label}, currently ${sortState.direction === 'asc' ? 'ascending' : 'descending'}`
          : `Sort by ${label}`}
      >
        {label}
        <span style={indicatorStyle}>{indicator}</span>
      </button>
    </th>
  );
}

export function TableLayout({
  panels,
  visibleColumns,
  sortState,
  onSort,
  density,
  summary,
}: TableLayoutProps) {
  // Get visible column definitions
  const visibleColumnDefs = COLUMN_DEFINITIONS.filter(col => visibleColumns.has(col.key));

  // Sort panels (FR-3.5: sorting within string section)
  const sortedPanels = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      // Default sort by display_label
      return [...panels].sort((a, b) =>
        a.display_label.localeCompare(b.display_label, undefined, { numeric: true })
      );
    }

    const sorted = [...panels].sort((a, b) => {
      const aData = a as unknown as Record<string, unknown>;
      const bData = b as unknown as Record<string, unknown>;

      let aVal = aData[sortState.column!];
      let bVal = bData[sortState.column!];

      // Handle voltage_in fallback
      if (sortState.column === 'voltage_in') {
        if (aVal == null) aVal = a.voltage;
        if (bVal == null) bVal = b.voltage;
      }

      // Handle nulls
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortState.direction === 'asc' ? -1 : 1;

      // Compare based on type
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const aStr = String(aVal);
      const bStr = String(bVal);
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true });
      return sortState.direction === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [panels, sortState]);

  // Density-based styles
  const padding = density === 'compact' ? '6px 12px' : '10px 12px';
  const fontSize = density === 'compact' ? '13px' : '14px';

  const tableWrapperStyle: CSSProperties = {
    overflowX: 'auto',
  };

  const tableStyle: CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize,
  };

  const thStyle: CSSProperties = {
    textAlign: 'left',
    padding,
    backgroundColor: '#333',
    borderBottom: '1px solid #444',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  };

  const thStickyStyle: CSSProperties = {
    ...thStyle,
    position: 'sticky',
    left: 0,
    zIndex: 2,
    backgroundColor: '#333',
  };

  const tdStyle: CSSProperties = {
    padding,
    borderBottom: '1px solid #444',
    whiteSpace: 'nowrap',
  };

  const tdStickyStyle: CSSProperties = {
    ...tdStyle,
    position: 'sticky',
    left: 0,
    backgroundColor: '#252525',
    zIndex: 1,
  };

  const summaryRowStyle: CSSProperties = {
    backgroundColor: '#2d2d2d',
    fontWeight: 'bold',
  };

  const temporaryRowStyle: CSSProperties = {
    backgroundColor: '#3d3d22',
  };

  const wrongCcaRowStyle: CSSProperties = {
    backgroundColor: '#3d2244',
  };

  const tempIndicatorStyle: CSSProperties = {
    color: '#ffc107',
    fontWeight: 'bold',
  };

  return (
    <div style={tableWrapperStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {visibleColumnDefs.map((col, idx) => (
              <SortableHeader
                key={col.key}
                column={col.key}
                label={col.label}
                sortState={sortState}
                onSort={onSort}
                style={idx === 0 ? thStickyStyle : thStyle}
              />
            ))}
            {/* Age column - always visible, not sortable */}
            <th style={thStyle}>Age</th>
          </tr>
        </thead>
        <tbody>
          {/* Summary row (FR-3.6: stays at top regardless of sort) */}
          <tr style={summaryRowStyle}>
            {visibleColumnDefs.map((col, idx) => (
              <td key={col.key} style={idx === 0 ? { ...tdStickyStyle, ...summaryRowStyle } : tdStyle}>
                {col.key === 'display_label' && `Summary (${summary.onlineCount}/${summary.totalCount})`}
                {col.key === 'voltage_in' && `${summary.voltage.toFixed(1)}V`}
                {col.key === 'current_in' && (summary.current != null ? `${summary.current.toFixed(2)}A` : '—')}
                {col.key === 'watts' && `${Math.round(summary.power)}W`}
              </td>
            ))}
            <td style={tdStyle}>—</td>
          </tr>

          {/* Panel rows */}
          {sortedPanels.map(panel => {
            const isTemporary = panel.is_temporary === true;
            const expectedSystem = STRING_TO_INVERTER[panel.string];
            const isWrongCca = panel.actual_system && expectedSystem && panel.actual_system !== expectedSystem;

            // Note: isMismatched is determined by the parent component via mismatch detection
            // This component receives it through props in StringSection

            let rowStyle: CSSProperties = {};
            if (isWrongCca) {
              rowStyle = wrongCcaRowStyle;
            } else if (isTemporary) {
              rowStyle = temporaryRowStyle;
            }

            return (
              <tr key={panel.display_label} style={rowStyle} data-testid={`panel-row-${panel.display_label}`}>
                {visibleColumnDefs.map((col, idx) => {
                  let value: unknown = (panel as unknown as Record<string, unknown>)[col.key];

                  // Handle voltage_in fallback to voltage
                  if (col.key === 'voltage_in' && value == null) {
                    value = panel.voltage;
                  }

                  let displayValue: string | React.ReactNode;
                  if (col.key === 'is_temporary') {
                    displayValue = isTemporary ? (
                      <span
                        role="img"
                        aria-label="Temporarily enumerated - panel ID may be incorrect"
                        style={tempIndicatorStyle}
                        title="Panel is temporarily enumerated. ID may change when state file is updated."
                      >
                        ⚠
                      </span>
                    ) : '';
                  } else if (col.format) {
                    displayValue = col.format(value);
                  } else {
                    displayValue = value != null ? String(value) : '—';
                  }

                  return (
                    <td
                      key={col.key}
                      style={idx === 0 ? { ...tdStickyStyle, ...rowStyle } : tdStyle}
                    >
                      {displayValue}
                    </td>
                  );
                })}
                <RelativeTimeCell lastUpdate={panel.last_update} style={tdStyle} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Export for use in mismatch detection styling
export { STRING_TO_INVERTER };
