import { useState, useRef, useLayoutEffect } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { PanelData } from '../hooks/useWebSocket';
import { PanelOverlay } from './PanelOverlay';
import type { DisplayMode } from './PanelOverlay';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useWheelZoom } from '../hooks/useWheelZoom';
import { usePinchZoom } from '../hooks/usePinchZoom';
import { LAYOUT_WIDTH, LAYOUT_HEIGHT, MOBILE_BREAKPOINT } from '../constants';
import './SolarLayout.css';

interface SolarLayoutProps {
  panels: PanelData[];
  mode: DisplayMode;
  zoom: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onZoomChange: (newZoom: number, isManualZoom: boolean) => void;
}

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

export function SolarLayout({ panels, mode, zoom, scrollRef, onZoomChange }: SolarLayoutProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Hook up wheel and pinch zoom handlers
  useWheelZoom({ zoom, onZoomChange, scrollRef });
  usePinchZoom({ zoom, onZoomChange, scrollRef });

  // Check for reduced motion preference
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Check for mobile viewport
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

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

  // Image styling - fills container at native size
  const imageStyle: CSSProperties = {
    display: 'block',
    maxWidth: 'none',  // Allow image to render at natural size
    height: 'auto',
  };

  // Outer scroll container - has scaled dimensions for scrollbar positioning
  const scrollContainerStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'auto',
  };

  // Inner sizer - sets the scrollable area to match scaled content
  // margin: auto centers the sizer when it's smaller than the scroll container
  const sizerStyle: CSSProperties = {
    width: `${LAYOUT_WIDTH * zoom}px`,
    height: `${LAYOUT_HEIGHT * zoom}px`,
    position: 'relative',
    margin: 'auto',
  };

  // Transform wrapper - applies visual scaling, stays at native dimensions
  const transformWrapperStyle: CSSProperties = {
    width: `${LAYOUT_WIDTH}px`,
    height: `${LAYOUT_HEIGHT}px`,
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
    transition: prefersReducedMotion ? 'none' : 'transform 150ms ease-out',
    position: 'absolute',
    top: 0,
    left: 0,
  };

  return (
    <div ref={scrollRef} style={scrollContainerStyle} className="scroll-container">
      <div style={sizerStyle}>
        <div style={transformWrapperStyle}>
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
              isMobile={isMobile}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
