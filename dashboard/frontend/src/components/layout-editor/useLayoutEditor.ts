/**
 * Layout Editor state management hook.
 * Handles edit mode, panel positions, undo/redo, and draft persistence.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { PanelPosition, EditHistory, LayoutDraft, LayoutConfig } from '../../types/config';
import type { EditorPanel, SpatialIndex } from './types';
import { buildSpatialIndex } from './types';
import {
  getLayoutConfig,
  updateLayoutConfig,
  updatePanelPositions,
  getPanelsConfig,
} from '../../api/config';

const DRAFT_KEY = 'solar-tigo-layout-draft';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const MAX_HISTORY_DEPTH = 50;

interface UseLayoutEditorOptions {
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
}

export function useLayoutEditor(options: UseLayoutEditorOptions = {}) {
  const { onSaveSuccess, onSaveError } = options;

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Layout config
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig | null>(null);
  const [overlaySize, setOverlaySize] = useState(50);

  // Panels
  const [panels, setPanels] = useState<EditorPanel[]>([]);
  const [positions, setPositions] = useState<Record<string, PanelPosition | null>>({});
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());

  // Snap settings
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Undo/redo history
  const [history, setHistory] = useState<EditHistory>({ states: [], currentIndex: -1 });

  // Draft auto-save interval ref
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialPositionsRef = useRef<Record<string, PanelPosition | null>>({});

  // Load initial data
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const [config, panelsData] = await Promise.all([
          getLayoutConfig(),
          getPanelsConfig(),
        ]);

        setLayoutConfig(config);
        setOverlaySize(config.overlay_size);

        const editorPanels: EditorPanel[] = panelsData.panels.map(p => ({
          serial: p.serial,
          cca: p.cca,
          string: p.string,
          tigo_label: p.tigo_label,
          display_label: p.display_label,
          position: p.position ?? null,
        }));
        setPanels(editorPanels);

        // Initialize positions
        const posMap: Record<string, PanelPosition | null> = {};
        for (const panel of editorPanels) {
          posMap[panel.serial] = panel.position;
        }
        setPositions(posMap);
        initialPositionsRef.current = { ...posMap };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load layout data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Build spatial index for snap calculations (memoized)
  const spatialIndex = useMemo<SpatialIndex>(() => {
    const positionedPanels = panels.map(p => ({
      ...p,
      position: positions[p.serial] ?? p.position,
    }));
    return buildSpatialIndex(positionedPanels, overlaySize);
  }, [panels, positions, overlaySize]);

  // Initialize history when entering edit mode
  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
    setHistory({
      states: [{ ...positions }],
      currentIndex: 0,
    });
    initialPositionsRef.current = { ...positions };
    setHasUnsavedChanges(false);

    // Start auto-save
    autoSaveIntervalRef.current = setInterval(() => {
      saveDraft(positions, overlaySize);
    }, AUTO_SAVE_INTERVAL);
  }, [positions, overlaySize]);

  // Exit edit mode
  const exitEditMode = useCallback((discardChanges: boolean = false) => {
    // Stop auto-save
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }

    if (discardChanges) {
      setPositions(initialPositionsRef.current);
    }

    setIsEditMode(false);
    setSelectedPanels(new Set());
    setHistory({ states: [], currentIndex: -1 });
    setHasUnsavedChanges(false);
    clearDraft();
  }, []);

  // Record position change to history
  const recordHistoryState = useCallback((newPositions: Record<string, PanelPosition | null>) => {
    setHistory(prev => {
      // Truncate any "future" states if we've undone then made new changes
      const truncatedStates = prev.states.slice(0, prev.currentIndex + 1);
      truncatedStates.push({ ...newPositions });

      let newStates = truncatedStates;
      let newIndex = truncatedStates.length - 1;

      // Limit history depth
      if (newStates.length > MAX_HISTORY_DEPTH) {
        newStates = newStates.slice(1);
        newIndex--;
      }

      return {
        states: newStates,
        currentIndex: newIndex,
      };
    });
    setHasUnsavedChanges(true);
  }, []);

  // Update panel position
  const updatePosition = useCallback(
    (serial: string, position: PanelPosition | null) => {
      setPositions(prev => {
        const newPositions = { ...prev, [serial]: position };
        recordHistoryState(newPositions);
        return newPositions;
      });
    },
    [recordHistoryState]
  );

  // Update multiple panel positions (for group moves)
  const updatePositions = useCallback(
    (updates: Record<string, PanelPosition | null>) => {
      setPositions(prev => {
        const newPositions = { ...prev, ...updates };
        recordHistoryState(newPositions);
        return newPositions;
      });
    },
    [recordHistoryState]
  );

  // Undo
  const canUndo = history.currentIndex > 0;
  const undo = useCallback(() => {
    if (!canUndo) return;
    setHistory(prev => {
      const newIndex = prev.currentIndex - 1;
      setPositions(prev.states[newIndex]);
      return { ...prev, currentIndex: newIndex };
    });
  }, [canUndo]);

  // Redo
  const canRedo = history.currentIndex < history.states.length - 1;
  const redo = useCallback(() => {
    if (!canRedo) return;
    setHistory(prev => {
      const newIndex = prev.currentIndex + 1;
      setPositions(prev.states[newIndex]);
      return { ...prev, currentIndex: newIndex };
    });
  }, [canRedo]);

  // Selection management
  const selectPanel = useCallback((serial: string, addToSelection: boolean = false) => {
    setSelectedPanels(prev => {
      if (addToSelection) {
        const next = new Set(prev);
        if (next.has(serial)) {
          next.delete(serial);
        } else {
          next.add(serial);
        }
        return next;
      }
      return new Set([serial]);
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPanels(new Set(panels.map(p => p.serial)));
  }, [panels]);

  const deselectAll = useCallback(() => {
    setSelectedPanels(new Set());
  }, []);

  // Save to backend
  const save = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Save overlay size
      await updateLayoutConfig(overlaySize);

      // Save panel positions
      await updatePanelPositions(positions);

      // Update initial positions ref
      initialPositionsRef.current = { ...positions };
      setHasUnsavedChanges(false);

      // Clear draft
      clearDraft();

      // Exit edit mode
      exitEditMode(false);

      onSaveSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save');
      setError(error.message);
      onSaveError?.(error);
    } finally {
      setIsSaving(false);
    }
  }, [overlaySize, positions, exitEditMode, onSaveSuccess, onSaveError]);

  // Draft persistence
  const saveDraft = useCallback((pos: Record<string, PanelPosition | null>, size: number) => {
    try {
      const draft: LayoutDraft = {
        timestamp: Date.now(),
        positions: pos as Record<string, PanelPosition>,
        overlaySize: size,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const loadDraft = useCallback((): LayoutDraft | null => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (!saved) return null;

      const draft = JSON.parse(saved) as LayoutDraft;

      // Only restore drafts less than 24 hours old
      if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }

      return draft;
    } catch {
      return null;
    }
  }, []);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const restoreDraft = useCallback((draft: LayoutDraft) => {
    // Filter out positions for panels that no longer exist
    const existingSerials = new Set(panels.map(p => p.serial));
    const validPositions: Record<string, PanelPosition | null> = {};
    for (const [serial, pos] of Object.entries(draft.positions)) {
      if (existingSerials.has(serial)) {
        validPositions[serial] = pos;
      }
    }

    setPositions(prev => ({ ...prev, ...validPositions }));
    setOverlaySize(draft.overlaySize);
    recordHistoryState({ ...positions, ...validPositions });
  }, [panels, positions, recordHistoryState]);

  // Check for draft on mount
  const [draftAvailable, setDraftAvailable] = useState<LayoutDraft | null>(null);
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setDraftAvailable(draft);
    }
  }, [loadDraft]);

  const dismissDraft = useCallback(() => {
    clearDraft();
    setDraftAvailable(null);
  }, [clearDraft]);

  const applyDraft = useCallback(() => {
    if (draftAvailable) {
      restoreDraft(draftAvailable);
      setDraftAvailable(null);
      clearDraft();
    }
  }, [draftAvailable, restoreDraft, clearDraft]);

  // Get positioned and unpositioned panels
  const positionedPanels = useMemo(() => {
    return panels
      .filter(p => positions[p.serial] != null)
      .map(p => ({ ...p, position: positions[p.serial]! }));
  }, [panels, positions]);

  const unpositionedPanels = useMemo(() => {
    return panels.filter(p => positions[p.serial] == null);
  }, [panels, positions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, []);

  return {
    // State
    isEditMode,
    isLoading,
    isSaving,
    error,
    layoutConfig,
    overlaySize,
    setOverlaySize,
    panels,
    positions,
    positionedPanels,
    unpositionedPanels,
    selectedPanels,
    snapEnabled,
    setSnapEnabled,
    spatialIndex,
    hasUnsavedChanges,

    // Actions
    enterEditMode,
    exitEditMode,
    updatePosition,
    updatePositions,
    selectPanel,
    selectAll,
    deselectAll,
    save,

    // Undo/Redo
    canUndo,
    canRedo,
    undo,
    redo,

    // Draft
    draftAvailable,
    dismissDraft,
    applyDraft,
  };
}
