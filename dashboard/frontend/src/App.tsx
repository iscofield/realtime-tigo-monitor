import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useMediaQuery } from './hooks/useMediaQuery';
import { getInitialStateFromUrl, useUrlParamsSync } from './hooks/useUrlParams';
import { SolarLayout } from './components/SolarLayout';
import { ModeToggle } from './components/ModeToggle';
import { ConnectionStatusDisplay } from './components/ConnectionStatus';
import { SystemWarningBanner } from './components/SystemWarningBanner';
import { TabNavigation, type TabType } from './components/TabNavigation';
import { TableView } from './components/TableView';
import type { DisplayMode } from './components/PanelOverlay';
import { MOBILE_BREAKPOINT } from './constants';

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

  // SPIKE: Zoom state is now managed internally by SolarLayout via react-zoom-pan-pinch
  // ZoomControls temporarily disabled for this spike

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
            {/* SPIKE: SolarLayout now uses react-zoom-pan-pinch internally */}
            <SolarLayout panels={panels} mode={mode} />
          </div>
        ) : (
          <TableView panels={panels} />
        )}
      </main>

      {/* SPIKE: ZoomControls temporarily disabled - zoom via trackpad/pinch only */}
      {/* TODO: Re-enable with ref-based API after spike validation */}

      {/* FR-1.3: Mobile bottom navigation */}
      {isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}

export default App;
