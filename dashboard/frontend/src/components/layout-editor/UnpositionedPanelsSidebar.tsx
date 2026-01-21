/**
 * Sidebar showing panels that need positioning.
 */

import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Filter, LayoutGrid } from 'lucide-react';
import type { EditorPanel } from './types';
import { UnpositionedPanel } from './DraggablePanel';

interface UnpositionedPanelsSidebarProps {
  panels: EditorPanel[];
  selectedPanels: Set<string>;
  onPanelClick: (serial: string, addToSelection: boolean) => void;
  onAutoArrange: () => void;
}

const sidebarStyle = (collapsed: boolean): CSSProperties => ({
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: collapsed ? '40px' : '220px',
  backgroundColor: '#1a1a1a',
  borderLeft: '1px solid #333',
  display: 'flex',
  flexDirection: 'column',
  transition: 'width 0.2s ease',
  zIndex: 100,
});

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px',
  borderBottom: '1px solid #333',
};

const titleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const toggleButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: '#aaa',
  cursor: 'pointer',
};

const filterContainerStyle: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #333',
};

const selectStyle: CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  backgroundColor: '#333',
  color: '#fff',
  border: '1px solid #444',
  borderRadius: '4px',
  cursor: 'pointer',
};

const panelListStyle: CSSProperties = {
  flexGrow: 1,
  overflowY: 'auto',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const countBadgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '20px',
  height: '20px',
  padding: '0 6px',
  fontSize: '11px',
  fontWeight: 600,
  backgroundColor: '#4a90d9',
  color: '#fff',
  borderRadius: '10px',
};

const emptyStyle: CSSProperties = {
  padding: '20px',
  textAlign: 'center',
  color: '#888',
  fontSize: '13px',
};

const autoArrangeButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  margin: '8px',
  fontSize: '12px',
  fontWeight: 500,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#333',
  color: '#fff',
  cursor: 'pointer',
};

export function UnpositionedPanelsSidebar({
  panels,
  selectedPanels,
  onPanelClick,
  onAutoArrange,
}: UnpositionedPanelsSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [filterString, setFilterString] = useState<string>('all');

  // Get unique strings for filter dropdown
  const strings = useMemo(() => {
    const uniqueStrings = new Set(panels.map(p => p.string));
    return Array.from(uniqueStrings).sort();
  }, [panels]);

  // Filter panels by selected string
  const filteredPanels = useMemo(() => {
    if (filterString === 'all') return panels;
    return panels.filter(p => p.string === filterString);
  }, [panels, filterString]);

  if (panels.length === 0) {
    return null;
  }

  if (collapsed) {
    return (
      <div style={sidebarStyle(true)}>
        <button
          style={{
            ...toggleButtonStyle,
            margin: '8px auto',
          }}
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
        >
          <ChevronLeft size={18} />
        </button>
        <div
          style={{
            ...countBadgeStyle,
            margin: '0 auto',
          }}
          title={`${panels.length} panels need positioning`}
        >
          {panels.length}
        </div>
      </div>
    );
  }

  return (
    <div style={sidebarStyle(false)}>
      <div style={headerStyle}>
        <div style={titleStyle}>
          <span>Panels to Position</span>
          <span style={countBadgeStyle}>{panels.length}</span>
        </div>
        <button
          style={toggleButtonStyle}
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {strings.length > 1 && (
        <div style={filterContainerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Filter size={12} color="#888" />
            <span style={{ fontSize: '11px', color: '#888' }}>Filter by string</span>
          </div>
          <select
            style={selectStyle}
            value={filterString}
            onChange={(e) => setFilterString(e.target.value)}
          >
            <option value="all">All strings</option>
            {strings.map(s => (
              <option key={s} value={s}>String {s}</option>
            ))}
          </select>
        </div>
      )}

      <div style={panelListStyle}>
        {filteredPanels.length === 0 ? (
          <div style={emptyStyle}>
            No panels to position
            {filterString !== 'all' && ' for this string'}
          </div>
        ) : (
          filteredPanels.map(panel => (
            <UnpositionedPanel
              key={panel.serial}
              panel={panel}
              isSelected={selectedPanels.has(panel.serial)}
              onClick={onPanelClick}
            />
          ))
        )}
      </div>

      <button
        style={autoArrangeButtonStyle}
        onClick={onAutoArrange}
        title="Auto-arrange all unpositioned panels"
      >
        <LayoutGrid size={14} />
        Place All in Grid
      </button>
    </div>
  );
}
