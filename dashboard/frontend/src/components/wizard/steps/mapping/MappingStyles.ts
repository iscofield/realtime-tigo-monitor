/**
 * Shared styles for the panel mapping interface.
 */

import type { CSSProperties } from 'react';

// Container for the single-column layout
export const mappingContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};

// Unassigned panels area (horizontal, at top)
export const unassignedAreaStyle: CSSProperties = {
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  padding: '12px 16px',
};

// Unassigned panels header row
export const unassignedHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
};

// Unassigned panels grid (horizontal)
export const unassignedPanelsGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginBottom: '12px',
};

// Compact panel card for horizontal layout
export const compactPanelCardStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
  cursor: 'grab',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  transition: 'all 0.15s ease',
  fontSize: '12px',
};

// Topology section (full width, natural height)
export const topologySectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

// Content area within topology section (no scroll, natural height)
export const topologyScrollAreaStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

// Legacy: Right column - unassigned panels (kept for backwards compatibility)
export const unassignedColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  padding: '16px',
  overflowY: 'auto',
};

// Column header
export const columnHeaderStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#333',
  marginBottom: '8px',
  padding: '8px 0',
  borderBottom: '2px solid #e0e0e0',
};

// CCA section container
export const ccaSectionStyle: CSSProperties = {
  backgroundColor: '#fafafa',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
};

// CCA header
export const ccaHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  backgroundColor: '#f0f0f0',
  cursor: 'pointer',
  userSelect: 'none',
};

// CCA content (strings)
export const ccaContentStyle: CSSProperties = {
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

// String group container
export const stringGroupStyle: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e8e8e8',
  overflow: 'hidden',
};

// String header (collapsible)
export const stringHeaderStyle = (hasIssues: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: hasIssues ? '#fff8e1' : '#f5f5f5',
  cursor: 'pointer',
  userSelect: 'none',
  fontSize: '13px',
});

// String content (slots grid)
export const stringContentStyle: CSSProperties = {
  padding: '12px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
};

// Slot base style
export const slotBaseStyle: CSSProperties = {
  width: '80px',
  height: '60px',
  borderRadius: '6px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  transition: 'all 0.15s ease',
  cursor: 'grab',
};

// Empty slot style
export const emptySlotStyle: CSSProperties = {
  ...slotBaseStyle,
  border: '2px dashed #ccc',
  backgroundColor: '#fafafa',
  color: '#999',
};

// Auto-matched slot style (green)
export const matchedSlotStyle: CSSProperties = {
  ...slotBaseStyle,
  border: '2px solid #4caf50',
  backgroundColor: '#e8f5e9',
  color: '#2e7d32',
};

// User-mapped slot style (yellow/orange)
export const translatedSlotStyle: CSSProperties = {
  ...slotBaseStyle,
  border: '2px solid #ff9800',
  backgroundColor: '#fff3e0',
  color: '#e65100',
};

// Excess panel slot style (red/warning - not draggable)
export const excessSlotStyle: CSSProperties = {
  ...slotBaseStyle,
  border: '2px solid #f44336',
  backgroundColor: '#ffebee',
  color: '#c62828',
  cursor: 'not-allowed',
  opacity: 0.85,
};

// Slot being dragged over
export const slotDragOverStyle: CSSProperties = {
  border: '2px solid #2196f3',
  backgroundColor: '#e3f2fd',
  transform: 'scale(1.05)',
};

// Draggable panel card
export const panelCardStyle: CSSProperties = {
  padding: '10px 12px',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
  cursor: 'grab',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  transition: 'all 0.15s ease',
};

// Panel card being dragged
export const panelCardDraggingStyle: CSSProperties = {
  ...panelCardStyle,
  opacity: 0.8,
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  transform: 'rotate(2deg)',
};

// Drag overlay style (follows cursor)
export const dragOverlayStyle: CSSProperties = {
  padding: '8px 12px',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '2px solid #2196f3',
  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '12px',
  cursor: 'grabbing',
};

// Panel label in card
export const panelLabelStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: '14px',
  color: '#333',
};

// Panel serial in card
export const panelSerialStyle: CSSProperties = {
  fontSize: '11px',
  color: '#666',
  fontFamily: 'monospace',
};

// Summary bar
export const summaryBarStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '24px',
  padding: '16px',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  marginBottom: '16px',
};

// Summary stat
export const summaryStatStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

// Summary stat value
export const summaryValueStyle = (color: string): CSSProperties => ({
  fontSize: '24px',
  fontWeight: 600,
  color,
});

// Summary stat label
export const summaryLabelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
};

// Legend bar
export const legendBarStyle: CSSProperties = {
  display: 'flex',
  gap: '16px',
  padding: '8px 16px',
  backgroundColor: '#f0f0f0',
  borderRadius: '6px',
  fontSize: '12px',
  color: '#666',
  marginTop: '16px',
};

// Legend item
export const legendItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

// Navigation buttons
export const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '24px',
};

export const primaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#1976d2',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

export const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: 'white',
  color: '#333',
  border: '1px solid #ccc',
};

// Reset/danger button style
export const resetButtonStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  backgroundColor: 'white',
  color: '#d32f2f',
  border: '1px solid #d32f2f',
  borderRadius: '4px',
  cursor: 'pointer',
};

// Unassigned drop zone
export const unassignedDropZoneStyle: CSSProperties = {
  marginTop: 'auto',
  padding: '16px',
  border: '2px dashed #ccc',
  borderRadius: '8px',
  textAlign: 'center',
  color: '#999',
  fontSize: '13px',
};

// Unassigned drop zone when active
export const unassignedDropZoneActiveStyle: CSSProperties = {
  ...unassignedDropZoneStyle,
  border: '2px dashed #2196f3',
  backgroundColor: '#e3f2fd',
  color: '#1976d2',
};
