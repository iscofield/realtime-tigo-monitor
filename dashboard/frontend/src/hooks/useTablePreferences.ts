import { useState, useEffect, useCallback } from 'react';

// Column definitions
export const ALL_COLUMNS = new Set([
  'display_label', 'tigo_label', 'node_id', 'sn', 'actual_system',
  'voltage_in', 'voltage_out', 'current_in', 'current_out',
  'watts', 'temperature', 'duty_cycle', 'rssi', 'energy', 'is_temporary'
]);

export const DEFAULT_COLUMNS = new Set([
  'display_label', 'voltage_in', 'current_in', 'watts', 'actual_system', 'is_temporary'
]);

// Storage keys
const STORAGE_KEYS = {
  columns: 'tableColumns',
  density: 'tableDensity',
  sort: 'tableSort',
  collapsed: 'collapsedStrings',
  threshold: 'mismatchThreshold',
  version: 'tablePrefsVersion',
};

// Valid values
export const VALID_THRESHOLDS = [5, 10, 15, 20, 30];
export const DEFAULT_THRESHOLD = 30;
const CURRENT_VERSION = '1';

export type Density = 'compact' | 'standard';
export type SortDirection = 'asc' | 'desc' | null;

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

export interface TablePreferences {
  visibleColumns: Set<string>;
  density: Density;
  sortState: SortState;
  collapsedStrings: Set<string>;
  mismatchThreshold: number;
}

interface TablePreferencesActions {
  setVisibleColumns: (columns: Set<string>) => void;
  toggleColumn: (column: string) => void;
  setPreset: (preset: 'essential' | 'all') => void;
  setDensity: (density: Density) => void;
  setSortState: (state: SortState) => void;
  cycleSortColumn: (column: string) => void;
  toggleStringCollapse: (stringId: string) => void;
  collapseAll: (allStringIds: string[]) => void;
  expandAll: () => void;
  setMismatchThreshold: (threshold: number) => void;
}

// Helper to safely read from localStorage
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Helper to safely write to localStorage
function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (private browsing, quota exceeded)
  }
}

// Initialize columns from localStorage with validation
function initColumns(): Set<string> {
  const saved = safeGetItem(STORAGE_KEYS.columns);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Filter out invalid column keys silently
        const validColumns = parsed.filter(col => ALL_COLUMNS.has(col));
        if (validColumns.length > 0) {
          return new Set(validColumns);
        }
      }
    } catch {
      // Malformed JSON
    }
  }
  return new Set(DEFAULT_COLUMNS);
}

// Initialize density from localStorage
function initDensity(): Density {
  const saved = safeGetItem(STORAGE_KEYS.density);
  if (saved === 'compact' || saved === 'standard') {
    return saved;
  }
  return 'compact'; // Default
}

// Initialize sort state from localStorage
function initSortState(): SortState {
  const saved = safeGetItem(STORAGE_KEYS.sort);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed.column === null || (typeof parsed.column === 'string' && ALL_COLUMNS.has(parsed.column))) &&
        (parsed.direction === null || parsed.direction === 'asc' || parsed.direction === 'desc')
      ) {
        return {
          column: parsed.column,
          direction: parsed.direction,
        };
      }
    } catch {
      // Malformed JSON
    }
  }
  return { column: null, direction: null };
}

// Initialize collapsed strings from localStorage
function initCollapsedStrings(): Set<string> {
  const saved = safeGetItem(STORAGE_KEYS.collapsed);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    } catch {
      // Malformed JSON
    }
  }
  return new Set();
}

// Initialize threshold from localStorage
function initThreshold(): number {
  const saved = safeGetItem(STORAGE_KEYS.threshold);
  if (saved) {
    const parsed = parseInt(saved, 10);
    if (VALID_THRESHOLDS.includes(parsed)) {
      return parsed;
    }
  }
  return DEFAULT_THRESHOLD;
}

// Cycle sort direction: null -> asc -> desc -> null
export function cycleSortDirection(current: SortDirection): SortDirection {
  if (current === null) return 'asc';
  if (current === 'asc') return 'desc';
  return null;
}

export function useTablePreferences(): [TablePreferences, TablePreferencesActions] {
  const [visibleColumns, setVisibleColumnsState] = useState<Set<string>>(initColumns);
  const [density, setDensityState] = useState<Density>(initDensity);
  const [sortState, setSortStateState] = useState<SortState>(initSortState);
  const [collapsedStrings, setCollapsedStringsState] = useState<Set<string>>(initCollapsedStrings);
  const [mismatchThreshold, setMismatchThresholdState] = useState<number>(initThreshold);

  // Persist version
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.version, CURRENT_VERSION);
  }, []);

  // Persist columns
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.columns, JSON.stringify([...visibleColumns]));
  }, [visibleColumns]);

  // Persist density
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.density, density);
  }, [density]);

  // Persist sort state
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.sort, JSON.stringify(sortState));
  }, [sortState]);

  // Persist collapsed strings
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.collapsed, JSON.stringify([...collapsedStrings]));
  }, [collapsedStrings]);

  // Persist threshold
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.threshold, mismatchThreshold.toString());
  }, [mismatchThreshold]);

  // Actions
  const setVisibleColumns = useCallback((columns: Set<string>) => {
    setVisibleColumnsState(columns);
    // Clear sort if sorted column is hidden (FR-3.4)
    setSortStateState(prev => {
      if (prev.column && !columns.has(prev.column)) {
        return { column: null, direction: null };
      }
      return prev;
    });
  }, []);

  const toggleColumn = useCallback((column: string) => {
    setVisibleColumnsState(prev => {
      const next = new Set(prev);
      if (next.has(column)) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
    // Clear sort if the toggled column is being hidden
    setSortStateState(prev => {
      if (prev.column === column) {
        // Check if the column will be hidden after toggle
        setVisibleColumnsState(cols => {
          if (!cols.has(column)) {
            // Column was just hidden
            setSortStateState({ column: null, direction: null });
          }
          return cols;
        });
      }
      return prev;
    });
  }, []);

  const setPreset = useCallback((preset: 'essential' | 'all') => {
    const newColumns = preset === 'all' ? new Set(ALL_COLUMNS) : new Set(DEFAULT_COLUMNS);
    setVisibleColumnsState(newColumns);
    // Clear sort if sorted column is not in preset
    setSortStateState(prev => {
      if (prev.column && !newColumns.has(prev.column)) {
        return { column: null, direction: null };
      }
      return prev;
    });
  }, []);

  const setDensity = useCallback((newDensity: Density) => {
    setDensityState(newDensity);
  }, []);

  const setSortState = useCallback((state: SortState) => {
    setSortStateState(state);
  }, []);

  const cycleSortColumn = useCallback((column: string) => {
    setSortStateState(prev => {
      if (prev.column === column) {
        const newDirection = cycleSortDirection(prev.direction);
        if (newDirection === null) {
          return { column: null, direction: null };
        }
        return { column, direction: newDirection };
      }
      // Clicking a new column starts with ascending
      return { column, direction: 'asc' };
    });
  }, []);

  const toggleStringCollapse = useCallback((stringId: string) => {
    setCollapsedStringsState(prev => {
      const next = new Set(prev);
      if (next.has(stringId)) {
        next.delete(stringId);
      } else {
        next.add(stringId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback((allStringIds: string[]) => {
    setCollapsedStringsState(new Set(allStringIds));
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedStringsState(new Set());
  }, []);

  const setMismatchThreshold = useCallback((threshold: number) => {
    if (VALID_THRESHOLDS.includes(threshold)) {
      setMismatchThresholdState(threshold);
    }
  }, []);

  const preferences: TablePreferences = {
    visibleColumns,
    density,
    sortState,
    collapsedStrings,
    mismatchThreshold,
  };

  const actions: TablePreferencesActions = {
    setVisibleColumns,
    toggleColumn,
    setPreset,
    setDensity,
    setSortState,
    cycleSortColumn,
    toggleStringCollapse,
    collapseAll,
    expandAll,
    setMismatchThreshold,
  };

  return [preferences, actions];
}
