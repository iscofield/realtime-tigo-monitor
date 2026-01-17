import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SolarLayout } from './components/SolarLayout';
import { ModeToggle } from './components/ModeToggle';
import { ConnectionStatusDisplay } from './components/ConnectionStatus';
import { SystemWarningBanner } from './components/SystemWarningBanner';
import type { DisplayMode } from './components/PanelOverlay';

const appStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  overflowX: 'auto',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '10px',
  backgroundColor: '#333',
  position: 'sticky',
  top: 0,
  zIndex: 50,
};

const mainStyle: CSSProperties = {
  position: 'relative',
};

function App() {
  // FR-4.5: Default mode is Watts
  const [mode, setMode] = useState<DisplayMode>('watts');
  const { panels, status, error, retry } = useWebSocket();

  return (
    <div style={appStyle}>
      {/* System warning banner for state file issues */}
      <SystemWarningBanner />

      {/* FR-4.6: Toggle button at top of viewport */}
      <header style={headerStyle}>
        <ModeToggle mode={mode} setMode={setMode} />
      </header>

      <main style={mainStyle}>
        {/* FR-4.8: Connection status indicators */}
        <ConnectionStatusDisplay status={status} error={error} onRetry={retry} />

        {/* FR-4.1, FR-4.2: Layout with panel overlays */}
        <SolarLayout panels={panels} mode={mode} />
      </main>
    </div>
  );
}

export default App;
