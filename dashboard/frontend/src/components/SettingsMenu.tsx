/**
 * Settings menu component with backup/restore functionality.
 * Provides a gear icon dropdown with options for configuration management.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { exportBackup, restoreBackup } from '../api/backup';
import { downloadBlob } from '../utils/download';
import type { RestoreData } from '../types/config';

interface SettingsMenuProps {
  onRestore: (data: RestoreData) => void;
  onRerunWizard: () => void;
}

// Gear icon SVG
const GearIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const containerStyle: CSSProperties = {
  position: 'relative',
};

const buttonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  padding: 0,
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: '6px',
  color: '#666',
  cursor: 'pointer',
  transition: 'background-color 0.2s, color 0.2s',
};

const buttonHoverStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#e0e0e0',
  color: '#333',
};

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '4px',
  minWidth: '200px',
  backgroundColor: '#fff',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  zIndex: 1000,
  overflow: 'hidden',
};

const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '12px 16px',
  backgroundColor: 'transparent',
  border: 'none',
  textAlign: 'left',
  fontSize: '14px',
  color: '#333',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
};

const menuItemHoverStyle: CSSProperties = {
  ...menuItemStyle,
  backgroundColor: '#f5f5f5',
};

const dividerStyle: CSSProperties = {
  height: '1px',
  backgroundColor: '#e0e0e0',
  margin: '4px 0',
};

const warningStyle: CSSProperties = {
  ...menuItemStyle,
  color: '#c53030',
};

const warningHoverStyle: CSSProperties = {
  ...warningStyle,
  backgroundColor: '#fff5f5',
};

const hiddenInputStyle: CSSProperties = {
  display: 'none',
};

// Confirmation dialog styles
const overlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
};

const dialogStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '450px',
  width: '90%',
  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
};

const dialogTitleStyle: CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  marginBottom: '12px',
  color: '#333',
};

const dialogTextStyle: CSSProperties = {
  fontSize: '14px',
  color: '#666',
  lineHeight: '1.5',
  marginBottom: '8px',
};

const dialogWarningStyle: CSSProperties = {
  ...dialogTextStyle,
  color: '#c53030',
  backgroundColor: '#fff5f5',
  padding: '12px',
  borderRadius: '6px',
  marginBottom: '20px',
};

const dialogButtonsStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '20px',
};

const dialogCancelStyle: CSSProperties = {
  padding: '10px 20px',
  backgroundColor: '#e0e0e0',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#333',
  cursor: 'pointer',
};

const dialogConfirmStyle: CSSProperties = {
  padding: '10px 20px',
  backgroundColor: '#4a90d9',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#fff',
  cursor: 'pointer',
};

interface MenuItem {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'warning';
}

export function SettingsMenu({ onRestore, onRerunWizard }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<RestoreData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setShowConfirmDialog(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBackup = useCallback(async () => {
    setIsOpen(false);
    setIsExporting(true);
    setError(null);

    try {
      const blob = await exportBackup();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadBlob(blob, `solar-dashboard-backup-${timestamp}.zip`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleRestoreClick = useCallback(() => {
    setIsOpen(false);
    setError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = '';

    try {
      const data = await restoreBackup(file);
      setPendingRestoreData(data);
      setShowConfirmDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  }, []);

  const handleConfirmRestore = useCallback(() => {
    if (pendingRestoreData) {
      onRestore(pendingRestoreData);
      setShowConfirmDialog(false);
      setPendingRestoreData(null);
    }
  }, [pendingRestoreData, onRestore]);

  const handleCancelRestore = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingRestoreData(null);
  }, []);

  const handleRerunWizard = useCallback(() => {
    setIsOpen(false);
    onRerunWizard();
  }, [onRerunWizard]);

  const menuItems: MenuItem[] = [
    { id: 'backup', label: 'Backup Configuration', onClick: handleBackup },
    { id: 'restore', label: 'Restore Configuration', onClick: handleRestoreClick },
    { id: 'divider', label: '', onClick: () => {} },
    { id: 'wizard', label: 'Re-run Setup Wizard', onClick: handleRerunWizard, variant: 'warning' },
  ];

  return (
    <div ref={menuRef} style={containerStyle}>
      <button
        style={isHovered || isOpen ? buttonHoverStyle : buttonStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        title="Settings"
        aria-label="Settings menu"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <GearIcon />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={hiddenInputStyle}
        onChange={handleFileSelected}
      />

      {isOpen && (
        <div style={menuStyle} role="menu">
          {menuItems.map((item) => {
            if (item.id === 'divider') {
              return <div key={item.id} style={dividerStyle} />;
            }

            const isWarning = item.variant === 'warning';
            const baseStyle = isWarning ? warningStyle : menuItemStyle;
            const hoverStyle = isWarning ? warningHoverStyle : menuItemHoverStyle;

            return (
              <button
                key={item.id}
                style={hoveredItem === item.id ? hoverStyle : baseStyle}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={item.onClick}
                role="menuitem"
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: '#c53030',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: 3000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '12px',
              padding: '2px 8px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showConfirmDialog && pendingRestoreData && (
        <div style={overlayStyle} onClick={handleCancelRestore}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={dialogTitleStyle}>Restore Configuration?</div>
            <div style={dialogTextStyle}>
              This backup contains:
            </div>
            <ul style={{ ...dialogTextStyle, paddingLeft: '20px', margin: '8px 0' }}>
              <li>{pendingRestoreData.manifest.panel_count} panels</li>
              <li>Created: {new Date(pendingRestoreData.manifest.created_at).toLocaleString()}</li>
              {pendingRestoreData.has_image && <li>Layout image included</li>}
              {pendingRestoreData.manifest.contains_sensitive_data && (
                <li style={{ color: '#c53030' }}>Contains MQTT credentials</li>
              )}
            </ul>
            <div style={dialogWarningStyle}>
              Warning: Only restore backups from trusted sources. Restoring will open the
              setup wizard to review and apply the configuration.
            </div>
            <div style={dialogButtonsStyle}>
              <button style={dialogCancelStyle} onClick={handleCancelRestore}>
                Cancel
              </button>
              <button style={dialogConfirmStyle} onClick={handleConfirmRestore}>
                Continue to Wizard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
