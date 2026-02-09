import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useLogWebSocket, type LogEntry } from '../hooks/useLogWebSocket';

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return '---------- --:--:--.---';
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${y}-${mo}-${d} ${h}:${m}:${s}.${ms}`;
  } catch {
    return '---------- --:--:--.---';
  }
}

const LEVEL_COLORS: Record<string, string> = {
  debug: '#569CD6',
  info: '#6A9955',
  warning: '#D7BA7D',
  error: '#F44747',
  critical: '#F44747',
};

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#1e1e1e',
  color: '#d4d4d4',
};

const subTabsStyle: CSSProperties = {
  display: 'flex',
  backgroundColor: '#2d2d2d',
  borderBottom: '1px solid #444',
  flexShrink: 0,
};

const subTabStyle = (active: boolean): CSSProperties => ({
  padding: '8px 16px',
  backgroundColor: active ? '#3c3c3c' : 'transparent',
  color: active ? '#fff' : '#aaa',
  border: 'none',
  borderBottom: active ? '2px solid #4CAF50' : '2px solid transparent',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 500,
});

const searchBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: '#252526',
  borderBottom: '1px solid #444',
  gap: '8px',
  flexShrink: 0,
};

const searchInputStyle: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  backgroundColor: '#3c3c3c',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#d4d4d4',
  fontSize: '13px',
  outline: 'none',
};

const clearButtonStyle: CSSProperties = {
  padding: '4px 8px',
  backgroundColor: 'transparent',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#aaa',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1,
};

const levelSelectStyle: CSSProperties = {
  padding: '5px 8px',
  backgroundColor: '#3c3c3c',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#d4d4d4',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
};

const countStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: '12px',
  color: '#888',
  backgroundColor: '#252526',
  borderBottom: '1px solid #333',
  flexShrink: 0,
};

const logContainerStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: '12px',
  lineHeight: '1.5',
  padding: '4px 0',
  position: 'relative',
};

const logEntryStyle: CSSProperties = {
  padding: '1px 12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const timestampStyle: CSSProperties = {
  color: '#6A9955',
  marginRight: '8px',
  userSelect: 'none',
};

const levelBadgeBaseStyle: CSSProperties = {
  display: 'inline-block',
  fontSize: '10px',
  fontWeight: 600,
  padding: '0 4px',
  borderRadius: '3px',
  marginRight: '6px',
  textTransform: 'uppercase',
  lineHeight: '16px',
  verticalAlign: 'middle',
};

const emptyStateStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#888',
  fontSize: '14px',
  padding: '20px',
  textAlign: 'center',
};

const disconnectedStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#5c2020',
  color: '#f0a0a0',
  fontSize: '12px',
  textAlign: 'center',
  flexShrink: 0,
};

const newEntriesBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: '8px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '4px 12px',
  backgroundColor: '#4CAF50',
  color: '#fff',
  borderRadius: '12px',
  fontSize: '12px',
  cursor: 'pointer',
  zIndex: 10,
  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
};

const filterBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 12px',
  backgroundColor: '#252526',
  borderBottom: '1px solid #333',
  gap: '12px',
  flexShrink: 0,
  fontSize: '12px',
  flexWrap: 'wrap',
};

const filterCheckboxStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  color: '#aaa',
  cursor: 'pointer',
  userSelect: 'none',
};

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLORS[level] || LEVEL_COLORS.info;
  return (
    <span
      style={{
        ...levelBadgeBaseStyle,
        color,
        border: `1px solid ${color}40`,
        backgroundColor: `${color}15`,
      }}
    >
      {level}
    </span>
  );
}

function LogViewer() {
  const [logLevel, setLogLevel] = useState<'info' | 'debug'>('info');
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set());
  const [categoriesInitialized, setCategoriesInitialized] = useState(false);

  const { logsBySystem, systems, status, hasDebug, totalBySystem, loadingOlder, hasOlderBySystem, fetchOlderLogs, categories } = useLogWebSocket(logLevel, excludedCategories);
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newEntryCount, setNewEntryCount] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isAtNewestRef = useRef(true);

  // Initialize excluded categories from server-provided defaults (once)
  useEffect(() => {
    if (!categoriesInitialized && Object.keys(categories).length > 0) {
      const defaultExcluded = new Set(
        Object.entries(categories)
          .filter(([, v]) => !v.default)
          .map(([k]) => k)
      );
      setExcludedCategories(defaultExcluded);
      setCategoriesInitialized(true);
    }
  }, [categories, categoriesInitialized]);

  // Show dropdown if any system has debug entries
  const showLevelDropdown = useMemo(
    () => Object.values(hasDebug).some(Boolean),
    [hasDebug]
  );

  // Set active system when systems become available
  useEffect(() => {
    if (systems.length > 0 && (activeSystem === null || !systems.includes(activeSystem))) {
      setActiveSystem(systems[0]);
    }
  }, [systems, activeSystem]);

  const currentSystem = activeSystem || systems[0] || null;
  const entries = currentSystem ? (logsBySystem[currentSystem] || []) : [];

  // Filter entries by search
  const searchLower = search.toLowerCase();
  const filtered = search
    ? entries.filter((e: LogEntry) => e.line.toLowerCase().includes(searchLower))
    : entries;

  // Memoize reversed array
  const reversedFiltered = useMemo(() => [...filtered].reverse(), [filtered]);

  const toggleCategory = useCallback((id: string) => {
    setExcludedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Track scroll position for "new entries" badge and lazy loading
  const handleScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    // scrollTop=0 means we're at the top (newest entries)
    isAtNewestRef.current = el.scrollTop <= 1;
    if (isAtNewestRef.current) {
      setNewEntryCount(0);
    }
    // Detect scroll near bottom (oldest entries) for lazy loading
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom && currentSystem && hasOlderBySystem[currentSystem] && !loadingOlder) {
      fetchOlderLogs(currentSystem);
    }
  }, [currentSystem, hasOlderBySystem, loadingOlder, fetchOlderLogs]);

  // Track new entries when scrolled away
  const prevEntryCountRef = useRef(entries.length);
  useEffect(() => {
    const diff = entries.length - prevEntryCountRef.current;
    prevEntryCountRef.current = entries.length;
    if (diff > 0 && !isAtNewestRef.current) {
      setNewEntryCount((prev) => prev + diff);
    }
  }, [entries.length]);

  // Reset new entry count when switching systems
  useEffect(() => {
    setNewEntryCount(0);
    prevEntryCountRef.current = entries.length;
  }, [currentSystem]);

  const scrollToNewest = useCallback(() => {
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = 0;
      setNewEntryCount(0);
    }
  }, []);

  const hasMultipleSystems = systems.length > 1;
  const totalEntries = entries.length;
  const filteredCount = filtered.length;
  const hasEntries = totalEntries > 0;
  const showCategoryFilters = logLevel === 'debug' && Object.keys(categories).length > 0;

  return (
    <div style={containerStyle}>
      {status === 'disconnected' || status === 'error' ? (
        <div style={disconnectedStyle}>
          Disconnected — reconnecting...
        </div>
      ) : null}

      {hasMultipleSystems && (
        <div style={subTabsStyle} role="tablist" aria-label="CCA system tabs">
          {systems.map((sys) => (
            <button
              key={sys}
              role="tab"
              aria-selected={sys === currentSystem}
              onClick={() => setActiveSystem(sys)}
              style={subTabStyle(sys === currentSystem)}
            >
              {sys.charAt(0).toUpperCase() + sys.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div style={searchBarStyle}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search logs (MAC, serial, node ID...)"
          aria-label="Search logs"
          style={searchInputStyle}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            style={clearButtonStyle}
          >
            X
          </button>
        )}
        {showLevelDropdown && (
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value as 'info' | 'debug')}
            aria-label="Log level filter"
            style={levelSelectStyle}
          >
            <option value="info">Info+</option>
            <option value="debug">Debug</option>
          </select>
        )}
      </div>

      {showCategoryFilters && (
        <div style={filterBarStyle}>
          {Object.entries(categories).map(([id, { label }]) => (
            <label key={id} style={filterCheckboxStyle}>
              <input
                type="checkbox"
                checked={!excludedCategories.has(id)}
                onChange={() => toggleCategory(id)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {hasEntries && (
        <div style={countStyle} aria-live="polite">
          {search
            ? `Showing ${filteredCount} of ${totalEntries} entries`
            : currentSystem && totalBySystem[currentSystem] && totalBySystem[currentSystem] > totalEntries
              ? `${totalEntries} of ${totalBySystem[currentSystem]} entries`
              : `${totalEntries} entries`}
        </div>
      )}

      {!hasEntries ? (
        <div style={emptyStateStyle}>
          No log data available. Connect to live CCA devices to see logs.
        </div>
      ) : (
        <div
          ref={logContainerRef}
          style={logContainerStyle}
          role="log"
          aria-live="polite"
          onScroll={handleScroll}
        >
          {newEntryCount > 0 && (
            <div style={newEntriesBadgeStyle} onClick={scrollToNewest}>
              {newEntryCount} new {newEntryCount === 1 ? 'entry' : 'entries'}
            </div>
          )}
          {/* Reverse so newest entries render at the top */}
          {reversedFiltered.map((entry: LogEntry) => (
            <div key={entry.seq} style={logEntryStyle}>
              <span
                style={timestampStyle}
                title={entry.ts}
              >
                {formatTimestamp(entry.ts)}
              </span>
              <LevelBadge level={entry.level || 'info'} />
              {entry.line}
            </div>
          ))}
          {loadingOlder && (
            <div style={{ textAlign: 'center', padding: '8px', color: '#888', fontSize: '12px' }}>
              Loading older entries...
            </div>
          )}
          {currentSystem && !loadingOlder && hasOlderBySystem[currentSystem] === false && entries.length > 0 && (
            <div style={{ textAlign: 'center', padding: '8px', color: '#555', fontSize: '11px' }}>
              All entries loaded
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LogViewer;
