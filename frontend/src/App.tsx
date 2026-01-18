import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SolarLayout } from './components/SolarLayout';
import { ModeToggle } from './components/ModeToggle';
import { ConnectionStatusDisplay } from './components/ConnectionStatus';
import { SystemWarningBanner } from './components/SystemWarningBanner';
import { TabNavigation, type TabType } from './components/TabNavigation';
import { TableView } from './components/TableView';
import type { DisplayMode } from './components/PanelOverlay';
import { useMediaQuery } from './hooks/useMediaQuery';

const appStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  overflowX: 'auto',
};

const mainStyle: CSSProperties = {
  position: 'relative',
};

const modeToggleContainerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '10px',
  backgroundColor: '#fff',
  borderBottom: '1px solid #e0e0e0',
};

function App() {
  // FR-4.5: Default mode is Watts
  const [mode, setMode] = useState<DisplayMode>('watts');
  // FR-1.5: Default tab is Layout
  const [activeTab, setActiveTab] = useState<TabType>('layout');
  const { panels, status, error, retry } = useWebSocket();
  const isMobile = useMediaQuery('(max-width: 767px)');

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
          <SolarLayout panels={panels} mode={mode} />
        ) : (
          /* FR-2.1: Table view with hierarchical organization */
          <TableView panels={panels} />
        )}
      </main>

      {/* FR-1.3: Mobile bottom navigation */}
      {isMobile && (
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}

export default App;
