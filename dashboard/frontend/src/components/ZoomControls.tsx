import type { CSSProperties } from 'react';
import './ZoomControls.css';

interface ZoomControlsProps {
  zoom: number;
  fitZoom: number;
  minZoom: number;  // 0.25
  maxZoom: number;  // 2
  step: number;     // 0.25
  isMobile: boolean;  // For responsive positioning
  onZoomChange: (zoom: number, isManualZoom?: boolean) => void;
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

export function ZoomControls({ zoom, fitZoom, minZoom, maxZoom, step, isMobile, onZoomChange }: ZoomControlsProps) {
  const canZoomIn = zoom < maxZoom;
  const canZoomOut = zoom > minZoom;

  return (
    <div
      style={containerStyle}
      className={`zoom-controls ${isMobile ? 'zoom-controls--mobile' : 'zoom-controls--desktop'}`}
      data-testid="zoom-controls"
    >
      <button
        onClick={() => onZoomChange(Math.min(maxZoom, zoom + step))}
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
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => onZoomChange(fitZoom)}
        aria-label="Fit to screen"
        className="zoom-button"
        style={getButtonStyle(false)}
        data-testid="zoom-fit"
      >
        ⊡
      </button>
      <button
        onClick={() => onZoomChange(Math.max(minZoom, zoom - step))}
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
