import { useEffect, useRef, useCallback, type RefObject } from 'react';
import { ZOOM_STEP, MIN_ZOOM, MAX_ZOOM, PINCH_THRESHOLD_PX } from '../constants';

interface UsePinchZoomOptions {
  zoom: number;
  onZoomChange: (newZoom: number, isManualZoom: boolean) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}

interface TouchState {
  initialDistance: number;
  initialZoom: number;
}

function getTouchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function usePinchZoom({ zoom, onZoomChange, scrollRef }: UsePinchZoomOptions) {
  const touchState = useRef<TouchState | null>(null);
  const currentZoom = useRef(zoom);
  const isPinching = useRef(false); // Track if we've started pinching (past threshold)

  // Keep ref in sync with prop
  useEffect(() => {
    currentZoom.current = zoom;
  }, [zoom]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2) return;

    touchState.current = {
      initialDistance: getTouchDistance(e.touches),
      initialZoom: currentZoom.current,
    };
    isPinching.current = false; // Reset pinch state
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length !== 2 || !touchState.current) return;

    const currentDistance = getTouchDistance(e.touches);
    const distanceChange = Math.abs(currentDistance - touchState.current.initialDistance);

    // Don't treat as pinch until threshold exceeded (allows two-finger pan)
    if (!isPinching.current && distanceChange < PINCH_THRESHOLD_PX) {
      return; // Let browser handle as pan
    }

    // Once threshold exceeded, we're pinching
    isPinching.current = true;
    e.preventDefault(); // Block browser pinch zoom

    const scale = currentDistance / touchState.current.initialDistance;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      touchState.current.initialZoom * scale
    ));

    // Apply continuous zoom during gesture (don't set hasManuallyZoomed yet)
    onZoomChange(newZoom, false);
  }, [onZoomChange]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Only process when we were actively pinching and dropping from 2 to fewer fingers
    if (!touchState.current || !isPinching.current) {
      touchState.current = null;
      return;
    }

    // Still have 2+ fingers? Not done pinching
    if (e.touches.length >= 2) return;

    // Snap to nearest step on gesture end
    const snappedZoom = Math.round(currentZoom.current / ZOOM_STEP) * ZOOM_STEP;
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, snappedZoom));

    // Final zoom change with isManualZoom=true to set hasManuallyZoomed
    onZoomChange(clampedZoom, true);

    touchState.current = null;
    isPinching.current = false;
  }, [onZoomChange]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, scrollRef]);
}
