import { useState, useLayoutEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useMediaQuery } from './hooks/useMediaQuery';
import { SolarLayout } from './components/SolarLayout';
import { ModeToggle } from './components/ModeToggle';
import { ConnectionStatusDisplay } from './components/ConnectionStatus';
import { SystemWarningBanner } from './components/SystemWarningBanner';
import { TabNavigation, type TabType } from './components/TabNavigation';
import { TableView } from './components/TableView';
import { ZoomControls } from './components/ZoomControls';
import type { DisplayMode } from './components/PanelOverlay';
import { adjustScrollForZoom } from './utils/zoom';
import {
  LAYOUT_WIDTH, LAYOUT_HEIGHT, HEADER_HEIGHT, TAB_HEIGHT_DESKTOP,
  TAB_HEIGHT_MOBILE, VIEWPORT_PADDING, SCROLLBAR_WIDTH, MIN_ZOOM,
  MAX_ZOOM, ZOOM_STEP, MOBILE_BREAKPOINT
} from './constants';

const appStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  display: 'flex',
  flexDirection: 'column',
};

const mainStyle: CSSProperties = {
  position: 'relative',
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modeToggleContainerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '10px',
  backgroundColor: '#fff',
  borderBottom: '1px solid #e0e0e0',
  flexShrink: 0,
};

const layoutContainerStyle: CSSProperties = {
  flexGrow: 1,
  overflow: 'hidden',
};

function App() {
  // FR-4.5: Default mode is Watts
  const [mode, setMode] = useState<DisplayMode>('watts');
  // FR-1.5: Default tab is Layout
  const [activeTab, setActiveTab] = useState<TabType>('layout');
  const { panels, status, error, retry } = useWebSocket();
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // Zoom state
  const [zoom, setZoom] = useState<number>(1); // 1 = 100%
  const [fitZoom, setFitZoom] = useState<number>(1);
  const hasManuallyZoomed = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const calculateFitZoom = useCallback(() => {
    const tabHeight = isMobile ? TAB_HEIGHT_MOBILE : TAB_HEIGHT_DESKTOP;
    const scrollbarOffset = isMobile ? 0 : SCROLLBAR_WIDTH;

    const availableWidth = window.innerWidth - (2 * VIEWPORT_PADDING) - scrollbarOffset;
    const availableHeight = window.innerHeight - HEADER_HEIGHT - tabHeight - (2 * VIEWPORT_PADDING);

    const scaleX = availableWidth / LAYOUT_WIDTH;
    const scaleY = availableHeight / LAYOUT_HEIGHT;
    const fit = Math.min(scaleX, scaleY);

    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
  }, [isMobile]);

  // Handle zoom changes from ZoomControls or hooks (wheel/pinch)
  const handleZoomChange = useCallback((newZoom: number, isManualZoom: boolean = true) => {
    // Note: Direct === comparison is safe here because fitZoom is passed by reference
    // from state to ZoomControls and back. No arithmetic happens in between.
    const isFitAction = newZoom === fitZoom;

    // Adjust scroll position to keep center in view (except for fit-to-screen)
    if (scrollRef.current && !isFitAction) {
      adjustScrollForZoom(scrollRef.current, zoom, newZoom);
    }

    // Track whether user manually zoomed (fit resets this)
    if (isManualZoom) {
      hasManuallyZoomed.current = !isFitAction;
    }

    // Reset scroll to top-left for fit-to-screen
    if (isFitAction && scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
      scrollRef.current.scrollTop = 0;
    }

    setZoom(newZoom);
  }, [fitZoom, zoom]);

  // useLayoutEffect prevents flash of incorrectly-sized content on initial render
  useLayoutEffect(() => {
    const fit = calculateFitZoom();
    setFitZoom(fit);
    setZoom(fit);
    hasManuallyZoomed.current = false;
  }, [calculateFitZoom]);

  // Recalculate fit zoom on window resize (debounced)
  useLayoutEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const newFit = calculateFitZoom();
        setFitZoom(newFit);
        // Only update zoom if user hasn't manually zoomed
        if (!hasManuallyZoomed.current) {
          setZoom(newFit);
        }
      }, 150); // 150ms debounce
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [calculateFitZoom]);

  return (
    <div style={appStyle}>
      {/* System warning banner for state file issues */}
      <SystemWarningBanner />

      {/* FR-1.2: Desktop tab navigation at very top */}
      {!isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <main style={mainStyle}>
        {/* FR-4.8: Connection status indicators */}
        <ConnectionStatusDisplay status={status} error={error} onRetry={retry} />

        {/* FR-4.6: Mode toggle inside page content (only for layout view) */}
        {activeTab === 'layout' && (
          <div style={modeToggleContainerStyle}>
            <ModeToggle mode={mode} setMode={setMode} />
          </div>
        )}

        {/* FR-1.4: Tab switching preserves WebSocket connection */}
        {activeTab === 'layout' ? (
          /* FR-4.1, FR-4.2: Layout with panel overlays */
          <div style={layoutContainerStyle}>
            <SolarLayout
              panels={panels}
              mode={mode}
              zoom={zoom}
              scrollRef={scrollRef}
              onZoomChange={handleZoomChange}
            />
          </div>
        ) : (
          /* FR-2.1: Table view with hierarchical organization */
          <TableView panels={panels} />
        )}
      </main>

      {/* Zoom controls only visible on layout tab */}
      {activeTab === 'layout' && (
        <ZoomControls
          zoom={zoom}
          fitZoom={fitZoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          step={ZOOM_STEP}
          isMobile={isMobile}
          onZoomChange={handleZoomChange}
        />
      )}

      {/* FR-1.3: Mobile bottom navigation */}
      {isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}

export default App;
