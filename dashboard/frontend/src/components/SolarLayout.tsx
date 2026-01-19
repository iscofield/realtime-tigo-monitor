import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { PanelData } from '../hooks/useWebSocket';
import { PanelOverlay } from './PanelOverlay';
import type { DisplayMode } from './PanelOverlay';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  LAYOUT_WIDTH,
  LAYOUT_HEIGHT,
  MOBILE_BREAKPOINT,
  MIN_ZOOM,
  MAX_ZOOM,
  CONTENT_PADDING,
  WHEEL_DEBOUNCE_MS,
} from '../constants';
import './SolarLayout.css';

// Wheel uses smaller step than button zoom (ZOOM_STEP=0.25) for smoother feel
const WHEEL_ZOOM_STEP = 0.1;
const ANIMATION_MS = 200;

interface SolarLayoutProps {
  panels: PanelData[];
  mode: DisplayMode;
  transformRef: RefObject<ReactZoomPanPinchRef | null>;
  initialScale: number;
  onTransformed: (
    ref: ReactZoomPanPinchRef,
    state: { scale: number; positionX: number; positionY: number }
  ) => void;
  onManualZoom: () => void;
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

export function SolarLayout({
  panels,
  mode,
  transformRef,
  initialScale,
  onTransformed,
  onManualZoom,
}: SolarLayoutProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Check for mobile viewport
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // Ref for the wrapper element to attach wheel listener
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce ref to prevent animation overlap on rapid scroll (GitHub #408)
  const lastZoomTime = useRef(0);

  // Custom wheel handler - checks for Ctrl/Cmd modifier before zooming
  // This works around the library's broken activationKeys (GitHub #113, #370)
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // Only zoom if Ctrl (Windows/Linux) or Cmd (Mac) is held
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();

        if (!transformRef.current) return;

        // Ignore horizontal-only scroll (deltaY === 0)
        if (event.deltaY === 0) return;

        // Debounce: Prevent animation overlap on rapid scroll
        const now = Date.now();
        if (now - lastZoomTime.current < WHEEL_DEBOUNCE_MS) return;
        lastZoomTime.current = now;

        onManualZoom(); // Track as manual zoom

        // Determine zoom direction based on wheel delta
        if (event.deltaY < 0) {
          // Scroll up = zoom in (centered on viewport, not cursor)
          transformRef.current.zoomIn(WHEEL_ZOOM_STEP, ANIMATION_MS);
        } else {
          // Scroll down = zoom out (centered on viewport, not cursor)
          transformRef.current.zoomOut(WHEEL_ZOOM_STEP, ANIMATION_MS);
        }
      }
      // Without modifier: let event bubble naturally (browser handles scroll/pan)
    },
    [transformRef, onManualZoom]
  );

  // Attach custom wheel handler with passive: false to allow preventDefault
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const options: AddEventListenerOptions = { passive: false };
    wrapper.addEventListener('wheel', handleWheel, options);

    return () => {
      wrapper.removeEventListener('wheel', handleWheel, options);
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
            setRetryCount((c) => c + 1);
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

  // Padding container - provides clearance around content for panning
  const paddingContainerStyle: CSSProperties = {
    padding: `${CONTENT_PADDING}px`,
    display: 'inline-block',
  };

  // Content wrapper - fixed size matching layout for percentage-based overlay positioning
  const contentWrapperStyle: CSSProperties = {
    width: `${LAYOUT_WIDTH}px`,
    height: `${LAYOUT_HEIGHT}px`,
    position: 'relative',
  };

  return (
    <div ref={wrapperRef} className="solar-layout-wrapper">
      <TransformWrapper
        ref={transformRef}
        initialScale={initialScale}
        minScale={MIN_ZOOM}
        maxScale={MAX_ZOOM}
        centerOnInit={true}
        wheel={{
          // Disable library's wheel handling - we use custom handler for Ctrl/Cmd check
          disabled: true,
        }}
        panning={{
          velocityDisabled: prefersReducedMotion,
        }}
        doubleClick={{
          disabled: true, // Prevent accidental zoom when tapping panels
        }}
        smooth={!prefersReducedMotion}
        onTransformed={onTransformed}
        onPanning={onManualZoom}
        onZoom={onManualZoom}
      >
        <TransformComponent
          wrapperStyle={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
          }}
          wrapperClass="transform-component-wrapper"
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
              {imageLoaded &&
                panels.map((panel) => (
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
