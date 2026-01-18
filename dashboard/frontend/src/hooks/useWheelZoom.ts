import { useEffect, useRef, useCallback, type RefObject } from 'react';
import {
  ZOOM_STEP, MIN_ZOOM, MAX_ZOOM,
  WHEEL_DELTA_PER_STEP, WHEEL_DEBOUNCE_MS
} from '../constants';

interface UseWheelZoomOptions {
  zoom: number;
  onZoomChange: (newZoom: number, isManualZoom: boolean) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function useWheelZoom({ zoom, onZoomChange, scrollRef }: UseWheelZoomOptions) {
  const lastWheelTime = useRef(0);
  const accumulatedDelta = useRef(0);

  const handleWheel = useCallback((e: WheelEvent) => {
    // Only handle zoom when Ctrl (Win/Linux) or Meta (Mac) is held
    // Note: macOS trackpad pinch gestures send Ctrl+wheel events,
    // resulting in stepped zoom. This is acceptable UX for v1.0.
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault(); // Prevent browser zoom

    // Accumulate delta for smoother trackpad experience
    accumulatedDelta.current += e.deltaY;

    const now = Date.now();
    if (now - lastWheelTime.current < WHEEL_DEBOUNCE_MS) return;
    lastWheelTime.current = now;

    // Calculate zoom steps from accumulated delta
    const steps = Math.round(accumulatedDelta.current / WHEEL_DELTA_PER_STEP);

    if (steps === 0) return; // Keep accumulating if no full step yet

    accumulatedDelta.current = 0; // Only reset after successful step calculation

    const direction = steps < 0 ? 1 : -1; // Negative delta = scroll up = zoom in
    const stepCount = Math.abs(steps);
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + direction * stepCount * ZOOM_STEP));

    if (newZoom !== zoom) {
      onZoomChange(newZoom, true); // true = manual zoom
    }
  }, [zoom, onZoomChange]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    // passive: false required to call preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel, scrollRef]);
}
