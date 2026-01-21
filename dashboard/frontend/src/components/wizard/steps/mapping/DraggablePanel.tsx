/**
 * Draggable panel card component.
 * Can be dragged from unassigned area or from a slot.
 */

import { useDraggable } from '@dnd-kit/core';
import type { DiscoveredPanel } from '../../../../types/config';
import {
  panelCardStyle,
  panelCardDraggingStyle,
  panelLabelStyle,
  panelSerialStyle,
} from './MappingStyles';

interface DraggablePanelProps {
  panel: DiscoveredPanel;
  /** Display label (may differ from tigo_label if translated) */
  displayLabel?: string;
  /** Whether this is in a matched slot (show as "fine") */
  isMatched?: boolean;
  /** Whether this was user-translated */
  isTranslated?: boolean;
}

export function DraggablePanel({
  panel,
  displayLabel,
  isMatched,
  isTranslated,
}: DraggablePanelProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: panel.tigo_label,
    data: {
      panel,
      displayLabel: displayLabel || panel.tigo_label,
      isMatched,
      isTranslated,
    },
  });

  const style = {
    ...(isDragging ? panelCardDraggingStyle : panelCardStyle),
    ...(isDragging ? { opacity: 0.5 } : {}),
  };

  // Abbreviated serial (show first 4 and last 4 chars)
  const shortSerial = panel.serial.length > 10
    ? `${panel.serial.slice(0, 4)}...${panel.serial.slice(-4)}`
    : panel.serial;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <div style={panelLabelStyle}>
        {displayLabel || panel.tigo_label}
        {isMatched && !isTranslated && (
          <span style={{ marginLeft: '6px', color: '#4caf50' }}>&#10003;</span>
        )}
        {isTranslated && (
          <span style={{ marginLeft: '6px', color: '#ff9800' }}>&#9679;</span>
        )}
      </div>
      <div style={panelSerialStyle}>{shortSerial}</div>
      <div style={{ fontSize: '11px', color: '#999' }}>
        {panel.watts}W
      </div>
    </div>
  );
}
