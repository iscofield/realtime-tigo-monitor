import type { CSSProperties } from 'react';
import type { DisplayMode } from './PanelOverlay';

interface ModeToggleProps {
  mode: DisplayMode;
  setMode: (mode: DisplayMode) => void;
}

const containerStyle: CSSProperties = {
  display: 'flex',
  gap: '4px',
  backgroundColor: '#2a2a2a',
  padding: '4px',
  borderRadius: '6px',
};

const buttonBaseStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  cursor: 'pointer',
  border: 'none',
  borderRadius: '4px',
  fontWeight: 'bold',
  transition: 'background-color 0.2s',
};

const activeStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: '#4a90d9',
  color: 'white',
};

const inactiveStyle: CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: 'transparent',
  color: '#888',
};

const modes: { value: DisplayMode; label: string }[] = [
  { value: 'watts', label: 'Watts' },
  { value: 'voltage', label: 'Voltage' },
  { value: 'sn', label: 'SN' },
];

export function ModeToggle({ mode, setMode }: ModeToggleProps) {
  return (
    <div style={containerStyle} data-testid="mode-toggle">
      {modes.map(({ value, label }) => (
        <button
          key={value}
          data-testid={`mode-${value}`}
          onClick={() => setMode(value)}
          style={mode === value ? activeStyle : inactiveStyle}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
