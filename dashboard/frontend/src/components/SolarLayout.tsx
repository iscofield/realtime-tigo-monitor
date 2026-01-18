import { useState, useRef, useLayoutEffect } from 'react';
import type { CSSProperties } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { PanelOverlay } from './PanelOverlay';
import type { DisplayMode } from './PanelOverlay';

interface SolarLayoutProps {
  panels: PanelData[];
  mode: DisplayMode;
}

const containerStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};

const imageStyle: CSSProperties = {
  display: 'block',
  maxWidth: 'none',  // Allow image to render at natural size
  height: 'auto',
};

const errorContainerStyle: CSSProperties = {
  padding: '20px',
  textAlign: 'center',
  color: '#dc3545',
};

const retryButtonStyle: CSSProperties = {
  marginTop: '10px',
  padding: '8px 16px',
  fontSize: '14px',
  cursor: 'pointer',
  backgroundColor: '#5cb85c',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
};

export function SolarLayout({ panels, mode }: SolarLayoutProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // NFR-5.1: Defensive pattern for cached images that load synchronously
  // Check naturalWidth to detect broken cached images
  useLayoutEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [retryCount]);

  // Handle image load error (FR-4.9)
  if (imageError) {
    return (
      <div style={errorContainerStyle} data-testid="image-error">
        <p>Failed to load layout image</p>
        <button
          style={retryButtonStyle}
          onClick={() => {
            setImageError(false);
            setImageLoaded(false);
            setRetryCount(c => c + 1); // Force remount to reload image
          }}
          data-testid="image-retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Key forces remount on retry, triggering new image request */}
      <img
        key={retryCount}
        ref={imgRef}
        src="/layout.png"
        alt="Solar panel layout"
        style={imageStyle}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
      {/* NFR-5.1: Only render overlays after image loads for correct positioning */}
      {imageLoaded && panels.map(panel => (
        <PanelOverlay
          key={panel.display_label}
          panel={panel}
          mode={mode}
        />
      ))}
    </div>
  );
}
