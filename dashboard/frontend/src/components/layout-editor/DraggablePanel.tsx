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
  overlaySize: number;
  isSelected: boolean;
  isEditMode: boolean;
  onClick?: (serial: string, addToSelection: boolean) => void;
}

export function DraggablePanel({
  panel,
  overlaySize,
  isSelected,
  isEditMode,
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

  if (!panel.position) {
    return null; // Unpositioned panels go in sidebar
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: `${panel.position.x_percent}%`,
    top: `${panel.position.y_percent}%`,
    transform: transform
      ? `translate(-50%, -50%) ${CSS.Translate.toString(transform)}`
      : 'translate(-50%, -50%)',
    width: `${overlaySize}px`,
    height: `${overlaySize}px`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    fontSize: `${Math.max(10, overlaySize / 4)}px`,
    fontWeight: 'bold',
    color: 'white',
    textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
    cursor: isEditMode ? (isDragging ? 'grabbing' : 'grab') : 'default',
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
    zIndex: isDragging ? 1000 : isSelected ? 10 : 1,
    transition: isDragging ? 'none' : 'box-shadow 0.15s, border 0.15s',
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isEditMode || isDragging) return;
    e.stopPropagation();
    const addToSelection = e.ctrlKey || e.metaKey;
    onClick?.(panel.serial, addToSelection);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      {...(isEditMode ? { ...listeners, ...attributes } : {})}
      data-testid={`editor-panel-${panel.display_label}`}
      role={isEditMode ? 'button' : undefined}
      tabIndex={isEditMode ? 0 : undefined}
      aria-label={`Panel ${panel.display_label}${isSelected ? ', selected' : ''}`}
    >
      <div>{panel.display_label}</div>
      {overlaySize >= 50 && (
        <div style={{ fontSize: `${Math.max(8, overlaySize / 5)}px`, opacity: 0.8 }}>
          {panel.serial.slice(-4)}
        </div>
      )}
    </div>
  );
}

// Unpositioned panel in sidebar
interface UnpositionedPanelProps {
  panel: EditorPanel;
  isSelected: boolean;
  onClick?: (serial: string, addToSelection: boolean) => void;
}

export function UnpositionedPanel({
  panel,
  isSelected,
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

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    const addToSelection = e.ctrlKey || e.metaKey;
    onClick?.(panel.serial, addToSelection);
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
