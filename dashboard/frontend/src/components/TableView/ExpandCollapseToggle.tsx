import type { CSSProperties } from 'react';

interface ExpandCollapseToggleProps {
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  isMobile: boolean;
}

const segmentedContainerStyle: CSSProperties = {
  display: 'flex',
  borderRadius: '6px',
  overflow: 'hidden',
  border: '1px solid #444',
  boxSizing: 'border-box',
  alignSelf: 'flex-end',
};

const segmentButtonStyle: CSSProperties = {
  padding: '8px 12px',
  border: 'none',
  background: '#333',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '14px',
  minHeight: '44px',
  minWidth: '44px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const activeSegmentStyle: CSSProperties = {
  background: '#4a90d9',
  color: '#fff',
};

export function ExpandCollapseToggle({
  allExpanded,
  onExpandAll,
  onCollapseAll,
  isMobile,
}: ExpandCollapseToggleProps) {
  return (
    <div style={segmentedContainerStyle} role="group" aria-label="Expand or collapse all strings">
      <button
        style={{
          ...segmentButtonStyle,
          ...(allExpanded ? activeSegmentStyle : {}),
          borderRight: '1px solid #444',
        }}
        onClick={onExpandAll}
        title="Expand all strings"
        aria-pressed={allExpanded}
      >
        {isMobile ? '▼▼' : 'Expand'}
      </button>
      <button
        style={{
          ...segmentButtonStyle,
          ...(!allExpanded ? activeSegmentStyle : {}),
        }}
        onClick={onCollapseAll}
        title="Collapse all strings"
        aria-pressed={!allExpanded}
      >
        {isMobile ? '▲▲' : 'Collapse'}
      </button>
    </div>
  );
}
