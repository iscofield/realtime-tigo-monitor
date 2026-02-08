/**
 * Main Dashboard component - the primary solar monitoring view.
 * Shows real-time panel data in layout or table format.
 */

import { useState, useRef, useCallback, useLayoutEffect, useEffect, lazy, Suspense } from 'react';
import type { CSSProperties, MutableRefObject } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useWebSocket } from '../hooks/useWebSocket';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { getInitialStateFromUrl, useUrlParamsSync } from '../hooks/useUrlParams';
import { SolarLayout } from './SolarLayout';
import { ModeToggle } from './ModeToggle';
import { ConnectionStatusDisplay } from './ConnectionStatus';
import { SystemWarningBanner } from './SystemWarningBanner';
import { TabNavigation, type TabType } from './TabNavigation';
import { TableView } from './TableView';
import { ZoomControls } from './ZoomControls';
import { SettingsMenu } from './SettingsMenu';
import type { DisplayMode } from './PanelOverlay';
import type { RestoreData, LayoutConfig } from '../types/config';
import { getLayoutConfig } from '../api/config';

// Lazy load the Layout Editor for code splitting
const LayoutEditor = lazy(() => import('./layout-editor/LayoutEditor'));
import {
  MOBILE_BREAKPOINT,
  LAYOUT_WIDTH,
  LAYOUT_HEIGHT,
  BLANK_CANVAS_WIDTH,
  BLANK_CANVAS_HEIGHT,
  CONTENT_PADDING,
  MIN_ZOOM,
  MAX_ZOOM,
  HEADER_HEIGHT,
  TAB_HEIGHT_DESKTOP,
  TAB_HEIGHT_MOBILE,
} from '../constants';

// Get initial state from URL parameters (or defaults)
const initialState = getInitialStateFromUrl();

const appStyle: CSSProperties = {
  height: '100vh',
  backgroundColor: '#f5f5f5',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const mainStyle: CSSProperties = {
  position: 'relative',
  flexGrow: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modeToggleContainerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '10px',
  backgroundColor: '#fff',
  borderBottom: '1px solid #e0e0e0',
  flexShrink: 0,
  position: 'relative',
  overflow: 'visible',
};

const settingsContainerStyle: CSSProperties = {
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  zIndex: 1001,
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

const modeToggleSpacerStyle: CSSProperties = {
  height: '52px',
  flexShrink: 0,
};

const layoutContainerStyle: CSSProperties = {
  flexGrow: 1,
  minHeight: 0,
  overflow: 'hidden',
};

const tableContainerStyle: CSSProperties = {
  flexGrow: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
};

const editorLoadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#888',
  fontSize: '14px',
};

export interface DashboardProps {
  onRestore?: (data: RestoreData) => void;
  onRerunWizard?: () => void;
  initialTab?: 'editor';
}

export function Dashboard({ onRestore, onRerunWizard, initialTab }: DashboardProps = {}) {
  const [mode, setMode] = useState<DisplayMode>(initialState.mode);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || initialState.view);
  const { panels, status, error, retry } = useWebSocket();
  const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);

  useUrlParamsSync(activeTab, mode);

  // Fetch layout config for dynamic canvas dimensions and overlay size
  const [layoutConfig, setLayoutConfig] = useState<LayoutConfig | null>(null);
  useEffect(() => {
    getLayoutConfig().then(setLayoutConfig).catch(() => {});
  }, []);

  // Derive canvas dimensions from config
  const layoutWidth = layoutConfig
    ? layoutConfig.image_path && !layoutConfig.use_blank_background
      ? layoutConfig.image_width ?? LAYOUT_WIDTH
      : BLANK_CANVAS_WIDTH
    : LAYOUT_WIDTH;
  const layoutHeight = layoutConfig
    ? layoutConfig.image_path && !layoutConfig.use_blank_background
      ? layoutConfig.image_height ?? LAYOUT_HEIGHT
      : BLANK_CANVAS_HEIGHT
    : LAYOUT_HEIGHT;
  const overlaySize = layoutConfig?.overlay_size || 50;

  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const [currentZoom, setCurrentZoom] = useState(1);
  const hasManuallyZoomed = useRef(false);
  const isProgrammaticZoom = useRef(false);

  const calculateFitZooms = useCallback(
    (mobile: boolean) => {
      if (typeof window === 'undefined') {
        return { fitViewportZoom: 1, fitWidthZoom: 1 };
      }

      const viewportWidth = window.innerWidth;
      const tabHeight = mobile ? TAB_HEIGHT_MOBILE : TAB_HEIGHT_DESKTOP;
      const viewportHeight = window.innerHeight - HEADER_HEIGHT - tabHeight;

      const contentWidth = layoutWidth + CONTENT_PADDING * 2;
      const contentHeight = layoutHeight + CONTENT_PADDING * 2;

      const fitViewportZoom = Math.min(
        viewportWidth / contentWidth,
        viewportHeight / contentHeight
      );

      const fitWidthZoom = viewportWidth / contentWidth;

      return {
        fitViewportZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitViewportZoom)),
        fitWidthZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitWidthZoom)),
      };
    },
    [layoutWidth, layoutHeight]
  );

  // Calculate initial fit zoom synchronously to avoid flash of zoomed-in content
  const getInitialFitZooms = () => {
    if (typeof window === 'undefined') {
      return { fitViewportZoom: 1, fitWidthZoom: 1 };
    }
    // Use desktop tab height for initial calculation since isMobile hasn't been determined yet
    const viewportWidth = window.innerWidth;
    const isMobileInitial = viewportWidth <= MOBILE_BREAKPOINT;
    const tabHeight = isMobileInitial ? TAB_HEIGHT_MOBILE : TAB_HEIGHT_DESKTOP;
    const viewportHeight = window.innerHeight - HEADER_HEIGHT - tabHeight;

    const contentWidth = LAYOUT_WIDTH + CONTENT_PADDING * 2;
    const contentHeight = LAYOUT_HEIGHT + CONTENT_PADDING * 2;

    const fitViewportZoom = Math.min(
      viewportWidth / contentWidth,
      viewportHeight / contentHeight
    );

    const fitWidthZoom = viewportWidth / contentWidth;

    return {
      fitViewportZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitViewportZoom)),
      fitWidthZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitWidthZoom)),
    };
  };

  const [fitZooms, setFitZooms] = useState(getInitialFitZooms);

  useLayoutEffect(() => {
    const newFitZooms = calculateFitZooms(isMobile);
    setFitZooms(newFitZooms);

    // Re-center transform when layout dimensions change (e.g., config loads)
    if (!hasManuallyZoomed.current && transformRef.current) {
      const wrapperBounds =
        transformRef.current.instance.wrapperComponent?.getBoundingClientRect();
      if (wrapperBounds) {
        const contentWidth = (layoutWidth + CONTENT_PADDING * 2) * newFitZooms.fitViewportZoom;
        const contentHeight = (layoutHeight + CONTENT_PADDING * 2) * newFitZooms.fitViewportZoom;
        const centerX = (wrapperBounds.width - contentWidth) / 2;
        const centerY = Math.max(0, (wrapperBounds.height - contentHeight) / 2);
        transformRef.current.setTransform(centerX, centerY, newFitZooms.fitViewportZoom, 0);
      }
    }
  }, [calculateFitZooms, isMobile, layoutWidth, layoutHeight]);

  const handleTransformed = useCallback(
    (
      _ref: ReactZoomPanPinchRef,
      state: { scale: number; positionX: number; positionY: number }
    ) => {
      setCurrentZoom(state.scale);
    },
    []
  );

  const handleManualZoom = useCallback(() => {
    if (!isProgrammaticZoom.current) {
      hasManuallyZoomed.current = true;
    }
  }, []);

  const handleFitAction = useCallback(() => {
    hasManuallyZoomed.current = false;
  }, []);

  useLayoutEffect(() => {
    const handleResize = () => {
      const newFitZooms = calculateFitZooms(isMobile);
      setFitZooms(newFitZooms);

      if (!hasManuallyZoomed.current && transformRef.current) {
        const wrapperBounds =
          transformRef.current.instance.wrapperComponent?.getBoundingClientRect();
        if (wrapperBounds) {
          const contentWidth = (layoutWidth + CONTENT_PADDING * 2) * newFitZooms.fitViewportZoom;
          const contentHeight = (layoutHeight + CONTENT_PADDING * 2) * newFitZooms.fitViewportZoom;
          const centerX = (wrapperBounds.width - contentWidth) / 2;
          const centerY = Math.max(0, (wrapperBounds.height - contentHeight) / 2);
          transformRef.current.setTransform(centerX, centerY, newFitZooms.fitViewportZoom, 0);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateFitZooms, isMobile, layoutWidth, layoutHeight]);

  return (
    <div style={appStyle}>
      <SystemWarningBanner />

      {!isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      <main style={mainStyle}>
        <ConnectionStatusDisplay status={status} error={error} onRetry={retry} />

        {activeTab === 'layout' && (
          <>
            <div style={isMobile ? modeToggleMobileStyle : modeToggleContainerStyle}>
              <ModeToggle mode={mode} setMode={setMode} />
              {onRestore && onRerunWizard && !isMobile && (
                <div style={settingsContainerStyle}>
                  <SettingsMenu onRestore={onRestore} onRerunWizard={onRerunWizard} />
                </div>
              )}
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
              layoutWidth={layoutWidth}
              layoutHeight={layoutHeight}
              overlaySize={overlaySize}
            />
          </div>
        ) : activeTab === 'table' ? (
          <div style={tableContainerStyle}>
            <TableView panels={panels} />
          </div>
        ) : (
          <Suspense fallback={<div style={editorLoadingStyle}>Loading editor...</div>}>
            <LayoutEditor onClose={() => setActiveTab('layout')} />
          </Suspense>
        )}
      </main>

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
          layoutWidth={layoutWidth}
          layoutHeight={layoutHeight}
        />
      )}

      {isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}
