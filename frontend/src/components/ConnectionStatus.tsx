import type { CSSProperties } from 'react';
import type { ConnectionStatus as Status } from '../hooks/useWebSocket';

interface ConnectionStatusProps {
  status: Status;
  error: string | null;
  onRetry: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  color: 'white',
  fontSize: '18px',
  zIndex: 100,
};

const badgeStyle: CSSProperties = {
  position: 'fixed',
  top: '10px',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '8px 16px',
  backgroundColor: '#f0ad4e',
  color: 'white',
  borderRadius: '4px',
  fontSize: '14px',
  fontWeight: 'bold',
  zIndex: 100,
};

const errorContainerStyle: CSSProperties = {
  textAlign: 'center',
  padding: '20px',
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

export function ConnectionStatusDisplay({ status, error, onRetry }: ConnectionStatusProps) {
  // FR-4.8: Connecting overlay
  if (status === 'connecting') {
    return (
      <div style={overlayStyle} data-testid="connecting-overlay">
        Connecting...
      </div>
    );
  }

  // FR-4.8: Disconnected badge
  if (status === 'disconnected') {
    return (
      <div style={badgeStyle} data-testid="reconnecting-badge">
        Reconnecting...
      </div>
    );
  }

  // FR-4.8: Error with retry button
  if (status === 'error') {
    return (
      <div style={overlayStyle} data-testid="error-overlay">
        <div style={errorContainerStyle}>
          <div>{error || 'Connection error'}</div>
          <button style={retryButtonStyle} onClick={onRetry} data-testid="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // FR-4.8: Connected - no indicator
  return null;
}
