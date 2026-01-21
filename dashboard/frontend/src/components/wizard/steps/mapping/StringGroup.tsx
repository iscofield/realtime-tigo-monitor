/**
 * Collapsible string group component.
 * Shows all slots for a string of panels, including excess panels.
 */

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { DroppableSlot } from './DroppableSlot';
import type { StringInfo, MappingResult } from './computePanelMapping';
import type { DiscoveredPanel } from '../../../../types/config';
import {
  stringGroupStyle,
  stringHeaderStyle,
  stringContentStyle,
  excessSlotStyle,
} from './MappingStyles';

interface StringGroupProps {
  stringInfo: StringInfo;
  mapping: MappingResult;
  /** Whether this string has issues (should be expanded by default) */
  hasIssues: boolean;
  /** Callback to remove a panel (move to unassigned) */
  onRemove?: (tigoLabel: string) => void;
}

/** Draggable excess panel */
function ExcessSlot({ panel, onRemove }: { panel: DiscoveredPanel; onRemove?: (tigoLabel: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: panel.tigo_label,
    data: {
      panel,
      isExcess: true,
    },
  });

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(panel.tigo_label);
    }
  };

  const shortSerial = panel.serial.length > 8 ? panel.serial.slice(-6) : panel.serial;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...excessSlotStyle,
        position: 'relative',
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
      title={`Excess panel: ${panel.serial}`}
      {...listeners}
      {...attributes}
    >
      {/* X button to remove */}
      {onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '16px',
            height: '16px',
            padding: 0,
            border: 'none',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.15)',
            color: '#c62828',
            fontSize: '10px',
            lineHeight: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Remove panel"
        >
          ✕
        </button>
      )}
      <div style={{ fontWeight: 600, fontSize: '11px' }}>⚠ {panel.tigo_label}</div>
      <div style={{ fontSize: '9px', opacity: 0.8, fontFamily: 'monospace' }}>{shortSerial}</div>
    </div>
  );
}

export function StringGroup({ stringInfo, mapping, hasIssues, onRemove }: StringGroupProps) {
  const [isExpanded, setIsExpanded] = useState(hasIssues);

  // Count assigned slots for this string
  const assignedCount = stringInfo.expectedLabels.filter(
    label => mapping.assignedSlots.has(label)
  ).length;

  // Get excess panels for this string from the mapping result
  const excessPanels = mapping.excessPanelsByString.get(stringInfo.name) || [];

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  // Status indicator - show warning if incomplete OR has excess panels
  const isComplete = assignedCount === stringInfo.panelCount && excessPanels.length === 0;
  const statusIcon = isComplete ? '✓' : '⚠';
  const statusColor = isComplete ? '#4caf50' : '#ff9800';

  return (
    <div style={stringGroupStyle}>
      <div style={stringHeaderStyle(hasIssues)} onClick={toggleExpanded}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: '#666' }}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: 500 }}>String {stringInfo.name}</span>
          <span style={{ color: statusColor, fontSize: '12px' }}>{statusIcon}</span>
          {excessPanels.length > 0 && (
            <span style={{ fontSize: '11px', color: '#f44336' }}>
              (+{excessPanels.length} excess)
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          {assignedCount} / {stringInfo.panelCount}
        </div>
      </div>

      {isExpanded && (
        <div style={stringContentStyle}>
          {stringInfo.expectedLabels.map(label => {
            const assigned = mapping.assignedSlots.get(label);
            return (
              <DroppableSlot
                key={label}
                slotLabel={label}
                assignedPanel={assigned?.panel || null}
                isTranslation={assigned?.isTranslation}
                onRemove={onRemove}
              />
            );
          })}
          {/* Show excess panels - draggable with X button */}
          {excessPanels.map(panel => (
            <ExcessSlot key={panel.serial} panel={panel} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
