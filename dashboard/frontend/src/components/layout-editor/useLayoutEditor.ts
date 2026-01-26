/**
 * Layout Editor state management hook.
 * Handles edit mode, panel positions, undo/redo, and draft persistence.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { PanelPosition, EditHistory, EditorHistoryState, LayoutDraft, LayoutConfig } from '../../types/config';
import type { EditorPanel, SpatialIndex } from './types';
import { buildSpatialIndex } from './types';
import {
  getLayoutConfig,
  updateLayoutConfig,
  updatePanelPositions,
  getPanelsConfig,
} from '../../api/config';

const DRAFT_KEY = 'solar-tigo-layout-draft';
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

  // Image scale state: undefined = not yet loaded, number = loaded value
  const [imageScale, setImageScale] = useState<number | undefined>(undefined);
  // Effective scale for rendering (use default until config loads)
  // Fallback chain: local state -> config -> default (100)
  const effectiveImageScale = imageScale ?? layoutConfig?.image_scale ?? 100;

  // Panels
  const [panels, setPanels] = useState<EditorPanel[]>([]);
  const [positions, setPositions] = useState<Record<string, PanelPosition | null>>({});
  const [selectedPanels, setSelectedPanels] = useState<Set<string>>(new Set());

  // Snap settings
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Undo/redo history
  const [history, setHistory] = useState<EditHistory>({ states: [], currentIndex: -1 });


  // Track if there are unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialPositionsRef = useRef<Record<string, PanelPosition | null>>({});

  // Refs to track latest values (avoids stale closure issues in callbacks)
  // IMPORTANT: These useEffects create a timing gap between setState and ref update.
  // Any code path calling setImageScale/setPositions MUST also manually sync the ref
  // immediately if the value is needed before the next render.
  const positionsRef = useRef<Record<string, PanelPosition | null>>(positions);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  const imageScaleRef = useRef<number>(effectiveImageScale);
  useEffect(() => { imageScaleRef.current = effectiveImageScale; }, [effectiveImageScale]);

  // Ref for history to avoid stale closure issues with rapid undo/redo clicks
  const historyRef = useRef(history);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Pending history record flag to prevent duplicate recordings (release + blur)
  const [pendingHistoryRecord, setPendingHistoryRecord] = useState(false);

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
        setImageScale(config.image_scale ?? 100);

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
  const imageSize = useMemo(() => ({
    width: layoutConfig?.image_width || 800,
    height: layoutConfig?.image_height || 600,
  }), [layoutConfig]);

  const spatialIndex = useMemo<SpatialIndex>(() => {
    const positionedPanels = panels.map(p => ({
      ...p,
      position: positions[p.serial] ?? p.position,
    }));
    return buildSpatialIndex(positionedPanels, overlaySize, undefined, imageSize);
  }, [panels, positions, overlaySize, imageSize]);

  // Initialize history when entering edit mode
  const enterEditMode = useCallback(() => {
    setIsEditMode(true);
    const initialState: EditorHistoryState = {
      positions: { ...positions },
      imageScale: effectiveImageScale,
    };
    setHistory({
      states: [initialState],
      currentIndex: 0,
    });
    initialPositionsRef.current = { ...positions };
    initialImageScaleRef.current = effectiveImageScale;
    setHasUnsavedChanges(false);
  }, [positions, effectiveImageScale]);

  // Initial image scale ref (for discard)
  const initialImageScaleRef = useRef<number>(100);

  // Exit edit mode
  const exitEditMode = useCallback((discardChanges: boolean = false) => {
    if (discardChanges) {
      // Reset to persisted values
      setPositions(initialPositionsRef.current);
      setImageScale(initialImageScaleRef.current);
      setOverlaySize(layoutConfig?.overlay_size ?? 50);
    }

    setIsEditMode(false);
    setSelectedPanels(new Set());
    setHistory({ states: [], currentIndex: -1 });
    setHasUnsavedChanges(false);
    clearDraft();
  }, [layoutConfig?.overlay_size]);

  // Auto-enter edit mode after loading
  const hasAutoEntered = useRef(false);
  useEffect(() => {
    if (!isLoading && !error && !hasAutoEntered.current) {
      hasAutoEntered.current = true;
      enterEditMode();
    }
  }, [isLoading, error, enterEditMode]);

  // Record state change to history (captures both positions and imageScale)
  // Call this on: panel drag END, slider RELEASE (onMouseUp/onTouchEnd), numeric input BLUR
  const recordHistoryState = useCallback((
    newPositions: Record<string, PanelPosition | null>,
    newImageScale: number
  ) => {
    setHistory(prev => {
      // Truncate any "future" states if we've undone then made new changes
      // (user's new action invalidates forward history)
      const truncated = prev.states.slice(0, prev.currentIndex + 1);
      const newState: EditorHistoryState = {
        positions: { ...newPositions },
        imageScale: newImageScale,
      };
      // Truncation strategy:
      // 1. Discard redo states beyond currentIndex (user's new action invalidates forward history)
      // 2. Append new state
      // 3. If exceeds 50, discard oldest states (FIFO)
      // 4. currentIndex always points to the new state
      const newStates = [...truncated, newState].slice(-MAX_HISTORY_DEPTH);
      return {
        states: newStates,
        currentIndex: newStates.length - 1,  // Always point to newest
      };
    });
    setHasUnsavedChanges(true);
    setPendingHistoryRecord(false);
  }, []);

  // Update panel position
  const updatePosition = useCallback(
    (serial: string, position: PanelPosition | null) => {
      setPositions(prev => {
        const newPositions = { ...prev, [serial]: position };
        recordHistoryState(newPositions, imageScaleRef.current);
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
        recordHistoryState(newPositions, imageScaleRef.current);
        return newPositions;
      });
    },
    [recordHistoryState]
  );

  // Update positions without recording to history (for arrow key movement)
  const updatePositionsWithoutHistory = useCallback(
    (updates: Record<string, PanelPosition | null>) => {
      setPositions(prev => {
        const next = { ...prev, ...updates };
        // Ref update in updater is safe: useEffect also syncs positionsRef,
        // and keyup handler reads only after state flushes
        positionsRef.current = next;
        return next;
      });
      setHasUnsavedChanges(true);
    },
    []
  );

  // Expose for keyup handler in LayoutEditor.tsx (reads from refs)
  const recordCurrentHistoryState = useCallback(() => {
    recordHistoryState(positionsRef.current, imageScaleRef.current);
  }, [recordHistoryState]);

  // Commit any pending history record (for keyboard-then-save without blur)
  // Note: pendingHistoryRecord in deps causes callback recreation on flag change.
  // A ref-based approach would make this stable but harder to debug.
  // Current approach is clearer; recreation overhead is negligible.
  const commitIfPending = useCallback(() => {
    if (pendingHistoryRecord) {
      recordHistoryState(positionsRef.current, imageScaleRef.current);
    }
  }, [pendingHistoryRecord, recordHistoryState]);

  // Image scale change handler (marks pending, does not record immediately)
  const handleImageScaleChange = useCallback((newScale: number) => {
    setImageScale(newScale);
    imageScaleRef.current = newScale;  // Sync ref immediately for onMouseUp
    setPendingHistoryRecord(true);
    setHasUnsavedChanges(true);
  }, []);

  // Image scale commit handler (called on release to record history)
  const handleImageScaleCommit = useCallback(() => {
    if (pendingHistoryRecord) {
      recordHistoryState(positionsRef.current, imageScaleRef.current);
    }
  }, [pendingHistoryRecord, recordHistoryState]);

  // Undo - uses ref for synchronous check to avoid stale closure issues with rapid clicks
  const canUndo = history.currentIndex > 0;
  const undo = useCallback(() => {
    const currentHistory = historyRef.current;
    // Explicit boundary check - distinguishes "at oldest state" from "corrupted history"
    if (currentHistory.currentIndex <= 0) return;
    const stateToRestore = currentHistory.states[currentHistory.currentIndex - 1];

    // Guard uses ref for synchronous check; setState rechecks in case of concurrent updates
    setHistory(prev => {
      if (prev.currentIndex <= 0) return prev;
      return { ...prev, currentIndex: prev.currentIndex - 1 };
    });
    setPositions(stateToRestore.positions);
    setImageScale(stateToRestore.imageScale);
  }, []);  // No deps needed - reads from ref

  // Redo - same ref pattern as undo for consistency
  const canRedo = history.currentIndex < history.states.length - 1;
  const redo = useCallback(() => {
    const currentHistory = historyRef.current;
    // Explicit boundary check - distinguishes "at newest state" from "corrupted history"
    if (currentHistory.currentIndex >= currentHistory.states.length - 1) return;
    const stateToRestore = currentHistory.states[currentHistory.currentIndex + 1];

    // Guard uses ref for synchronous check; setState rechecks in case of concurrent updates
    setHistory(prev => {
      if (prev.currentIndex >= prev.states.length - 1) return prev;
      return { ...prev, currentIndex: prev.currentIndex + 1 };
    });
    setPositions(stateToRestore.positions);
    setImageScale(stateToRestore.imageScale);
  }, []);  // No deps needed - reads from ref

  // Selection management - always toggle (no addToSelection parameter needed)
  const selectPanel = useCallback((serial: string) => {
    setSelectedPanels(prev => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
      } else {
        next.add(serial);
      }
      return next;
    });
  }, []);

  // Helper to get only positioned panels from selection (unpositioned panels ignored)
  const getPositionedSelection = useCallback(() => {
    return [...selectedPanels].filter(s => positions[s] != null);
  }, [selectedPanels, positions]);

  // Select all positioned panels only (unpositioned panels can't be nudged/dragged)
  const selectAll = useCallback(() => {
    const positioned = panels.filter(p => positions[p.serial] != null);
    setSelectedPanels(new Set(positioned.map(p => p.serial)));
  }, [panels, positions]);

  const deselectAll = useCallback(() => {
    setSelectedPanels(new Set());
  }, []);

  // Save to backend
  const save = useCallback(async () => {
    // Record any pending history before save (handles keyboard-change-then-save without blur)
    commitIfPending();

    setIsSaving(true);
    setError(null);
    try {
      // Save panel positions first
      await updatePanelPositions(positions);

      // Save layout config (overlay size and image scale)
      await updateLayoutConfig({
        overlay_size: overlaySize,
        image_scale: effectiveImageScale,
      });

      // Update initial refs for potential future discard
      initialPositionsRef.current = { ...positions };
      initialImageScaleRef.current = effectiveImageScale;
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
  }, [overlaySize, effectiveImageScale, positions, commitIfPending, exitEditMode, onSaveSuccess, onSaveError]);

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

  // Save draft on every position change while in edit mode
  useEffect(() => {
    if (isEditMode && hasUnsavedChanges) {
      saveDraft(positions, overlaySize);
    }
  }, [isEditMode, hasUnsavedChanges, positions, overlaySize, saveDraft]);

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
    recordHistoryState({ ...positions, ...validPositions }, imageScaleRef.current);
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

  // Refresh layout config (e.g., after image upload)
  const refreshLayoutConfig = useCallback(async () => {
    try {
      const config = await getLayoutConfig();
      setLayoutConfig(config);
    } catch (err) {
      console.error('Failed to refresh layout config:', err);
    }
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
    imageScale: effectiveImageScale,
    setImageScale: handleImageScaleChange,
    onImageScaleCommit: handleImageScaleCommit,
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
    exitEditMode,
    updatePosition,
    updatePositions,
    updatePositionsWithoutHistory,
    recordCurrentHistoryState,
    selectPanel,
    selectAll,
    deselectAll,
    getPositionedSelection,
    save,
    refreshLayoutConfig,

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
