/**
 * Welcome Step: Initial wizard screen for fresh setup or restore.
 * Allows users to choose between starting fresh or restoring from backup.
 */

import { useState, useRef, useCallback } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { restoreBackup } from '../../../api/backup';
import type { RestoreData } from '../../../types/config';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '32px',
  padding: '20px 0',
};

const titleStyle: CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: '#333',
  margin: 0,
  textAlign: 'center',
};

const subtitleStyle: CSSProperties = {
  fontSize: '16px',
  color: '#666',
  margin: 0,
  textAlign: 'center',
  maxWidth: '500px',
};

const optionsContainerStyle: CSSProperties = {
  display: 'flex',
  gap: '24px',
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const optionCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '32px',
  backgroundColor: '#fff',
  border: '2px solid #e0e0e0',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  width: '220px',
  textAlign: 'center',
};

const optionCardHoverStyle: CSSProperties = {
  ...optionCardStyle,
  borderColor: '#1976d2',
  boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
};

const iconContainerStyle: CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  backgroundColor: '#e3f2fd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const optionTitleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: '#333',
  margin: 0,
};

const optionDescStyle: CSSProperties = {
  fontSize: '14px',
  color: '#666',
  margin: 0,
  lineHeight: '1.5',
};

const warningBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  padding: '16px',
  backgroundColor: '#fff8e1',
  border: '1px solid #ffca28',
  borderRadius: '8px',
  maxWidth: '500px',
};

const warningIconStyle: CSSProperties = {
  color: '#f9a825',
  fontSize: '20px',
  flexShrink: 0,
  marginTop: '2px',
};

const warningTextStyle: CSSProperties = {
  fontSize: '13px',
  color: '#5d4037',
  lineHeight: '1.5',
};

const errorStyle: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#ffebee',
  color: '#c62828',
  borderRadius: '6px',
  fontSize: '14px',
  maxWidth: '500px',
  textAlign: 'center',
};

const loadingStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '40px',
  color: '#666',
};

const hiddenInputStyle: CSSProperties = {
  display: 'none',
};

// SVG Icons
const FreshSetupIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

const RestoreIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1976d2" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
);

interface WelcomeStepProps {
  onFreshSetup: () => void;
  onRestore: (data: RestoreData) => void;
}

export function WelcomeStep({ onFreshSetup, onRestore }: WelcomeStepProps) {
  const [hoveredOption, setHoveredOption] = useState<'fresh' | 'restore' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRestoreClick = useCallback(() => {
    setError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    setIsLoading(true);
    setError(null);

    try {
      const data = await restoreBackup(file);
      onRestore(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
      setIsLoading(false);
    }
  }, [onRestore]);

  if (isLoading) {
    return (
      <div style={loadingStyle}>
        <div style={{ fontSize: '18px' }}>Validating backup...</div>
        <div style={{ color: '#999' }}>Please wait while we check your backup file</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Welcome to Solar Dashboard Setup</h1>
      <p style={subtitleStyle}>
        Configure your solar panel monitoring dashboard. You can start fresh or
        restore from a previous backup.
      </p>

      <div style={optionsContainerStyle}>
        <button
          style={hoveredOption === 'fresh' ? optionCardHoverStyle : optionCardStyle}
          onMouseEnter={() => setHoveredOption('fresh')}
          onMouseLeave={() => setHoveredOption(null)}
          onClick={onFreshSetup}
        >
          <div style={iconContainerStyle}>
            <FreshSetupIcon />
          </div>
          <h3 style={optionTitleStyle}>Fresh Setup</h3>
          <p style={optionDescStyle}>
            Start from scratch with guided setup for MQTT, topology, and panel discovery
          </p>
        </button>

        <button
          style={hoveredOption === 'restore' ? optionCardHoverStyle : optionCardStyle}
          onMouseEnter={() => setHoveredOption('restore')}
          onMouseLeave={() => setHoveredOption(null)}
          onClick={handleRestoreClick}
        >
          <div style={iconContainerStyle}>
            <RestoreIcon />
          </div>
          <h3 style={optionTitleStyle}>Restore from Backup</h3>
          <p style={optionDescStyle}>
            Import settings from a previous backup file (.zip)
          </p>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={hiddenInputStyle}
        onChange={handleFileSelected}
      />

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}

      <div style={warningBannerStyle}>
        <span style={warningIconStyle}>
          <WarningIcon />
        </span>
        <div style={warningTextStyle}>
          <strong>Security Note:</strong> Only restore backups from trusted sources.
          Backup files may contain MQTT credentials and configuration data.
        </div>
      </div>
    </div>
  );
}
