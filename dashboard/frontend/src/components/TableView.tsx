import { useState, useEffect, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { analyzeStringForMismatches, type StringAnalysis } from '../utils/mismatchDetection';
import { MOBILE_BREAKPOINT } from '../constants';

// Column configuration
const ALL_COLUMNS = new Set([
  'display_label', 'tigo_label', 'node_id', 'sn', 'actual_system',
  'voltage_in', 'voltage_out', 'current_in', 'current_out',
  'watts', 'temperature', 'duty_cycle', 'rssi', 'energy', 'is_temporary'
]);
const DEFAULT_COLUMNS = new Set(['display_label', 'voltage_in', 'current_in', 'watts', 'actual_system', 'is_temporary']);
const VALID_THRESHOLDS = [5, 10, 15, 20, 30];
const DEFAULT_THRESHOLD = 15;

// String to inverter mapping (expected/correct assignment)
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

// Column definitions
interface ColumnDef {
  key: string;
  label: string;
  shortLabel: string;
  format?: (value: unknown) => string;
}

const COLUMN_DEFINITIONS: ColumnDef[] = [
  { key: 'display_label', label: 'Panel ID', shortLabel: 'ID' },
  { key: 'tigo_label', label: 'Tigo ID', shortLabel: 'Tigo' },
  { key: 'node_id', label: 'Node ID', shortLabel: 'Node' },
  { key: 'sn', label: 'Serial', shortLabel: 'SN' },
  { key: 'actual_system', label: 'CCA', shortLabel: 'CCA', format: (v) => v === 'primary' ? 'P' : v === 'secondary' ? 'S' : '—' },
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

interface TableViewProps {
  panels: PanelData[];
}

// Styles
const containerStyle: CSSProperties = {
  padding: '16px',
  paddingBottom: '72px', // Space for mobile nav
  backgroundColor: '#1a1a1a',
  minHeight: '100vh',
  color: '#fff',
};

const controlsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '16px',
  marginBottom: '16px',
  alignItems: 'flex-start',
};

const controlsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'center',
  width: '100%',
};

const columnTogglesRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  width: '100%',
  marginTop: '8px',
};

const thresholdContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const thresholdLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#aaa',
};

const thresholdSelectStyle: CSSProperties = {
  backgroundColor: '#333',
  color: '#fff',
  border: '1px solid #555',
  borderRadius: '4px',
  padding: '6px 12px',
  fontSize: '14px',
};

const columnToggleContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  flex: 1,
};

const columnToggleButtonStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  borderRadius: '4px',
  border: 'none',
  cursor: 'pointer',
  minWidth: '44px',
  minHeight: '44px',
};

const systemSectionStyle: CSSProperties = {
  marginBottom: '24px',
};

const systemHeaderStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 'bold',
  padding: '8px 12px',
  backgroundColor: '#2a2a2a',
  borderRadius: '4px',
  marginBottom: '12px',
};

const stringSectionStyle: CSSProperties = {
  marginBottom: '16px',
  backgroundColor: '#252525',
  borderRadius: '4px',
  overflow: 'hidden',
};

const stringSectionMismatchStyle: CSSProperties = {
  ...stringSectionStyle,
  border: '2px solid #ff4444',
};

const stringHeaderStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  padding: '8px 12px',
  backgroundColor: '#333',
};

const warningBannerStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#442222',
  color: '#ff8888',
  fontSize: '13px',
  borderBottom: '1px solid #553333',
};

const tableWrapperStyle: CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
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
  padding: '6px 12px',
  borderBottom: '1px solid #333',
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

const mismatchRowStyle: CSSProperties = {
  backgroundColor: '#3d2222',
};

const temporaryRowStyle: CSSProperties = {
  backgroundColor: '#3d3d22',
};

const wrongCcaRowStyle: CSSProperties = {
  backgroundColor: '#3d2244',  // Purple tint for wrong CCA
};

const tempIndicatorStyle: CSSProperties = {
  color: '#ffc107',
  fontWeight: 'bold',
};

export function TableView({ panels }: TableViewProps) {
  // Mobile detection
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // State management with localStorage persistence
  const [threshold, setThreshold] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('mismatchThreshold');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (VALID_THRESHOLDS.includes(parsed)) {
          return parsed;
        }
      }
    } catch {
      // localStorage may throw in private browsing
    }
    return DEFAULT_THRESHOLD;
  });

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('tableColumns');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validColumns = parsed.filter(col => ALL_COLUMNS.has(col));
          if (validColumns.length > 0) {
            return new Set(validColumns);
          }
        }
      }
    } catch {
      // Invalid localStorage data
    }
    return DEFAULT_COLUMNS;
  });

  const [collapsedStrings, setCollapsedStrings] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('collapsedStrings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch {
      // Invalid localStorage data
    }
    return new Set();
  });

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mismatchThreshold', threshold.toString());
    } catch {
      // Ignore storage errors
    }
  }, [threshold]);

  useEffect(() => {
    try {
      localStorage.setItem('tableColumns', JSON.stringify([...visibleColumns]));
    } catch {
      // Ignore storage errors
    }
  }, [visibleColumns]);

  useEffect(() => {
    try {
      localStorage.setItem('collapsedStrings', JSON.stringify([...collapsedStrings]));
    } catch {
      // Ignore storage errors
    }
  }, [collapsedStrings]);

  // Group panels by string's expected inverter (not panel's configured system)
  const grouped = useMemo(() => {
    const bySystem: Record<string, Record<string, PanelData[]>> = {
      primary: {},
      secondary: {},
    };

    panels.forEach(panel => {
      const string = panel.string;
      // Use the string's expected inverter, not the panel's configured system
      const expectedSystem = STRING_TO_INVERTER[string] || 'primary';
      if (!bySystem[expectedSystem]) {
        bySystem[expectedSystem] = {};
      }
      if (!bySystem[expectedSystem][string]) {
        bySystem[expectedSystem][string] = [];
      }
      bySystem[expectedSystem][string].push(panel);
    });

    // Sort panels within each string by display_label
    Object.values(bySystem).forEach(systemStrings => {
      Object.values(systemStrings).forEach(stringPanels => {
        stringPanels.sort((a, b) =>
          a.display_label.localeCompare(b.display_label, undefined, { numeric: true })
        );
      });
    });

    return bySystem;
  }, [panels]);

  // Toggle column visibility
  const toggleColumn = (column: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  };

  // Toggle string collapse
  const toggleStringCollapse = (stringId: string) => {
    setCollapsedStrings(prev => {
      const next = new Set(prev);
      if (next.has(stringId)) {
        next.delete(stringId);
      } else {
        next.add(stringId);
      }
      return next;
    });
  };

  // Get all string IDs
  const allStringIds = useMemo(() => {
    const ids: string[] = [];
    Object.values(grouped).forEach(systemStrings => {
      Object.keys(systemStrings).forEach(stringId => ids.push(stringId));
    });
    return ids;
  }, [grouped]);

  // Collapse/expand all
  const collapseAll = () => setCollapsedStrings(new Set(allStringIds));
  const expandAll = () => setCollapsedStrings(new Set());

  // Get visible column definitions
  const visibleColumnDefs = COLUMN_DEFINITIONS.filter(col => visibleColumns.has(col.key));

  return (
    <div style={containerStyle} data-testid="panel-table">
      {/* Controls */}
      <div style={controlsStyle}>
        {isMobile ? (
          // Mobile layout: threshold + expand/collapse on first row, column toggles below
          <>
            <div style={controlsRowStyle}>
              {/* Threshold selector */}
              <div style={thresholdContainerStyle}>
                <label style={thresholdLabelStyle} htmlFor="threshold-select">
                  Mismatch Threshold
                </label>
                <select
                  id="threshold-select"
                  style={thresholdSelectStyle}
                  value={threshold}
                  onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                  data-testid="threshold-select"
                >
                  {VALID_THRESHOLDS.map(t => (
                    <option key={t} value={t}>{t}%</option>
                  ))}
                </select>
              </div>

              {/* Collapse/Expand all buttons */}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button
                  style={{
                    ...columnToggleButtonStyle,
                    backgroundColor: '#444',
                    color: '#fff',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={expandAll}
                  title="Expand all strings"
                >
                  Expand
                </button>
                <button
                  style={{
                    ...columnToggleButtonStyle,
                    backgroundColor: '#444',
                    color: '#fff',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={collapseAll}
                  title="Collapse all strings"
                >
                  Collapse
                </button>
              </div>
            </div>

            {/* Column visibility toggles - separate row on mobile */}
            <div style={columnTogglesRowStyle}>
              {COLUMN_DEFINITIONS.map(col => (
                <button
                  key={col.key}
                  style={{
                    ...columnToggleButtonStyle,
                    backgroundColor: visibleColumns.has(col.key) ? '#4a90d9' : '#444',
                    color: visibleColumns.has(col.key) ? '#fff' : '#888',
                  }}
                  onClick={() => toggleColumn(col.key)}
                  title={col.label}
                  data-testid={`col-toggle-${col.key}`}
                >
                  {col.shortLabel}
                </button>
              ))}
            </div>
          </>
        ) : (
          // Desktop layout: all controls in one row
          <>
            {/* Threshold selector */}
            <div style={thresholdContainerStyle}>
              <label style={thresholdLabelStyle} htmlFor="threshold-select">
                Mismatch Threshold
              </label>
              <select
                id="threshold-select"
                style={thresholdSelectStyle}
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                data-testid="threshold-select"
              >
                {VALID_THRESHOLDS.map(t => (
                  <option key={t} value={t}>{t}%</option>
                ))}
              </select>
            </div>

            {/* Column visibility toggles */}
            <div style={columnToggleContainerStyle}>
              {COLUMN_DEFINITIONS.map(col => (
                <button
                  key={col.key}
                  style={{
                    ...columnToggleButtonStyle,
                    backgroundColor: visibleColumns.has(col.key) ? '#4a90d9' : '#444',
                    color: visibleColumns.has(col.key) ? '#fff' : '#888',
                  }}
                  onClick={() => toggleColumn(col.key)}
                  title={col.label}
                  data-testid={`col-toggle-${col.key}`}
                >
                  {col.shortLabel}
                </button>
              ))}
            </div>

            {/* Collapse/Expand all buttons */}
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button
                style={{
                  ...columnToggleButtonStyle,
                  backgroundColor: '#444',
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}
                onClick={expandAll}
                title="Expand all strings"
              >
                Expand All
              </button>
              <button
                style={{
                  ...columnToggleButtonStyle,
                  backgroundColor: '#444',
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}
                onClick={collapseAll}
                title="Collapse all strings"
              >
                Collapse All
              </button>
            </div>
          </>
        )}
      </div>

      {/* System sections */}
      {['primary', 'secondary']
        .filter(system => Object.keys(grouped[system] || {}).length > 0)
        .map(system => (
          <div key={system} style={systemSectionStyle}>
            <div style={systemHeaderStyle}>
              {system === 'primary' ? 'Primary System' : 'Secondary System'}
            </div>

            {/* String sections */}
            {Object.entries(grouped[system] || {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([stringId, stringPanels]) => {
                const analysis = analyzeStringForMismatches(stringPanels, threshold);
                return (
                  <StringSection
                    key={stringId}
                    stringId={stringId}
                    panels={stringPanels}
                    analysis={analysis}
                    visibleColumns={visibleColumnDefs}
                    collapsed={collapsedStrings.has(stringId)}
                    onToggleCollapse={() => toggleStringCollapse(stringId)}
                  />
                );
              })}
          </div>
        ))}
    </div>
  );
}

// String Section Component
interface StringSectionProps {
  stringId: string;
  panels: PanelData[];
  analysis: StringAnalysis;
  visibleColumns: ColumnDef[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function StringSection({ stringId, panels, analysis, visibleColumns, collapsed, onToggleCollapse }: StringSectionProps) {
  // Calculate string summary
  const summary = useMemo(() => {
    const onlinePanels = panels.filter(p => p.online !== false);
    const totalVoltage = onlinePanels.reduce((sum, p) => sum + ((p.voltage_in ?? p.voltage) || 0), 0);
    const totalPower = onlinePanels.reduce((sum, p) => sum + (p.watts || 0), 0);
    const currents = onlinePanels.map(p => p.current_in).filter(c => c != null) as number[];
    const avgCurrent = currents.length > 0 ? currents.reduce((a, b) => a + b, 0) / currents.length : null;

    return {
      voltage: totalVoltage,
      power: totalPower,
      current: avgCurrent,
      onlineCount: onlinePanels.length,
      totalCount: panels.length,
    };
  }, [panels]);

  const collapsedHeaderStyle: CSSProperties = {
    ...stringHeaderStyle,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    userSelect: 'none',
  };

  const summaryStatsStyle: CSSProperties = {
    display: 'flex',
    gap: '16px',
    fontSize: '13px',
    fontWeight: 'normal',
    color: '#aaa',
  };

  const chevronStyle: CSSProperties = {
    transition: 'transform 0.2s ease',
    transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
    marginRight: '8px',
  };

  return (
    <div style={analysis.hasMismatch ? stringSectionMismatchStyle : stringSectionStyle}>
      <div style={collapsedHeaderStyle} onClick={onToggleCollapse}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={chevronStyle}>&#9660;</span>
          <span>String {stringId}</span>
        </div>
        <div style={summaryStatsStyle}>
          <span>{Math.round(summary.power)}W</span>
          <span>{summary.voltage.toFixed(1)}V</span>
          <span>{(summary.current ?? 0).toFixed(2)}A</span>
          <span>({summary.onlineCount} panels)</span>
        </div>
      </div>

      {/* Content hidden when collapsed */}
      {!collapsed && (
        <>
          {/* Warning banner */}
          {analysis.warningMessage && (
            <div style={warningBannerStyle}>
              {analysis.warningMessage}
            </div>
          )}

          {analysis.insufficientData && (
            <div style={{ ...warningBannerStyle, backgroundColor: '#333', color: '#888' }}>
              Insufficient data for mismatch detection
            </div>
          )}

          {/* Table */}
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {visibleColumns.map((col, idx) => (
                    <th key={col.key} style={idx === 0 ? thStickyStyle : thStyle}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Summary row */}
                <tr style={summaryRowStyle}>
                  {visibleColumns.map((col, idx) => (
                    <td key={col.key} style={idx === 0 ? { ...tdStickyStyle, ...summaryRowStyle } : tdStyle}>
                      {col.key === 'display_label' && `Summary (${summary.onlineCount}/${summary.totalCount})`}
                      {col.key === 'voltage_in' && `${summary.voltage.toFixed(1)}V`}
                      {col.key === 'current_in' && (summary.current != null ? `${summary.current.toFixed(2)}A` : '—')}
                      {col.key === 'watts' && `${Math.round(summary.power)}W`}
                    </td>
                  ))}
                </tr>

                {/* Panel rows */}
                {panels.map(panel => {
                  const mismatchResult = analysis.panels.find(p => p.panelId === panel.display_label);
                  const isMismatched = mismatchResult?.isMismatched ?? false;
                  const isTemporary = panel.is_temporary === true;

                  // Check if panel is connected to wrong CCA
                  const expectedSystem = STRING_TO_INVERTER[panel.string];
                  const isWrongCca = panel.actual_system && expectedSystem && panel.actual_system !== expectedSystem;

                  let rowStyle: CSSProperties = {};
                  if (isMismatched) {
                    rowStyle = mismatchRowStyle;
                  } else if (isWrongCca) {
                    rowStyle = wrongCcaRowStyle;
                  } else if (isTemporary) {
                    rowStyle = temporaryRowStyle;
                  }

                  return (
                    <tr key={panel.display_label} style={rowStyle} data-testid={`panel-row-${panel.display_label}`}>
                      {visibleColumns.map((col, idx) => {
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
