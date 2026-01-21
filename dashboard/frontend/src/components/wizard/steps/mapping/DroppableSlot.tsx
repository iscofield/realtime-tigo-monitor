/**
 * Droppable slot component.
 * Represents an expected panel position that can accept dropped panels.
 */

import { useDroppable, useDraggable } from '@dnd-kit/core';
import type { DiscoveredPanel } from '../../../../types/config';
import {
  emptySlotStyle,
  matchedSlotStyle,
  translatedSlotStyle,
  slotDragOverStyle,
} from './MappingStyles';

interface DroppableSlotProps {
  /** The expected label for this slot (e.g., "A1", "C9") */
  slotLabel: string;
  /** Panel assigned to this slot (if any) */
  assignedPanel?: DiscoveredPanel | null;
  /** Whether the assignment is from a translation (user-mapped) */
  isTranslation?: boolean;
  /** Callback to remove a panel from this slot */
  onRemove?: (tigoLabel: string) => void;
}

export function DroppableSlot({
  slotLabel,
  assignedPanel,
  isTranslation,
  onRemove,
}: DroppableSlotProps) {
  // Make the slot droppable
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: slotLabel,
    data: {
      slotLabel,
      hasPanel: !!assignedPanel,
    },
  });

  // If there's an assigned panel, make it draggable from this slot
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: assignedPanel?.tigo_label || `empty-${slotLabel}`,
    disabled: !assignedPanel,
    data: {
      panel: assignedPanel,
      fromSlot: slotLabel,
      isMatched: assignedPanel && !isTranslation,
      isTranslated: isTranslation,
    },
  });

  // Compute styles based on state
  let baseStyle = emptySlotStyle;
  if (assignedPanel) {
    baseStyle = isTranslation ? translatedSlotStyle : matchedSlotStyle;
  }

  const style = {
    ...baseStyle,
    ...(isOver ? slotDragOverStyle : {}),
    ...(isDragging ? { opacity: 0.5 } : {}),
    cursor: assignedPanel ? 'grab' : 'default',
  };

  // Abbreviated serial
  const shortSerial = assignedPanel
    ? (assignedPanel.serial.length > 8
        ? `${assignedPanel.serial.slice(-6)}`
        : assignedPanel.serial)
    : null;

  // Combine refs
  const setRefs = (el: HTMLDivElement | null) => {
    setDropRef(el);
    if (assignedPanel) {
      setDragRef(el);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent drag from starting
    if (onRemove && assignedPanel) {
      onRemove(assignedPanel.tigo_label);
    }
  };

  return (
    <div
      ref={setRefs}
      style={{ ...style, position: 'relative' }}
      {...(assignedPanel ? { ...listeners, ...attributes } : {})}
    >
      {/* X button to remove panel */}
      {assignedPanel && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '16px',
            height: '16px',
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.1)',
            color: '#666',
            fontSize: '10px',
            lineHeight: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Remove panel from slot"
        >
          ✕
        </button>
      )}
      <div style={{ fontWeight: 600, fontSize: '13px' }}>
        {slotLabel}
        {assignedPanel && !isTranslation && (
          <span style={{ marginLeft: '4px', fontSize: '10px' }}>&#10003;</span>
        )}
      </div>
      {assignedPanel ? (
        <>
          <div style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>
            {shortSerial}
          </div>
          {isTranslation && (
            <div style={{ fontSize: '9px', color: '#e65100' }}>
              ({assignedPanel.tigo_label})
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: '10px', color: '#aaa' }}>empty</div>
      )}
    </div>
  );
}
