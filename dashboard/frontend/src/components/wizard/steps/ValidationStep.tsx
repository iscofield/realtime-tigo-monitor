/**
 * Step 5: Panel Mapping (Phase 1 spec FR-3.6).
 * Single-column layout with unassigned panels at top and full-width topology below.
 */

import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { SystemConfig, DiscoveredPanel } from '../../../types/config';
import {
  CCASection,
  UnassignedArea,
  computePanelMapping,
  computeCCAInfoWithCounts,
  buildExpectedLabels,
  getCurrentSlotForPanel,
  UNASSIGNED_MARKER,
  mappingContainerStyle,
  topologySectionStyle,
  topologyScrollAreaStyle,
  columnHeaderStyle,
  summaryBarStyle,
  summaryStatStyle,
  summaryValueStyle,
  summaryLabelStyle,
  legendBarStyle,
  legendItemStyle,
  buttonGroupStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  dragOverlayStyle,
} from './mapping';

interface ValidationStepProps {
  topology: SystemConfig;
  discoveredPanels: Record<string, DiscoveredPanel>;
  translations: Record<string, string>;
  onTranslationChange: (tigoLabel: string, displayLabel: string) => void;
  onTranslationRemove: (tigoLabel: string) => void;
  onResetAllTranslations: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ValidationStep({
  topology,
  discoveredPanels,
  translations,
  onTranslationChange,
  onTranslationRemove,
  onResetAllTranslations,
  onNext,
  onBack,
}: ValidationStepProps) {
  // Track which panel is being dragged for DragOverlay
  const [activePanel, setActivePanel] = useState<DiscoveredPanel | null>(null);

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Compute mapping result
  const mapping = useMemo(
    () => computePanelMapping(discoveredPanels, topology, translations),
    [discoveredPanels, topology, translations]
  );

  // Compute CCA info with counts
  const ccaInfos = useMemo(
    () => computeCCAInfoWithCounts(topology, mapping),
    [topology, mapping]
  );

  // Expected labels set for lookup
  const expectedLabels = useMemo(
    () => new Set(buildExpectedLabels(topology)),
    [topology]
  );

  // Handle drag start - capture active panel for overlay
  const handleDragStart = (event: DragStartEvent) => {
    const tigoLabel = event.active.id as string;
    // Find the panel - could be in unassigned or in a slot
    const panel = Object.values(discoveredPanels).find(p => p.tigo_label === tigoLabel);
    setActivePanel(panel || null);
  };

  // Handle removing a panel (X button) - mark as explicitly unassigned
  const handleRemovePanel = (tigoLabel: string) => {
    onTranslationChange(tigoLabel, UNASSIGNED_MARKER);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    setActivePanel(null); // Clear the overlay

    const { active, over } = event;
    if (!over) return;

    const draggedTigoLabel = active.id as string;
    const targetId = over.id as string;

    // Case 1: Dropped on unassigned area - remove assignment
    if (targetId === 'unassigned') {
      // Only remove if it's currently assigned
      const currentSlot = getCurrentSlotForPanel(draggedTigoLabel, translations, expectedLabels);
      if (currentSlot) {
        onTranslationRemove(draggedTigoLabel);
      }
      return;
    }

    // Case 2: Dropped on a slot
    const targetSlotLabel = targetId;

    // Find if there's already a panel in the target slot
    const existingInTarget = mapping.assignedSlots.get(targetSlotLabel);

    if (existingInTarget) {
      // Swap: move existing panel to where dragged panel came from
      const draggedFromSlot = getCurrentSlotForPanel(draggedTigoLabel, translations, expectedLabels);

      if (draggedFromSlot) {
        // Both panels are in slots - swap them
        // Move existing to dragged's original slot
        if (draggedFromSlot === existingInTarget.panel.tigo_label) {
          // Existing panel's tigo_label matches the slot - remove translation
          onTranslationRemove(existingInTarget.panel.tigo_label);
        } else {
          onTranslationChange(existingInTarget.panel.tigo_label, draggedFromSlot);
        }
      } else {
        // Dragged from unassigned - existing goes to unassigned
        onTranslationRemove(existingInTarget.panel.tigo_label);
      }
    }

    // Assign dragged panel to target slot
    if (draggedTigoLabel === targetSlotLabel) {
      // Direct match - remove any translation
      onTranslationRemove(draggedTigoLabel);
    } else {
      onTranslationChange(draggedTigoLabel, targetSlotLabel);
    }
  };

  const { summary } = mapping;

  return (
    <div>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Panel Mapping</h2>
      <p style={{ margin: '0 0 16px', color: '#666' }}>
        Drag panels to map them to expected positions. Auto-matched panels show a ✓ indicator.
      </p>

      {/* Summary bar */}
      <div style={summaryBarStyle}>
        <div style={summaryStatStyle}>
          <div style={summaryValueStyle('#4caf50')}>{summary.autoMatched}</div>
          <div style={summaryLabelStyle}>Auto-matched</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={summaryValueStyle('#ff9800')}>{summary.userMapped}</div>
          <div style={summaryLabelStyle}>User-mapped</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={summaryValueStyle('#f44336')}>{summary.empty}</div>
          <div style={summaryLabelStyle}>Empty slots</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={summaryValueStyle('#c62828')}>{summary.excess}</div>
          <div style={summaryLabelStyle}>Excess</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={summaryValueStyle('#9e9e9e')}>{summary.unassigned}</div>
          <div style={summaryLabelStyle}>Unassigned</div>
        </div>
      </div>

      {/* Drag and drop context */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={mappingContainerStyle}>
          {/* Unassigned panels area (horizontal, at top) */}
          <UnassignedArea
            panels={mapping.unassignedPanels}
            onReset={onResetAllTranslations}
          />

          {/* Topology section (full width) */}
          <div style={topologySectionStyle}>
            <div style={columnHeaderStyle}>
              Expected Topology ({summary.totalExpected - summary.empty} / {summary.totalExpected} assigned)
            </div>
            <div style={topologyScrollAreaStyle}>
              {ccaInfos.map(ccaInfo => (
                <CCASection
                  key={ccaInfo.name}
                  ccaInfo={ccaInfo}
                  mapping={mapping}
                  discoveredPanels={discoveredPanels}
                  onRemove={handleRemovePanel}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Drag overlay - shows the panel visually following cursor */}
        <DragOverlay>
          {activePanel && (
            <div style={dragOverlayStyle}>
              <span style={{ fontWeight: 600, color: '#333' }}>{activePanel.tigo_label}</span>
              <span style={{ color: '#666', fontFamily: 'monospace', fontSize: '10px' }}>
                {activePanel.serial.slice(-6)}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Legend */}
      <div style={legendBarStyle}>
        <div style={legendItemStyle}>
          <span style={{ color: '#4caf50' }}>●</span>
          <span>Auto-matched</span>
        </div>
        <div style={legendItemStyle}>
          <span style={{ color: '#ff9800' }}>●</span>
          <span>User-mapped</span>
        </div>
        <div style={legendItemStyle}>
          <span style={{ color: '#f44336' }}>●</span>
          <span>Excess</span>
        </div>
        <div style={legendItemStyle}>
          <span style={{ color: '#ccc' }}>○</span>
          <span>Empty slot</span>
        </div>
      </div>

      {/* Navigation */}
      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button type="button" onClick={onNext} style={primaryButtonStyle}>
          Next: Review & Save
        </button>
      </div>
    </div>
  );
}
