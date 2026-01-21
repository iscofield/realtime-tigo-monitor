/**
 * Main Layout Editor component.
 * Provides visual panel positioning with drag-and-drop, snap-to-align, and undo/redo.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core';
import type { AlignmentGuide, PanelPosition } from '../../types/config';
import type { EditorPanel } from './types';
import { calculateSnap, pixelToPercent, buildSpatialIndex, getStringColor } from './types';
import { useLayoutEditor } from './useLayoutEditor';
import { EditorToolbar } from './EditorToolbar';
import { DraggablePanel } from './DraggablePanel';
import { AlignmentGuides } from './AlignmentGuides';
import { UnpositionedPanelsSidebar } from './UnpositionedPanelsSidebar';
import { getLayoutImageUrl, uploadLayoutImage } from '../../api/config';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#2a2a2a',
  overflow: 'hidden',
};

const editorAreaStyle: CSSProperties = {
  flexGrow: 1,
  display: 'flex',
  position: 'relative',
  overflow: 'hidden',
};

const canvasContainerStyle: CSSProperties = {
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'auto',
  padding: '20px',
};

const canvasStyle = (imageWidth: number, imageHeight: number): CSSProperties => ({
  position: 'relative',
  width: `${imageWidth}px`,
  height: `${imageHeight}px`,
  flexShrink: 0,
});

const imageStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const loadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#888',
  fontSize: '16px',
};

const errorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#dc3545',
  fontSize: '14px',
  gap: '12px',
};

const draftBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  backgroundColor: '#ffc107',
  color: '#000',
  fontSize: '13px',
};

const noImageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#888',
  fontSize: '14px',
  gap: '16px',
};

interface LayoutEditorProps {
  onClose?: () => void;
}

export function LayoutEditor({ onClose }: LayoutEditorProps) {
  const editor = useLayoutEditor({
    onSaveSuccess: () => {
      onClose?.();
    },
  });

  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Touch sensor with delay to prevent scroll conflicts
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 8,
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor);

  // Image dimensions from config
  const imageWidth = editor.layoutConfig?.image_width || 800;
  const imageHeight = editor.layoutConfig?.image_height || 600;
  const hasImage = !!editor.layoutConfig?.image_path;

  // Build spatial index excluding the dragging panel
  const activeSpatialIndex = useMemo(() => {
    if (!activeDragId) return editor.spatialIndex;
    const positionedPanels = editor.panels
      .filter(p => editor.positions[p.serial] != null)
      .map(p => ({ ...p, position: editor.positions[p.serial]! }));
    return buildSpatialIndex(positionedPanels, editor.overlaySize, activeDragId);
  }, [editor.panels, editor.positions, editor.overlaySize, activeDragId, editor.spatialIndex]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setActiveGuides([]);
  }, []);

  // Handle drag move - calculate snap and guides
  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      if (!editor.snapEnabled || !canvasRef.current) {
        setActiveGuides([]);
        return;
      }

      const { active, delta } = event;
      const panel = active.data.current?.panel as EditorPanel | undefined;
      if (!panel) return;

      // Get the initial rect from the active element
      const initialRect = active.rect.current.initial;
      if (!initialRect) return;

      // Calculate position relative to canvas
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const dragPosition = {
        x: initialRect.left + delta.x - canvasRect.left + editor.overlaySize / 2,
        y: initialRect.top + delta.y - canvasRect.top + editor.overlaySize / 2,
      };

      const { guides } = calculateSnap(
        { width: editor.overlaySize, height: editor.overlaySize, serial: panel.serial },
        dragPosition,
        activeSpatialIndex,
        true,
        { width: imageWidth, height: imageHeight },
        editor.overlaySize
      );

      setActiveGuides(guides);
    },
    [editor.snapEnabled, editor.overlaySize, activeSpatialIndex, imageWidth, imageHeight]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const panel = active.data.current?.panel as EditorPanel | undefined;
      const fromSidebar = active.data.current?.fromSidebar as boolean | undefined;

      setActiveDragId(null);
      setActiveGuides([]);

      if (!panel || !canvasRef.current) return;

      const canvasRect = canvasRef.current.getBoundingClientRect();
      let newPosition: { x: number; y: number };

      if (fromSidebar) {
        // Panel dragged from sidebar - use the drop position
        const initialRect = active.rect.current.initial;
        if (!initialRect) return;

        newPosition = {
          x: initialRect.left + delta.x - canvasRect.left + editor.overlaySize / 2,
          y: initialRect.top + delta.y - canvasRect.top + editor.overlaySize / 2,
        };
      } else {
        // Panel already on canvas - calculate from current position + delta
        const currentPos = editor.positions[panel.serial];
        if (!currentPos) return;

        const currentPixel = {
          x: (currentPos.x_percent / 100) * imageWidth,
          y: (currentPos.y_percent / 100) * imageHeight,
        };

        newPosition = {
          x: currentPixel.x + delta.x,
          y: currentPixel.y + delta.y,
        };
      }

      // Apply snap if enabled
      if (editor.snapEnabled) {
        const { position: snappedPos } = calculateSnap(
          { width: editor.overlaySize, height: editor.overlaySize, serial: panel.serial },
          newPosition,
          activeSpatialIndex,
          true,
          { width: imageWidth, height: imageHeight },
          editor.overlaySize
        );
        newPosition = snappedPos;
      }

      // Convert to percentage and clamp
      const percentPos = pixelToPercent(newPosition, { width: imageWidth, height: imageHeight });
      editor.updatePosition(panel.serial, percentPos);
    },
    [
      editor.overlaySize,
      editor.positions,
      editor.snapEnabled,
      editor.updatePosition,
      activeSpatialIndex,
      imageWidth,
      imageHeight,
    ]
  );

  // Handle image upload
  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      await uploadLayoutImage(file);
      // Force reload to get new image dimensions
      window.location.reload();
    } catch {
      // Error handled by reload or user can retry
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (!editor.isEditMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.undo();
      }
      // Redo: Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        editor.redo();
      }
      // Escape: Exit edit mode
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editor.hasUnsavedChanges) {
          // Show confirmation?
          editor.exitEditMode(true);
        } else {
          editor.exitEditMode(false);
        }
      }
      // Delete: Remove position from selected panels
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editor.selectedPanels.size > 0) {
          e.preventDefault();
          const updates: Record<string, PanelPosition | null> = {};
          for (const serial of editor.selectedPanels) {
            updates[serial] = null;
          }
          editor.updatePositions(updates);
          editor.deselectAll();
        }
      }
      // Select all: Ctrl/Cmd + A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        editor.selectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  // Auto-arrange unpositioned panels
  const handleAutoArrange = useCallback(() => {
    if (editor.unpositionedPanels.length === 0) return;

    const panelsByString: Record<string, EditorPanel[]> = {};
    for (const panel of editor.unpositionedPanels) {
      if (!panelsByString[panel.string]) {
        panelsByString[panel.string] = [];
      }
      panelsByString[panel.string].push(panel);
    }

    const sortedStrings = Object.keys(panelsByString).sort();
    const gridGap = editor.overlaySize * 1.5;
    const startX = 10; // percent
    const startY = 10; // percent

    const updates: Record<string, PanelPosition> = {};
    let row = 0;

    for (const stringName of sortedStrings) {
      const panels = panelsByString[stringName];
      let col = 0;

      for (const panel of panels) {
        updates[panel.serial] = {
          x_percent: startX + (col * gridGap / imageWidth) * 100,
          y_percent: startY + (row * gridGap / imageHeight) * 100,
        };
        col++;
        if (col >= 8) { // Max 8 per row
          col = 0;
          row++;
        }
      }
      row++;
    }

    editor.updatePositions(updates);
  }, [editor, imageWidth, imageHeight]);

  // Get the panel being dragged for overlay
  const activeDragPanel = useMemo(() => {
    if (!activeDragId) return null;
    return editor.panels.find(p => p.serial === activeDragId);
  }, [activeDragId, editor.panels]);

  if (editor.isLoading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>Loading layout editor...</div>
      </div>
    );
  }

  if (editor.error) {
    return (
      <div style={containerStyle}>
        <div style={errorStyle}>
          <span>Error: {editor.error}</span>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
      />

      {/* Draft recovery banner */}
      {editor.draftAvailable && !editor.isEditMode && (
        <div style={draftBannerStyle}>
          <span>
            Unsaved layout changes from{' '}
            {new Date(editor.draftAvailable.timestamp).toLocaleString()}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={editor.applyDraft}
              style={{
                padding: '4px 12px',
                backgroundColor: '#4a90d9',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Resume Draft
            </button>
            <button
              onClick={editor.dismissDraft}
              style={{
                padding: '4px 12px',
                backgroundColor: 'transparent',
                color: '#000',
                border: '1px solid #000',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <EditorToolbar
        isEditMode={editor.isEditMode}
        hasUnsavedChanges={editor.hasUnsavedChanges}
        isSaving={editor.isSaving}
        overlaySize={editor.overlaySize}
        snapEnabled={editor.snapEnabled}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        selectedCount={editor.selectedPanels.size}
        onEnterEditMode={editor.enterEditMode}
        onExitEditMode={editor.exitEditMode}
        onSave={editor.save}
        onOverlaySizeChange={editor.setOverlaySize}
        onSnapToggle={() => editor.setSnapEnabled(!editor.snapEnabled)}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onDeselectAll={editor.deselectAll}
        onImageUpload={handleImageUpload}
      />

      {!hasImage ? (
        <div style={noImageStyle}>
          <span>No layout image configured</span>
          <button
            onClick={handleImageUpload}
            disabled={isUploading}
            style={{
              padding: '12px 24px',
              fontSize: '14px',
              backgroundColor: '#4a90d9',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {isUploading ? 'Uploading...' : 'Upload Layout Image'}
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <div style={editorAreaStyle}>
            <div style={canvasContainerStyle}>
              <div
                ref={canvasRef}
                style={canvasStyle(imageWidth, imageHeight)}
                onClick={() => editor.deselectAll()}
              >
                <img
                  src={getLayoutImageUrl()}
                  alt="Layout"
                  style={imageStyle}
                />

                {/* Positioned panels */}
                {editor.panels
                  .filter(p => editor.positions[p.serial] != null)
                  .map(panel => (
                    <DraggablePanel
                      key={panel.serial}
                      panel={{ ...panel, position: editor.positions[panel.serial]! }}
                      overlaySize={editor.overlaySize}
                      isSelected={editor.selectedPanels.has(panel.serial)}
                      isEditMode={editor.isEditMode}
                      onClick={editor.selectPanel}
                    />
                  ))}

                {/* Alignment guides */}
                {editor.isEditMode && activeGuides.length > 0 && (
                  <AlignmentGuides guides={activeGuides} />
                )}
              </div>
            </div>

            {/* Unpositioned panels sidebar */}
            {editor.isEditMode && (
              <UnpositionedPanelsSidebar
                panels={editor.unpositionedPanels}
                selectedPanels={editor.selectedPanels}
                onPanelClick={editor.selectPanel}
                onAutoArrange={handleAutoArrange}
              />
            )}
          </div>

          {/* Drag overlay for visual feedback */}
          <DragOverlay>
            {activeDragPanel && (
              <div
                style={{
                  width: `${editor.overlaySize}px`,
                  height: `${editor.overlaySize}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  fontSize: `${Math.max(10, editor.overlaySize / 4)}px`,
                  fontWeight: 'bold',
                  color: 'white',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                  backgroundColor: getStringColor(activeDragPanel.string),
                  border: '3px solid #fff',
                  boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
                  opacity: 0.9,
                }}
              >
                <div>{activeDragPanel.display_label}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default LayoutEditor;
