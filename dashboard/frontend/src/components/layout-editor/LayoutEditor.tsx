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
import { Info } from 'lucide-react';
import { calculateSnap, pixelToPercent, buildSpatialIndex, getStringColor } from './types';
import { BLANK_CANVAS_WIDTH, BLANK_CANVAS_HEIGHT } from '../../constants';
import { useLayoutEditor } from './useLayoutEditor';
import { EditorToolbar } from './EditorToolbar';
import { DraggablePanel } from './DraggablePanel';
import { AlignmentGuides } from './AlignmentGuides';
import { UnpositionedPanelsSidebar } from './UnpositionedPanelsSidebar';
import { getLayoutImageUrl, uploadLayoutImage, useSampleImage, deleteLayoutImage, updateLayoutConfig } from '../../api/config';

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
  overflow: 'auto',
  padding: '20px',
};

const canvasStyle = (imageWidth: number, imageHeight: number): CSSProperties => ({
  position: 'relative',
  width: `${imageWidth}px`,
  height: `${imageHeight}px`,
  margin: 'auto',
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

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: CSSProperties = {
  backgroundColor: '#2a2a2a',
  borderRadius: '12px',
  padding: '32px',
  maxWidth: '480px',
  width: '90%',
  border: '1px solid #444',
};

const modalTitleStyle: CSSProperties = {
  color: '#fff',
  fontSize: '20px',
  fontWeight: 600,
  marginBottom: '8px',
};

const modalDescStyle: CSSProperties = {
  color: '#aaa',
  fontSize: '14px',
  marginBottom: '24px',
};

const choiceButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '14px 16px',
  marginBottom: '10px',
  fontSize: '14px',
  fontWeight: 500,
  border: '1px solid #555',
  borderRadius: '8px',
  cursor: 'pointer',
  textAlign: 'left',
  backgroundColor: '#333',
  color: '#fff',
  transition: 'background-color 0.15s',
};

const choiceDescStyle: CSSProperties = {
  display: 'block',
  fontSize: '12px',
  color: '#999',
  marginTop: '4px',
  fontWeight: 400,
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [canvasFocused, setCanvasFocused] = useState(false);
  const [showImageChoiceModal, setShowImageChoiceModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Marquee (rubber-band) selection state
  const [marqueeRect, setMarqueeRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const marqueeActiveRef = useRef(false); // tracks whether threshold was exceeded
  const marqueeJustFinishedRef = useRef(false);

  // Ref to track held arrow keys for undo coalescing (persists across renders)
  const heldArrowKeys = useRef<Set<string>>(new Set());

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

  // Image dimensions from config — use blank canvas defaults when no image is active
  const useBlankCanvas = !editor.layoutConfig?.image_path || editor.layoutConfig?.use_blank_background;
  const imageWidth = useBlankCanvas ? BLANK_CANVAS_WIDTH : (editor.layoutConfig?.image_width || BLANK_CANVAS_WIDTH);
  const imageHeight = useBlankCanvas ? BLANK_CANVAS_HEIGHT : (editor.layoutConfig?.image_height || BLANK_CANVAS_HEIGHT);
  const hasImage = !!editor.layoutConfig?.image_path;

  // Calculate scaled dimensions for canvas display
  // Image scale affects editor canvas only - panel positions are stored as percentages
  const scaledWidth = (imageWidth * editor.imageScale) / 100;
  const scaledHeight = (imageHeight * editor.imageScale) / 100;

  // Build spatial index excluding the dragging panel
  // Uses scaled dimensions so snap calculations work correctly at any scale
  const activeSpatialIndex = useMemo(() => {
    if (!activeDragId) return editor.spatialIndex;
    const positionedPanels = editor.panels
      .filter(p => editor.positions[p.serial] != null)
      .map(p => ({ ...p, position: editor.positions[p.serial]! }));
    return buildSpatialIndex(positionedPanels, editor.overlaySize, activeDragId, { width: scaledWidth, height: scaledHeight });
  }, [editor.panels, editor.positions, editor.overlaySize, activeDragId, editor.spatialIndex, scaledWidth, scaledHeight]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const draggedSerial = event.active.id as string;
    setActiveDragId(draggedSerial);
    setActiveGuides([]);

    // Clear selection if dragging an unselected panel
    if (!editor.selectedPanels.has(draggedSerial)) {
      editor.deselectAll();
    }

    // Haptic feedback on touch drag start (FR-1.6.1)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (e) {
        // Some browsers throw in certain contexts (e.g., iframe restrictions)
        console.debug('Haptic feedback unavailable', e);
      }
    }
  }, [editor]);

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
        { width: scaledWidth, height: scaledHeight },
        editor.overlaySize
      );

      setActiveGuides(guides);
    },
    [editor.snapEnabled, editor.overlaySize, activeSpatialIndex, scaledWidth, scaledHeight]
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
        // Position is stored as percentage, convert to scaled pixels for calculation
        const currentPos = editor.positions[panel.serial];
        if (!currentPos) return;

        const currentPixel = {
          x: (currentPos.x_percent / 100) * scaledWidth,
          y: (currentPos.y_percent / 100) * scaledHeight,
        };

        newPosition = {
          x: currentPixel.x + delta.x,
          y: currentPixel.y + delta.y,
        };
      }

      // Apply snap if enabled (uses scaled dimensions)
      if (editor.snapEnabled) {
        const { position: snappedPos } = calculateSnap(
          { width: editor.overlaySize, height: editor.overlaySize, serial: panel.serial },
          newPosition,
          activeSpatialIndex,
          true,
          { width: scaledWidth, height: scaledHeight },
          editor.overlaySize
        );
        newPosition = snappedPos;
      }

      // Convert to percentage and clamp (uses scaled dimensions)
      // Percentages are relative to scaled canvas, which equals original image percentages
      const percentPos = pixelToPercent(newPosition, { width: scaledWidth, height: scaledHeight });

      // Filter to only positioned panels (unpositioned sidebar panels have no coordinates)
      const positionedSelection = editor.getPositionedSelection();

      if (editor.selectedPanels.has(panel.serial) && positionedSelection.length > 1) {
        // Group drag: apply same delta to all selected positioned panels
        const oldPos = editor.positions[panel.serial];
        if (oldPos) {
          const deltaX = percentPos.x_percent - oldPos.x_percent;
          const deltaY = percentPos.y_percent - oldPos.y_percent;

          // Compute max allowable delta so no panel exceeds bounds
          let clampedDeltaX = deltaX;
          let clampedDeltaY = deltaY;
          for (const serial of positionedSelection) {
            const pos = editor.positions[serial]!;  // Safe: filtered above
            const newX = pos.x_percent + deltaX;
            const newY = pos.y_percent + deltaY;
            if (newX < 0) clampedDeltaX = Math.max(clampedDeltaX, -pos.x_percent);
            if (newX > 100) clampedDeltaX = Math.min(clampedDeltaX, 100 - pos.x_percent);
            if (newY < 0) clampedDeltaY = Math.max(clampedDeltaY, -pos.y_percent);
            if (newY > 100) clampedDeltaY = Math.min(clampedDeltaY, 100 - pos.y_percent);
          }

          const updates: Record<string, PanelPosition> = {};
          for (const serial of positionedSelection) {
            const pos = editor.positions[serial]!;  // Safe: filtered above
            updates[serial] = {
              x_percent: pos.x_percent + clampedDeltaX,
              y_percent: pos.y_percent + clampedDeltaY,
            };
          }
          editor.updatePositions(updates);
          return; // Skip single-panel update
        } else {
          // Defensive: panel in selection but has no position entry (should not happen for canvas-dragged panels)
          console.warn(`Group drag: panel ${panel.serial} has no position, falling back to single update`);
          // Falls through to single-panel update below
        }
      }

      // Single panel update (existing behavior)
      editor.updatePosition(panel.serial, percentPos);
    },
    [
      editor.overlaySize,
      editor.positions,
      editor.snapEnabled,
      editor.updatePosition,
      editor.updatePositions,
      editor.selectedPanels,
      editor.getPositionedSelection,
      activeSpatialIndex,
      scaledWidth,
      scaledHeight,
    ]
  );

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      await uploadLayoutImage(file);
      // Refresh layout config to get new image hash (for cache busting)
      await editor.refreshLayoutConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
      console.error('Image upload failed:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [editor]);

  // Show image choice modal when there's no image and blank background not chosen
  const effectiveHasImage = hasImage || (editor.layoutConfig?.use_blank_background ?? false);

  useEffect(() => {
    if (!editor.isLoading && !effectiveHasImage) {
      setShowImageChoiceModal(true);
    }
  }, [editor.isLoading, effectiveHasImage]);

  // Handle sample image selection
  const handleUseSampleImage = useCallback(async () => {
    setShowImageChoiceModal(false);
    setIsUploading(true);
    try {
      await useSampleImage();
      await editor.refreshLayoutConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load sample image';
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  }, [editor]);

  // Handle blank canvas selection - persist to backend and delete image if one exists
  const handleUseBlankCanvas = useCallback(async () => {
    setShowImageChoiceModal(false);
    try {
      // Delete existing image if there is one
      if (hasImage) {
        await deleteLayoutImage();
      }
      await updateLayoutConfig({
        overlay_size: editor.overlaySize,
        image_scale: editor.imageScale,
        use_blank_background: true,
      });
      await editor.refreshLayoutConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set blank background';
      setUploadError(message);
    }
  }, [hasImage, editor]);

  // Handle upload from modal
  const handleUploadFromModal = useCallback(() => {
    setShowImageChoiceModal(false);
    fileInputRef.current?.click();
  }, []);

  // Canvas panel click handler - focuses canvas and toggles selection
  const handlePanelClick = useCallback((serial: string) => {
    canvasRef.current?.focus();
    editor.selectPanel(serial);
  }, [editor]);

  // Canvas click handler - deselects all when clicking empty space
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Skip if marquee just completed (pointerUp already handled selection)
    if (marqueeJustFinishedRef.current) return;
    // Only deselect if click is on empty canvas space (not on a panel)
    const target = e.target as HTMLElement;
    if (!target.closest('button, [role="button"]')) {
      editor.deselectAll();
    }
  }, [editor]);

  // Marquee selection: pointerdown on canvas starts tracking, window-level
  // mousemove/mouseup handle the drag (avoids pointer capture + React issues)
  const handleMarqueePointerDown = useCallback((e: React.PointerEvent) => {
    // Only activate for mouse (not touch — touch uses panning)
    if (e.pointerType !== 'mouse') return;
    // Only in edit mode
    if (!editor.isEditMode) return;

    // Only activate on empty canvas space — skip if target is inside a panel
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"]')) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    marqueeStartRef.current = { x, y, pointerId: e.pointerId };
    marqueeActiveRef.current = false;
    // Prevent DndKit's MouseSensor from intercepting subsequent pointer events
    e.preventDefault();
  }, [editor.isEditMode]);

  // Window-level mousemove/mouseup for marquee tracking (avoids pointer capture issues)
  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (!marqueeStartRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const dx = x - marqueeStartRef.current.x;
      const dy = y - marqueeStartRef.current.y;

      // Minimum drag threshold of 5px before showing marquee
      if (!marqueeActiveRef.current && Math.sqrt(dx * dx + dy * dy) < 5) return;
      marqueeActiveRef.current = true;

      setMarqueeRect({
        startX: marqueeStartRef.current.x,
        startY: marqueeStartRef.current.y,
        endX: x,
        endY: y,
      });
    };

    const handleMouseUp = (e: PointerEvent) => {
      if (!marqueeStartRef.current) return;

      const hadMarquee = marqueeActiveRef.current;
      const start = marqueeStartRef.current;
      marqueeStartRef.current = null;
      marqueeActiveRef.current = false;
      setMarqueeRect(null);

      if (!hadMarquee) return; // Was below threshold — let click handler deal with it

      // Set flag to prevent handleCanvasClick from also deselecting
      marqueeJustFinishedRef.current = true;
      requestAnimationFrame(() => { marqueeJustFinishedRef.current = false; });

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Normalized rectangle
      const minX = Math.min(start.x, endX);
      const maxX = Math.max(start.x, endX);
      const minY = Math.min(start.y, endY);
      const maxY = Math.max(start.y, endY);

      // Find panels whose center falls within the rectangle
      const matching = new Set<string>();
      for (const panel of editor.panels) {
        const pos = editor.positions[panel.serial];
        if (!pos) continue;
        const panelCenterX = (pos.x_percent / 100) * scaledWidth;
        const panelCenterY = (pos.y_percent / 100) * scaledHeight;
        if (panelCenterX >= minX && panelCenterX <= maxX && panelCenterY >= minY && panelCenterY <= maxY) {
          matching.add(panel.serial);
        }
      }

      if (matching.size > 0) {
        editor.setSelectedPanels(matching);
      } else {
        editor.deselectAll();
      }
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
  }, [editor, scaledWidth, scaledHeight]);

  // Keyboard shortcuts - now as a regular function for canvas onKeyDown
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editor.isEditMode) return;

    // Undo: Ctrl/Cmd + Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      // Flush any in-progress arrow key movement before undoing
      if (heldArrowKeys.current.size > 0) {
        heldArrowKeys.current.clear();
        editor.recordCurrentHistoryState();
      }
      editor.undo();
      return;
    }
    // Redo: Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      // Flush any in-progress arrow key movement before redoing
      if (heldArrowKeys.current.size > 0) {
        heldArrowKeys.current.clear();
        editor.recordCurrentHistoryState();
      }
      editor.redo();
      return;
    }
    // Escape: Two-tier behavior (FR-1.7)
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editor.selectedPanels.size > 0) {
        // First tier: deselect all, stay in edit mode
        editor.deselectAll();
      } else {
        // Second tier: exit edit mode (existing behavior)
        if (editor.hasUnsavedChanges) {
          editor.exitEditMode(true);
        } else {
          editor.exitEditMode(false);
        }
      }
      return;
    }
    // Space: Deselect all
    if (e.key === ' ') {
      if (editor.selectedPanels.size > 0) {
        e.preventDefault();
        editor.deselectAll();
      }
      return;
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
      return;
    }
    // Select all: Ctrl/Cmd + A (only selects positioned panels)
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      // Check if focus is in a text input - let browser handle it
      const activeElement = document.activeElement;
      const isTextInput = activeElement instanceof HTMLInputElement ||
                          activeElement instanceof HTMLTextAreaElement ||
                          activeElement?.getAttribute('contenteditable') === 'true';

      if (isTextInput) {
        return; // Let browser handle Ctrl+A in text inputs
      }

      e.preventDefault();
      editor.selectAll();
      return;
    }

    // Arrow key movement
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // Canvas has focus (implicit from handler attachment), check for selected panels
      if (editor.selectedPanels.size > 0) {
        // Filter to only positioned panels (unpositioned panels have no coordinates to nudge)
        const positionedSelection = editor.getPositionedSelection();
        if (positionedSelection.length === 0) return;

        // Guard against unloaded image or invalid dimensions
        if (imageWidth == null || imageHeight == null || !(imageWidth > 0) || !(imageHeight > 0)) {
          console.warn('Cannot calculate movement: image dimensions unavailable');
          return;
        }

        heldArrowKeys.current.add(e.key);  // Track for keyup coalescing
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        let dxPercent = (dx / imageWidth) * 100;
        let dyPercent = (dy / imageHeight) * 100;

        // Group-aware clamping: reduce delta if any panel would exceed bounds
        for (const serial of positionedSelection) {
          const pos = editor.positions[serial]!;  // Safe: filtered above
          const newX = pos.x_percent + dxPercent;
          const newY = pos.y_percent + dyPercent;
          if (newX < 0) dxPercent = Math.max(dxPercent, -pos.x_percent);
          if (newX > 100) dxPercent = Math.min(dxPercent, 100 - pos.x_percent);
          if (newY < 0) dyPercent = Math.max(dyPercent, -pos.y_percent);
          if (newY > 100) dyPercent = Math.min(dyPercent, 100 - pos.y_percent);
        }

        const updates: Record<string, PanelPosition> = {};
        for (const serial of positionedSelection) {
          const pos = editor.positions[serial]!;  // Safe: filtered above
          updates[serial] = {
            x_percent: pos.x_percent + dxPercent,
            y_percent: pos.y_percent + dyPercent,
          };
        }
        editor.updatePositionsWithoutHistory(updates);
      }
    }
  }, [editor, imageWidth, imageHeight]);

  // Keyup and blur handlers for arrow key undo coalescing
  useEffect(() => {
    if (!editor.isEditMode) return;

    const flushArrowKeyHistory = () => {
      if (heldArrowKeys.current.size > 0) {
        heldArrowKeys.current.clear();
        editor.recordCurrentHistoryState();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        heldArrowKeys.current.delete(e.key);
        // Record history only when ALL arrow keys are released
        if (heldArrowKeys.current.size === 0) {
          editor.recordCurrentHistoryState();
        }
      }
    };

    // Flush pending history if user tabs away while holding arrow keys
    const handleBlur = () => {
      flushArrowKeyHistory();
    };

    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      // Flush on unmount (e.g., edit mode exit while holding keys)
      flushArrowKeyHistory();
    };
  }, [editor.isEditMode, editor.recordCurrentHistoryState]);

  // Auto-arrange unpositioned panels
  // Uses original image dimensions for percentage calculations (scale-independent)
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
        // Use original image dimensions for percentage calculation (scale-independent)
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
      {editor.draftAvailable && (
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
        hasUnsavedChanges={editor.hasUnsavedChanges}
        isSaving={editor.isSaving}
        overlaySize={editor.overlaySize}
        imageScale={editor.imageScale}
        snapEnabled={editor.snapEnabled}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        selectedCount={editor.selectedPanels.size}
        onExitEditMode={editor.exitEditMode}
        onSave={editor.save}
        onOverlaySizeChange={editor.setOverlaySize}
        onImageScaleChange={editor.setImageScale}
        onImageScaleCommit={editor.onImageScaleCommit}
        onSnapToggle={() => editor.setSnapEnabled(!editor.snapEnabled)}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onDeselectAll={editor.deselectAll}
        onChangeBackground={() => setShowImageChoiceModal(true)}
      />

      {/* Image choice modal */}
      {showImageChoiceModal && (
        <div style={modalOverlayStyle} onClick={() => setShowImageChoiceModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalTitleStyle}>Choose a Background Image</div>
            <div style={modalDescStyle}>
              Select a background for your panel layout editor.
            </div>
            <button
              style={choiceButtonStyle}
              onClick={handleUploadFromModal}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#333'; }}
            >
              Upload your own image
              <span style={choiceDescStyle}>Use a photo or diagram of your solar array</span>
            </button>
            <button
              style={choiceButtonStyle}
              onClick={handleUseBlankCanvas}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#333'; }}
            >
              Use blank background
              <span style={choiceDescStyle}>Position panels on a plain canvas</span>
            </button>
            <button
              style={choiceButtonStyle}
              onClick={handleUseSampleImage}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#333'; }}
            >
              Use sample image
              <span style={choiceDescStyle}>Start with the included example layout</span>
            </button>
          </div>
        </div>
      )}

      {!effectiveHasImage ? (
        <div style={noImageStyle}>
          <span>{isUploading ? 'Loading image...' : 'No layout image configured'}</span>
          <button
            onClick={() => setShowImageChoiceModal(true)}
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
            Choose Background Image
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          {/* Contextual info bar - always reserves space to prevent layout shift */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: editor.selectedPanels.size > 0 ? '#1e3a5f' : 'transparent',
              color: '#e0e0e0',
              fontSize: '13px',
              borderBottom: editor.selectedPanels.size > 0 ? '1px solid #2a4a6f' : '1px solid transparent',
              minHeight: typeof window !== 'undefined' && window.innerWidth < 768 ? '44px' : '36px',
              visibility: editor.selectedPanels.size > 0 || (editor.isEditMode && typeof window !== 'undefined' && window.innerWidth >= 768) ? 'visible' : 'hidden',
            }}
            role="status"
            aria-live="polite"
          >
            <Info size={16} color={editor.selectedPanels.size > 0 ? '#ffffff' : '#888888'} />
            <span>
              {editor.selectedPanels.size > 0
                ? <>
                    {editor.selectedPanels.size} panel{editor.selectedPanels.size > 1 ? 's' : ''} selected
                    {typeof window !== 'undefined' && window.innerWidth < 768
                      ? ' · Hold to drag · Tap to deselect · Tap empty to clear'
                      : ' · Arrow keys to nudge · Drag to reposition · Space to deselect all · Click panel to toggle'
                    }
                  </>
                : 'Drag to select · Click panel to toggle · Ctrl+A to select all'
              }
            </span>
          </div>

          {/* Upload error banner */}
          {uploadError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px',
                backgroundColor: '#5c2020',
                color: '#ffaaaa',
                fontSize: '13px',
                borderBottom: '1px solid #7a3030',
              }}
              role="alert"
            >
              <span>Upload failed: {uploadError}</span>
              <button
                onClick={() => setUploadError(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffaaaa',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>
          )}

          <div style={editorAreaStyle}>
            <div style={canvasContainerStyle}>
              <div
                ref={canvasRef}
                tabIndex={0}
                style={{
                  ...canvasStyle(scaledWidth, scaledHeight),
                  outline: canvasFocused ? '2px solid #4a90d9' : 'none',
                  outlineOffset: '-2px',
                }}
                onClick={handleCanvasClick}
                onKeyDown={handleKeyDown}
                onPointerDown={handleMarqueePointerDown}
                onFocus={() => setCanvasFocused(true)}
                onBlur={() => setCanvasFocused(false)}
              >
                {hasImage ? (
                  <img
                    src={`${getLayoutImageUrl()}${editor.layoutConfig?.image_hash ? `?v=${editor.layoutConfig.image_hash}` : ''}`}
                    alt="Layout"
                    style={imageStyle}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#ffffff',
                      borderRadius: '2px',
                    }}
                  />
                )}

                {/* Positioned panels */}
                {editor.panels
                  .filter(p => editor.positions[p.serial] != null)
                  .map(panel => (
                    <DraggablePanel
                      key={panel.serial}
                      panel={panel}
                      position={editor.positions[panel.serial]!}
                      overlaySize={editor.overlaySize}
                      isSelected={editor.selectedPanels.has(panel.serial)}
                      isEditMode={editor.isEditMode}
                      isBeingDragged={activeDragId === panel.serial}
                      onClick={handlePanelClick}
                    />
                  ))}

                {/* Alignment guides */}
                {editor.isEditMode && activeGuides.length > 0 && (
                  <AlignmentGuides guides={activeGuides} />
                )}

                {/* Marquee selection rectangle */}
                {marqueeRect && (
                  <div style={{
                    position: 'absolute',
                    left: Math.min(marqueeRect.startX, marqueeRect.endX),
                    top: Math.min(marqueeRect.startY, marqueeRect.endY),
                    width: Math.abs(marqueeRect.endX - marqueeRect.startX),
                    height: Math.abs(marqueeRect.endY - marqueeRect.startY),
                    border: '2px dashed #4a90d9',
                    backgroundColor: 'rgba(74, 144, 217, 0.15)',
                    pointerEvents: 'none',
                    zIndex: 999,
                  }} />
                )}
              </div>
            </div>

            {/* Unpositioned panels sidebar */}
            {editor.isEditMode && (
              <UnpositionedPanelsSidebar
                panels={editor.unpositionedPanels}
                selectedPanels={editor.selectedPanels}
                onPanelClick={handlePanelClick}
                activeDragId={activeDragId}
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
