/**
 * Draggable panel overlay for the layout editor.
 */

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { EditorPanel } from './types';
import { getStringColor } from './types';

interface DraggablePanelProps {
  panel: EditorPanel;
  position: { x_percent: number; y_percent: number };  // Position from parent's positions[panel.serial]
  overlaySize: number;
  isSelected: boolean;
  isEditMode: boolean;
  isBeingDragged: boolean;  // true when activeDragId === panel.serial
  onClick?: (serial: string) => void;
}

export function DraggablePanel({
  panel,
  position,
  overlaySize,
  isSelected,
  isEditMode,
  isBeingDragged,
  onClick,
}: DraggablePanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: panel.serial,
    data: {
      panel,
      label: panel.display_label,
    },
    disabled: !isEditMode,
  });

  const stringColor = useMemo(() => getStringColor(panel.string), [panel.string]);

  // Touch target sizing (min 44px for accessibility)
  const touchTargetSize = Math.max(44, overlaySize);
  const offset = (touchTargetSize - overlaySize) / 2;

  // Click handler - checks isBeingDragged prop (set by parent from activeDragId)
  const handleClick = (e: React.MouseEvent) => {
    if (!isEditMode || isBeingDragged) return;
    e.stopPropagation();  // Prevent canvas deselect-all from firing
    onClick?.(panel.serial);  // Delegates to handlePanelClick which calls editor.selectPanel (toggles internally)
  };

  // Outer wrapper handles drag/click events with extended hit area
  const wrapperStyle: CSSProperties = {
    position: 'absolute',
    width: touchTargetSize,
    height: touchTargetSize,
    left: `calc(${position.x_percent}% - ${touchTargetSize / 2}px)`,
    top: `calc(${position.y_percent}% - ${touchTargetSize / 2}px)`,
    cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    zIndex: isDragging ? 1000 : isSelected ? 10 : 1,
    transition: isDragging ? 'none' : 'z-index 0s',
  };

  // Inner div is the visible panel, centered within touch target
  const panelStyle: CSSProperties = {
    position: 'absolute',
    width: overlaySize,
    height: overlaySize,
    top: offset,
    left: offset,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    fontSize: `${Math.max(10, overlaySize / 4)}px`,
    fontWeight: 'bold',
    color: 'white',
    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
    userSelect: 'none',
    touchAction: 'none',
    backgroundColor: stringColor,
    border: isSelected ? '3px solid #fff' : '1px solid rgba(255,255,255,0.3)',
    boxShadow: isDragging
      ? '0 8px 16px rgba(0,0,0,0.4)'
      : isSelected
      ? '0 0 0 2px #4a90d9'
      : 'none',
    opacity: isDragging ? 0.8 : 1,
    transition: isDragging ? 'none' : 'box-shadow 0.15s, border 0.15s',
  };

  return (
    <div
      ref={setNodeRef}
      style={wrapperStyle}
      onClick={handleClick}
      {...(isEditMode ? { ...listeners, ...attributes } : {})}
      data-testid={`editor-panel-${panel.display_label}`}
      role={isEditMode ? 'button' : undefined}
      tabIndex={isEditMode ? 0 : undefined}
      aria-label={`Panel ${panel.display_label}${isSelected ? ', selected' : ''}`}
    >
      <div style={panelStyle}>
        <div>{panel.display_label}</div>
        {overlaySize >= 50 && (
          <div style={{ fontSize: `${Math.max(8, overlaySize / 5)}px`, opacity: 0.8 }}>
            {panel.serial.slice(-4)}
          </div>
        )}
      </div>
    </div>
  );
}

// Unpositioned panel in sidebar
interface UnpositionedPanelProps {
  panel: EditorPanel;
  isSelected: boolean;
  isBeingDragged: boolean;  // passed from sidebar, true when activeDragId === panel.serial
  onClick?: (serial: string) => void;
}

export function UnpositionedPanel({
  panel,
  isSelected,
  isBeingDragged,
  onClick,
}: UnpositionedPanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: panel.serial,
    data: {
      panel,
      label: panel.display_label,
      fromSidebar: true,
    },
  });

  const stringColor = useMemo(() => getStringColor(panel.string), [panel.string]);

  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '4px',
    backgroundColor: isSelected ? '#4a90d9' : '#333',
    color: 'white',
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    touchAction: 'none',
    border: `2px solid ${stringColor}`,
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    transition: isDragging ? 'none' : 'background-color 0.15s',
  };

  // Click handler - same race condition guard as DraggablePanel
  const handleClick = (e: React.MouseEvent) => {
    if (isBeingDragged) return;
    e.stopPropagation();
    onClick?.(panel.serial);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      {...listeners}
      {...attributes}
      data-testid={`unpositioned-panel-${panel.display_label}`}
      role="button"
      tabIndex={0}
      aria-label={`Panel ${panel.display_label}, drag to position`}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: stringColor,
        }}
      />
      <span style={{ fontWeight: 'bold' }}>{panel.display_label}</span>
      <span style={{ fontSize: '11px', color: '#aaa' }}>{panel.serial.slice(-4)}</span>
    </div>
  );
}
