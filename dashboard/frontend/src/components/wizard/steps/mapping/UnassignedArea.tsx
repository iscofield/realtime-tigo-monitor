/**
 * Unassigned panels area component.
 * Shows panels that need to be mapped to slots in a horizontal layout.
 * Also serves as a drop zone to remove assignments.
 */

import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { DiscoveredPanel } from '../../../../types/config';
import {
  unassignedAreaStyle,
  unassignedHeaderStyle,
  unassignedPanelsGridStyle,
  compactPanelCardStyle,
  unassignedDropZoneStyle,
  unassignedDropZoneActiveStyle,
  resetButtonStyle,
} from './MappingStyles';

interface UnassignedAreaProps {
  panels: DiscoveredPanel[];
  onReset?: () => void;
}

/** Compact draggable panel for horizontal layout */
function CompactDraggablePanel({ panel }: { panel: DiscoveredPanel }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: panel.tigo_label,
    data: {
      panel,
      fromUnassigned: true,
    },
  });

  const style = {
    ...compactPanelCardStyle,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <span style={{ fontWeight: 600, color: '#333' }}>{panel.tigo_label}</span>
      <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '10px' }}>
        {panel.serial.slice(-6)}
      </span>
    </div>
  );
}

export function UnassignedArea({ panels, onReset }: UnassignedAreaProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'unassigned',
    data: { isUnassignedArea: true },
  });

  const dropZoneStyle = {
    ...(isOver ? unassignedDropZoneActiveStyle : unassignedDropZoneStyle),
    marginTop: 0,
    padding: '12px',
  };

  return (
    <div style={unassignedAreaStyle}>
      <div style={unassignedHeaderStyle}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
          Unassigned Panels ({panels.length})
        </div>
        {onReset && (
          <button type="button" onClick={onReset} style={resetButtonStyle}>
            Reset All
          </button>
        )}
      </div>

      {panels.length > 0 ? (
        <div style={unassignedPanelsGridStyle}>
          {panels.map(panel => (
            <CompactDraggablePanel key={panel.serial} panel={panel} />
          ))}
        </div>
      ) : (
        <div style={{ color: '#666', fontSize: '13px', padding: '8px 0' }}>
          All panels are assigned!
        </div>
      )}

      <div ref={setNodeRef} style={dropZoneStyle}>
        {isOver ? 'Drop here to unassign' : 'Drag panels here to unassign'}
      </div>
    </div>
  );
}
