import { useState, useRef, useEffect, useId } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { Density } from '../../hooks/useTablePreferences';

interface ColumnDropdownProps {
  visibleColumns: Set<string>;
  onToggleColumn: (column: string) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  onPreset: (preset: 'essential' | 'all') => void;
}

// Column categories for grouping (FR-1.2)
const COLUMN_CATEGORIES = {
  identity: ['display_label', 'tigo_label', 'node_id', 'sn', 'actual_system'],
  electrical: ['voltage_in', 'voltage_out', 'current_in', 'current_out', 'watts'],
  status: ['temperature', 'duty_cycle', 'rssi', 'energy', 'is_temporary'],
};

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  electrical: 'Electrical',
  status: 'Status',
};

// Human-readable column labels
const COLUMN_LABELS: Record<string, string> = {
  display_label: 'Panel ID',
  tigo_label: 'Tigo ID',
  node_id: 'Node ID',
  sn: 'Serial Number',
  actual_system: 'CCA Source',
  voltage_in: 'Input Voltage',
  voltage_out: 'Output Voltage',
  current_in: 'Input Current',
  current_out: 'Output Current',
  watts: 'Power (Watts)',
  temperature: 'Temperature',
  duty_cycle: 'Duty Cycle',
  rssi: 'Signal (RSSI)',
  energy: 'Energy (kWh)',
  is_temporary: 'Temp ID Warning',
};

// Styles
const buttonStyle: CSSProperties = {
  backgroundColor: '#4a90d9',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  padding: '8px 16px',
  fontSize: '14px',
  cursor: 'pointer',
  minHeight: '44px',
  minWidth: '44px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const dropdownContainerStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignSelf: 'flex-end',
};

const dropdownPanelStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: '4px',
  backgroundColor: '#2a2a2a',
  border: '1px solid #444',
  borderRadius: '8px',
  padding: '16px',
  minWidth: '280px',
  maxHeight: '70vh',
  overflowY: 'auto',
  zIndex: 1000,
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
};

const categoryHeaderStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: '#888',
  textTransform: 'uppercase',
  marginBottom: '8px',
  marginTop: '12px',
};

const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 4px',
  cursor: 'pointer',
  borderRadius: '4px',
};

const checkboxStyle: CSSProperties = {
  width: '18px',
  height: '18px',
  accentColor: '#4a90d9',
  cursor: 'pointer',
};

const labelStyle: CSSProperties = {
  fontSize: '14px',
  color: '#ddd',
  cursor: 'pointer',
  flex: 1,
};

const dividerStyle: CSSProperties = {
  height: '1px',
  backgroundColor: '#444',
  margin: '12px 0',
};

const presetContainerStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  marginBottom: '12px',
};

const presetButtonStyle: CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: '13px',
  borderRadius: '4px',
  border: '1px solid #555',
  backgroundColor: '#333',
  color: '#ccc',
  cursor: 'pointer',
  minHeight: '36px',
};

const densityContainerStyle: CSSProperties = {
  marginTop: '12px',
};

const densityLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#888',
  marginBottom: '8px',
  display: 'block',
};

const densityToggleStyle: CSSProperties = {
  display: 'flex',
  borderRadius: '6px',
  overflow: 'hidden',
  border: '1px solid #444',
};

const densityOptionStyle: CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  fontSize: '13px',
  border: 'none',
  backgroundColor: '#333',
  color: '#ccc',
  cursor: 'pointer',
  textAlign: 'center',
};

const densityActiveStyle: CSSProperties = {
  backgroundColor: '#4a90d9',
  color: '#fff',
};

export function ColumnDropdown({
  visibleColumns,
  onToggleColumn,
  density,
  onDensityChange,
  onPreset,
}: ColumnDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();

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

  // Focus management and focus trapping (FR-1.7)
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;

    // Focus first interactive element when opening
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    // Focus trap handler
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Handle keyboard navigation within categories
  const handleCheckboxKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    categoryColumns: string[],
    currentIndex: number
  ) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % categoryColumns.length;
      const nextId = `checkbox-${categoryColumns[nextIndex]}`;
      document.getElementById(nextId)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + categoryColumns.length) % categoryColumns.length;
      const prevId = `checkbox-${categoryColumns[prevIndex]}`;
      document.getElementById(prevId)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      // Focus first interactive element in panel
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled])'
      );
      firstFocusable?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      // Focus last interactive element in panel
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])'
      );
      if (focusables && focusables.length > 0) {
        focusables[focusables.length - 1].focus();
      }
    }
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleDropdown();
    }
  };

  return (
    <div style={dropdownContainerStyle} ref={dropdownRef}>
      <button
        ref={triggerRef}
        style={buttonStyle}
        onClick={toggleDropdown}
        onKeyDown={handleTriggerKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={dropdownId}
        data-testid="columns-button"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
        </svg>
        Columns
      </button>

      {isOpen && (
        <div
          id={dropdownId}
          ref={panelRef}
          style={dropdownPanelStyle}
          role="dialog"
          aria-label="Column visibility settings"
        >
          {/* Preset buttons */}
          <div style={presetContainerStyle}>
            <button
              style={presetButtonStyle}
              onClick={() => onPreset('essential')}
              data-testid="preset-essential"
            >
              Essential
            </button>
            <button
              style={presetButtonStyle}
              onClick={() => onPreset('all')}
              data-testid="preset-all"
            >
              All
            </button>
          </div>

          <div style={dividerStyle} />

          {/* Column categories */}
          {Object.entries(COLUMN_CATEGORIES).map(([category, columns], categoryIndex) => (
            <div key={category}>
              {categoryIndex > 0 && <div style={dividerStyle} />}
              <div style={{ ...categoryHeaderStyle, marginTop: categoryIndex === 0 ? 0 : '12px' }}>
                {CATEGORY_LABELS[category]}
              </div>
              {columns.map((column, columnIndex) => (
                <label
                  key={column}
                  style={{
                    ...checkboxRowStyle,
                    backgroundColor: visibleColumns.has(column) ? 'rgba(74, 144, 217, 0.1)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    id={`checkbox-${column}`}
                    checked={visibleColumns.has(column)}
                    onChange={() => onToggleColumn(column)}
                    onKeyDown={(e) => handleCheckboxKeyDown(e, columns, columnIndex)}
                    style={checkboxStyle}
                    data-testid={`col-checkbox-${column}`}
                  />
                  <span style={labelStyle}>{COLUMN_LABELS[column]}</span>
                </label>
              ))}
            </div>
          ))}

          <div style={dividerStyle} />

          {/* Density toggle (FR-1.5) */}
          <div style={densityContainerStyle}>
            <span style={densityLabelStyle}>View Density</span>
            <div style={densityToggleStyle}>
              <button
                style={{
                  ...densityOptionStyle,
                  ...(density === 'compact' ? densityActiveStyle : {}),
                  borderRight: '1px solid #444',
                }}
                onClick={() => onDensityChange('compact')}
                data-testid="density-compact"
              >
                Compact
              </button>
              <button
                style={{
                  ...densityOptionStyle,
                  ...(density === 'standard' ? densityActiveStyle : {}),
                }}
                onClick={() => onDensityChange('standard')}
                data-testid="density-standard"
              >
                Standard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
