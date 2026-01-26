import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { PanelData } from '../../hooks/useWebSocket';
import type { SortState, Density } from '../../hooks/useTablePreferences';
import type { StringAnalysis } from '../../utils/mismatchDetection';
import { STRING_TO_INVERTER, COLUMN_DEFINITIONS } from './TableLayout';
import { TileLayout } from './TileLayout';

interface StringSectionProps {
  stringId: string;
  panels: PanelData[];
  analysis: StringAnalysis;
  visibleColumns: Set<string>;
  sortState: SortState;
  onSort: (column: string) => void;
  density: Density;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobile: boolean;
}

// Styles
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
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  userSelect: 'none',
  minHeight: '44px', // NFR-2.1: Touch target minimum
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
  marginRight: '8px',
};

const warningBannerStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#442222',
  color: '#ff8888',
  fontSize: '13px',
  borderBottom: '1px solid #553333',
};

const insufficientDataBannerStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#333',
  color: '#888',
  fontSize: '13px',
  borderBottom: '1px solid #444',
};

// Extended TableLayout that handles mismatch styling
interface TableLayoutWithMismatchProps {
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
  mismatchedPanels: Set<string>;
}

function TableLayoutWithMismatch({
  panels,
  visibleColumns,
  sortState,
  onSort,
  density,
  summary,
  mismatchedPanels,
}: TableLayoutWithMismatchProps) {
  // Get visible column definitions
  const visibleColumnDefs = COLUMN_DEFINITIONS.filter(col => visibleColumns.has(col.key));

  // Sort panels
  const sortedPanels = useMemo(() => {
    if (!sortState.column || !sortState.direction) {
      return [...panels].sort((a, b) =>
        a.display_label.localeCompare(b.display_label, undefined, { numeric: true })
      );
    }

    const sorted = [...panels].sort((a, b) => {
      const aData = a as unknown as Record<string, unknown>;
      const bData = b as unknown as Record<string, unknown>;

      let aVal = aData[sortState.column!];
      let bVal = bData[sortState.column!];

      if (sortState.column === 'voltage_in') {
        if (aVal == null) aVal = a.voltage;
        if (bVal == null) bVal = b.voltage;
      }

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortState.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortState.direction === 'asc' ? -1 : 1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

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
    backgroundColor: '#3d2244',
  };

  const tempIndicatorStyle: CSSProperties = {
    color: '#ffc107',
    fontWeight: 'bold',
  };

  // Sortable header component
  const SortableHeader = ({ column, label, isFirst }: { column: string; label: string; isFirst: boolean }) => {
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
      <th style={isFirst ? thStickyStyle : thStyle} aria-sort={ariaSort}>
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
  };

  // RelativeTimeCell component
  const RelativeTimeCell = ({ lastUpdate }: { lastUpdate: string | undefined }) => {
    const formatRelativeTime = (isoTimestamp: string | undefined): string => {
      if (!isoTimestamp) return '—';

      const timestamp = new Date(isoTimestamp);
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);

      if (diffSeconds < 0) return '0s';
      if (diffSeconds < 60) return `${diffSeconds}s`;

      const diffMinutes = Math.floor(diffSeconds / 60);
      return `${diffMinutes} min`;
    };

    return <td style={tdStyle}>{formatRelativeTime(lastUpdate)}</td>;
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
                isFirst={idx === 0}
              />
            ))}
            <th style={thStyle}>Age</th>
          </tr>
        </thead>
        <tbody>
          {/* Summary row */}
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
            const isMismatched = mismatchedPanels.has(panel.display_label);
            const isTemporary = panel.is_temporary === true;
            const expectedSystem = STRING_TO_INVERTER[panel.string];
            const isWrongCca = !!(panel.actual_system && expectedSystem && panel.actual_system !== expectedSystem);

            // Apply style priority (FR-6.5)
            let rowStyle: CSSProperties = {};
            if (isTemporary) {
              rowStyle = temporaryRowStyle;
            }
            if (isWrongCca) {
              rowStyle = wrongCcaRowStyle;
            }
            if (isMismatched) {
              rowStyle = mismatchRowStyle;
            }

            return (
              <tr key={panel.display_label} style={rowStyle} data-testid={`panel-row-${panel.display_label}`}>
                {visibleColumnDefs.map((col, idx) => {
                  let value: unknown = (panel as unknown as Record<string, unknown>)[col.key];

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
                <RelativeTimeCell lastUpdate={panel.last_update} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StringSection({
  stringId,
  panels,
  analysis,
  visibleColumns,
  sortState,
  onSort,
  density,
  collapsed,
  onToggleCollapse,
  isMobile,
}: StringSectionProps) {
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

  // Get mismatched panel IDs from analysis
  const mismatchedPanels = useMemo(() => {
    const set = new Set<string>();
    analysis.panels.forEach(p => {
      if (p.isMismatched) {
        set.add(p.panelId);
      }
    });
    return set;
  }, [analysis]);

  return (
    <div style={analysis.hasMismatch ? stringSectionMismatchStyle : stringSectionStyle}>
      {/* String header */}
      <div
        style={stringHeaderStyle}
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ ...chevronStyle, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
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
            <div style={insufficientDataBannerStyle}>
              Insufficient data for mismatch detection
            </div>
          )}

          {/* Render table or tiles based on viewport */}
          {isMobile ? (
            <TileLayout
              panels={panels}
              visibleColumns={visibleColumns}
              sortState={sortState}
              onSort={onSort}
              density={density}
              mismatchedPanels={mismatchedPanels}
            />
          ) : (
            <TableLayoutWithMismatch
              panels={panels}
              visibleColumns={visibleColumns}
              sortState={sortState}
              onSort={onSort}
              density={density}
              summary={summary}
              mismatchedPanels={mismatchedPanels}
            />
          )}
        </>
      )}
    </div>
  );
}
