import { useState, useRef, useCallback, useLayoutEffect } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useWebSocket } from './hooks/useWebSocket';
import { useMediaQuery } from './hooks/useMediaQuery';
import { getInitialStateFromUrl, useUrlParamsSync } from './hooks/useUrlParams';
import { SolarLayout } from './components/SolarLayout';
import { ModeToggle } from './components/ModeToggle';
import { ConnectionStatusDisplay } from './components/ConnectionStatus';
import { SystemWarningBanner } from './components/SystemWarningBanner';
import { TabNavigation, type TabType } from './components/TabNavigation';
import { TableView } from './components/TableView';
import { ZoomControls } from './components/ZoomControls';
import type { DisplayMode } from './components/PanelOverlay';
import {
  MOBILE_BREAKPOINT,
  LAYOUT_WIDTH,
  LAYOUT_HEIGHT,
  CONTENT_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  HEADER_HEIGHT,
  TAB_HEIGHT_DESKTOP,
  TAB_HEIGHT_MOBILE,
} from './constants';

// Get initial state from URL parameters (or defaults)
const initialState = getInitialStateFromUrl();

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

const modeToggleMobileStyle: CSSProperties = {
  ...modeToggleContainerStyle,
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 999,
  borderBottom: '1px solid #e0e0e0',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

// Spacer to prevent content from being hidden behind fixed mode toggle on mobile
const modeToggleSpacerStyle: CSSProperties = {
  height: '52px',
  flexShrink: 0,
};

const layoutContainerStyle: CSSProperties = {
  flexGrow: 1,
  overflow: 'hidden',
};

function App() {
  const [mode, setMode] = useState<DisplayMode>(initialState.mode);
  const [activeTab, setActiveTab] = useState<TabType>(initialState.view);
  const { panels, status, error, retry } = useWebSocket();
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  // Sync view and mode state with URL parameters
  useUrlParamsSync(activeTab, mode);

  // Zoom state management
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const hasManuallyZoomed = useRef(false);
  const isProgrammaticZoom = useRef(false);

  // Calculate fit zoom values (SSR-safe)
  const calculateFitZooms = useCallback(
    (mobile: boolean) => {
      if (typeof window === 'undefined') {
        return { fitViewportZoom: 1, fitWidthZoom: 1 };
      }

      const viewportWidth = window.innerWidth;
      const tabHeight = mobile ? TAB_HEIGHT_MOBILE : TAB_HEIGHT_DESKTOP;
      const viewportHeight = window.innerHeight - HEADER_HEIGHT - tabHeight;

      // Account for padding in calculations
      const contentWidth = LAYOUT_WIDTH + CONTENT_PADDING * 2;
      const contentHeight = LAYOUT_HEIGHT + CONTENT_PADDING * 2;

      // Fit to viewport (contain entire image)
      const fitViewportZoom = Math.min(
        viewportWidth / contentWidth,
        viewportHeight / contentHeight
      );

      // Fit to width (fill width, allow vertical pan)
      const fitWidthZoom = viewportWidth / contentWidth;

      return {
        fitViewportZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitViewportZoom)),
        fitWidthZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitWidthZoom)),
      };
    },
    []
  );

  // SSR-safe initial state for fit zooms
  const [fitZooms, setFitZooms] = useState({ fitViewportZoom: 1, fitWidthZoom: 1 });

  // Calculate on mount (client-side only)
  useLayoutEffect(() => {
    setFitZooms(calculateFitZooms(isMobile));
  }, [calculateFitZooms, isMobile]);

  // Handle transform changes from library
  const handleTransformed = useCallback(
    (
      _ref: ReactZoomPanPinchRef,
      state: { scale: number; positionX: number; positionY: number }
    ) => {
      setCurrentZoom(state.scale);
    },
    []
  );

  // Handle manual zoom (only for user-initiated actions)
  const handleManualZoom = useCallback(() => {
    if (!isProgrammaticZoom.current) {
      hasManuallyZoomed.current = true;
    }
  }, []);

  // Clear manual zoom flag (for fit buttons)
  const handleFitAction = useCallback(() => {
    hasManuallyZoomed.current = false;
  }, []);

  // Window resize handler
  useLayoutEffect(() => {
    const handleResize = () => {
      const newFitZooms = calculateFitZooms(isMobile);
      setFitZooms(newFitZooms);

      // Re-fit only if user hasn't manually zoomed
      if (!hasManuallyZoomed.current && transformRef.current) {
        transformRef.current.centerView(newFitZooms.fitViewportZoom, 0);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateFitZooms, isMobile]);

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
          <>
            <div style={isMobile ? modeToggleMobileStyle : modeToggleContainerStyle}>
              <ModeToggle mode={mode} setMode={setMode} />
            </div>
            {isMobile && <div style={modeToggleSpacerStyle} />}
          </>
        )}

        {activeTab === 'layout' ? (
          <div style={layoutContainerStyle}>
            <SolarLayout
              panels={panels}
              mode={mode}
              transformRef={transformRef}
              initialScale={fitZooms.fitViewportZoom}
              onTransformed={handleTransformed}
              onManualZoom={handleManualZoom}
            />
          </div>
        ) : (
          <TableView panels={panels} />
        )}
      </main>

      {/* FR-4: Zoom controls (only for layout view) */}
      {activeTab === 'layout' && (
        <ZoomControls
          transformRef={transformRef}
          currentZoom={currentZoom}
          fitViewportZoom={fitZooms.fitViewportZoom}
          fitWidthZoom={fitZooms.fitWidthZoom}
          isProgrammaticZoomRef={isProgrammaticZoom as MutableRefObject<boolean>}
          onFitAction={handleFitAction}
          onManualZoom={handleManualZoom}
          isMobile={isMobile}
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
