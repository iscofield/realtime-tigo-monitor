import { useState, useRef, useEffect, useId, useMemo } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { PanelData } from '../../hooks/useWebSocket';
import type { SortState, Density } from '../../hooks/useTablePreferences';
import { PanelTile } from './PanelTile';

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

// Sortable columns with human-readable labels
const SORTABLE_COLUMNS: Record<string, string> = {
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
};

interface TileLayoutProps {
  panels: PanelData[];
  visibleColumns: Set<string>;
  sortState: SortState;
  onSort: (column: string) => void;
  density: Density;
  mismatchedPanels: Set<string>;
}

interface MobileSortDropdownProps {
  visibleColumns: Set<string>;
  sortState: SortState;
  onSort: (column: string) => void;
}

// Mobile sort dropdown component (FR-3.8)
function MobileSortDropdown({ visibleColumns, sortState, onSort }: MobileSortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();

  // Get visible sortable columns
  const visibleSortableColumns = useMemo(() => {
    return Object.entries(SORTABLE_COLUMNS)
      .filter(([key]) => visibleColumns.has(key) || key === 'display_label') // Panel ID always sortable
      .map(([key, label]) => ({ key, label }));
  }, [visibleColumns]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus management and keyboard handling
  useEffect(() => {
    if (!isOpen || !listRef.current) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      const options = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
      if (!options) return;

      const currentIndex = Array.from(options).findIndex(opt => opt === document.activeElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
        options[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
        options[prevIndex].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        options[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        options[options.length - 1].focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus first option
    const firstOption = listRef.current.querySelector<HTMLButtonElement>('[role="option"]');
    firstOption?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelectColumn = (column: string | null) => {
    if (column === null) {
      // Clear sort
      onSort(''); // Signal to clear
    } else {
      onSort(column);
    }
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, column: string | null) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelectColumn(column);
    }
  };

  // Get current sort display text
  const getCurrentSortText = () => {
    if (!sortState.column) return 'Sort by';
    const label = SORTABLE_COLUMNS[sortState.column] || sortState.column;
    const indicator = sortState.direction === 'asc' ? '▲' : '▼';
    return `${label} ${indicator}`;
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
  };

  const buttonStyle: CSSProperties = {
    backgroundColor: '#333',
    color: sortState.column ? '#fff' : '#888',
    border: '1px solid #555',
    borderRadius: '4px',
    padding: '8px 12px',
    fontSize: '14px',
    cursor: 'pointer',
    minHeight: '44px',
    minWidth: '100px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '8px',
    minWidth: '180px',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  };

  const optionStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#ddd',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const activeOptionStyle: CSSProperties = {
    ...optionStyle,
    backgroundColor: 'rgba(74, 144, 217, 0.2)',
    color: '#4a90d9',
  };

  return (
    <div style={containerStyle} ref={dropdownRef}>
      <button
        ref={triggerRef}
        style={buttonStyle}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={dropdownId}
        data-testid="mobile-sort-dropdown"
      >
        {getCurrentSortText()}
        <span style={{ marginLeft: 'auto' }}>▾</span>
      </button>

      {isOpen && (
        <div
          id={dropdownId}
          ref={listRef}
          style={dropdownStyle}
          role="listbox"
          aria-label="Sort options"
        >
          {/* Unsorted option */}
          <button
            role="option"
            aria-selected={!sortState.column}
            style={!sortState.column ? activeOptionStyle : optionStyle}
            onClick={() => handleSelectColumn(null)}
            onKeyDown={(e) => handleOptionKeyDown(e, null)}
          >
            Unsorted
          </button>

          {/* Column options */}
          {visibleSortableColumns.map(({ key, label }) => {
            const isActive = sortState.column === key;
            const indicator = isActive
              ? (sortState.direction === 'asc' ? '▲' : '▼')
              : '';

            return (
              <button
                key={key}
                role="option"
                aria-selected={isActive}
                style={isActive ? activeOptionStyle : optionStyle}
                onClick={() => handleSelectColumn(key)}
                onKeyDown={(e) => handleOptionKeyDown(e, key)}
              >
                {label}
                {indicator && <span>{indicator}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TileLayout({
  panels,
  visibleColumns,
  sortState,
  onSort,
  density,
  mismatchedPanels,
}: TileLayoutProps) {
  // Sort panels (FR-3.7: sort tiles according to current sort setting)
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

  // Handle sort column selection from mobile dropdown
  const handleMobileSort = (column: string) => {
    if (column === '') {
      // Clear sort - pass empty string to signal clear
      onSort('__clear__');
    } else {
      onSort(column);
    }
  };

  const containerStyle: CSSProperties = {
    padding: density === 'compact' ? '8px' : '12px',
  };

  // Empty state (FR-4.1.1)
  if (panels.length === 0) {
    const emptyStyle: CSSProperties = {
      textAlign: 'center',
      padding: '24px',
      color: '#666',
      fontSize: '14px',
    };

    return (
      <div style={containerStyle}>
        <div style={emptyStyle}>No panels available</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Mobile sort dropdown */}
      <div style={{ marginBottom: '12px' }}>
        <MobileSortDropdown
          visibleColumns={visibleColumns}
          sortState={sortState}
          onSort={handleMobileSort}
        />
      </div>

      {/* Panel tiles */}
      {sortedPanels.map(panel => {
        const isMismatched = mismatchedPanels.has(panel.display_label);
        const isTemporary = panel.is_temporary === true;
        const expectedSystem = STRING_TO_INVERTER[panel.string];
        const isWrongCca = !!(panel.actual_system && expectedSystem && panel.actual_system !== expectedSystem);

        return (
          <PanelTile
            key={panel.display_label}
            panel={panel}
            visibleColumns={visibleColumns}
            density={density}
            isMismatched={isMismatched}
            isWrongCca={isWrongCca}
            isTemporary={isTemporary}
          />
        );
      })}
    </div>
  );
}
