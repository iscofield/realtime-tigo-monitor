import type { CSSProperties, RefObject, MutableRefObject } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import {
  CONTENT_PADDING,
  ZOOM_STEP,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../constants';
import './ZoomControls.css';

const ANIMATION_MS = 200;

interface ZoomControlsProps {
  transformRef: RefObject<ReactZoomPanPinchRef | null>;
  currentZoom: number;
  fitViewportZoom: number;
  fitWidthZoom: number;
  isProgrammaticZoomRef: MutableRefObject<boolean>;
  onFitAction: () => void;
  onManualZoom: () => void;
  isMobile: boolean;
  layoutWidth: number;
  layoutHeight: number;
}

const getButtonStyle = (disabled: boolean): CSSProperties => ({
  width: '44px',
  height: '44px',
  padding: '4px',
  fontSize: '20px',
  fontWeight: 'bold',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: 'white',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
});

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  padding: '8px',
  backgroundColor: 'rgba(51, 51, 51, 0.8)', // #333 at 80%
  borderRadius: '8px',
};

export function ZoomControls({
  transformRef,
  currentZoom,
  fitViewportZoom,
  fitWidthZoom,
  isProgrammaticZoomRef,
  onFitAction,
  onManualZoom,
  isMobile,
  layoutWidth,
  layoutHeight,
}: ZoomControlsProps) {
  const canZoomIn = currentZoom < MAX_ZOOM;
  const canZoomOut = currentZoom > MIN_ZOOM;

  const handleZoomIn = () => {
    if (!transformRef.current) {
      console.warn('ZoomControls: transformRef not ready');
      return;
    }
    onManualZoom();
    transformRef.current.zoomIn(ZOOM_STEP, ANIMATION_MS);
  };

  const handleZoomOut = () => {
    if (!transformRef.current) {
      console.warn('ZoomControls: transformRef not ready');
      return;
    }
    onManualZoom();
    transformRef.current.zoomOut(ZOOM_STEP, ANIMATION_MS);
  };

  const handleFitViewport = () => {
    if (!transformRef.current) {
      console.warn('ZoomControls: transformRef not ready');
      return;
    }

    // Calculate centered position explicitly instead of using centerView
    // centerView has issues when wrapper height isn't properly established
    const wrapperBounds =
      transformRef.current.instance.wrapperComponent?.getBoundingClientRect();
    if (!wrapperBounds) {
      console.warn('ZoomControls: wrapperComponent not found');
      return;
    }

    // Calculate content dimensions at target scale
    const contentWidth = (layoutWidth + CONTENT_PADDING * 2) * fitViewportZoom;
    const contentHeight = (layoutHeight + CONTENT_PADDING * 2) * fitViewportZoom;

    // Calculate centered X and Y positions
    const centerX = (wrapperBounds.width - contentWidth) / 2;
    // Use Math.max(0, ...) to ensure content never goes above viewport
    const centerY = Math.max(0, (wrapperBounds.height - contentHeight) / 2);

    // Set guard BEFORE calling library method, reset immediately after
    // Library callbacks fire synchronously, so guard only needs to be set during the call
    isProgrammaticZoomRef.current = true;
    onFitAction(); // Clears hasManuallyZoomed
    transformRef.current.setTransform(centerX, centerY, fitViewportZoom, ANIMATION_MS);
    isProgrammaticZoomRef.current = false;
  };

  const handleFitWidth = () => {
    if (!transformRef.current) {
      console.warn('ZoomControls: transformRef not ready');
      return;
    }

    // Calculate centered X position for fit-to-width
    const wrapperBounds =
      transformRef.current.instance.wrapperComponent?.getBoundingClientRect();
    if (!wrapperBounds) {
      console.warn('ZoomControls: wrapperComponent not found');
      return;
    }

    const contentWidth = (layoutWidth + CONTENT_PADDING * 2) * fitWidthZoom;
    const centerX = (wrapperBounds.width - contentWidth) / 2;

    // Set guard, call method, reset immediately (callbacks are synchronous)
    isProgrammaticZoomRef.current = true;
    onFitAction(); // Clears hasManuallyZoomed (fit-to-width should also re-fit on resize)
    // Y=0 to start at top, allowing downward pan
    transformRef.current.setTransform(centerX, 0, fitWidthZoom, ANIMATION_MS);
    isProgrammaticZoomRef.current = false;
  };

  return (
    <div
      style={containerStyle}
      className={`zoom-controls ${isMobile ? 'zoom-controls--mobile' : 'zoom-controls--desktop'}`}
      data-testid="zoom-controls"
    >
      <button
        onClick={handleZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        className="zoom-button"
        style={getButtonStyle(!canZoomIn)}
        data-testid="zoom-in"
      >
        +
      </button>
      <span
        aria-live="polite"
        data-testid="zoom-level"
        style={{ color: 'white', fontSize: '14px', padding: '4px 0' }}
      >
        {Math.round(currentZoom * 100)}%
      </span>
      <button
        onClick={handleFitViewport}
        aria-label="Fit to viewport"
        className="zoom-button"
        style={getButtonStyle(false)}
        data-testid="zoom-fit"
      >
        ⊡
      </button>
      <button
        onClick={handleFitWidth}
        aria-label="Fit to width"
        className="zoom-button"
        style={getButtonStyle(false)}
        data-testid="zoom-fit-width"
      >
        ↔
      </button>
      <button
        onClick={handleZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        className="zoom-button"
        style={getButtonStyle(!canZoomOut)}
        data-testid="zoom-out"
      >
        −
      </button>
    </div>
  );
}
