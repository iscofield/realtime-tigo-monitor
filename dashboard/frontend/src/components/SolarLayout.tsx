import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { PanelData } from '../hooks/useWebSocket';
import { PanelOverlay } from './PanelOverlay';
import type { DisplayMode } from './PanelOverlay';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { LAYOUT_WIDTH, LAYOUT_HEIGHT, MOBILE_BREAKPOINT, MIN_ZOOM, MAX_ZOOM } from '../constants';
import './SolarLayout.css';

// Spike: Content padding for UI overlay clearance
const CONTENT_PADDING = 150;

// Zoom step for wheel events (matches library default)
const WHEEL_ZOOM_STEP = 0.1;
const ANIMATION_MS = 200;

interface SolarLayoutProps {
  panels: PanelData[];
  mode: DisplayMode;
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

// Spike: Debug overlay to show current zoom level
const debugOverlayStyle: CSSProperties = {
  position: 'fixed',
  top: '60px',
  right: '10px',
  backgroundColor: 'rgba(0,0,0,0.8)',
  color: '#00ff00',
  padding: '10px',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '12px',
  zIndex: 9999,
  whiteSpace: 'pre',
};

export function SolarLayout({ panels, mode }: SolarLayoutProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [lastEvent, setLastEvent] = useState('none');
  const imgRef = useRef<HTMLImageElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Check for mobile viewport
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // Ref for the wrapper element to attach wheel listener
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Custom wheel handler - checks for Ctrl/Cmd modifier before zooming
  // This works around the library's broken activationKeys (GitHub #113, #370)
  const handleWheel = useCallback((event: WheelEvent) => {
    // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) is held
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      if (!transformRef.current) return;

      // Determine zoom direction based on wheel delta
      if (event.deltaY < 0) {
        // Scroll up = zoom in
        transformRef.current.zoomIn(WHEEL_ZOOM_STEP, ANIMATION_MS);
        setLastEvent('wheel-zoom-in');
      } else {
        // Scroll down = zoom out
        transformRef.current.zoomOut(WHEEL_ZOOM_STEP, ANIMATION_MS);
        setLastEvent('wheel-zoom-out');
      }
    }
    // Without modifier: let event bubble naturally (browser handles scroll/pan)
  }, []);

  // Attach custom wheel handler
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Use passive: false to allow preventDefault for Ctrl+wheel
    wrapper.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  // NFR-5.1: Defensive pattern for cached images that load synchronously
  useLayoutEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
      setImageLoaded(true);
    }
  }, [retryCount]);

  // Handle image load error
  if (imageError) {
    return (
      <div style={errorContainerStyle} data-testid="image-error">
        <p>Failed to load layout image</p>
        <button
          style={retryButtonStyle}
          onClick={() => {
            setImageError(false);
            setImageLoaded(false);
            setRetryCount(c => c + 1);
          }}
          data-testid="image-retry-button"
        >
          Retry
        </button>
      </div>
    );
  }

  // Image styling - natural size
  const imageStyle: CSSProperties = {
    display: 'block',
    maxWidth: 'none',
    height: 'auto',
  };

  // Padding container - provides clearance around content
  const paddingContainerStyle: CSSProperties = {
    padding: `${CONTENT_PADDING}px`,
    display: 'inline-block',
  };

  // Content wrapper - fixed size matching layout
  const contentWrapperStyle: CSSProperties = {
    width: `${LAYOUT_WIDTH}px`,
    height: `${LAYOUT_HEIGHT}px`,
    position: 'relative',
  };

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%' }}>
      {/* Spike: Debug overlay */}
      <div style={debugOverlayStyle}>
        {`Zoom: ${(currentZoom * 100).toFixed(0)}%
Last event: ${lastEvent}
Test instructions:
- Plain scroll/trackpad → should SCROLL page
- Ctrl+scroll (Win) / Cmd+scroll (Mac) → should ZOOM
- Drag → should PAN
- Pinch → should ZOOM`}
      </div>

      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={MIN_ZOOM}
        maxScale={MAX_ZOOM}
        centerOnInit={true}
        wheel={{
          // Disable library's wheel handling - we use custom handler for Ctrl/Cmd check
          disabled: true,
        }}
        panning={{
          velocityDisabled: true,
        }}
        doubleClick={{
          disabled: true,
        }}
        onTransformed={(_ref, state) => {
          setCurrentZoom(state.scale);
        }}
        onPanning={() => setLastEvent('panning')}
        onZoom={() => setLastEvent('zoom')}
        onPinching={() => setLastEvent('pinching')}
        smooth={!prefersReducedMotion}
      >
        <TransformComponent
          wrapperStyle={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <div style={paddingContainerStyle}>
            <div style={contentWrapperStyle}>
              <img
                key={retryCount}
                ref={imgRef}
                src="/layout.png"
                alt="Solar panel layout"
                style={imageStyle}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
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
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
