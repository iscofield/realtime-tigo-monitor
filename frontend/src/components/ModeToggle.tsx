import type { CSSProperties } from 'react';
import type { DisplayMode } from './PanelOverlay';

interface ModeToggleProps {
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
}

const buttonStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  cursor: 'pointer',
  backgroundColor: '#4a90d9',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontWeight: 'bold',
};

export function ModeToggle({ mode, setMode }: ModeToggleProps) {
  const toggleMode = () => {
    setMode(mode === 'watts' ? 'voltage' : 'watts');
  };

  return (
    <button
      data-testid="mode-toggle"
      onClick={toggleMode}
      style={buttonStyle}
    >
      {mode === 'watts' ? 'Show Voltage' : 'Show Watts'}
    </button>
  );
}
