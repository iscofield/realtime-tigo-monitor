import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { PanelData } from '../hooks/useWebSocket';
import { PanelOverlay } from './PanelOverlay';
import type { DisplayMode } from './PanelOverlay';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getLayoutImageUrl } from '../api/config';
import {
  LAYOUT_WIDTH,
  LAYOUT_HEIGHT,
  MOBILE_BREAKPOINT,
  MIN_ZOOM,
  MAX_ZOOM,
  CONTENT_PADDING,
} from '../constants';
import './SolarLayout.css';

// Zoom step for pinch gestures (smaller than button ZOOM_STEP=0.25 for finer control)
const PINCH_ZOOM_STEP = 0.008;

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

  // Helper to get current transform state from the library
  const getTransformState = useCallback(() => {
    if (!transformRef.current) return null;
    // Access the transform state from the library's instance
    const instance = transformRef.current.instance;
    const { positionX, positionY, scale } = instance.transformState;
    return { positionX, positionY, scale };
  }, [transformRef]);

  // Custom wheel handler for both zoom and pan
  // - Ctrl/Cmd + wheel = zoom (works around library's broken activationKeys, GitHub #113, #370)
  // - Plain wheel = pan (two-finger trackpad scroll)
  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!transformRef.current) return;

      const state = getTransformState();
      if (!state) return;

      event.preventDefault();

      // Ctrl/Cmd + wheel = zoom (pinch gesture on macOS trackpad)
      if (event.ctrlKey || event.metaKey) {
        // Ignore horizontal-only scroll (deltaY === 0)
        if (event.deltaY === 0) return;

        onManualZoom(); // Track as manual zoom

        // Calculate new scale based on wheel delta (no debounce for responsiveness)
        // deltaY is typically ~1-3 for trackpad pinch, negative = zoom in
        const scaleFactor = 1 - event.deltaY * PINCH_ZOOM_STEP;
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.scale * scaleFactor));

        // Anchor zoom on cursor position (keep point under cursor fixed)
        // Get cursor position relative to the wrapper
        const wrapper = wrapperRef.current;
        if (wrapper) {
          const rect = wrapper.getBoundingClientRect();
          const cursorX = event.clientX - rect.left;
          const cursorY = event.clientY - rect.top;

          // Calculate new position to keep cursor point fixed
          // Point under cursor in content coords: (cursorX - posX) / scale
          // After zoom, same point should be at cursor: (cursorX - newPosX) / newScale
          // Solving: newPosX = cursorX - (cursorX - posX) * newScale / scale
          const scaleRatio = newScale / state.scale;
          const newPosX = cursorX - (cursorX - state.positionX) * scaleRatio;
          const newPosY = cursorY - (cursorY - state.positionY) * scaleRatio;

          transformRef.current.setTransform(newPosX, newPosY, newScale, 0);
        } else {
          // Fallback: zoom without anchor
          transformRef.current.setTransform(state.positionX, state.positionY, newScale, 0);
        }
      } else {
        // Plain wheel = pan (two-finger trackpad scroll)
        // Apply wheel deltas as pan offsets (negative because scroll direction is inverted)
        const newX = state.positionX - event.deltaX;
        const newY = state.positionY - event.deltaY;

        // Use setTransform for immediate response (no animation for smooth scrolling feel)
        transformRef.current.setTransform(newX, newY, state.scale, 0);
        onManualZoom(); // Track as manual interaction
      }
    },
    [transformRef, getTransformState, onManualZoom]
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
                src={getLayoutImageUrl()}
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
