import { useMemo, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTablePreferences, VALID_THRESHOLDS } from '../hooks/useTablePreferences';
import { analyzeStringForMismatches } from '../utils/mismatchDetection';
import { MOBILE_BREAKPOINT } from '../constants';
import { ColumnDropdown } from './TableView/ColumnDropdown';
import { ExpandCollapseToggle } from './TableView/ExpandCollapseToggle';
import { StringSection } from './TableView/StringSection';

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
  gap: '12px',
  marginBottom: '16px',
  alignItems: 'center',
};

const controlsBarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  alignItems: 'flex-end', // Align to bottom so items with labels align with buttons
  width: '100%',
  minHeight: '56px', // NFR-2.2: Controls bar target height
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
  padding: '8px 12px',
  fontSize: '14px',
  minHeight: '44px', // NFR-2.1: Touch target minimum
  minWidth: '44px',
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

// Screen reader only style for aria-live region
const srOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function TableView({ panels }: TableViewProps) {
  // Mobile detection
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // Use preferences hook for state management
  const [preferences, actions] = useTablePreferences();
  const {
    visibleColumns,
    density,
    sortState,
    collapsedStrings,
    mismatchThreshold,
  } = preferences;

  // Sort announcement for screen readers (FR-3.10)
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  // Group panels by string's expected inverter
  const grouped = useMemo(() => {
    const bySystem: Record<string, Record<string, PanelData[]>> = {
      primary: {},
      secondary: {},
    };

    panels.forEach(panel => {
      const string = panel.string;
      const expectedSystem = STRING_TO_INVERTER[string] || 'primary';
      if (!bySystem[expectedSystem]) {
        bySystem[expectedSystem] = {};
      }
      if (!bySystem[expectedSystem][string]) {
        bySystem[expectedSystem][string] = [];
      }
      bySystem[expectedSystem][string].push(panel);
    });

    // Sort panels within each string by display_label (default)
    Object.values(bySystem).forEach(systemStrings => {
      Object.values(systemStrings).forEach(stringPanels => {
        stringPanels.sort((a, b) =>
          a.display_label.localeCompare(b.display_label, undefined, { numeric: true })
        );
      });
    });

    return bySystem;
  }, [panels]);

  // Get all string IDs
  const allStringIds = useMemo(() => {
    const ids: string[] = [];
    Object.values(grouped).forEach(systemStrings => {
      Object.keys(systemStrings).forEach(stringId => ids.push(stringId));
    });
    return ids;
  }, [grouped]);

  // Check if all strings are expanded
  const allExpanded = collapsedStrings.size === 0;

  // Handle sort with announcement
  const handleSort = useCallback((column: string) => {
    // Handle clear signal from mobile dropdown
    if (column === '__clear__') {
      actions.setSortState({ column: null, direction: null });
      setSortAnnouncement('Table sort cleared');
      return;
    }

    // Get column label for announcement
    const columnLabels: Record<string, string> = {
      display_label: 'Panel ID',
      watts: 'Power',
      voltage_in: 'Voltage In',
      voltage_out: 'Voltage Out',
      current_in: 'Current In',
      current_out: 'Current Out',
      temperature: 'Temperature',
      duty_cycle: 'Duty Cycle',
      rssi: 'Signal',
      energy: 'Energy',
      actual_system: 'CCA Source',
      tigo_label: 'Tigo ID',
      node_id: 'Node ID',
      sn: 'Serial',
    };

    // Cycle sort
    actions.cycleSortColumn(column);

    // Determine new sort state for announcement
    const currentColumn = sortState.column;
    const currentDirection = sortState.direction;

    let newDirection: 'asc' | 'desc' | null;
    if (currentColumn === column) {
      if (currentDirection === null) newDirection = 'asc';
      else if (currentDirection === 'asc') newDirection = 'desc';
      else newDirection = null;
    } else {
      newDirection = 'asc';
    }

    // Set announcement
    const label = columnLabels[column] || column;
    if (newDirection === null) {
      setSortAnnouncement('Table sort cleared');
    } else {
      setSortAnnouncement(`Table sorted by ${label}, ${newDirection === 'asc' ? 'ascending' : 'descending'}`);
    }
  }, [actions, sortState]);

  return (
    <div style={containerStyle} data-testid="panel-table">
      {/* Screen reader announcement for sort changes */}
      <div aria-live="polite" aria-atomic="true" style={srOnlyStyle}>
        {sortAnnouncement}
      </div>

      {/* Controls */}
      <div style={controlsStyle}>
        <div style={controlsBarStyle}>
          {/* Threshold selector */}
          <div style={thresholdContainerStyle}>
            <label style={thresholdLabelStyle} htmlFor="threshold-select">
              Mismatch Threshold
            </label>
            <select
              id="threshold-select"
              style={thresholdSelectStyle}
              value={mismatchThreshold}
              onChange={(e) => actions.setMismatchThreshold(parseInt(e.target.value, 10))}
              data-testid="threshold-select"
            >
              {VALID_THRESHOLDS.map(t => (
                <option key={t} value={t}>{t}%</option>
              ))}
            </select>
          </div>

          {/* Column dropdown - centered */}
          <div style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            <ColumnDropdown
              visibleColumns={visibleColumns}
              onToggleColumn={actions.toggleColumn}
              density={density}
              onDensityChange={actions.setDensity}
              onPreset={actions.setPreset}
            />
          </div>

          {/* Expand/Collapse toggle */}
          <ExpandCollapseToggle
            allExpanded={allExpanded}
            onExpandAll={actions.expandAll}
            onCollapseAll={() => actions.collapseAll(allStringIds)}
            isMobile={isMobile}
          />
        </div>
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
                const analysis = analyzeStringForMismatches(stringPanels, mismatchThreshold);
                return (
                  <StringSection
                    key={stringId}
                    stringId={stringId}
                    panels={stringPanels}
                    analysis={analysis}
                    visibleColumns={visibleColumns}
                    sortState={sortState}
                    onSort={handleSort}
                    density={density}
                    collapsed={collapsedStrings.has(stringId)}
                    onToggleCollapse={() => actions.toggleStringCollapse(stringId)}
                    isMobile={isMobile}
                  />
                );
              })}
          </div>
        ))}
    </div>
  );
}
