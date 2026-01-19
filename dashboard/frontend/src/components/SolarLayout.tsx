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

// Wheel zoom configuration
// Base step scaled by deltaY magnitude for proportional feel across input devices
const WHEEL_ZOOM_SENSITIVITY = 0.002; // Multiplied by pixel delta for zoom step
const MIN_WHEEL_ZOOM_STEP = 0.02; // Minimum step to ensure some zoom happens
const MAX_WHEEL_ZOOM_STEP = 0.15; // Cap to prevent jarring jumps
const WHEEL_ANIMATION_MS = 100; // Shorter animation for snappier wheel response
const PIXELS_PER_LINE = 40; // Approximate pixels per line for deltaMode=1 (mouse wheels)

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
  //
  // IMPORTANT: On macOS, trackpad pinch gestures generate synthetic wheel events
  // with ctrlKey=true. We must NOT intercept these - let the library handle pinch
  // natively via touch/gesture events. We only handle actual Ctrl+scroll (keyboard).
  //
  // Heuristic to detect synthetic pinch vs real Ctrl+scroll:
  // - Pinch events have ctrlKey=true but NO keyboard Ctrl press
  // - We can't detect this directly, but pinch events typically have very small
  //   deltaY values (< 10) while real mouse wheel has larger values
  // - However, this isn't reliable, so we check metaKey only (Cmd+scroll on Mac)
  //   and let ctrlKey events pass through to the library's pinch handler
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // On macOS: Only handle Cmd+scroll (metaKey), not Ctrl+scroll
      // ctrlKey on Mac is often synthetic from pinch gestures
      // On Windows/Linux: Handle Ctrl+scroll (ctrlKey)
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const shouldZoom = isMac ? event.metaKey : event.ctrlKey;

      if (shouldZoom) {
        event.preventDefault();

        if (!transformRef.current) return;

        // Ignore horizontal-only scroll (deltaY === 0)
        if (event.deltaY === 0) return;

        // Debounce: Prevent animation overlap on very rapid scroll
        const now = Date.now();
        if (now - lastZoomTime.current < WHEEL_DEBOUNCE_MS) return;
        lastZoomTime.current = now;

        onManualZoom(); // Track as manual zoom

        // Normalize deltaY to pixels based on deltaMode
        // deltaMode 0 = pixels (trackpad, smooth-scroll mouse)
        // deltaMode 1 = lines (traditional mouse wheel, ~40px per line)
        // deltaMode 2 = pages (rare, ~800px per page)
        let deltaPixels = event.deltaY;
        if (event.deltaMode === 1) {
          deltaPixels = event.deltaY * PIXELS_PER_LINE;
        } else if (event.deltaMode === 2) {
          deltaPixels = event.deltaY * window.innerHeight;
        }

        // Calculate proportional zoom step based on normalized pixel delta
        const rawStep = Math.abs(deltaPixels) * WHEEL_ZOOM_SENSITIVITY;
        const zoomStep = Math.max(MIN_WHEEL_ZOOM_STEP, Math.min(MAX_WHEEL_ZOOM_STEP, rawStep));

        // Determine zoom direction based on wheel delta
        if (event.deltaY < 0) {
          // Scroll up = zoom in (centered on viewport, not cursor)
          transformRef.current.zoomIn(zoomStep, WHEEL_ANIMATION_MS);
        } else {
          // Scroll down = zoom out (centered on viewport, not cursor)
          transformRef.current.zoomOut(zoomStep, WHEEL_ANIMATION_MS);
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

  // Fix for tab switching: centerOnInit doesn't always work reliably when remounting
  // Manually center the view after a short delay to ensure the container has proper dimensions
  // Uses explicit setTransform instead of centerView for reliable positioning
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!transformRef.current) return;

      // Get wrapper bounds for accurate positioning
      const wrapperBounds =
        transformRef.current.instance.wrapperComponent?.getBoundingClientRect();
      if (!wrapperBounds) return;

      // Calculate content dimensions at initial scale
      const contentWidth = (LAYOUT_WIDTH + CONTENT_PADDING * 2) * initialScale;
      const contentHeight = (LAYOUT_HEIGHT + CONTENT_PADDING * 2) * initialScale;

      // Calculate centered positions
      const centerX = (wrapperBounds.width - contentWidth) / 2;
      // Use Math.max(0, ...) to ensure content never goes above viewport
      const centerY = Math.max(0, (wrapperBounds.height - contentHeight) / 2);

      // Use setTransform with explicit positions instead of centerView
      transformRef.current.setTransform(centerX, centerY, initialScale, 0);
    }, 50);
    return () => clearTimeout(timer);
  }, [transformRef, initialScale]);

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
