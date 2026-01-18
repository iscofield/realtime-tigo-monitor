import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';

interface SystemWarning {
  level: 'error' | 'warning';
  message: string;
  detail?: string;
}

interface SystemStatus {
  mock_mode: boolean;
  warnings: SystemWarning[];
  has_warnings: boolean;
}

const bannerStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 100,
  padding: '12px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: '14px',
  fontWeight: 500,
};

const errorBannerStyle: CSSProperties = {
  ...bannerStyle,
  backgroundColor: '#dc2626',
  color: 'white',
};

const warningBannerStyle: CSSProperties = {
  ...bannerStyle,
  backgroundColor: '#f59e0b',
  color: 'black',
};

const iconStyle: CSSProperties = {
  fontSize: '18px',
  flexShrink: 0,
};

const messageStyle: CSSProperties = {
  flex: 1,
  textAlign: 'center',
};

const detailStyle: CSSProperties = {
  fontSize: '12px',
  opacity: 0.9,
  marginTop: '2px',
};

const dismissButtonStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.2)',
  border: 'none',
  borderRadius: '4px',
  padding: '4px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  color: 'inherit',
  flexShrink: 0,
};

const API_BASE = import.meta.env.VITE_API_BASE || '';

export function SystemWarningBanner() {
  const [warnings, setWarnings] = useState<SystemWarning[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/system-status`);
        if (response.ok) {
          const data: SystemStatus = await response.json();
          if (data.has_warnings) {
            setWarnings(data.warnings);
          } else {
            setWarnings([]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch system status:', error);
      }
    };

    // Fetch immediately
    fetchStatus();

    // Then fetch every 60 seconds
    const interval = setInterval(fetchStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  // Rotate through warnings if there are multiple
  useEffect(() => {
    if (warnings.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % warnings.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [warnings.length]);

  if (dismissed || warnings.length === 0) {
    return null;
  }

  const currentWarning = warnings[currentIndex];
  const isError = currentWarning.level === 'error';
  const style = isError ? errorBannerStyle : warningBannerStyle;

  return (
    <div style={style} role="alert" data-testid="system-warning-banner">
      <span style={iconStyle}>{isError ? '\u26A0' : '\u26A0'}</span>
      <div style={messageStyle}>
        <div>{currentWarning.message}</div>
        {currentWarning.detail && (
          <div style={detailStyle}>{currentWarning.detail}</div>
        )}
        {warnings.length > 1 && (
          <div style={detailStyle}>
            ({currentIndex + 1} of {warnings.length} warnings)
          </div>
        )}
      </div>
      <button
        style={dismissButtonStyle}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss warning"
      >
        Dismiss
      </button>
    </div>
  );
}
