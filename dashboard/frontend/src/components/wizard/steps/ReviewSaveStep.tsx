/**
 * Step 6: Review & Save (Phase 1 spec FR-3.7).
 * Final review of configuration and save to backend.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { saveSystemConfig, savePanelsConfig } from '../../../api/config';
import { commitRestoreImage } from '../../../api/backup';
import type { MQTTConfig, SystemConfig, DiscoveredPanel } from '../../../types/config';
import { UNASSIGNED_MARKER } from './mapping';

// Local panel type for wizard display (differs from layout editor's Panel type)
interface WizardPanel {
  serial: string;
  cca: string;
  string: string;
  tigo_label: string;
  label: string;           // Display label for wizard UI
  position: number;        // Position in string (1st, 2nd, etc)
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const sectionStyle: CSSProperties = {
  padding: '20px',
  backgroundColor: '#fafafa',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
};

const summaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '16px',
};

const summaryItemStyle: CSSProperties = {
  padding: '16px',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
  textAlign: 'center',
};

const labelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginBottom: '4px',
};

const valueStyle: CSSProperties = {
  fontSize: '24px',
  fontWeight: 600,
  color: '#333',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

const thStyle: CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '2px solid #e0e0e0',
  backgroundColor: '#f5f5f5',
};

const tdStyle: CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #e0e0e0',
};

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  marginTop: '20px',
};

const primaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 500,
  backgroundColor: '#4caf50',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: 'white',
  color: '#333',
  border: '1px solid #ccc',
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#ccc',
  cursor: 'not-allowed',
};

const successStyle: CSSProperties = {
  padding: '30px',
  backgroundColor: '#e8f5e9',
  borderRadius: '8px',
  textAlign: 'center',
  border: '1px solid #a5d6a7',
};

const warningStyle: CSSProperties = {
  padding: '16px',
  backgroundColor: '#fff3e0',
  borderRadius: '8px',
  border: '1px solid #ffb74d',
};

interface ReviewSaveStepProps {
  mqttConfig: MQTTConfig;
  topology: SystemConfig;
  discoveredPanels: Record<string, DiscoveredPanel>;
  translations: Record<string, string>;
  restoreImageToken?: string;
  onComplete: () => void;
  onBack: () => void;
}

export function ReviewSaveStep({
  mqttConfig,
  topology,
  discoveredPanels,
  translations,
  restoreImageToken,
  onComplete,
  onBack,
}: ReviewSaveStepProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Build final panels array from discovered panels and translations
  // Filters out explicitly unassigned panels (those with UNASSIGNED_MARKER translation)
  const buildPanels = (): WizardPanel[] => {
    return Object.values(discoveredPanels)
      .filter(dp => {
        // Exclude panels that have been explicitly unassigned
        const translation = translations[dp.tigo_label];
        return translation !== UNASSIGNED_MARKER;
      })
      .map(dp => {
        const displayLabel = translations[dp.tigo_label] || dp.tigo_label;
        const stringMatch = displayLabel.match(/^([A-Z]{1,2})(\d+)$/);

        return {
          serial: dp.serial,
          cca: dp.cca,
          string: stringMatch ? stringMatch[1] : displayLabel.replace(/[0-9]/g, ''),
          position: stringMatch ? parseInt(stringMatch[2], 10) : 1,
          label: displayLabel,
          tigo_label: dp.tigo_label,
        };
      });
  };

  const panels = buildPanels();

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Save system config
      await saveSystemConfig(topology);

      // Save panels config - transform to backend format
      // Backend expects: { serial, cca, string, tigo_label, display_label }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backendPanels = panels.map(p => ({
        serial: p.serial,
        cca: p.cca,
        string: p.string,
        tigo_label: p.tigo_label!,
        display_label: p.label,  // Map frontend 'label' to backend 'display_label'
      })) as any[];
      await savePanelsConfig({ version: 1, panels: backendPanels });

      // Commit restore image if present (from backup restore flow)
      if (restoreImageToken) {
        try {
          await commitRestoreImage(restoreImageToken);
        } catch (imageError) {
          console.warn('Failed to commit restore image:', imageError);
          // Don't fail the whole save - config is already saved
        }
      }

      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const getTotalPanels = () => {
    return topology.ccas.reduce((total, cca) =>
      total + cca.strings.reduce((sum, s) => sum + s.panel_count, 0), 0
    );
  };

  const getTotalStrings = () => {
    return topology.ccas.reduce((sum, cca) => sum + cca.strings.length, 0);
  };

  // Group panels by CCA and string for display
  const panelsByString: Record<string, WizardPanel[]> = {};
  panels.forEach(panel => {
    const key = `${panel.cca}-${panel.string}`;
    if (!panelsByString[key]) {
      panelsByString[key] = [];
    }
    panelsByString[key].push(panel);
  });

  // Sort panels within each string by position
  Object.values(panelsByString).forEach(stringPanels => {
    stringPanels.sort((a, b) => a.position - b.position);
  });

  if (saved) {
    return (
      <div style={containerStyle}>
        <div style={successStyle}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✓</div>
          <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#2e7d32' }}>
            Configuration Saved!
          </h2>
          <p style={{ margin: '0 0 24px', color: '#666' }}>
            Your solar monitoring system is now configured and ready to use.
          </p>
          <button
            onClick={onComplete}
            style={{ ...primaryButtonStyle, fontSize: '16px', padding: '14px 32px' }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Review & Save</h2>
      <p style={{ margin: '0', color: '#666' }}>
        Review your configuration before saving. Once saved, the dashboard will start monitoring your panels.
      </p>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Configuration Summary */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Configuration Summary</h3>
        <div style={summaryGridStyle}>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>MQTT Broker</div>
            <div style={{ ...valueStyle, fontSize: '16px' }}>{mqttConfig.server}:{mqttConfig.port}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>CCA Devices</div>
            <div style={valueStyle}>{topology.ccas.length}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>Strings</div>
            <div style={valueStyle}>{getTotalStrings()}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>Expected Panels</div>
            <div style={valueStyle}>{getTotalPanels()}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>Discovered Panels</div>
            <div style={valueStyle}>{panels.length}</div>
          </div>
        </div>
      </div>

      {/* CCA Details */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>CCA Configuration</h3>
        {topology.ccas.map((cca, i) => (
          <div key={i} style={{ marginBottom: i < topology.ccas.length - 1 ? '16px' : 0 }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>
              {cca.name} <span style={{ fontWeight: 400, color: '#666' }}>({cca.serial_device})</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {cca.strings.map((s, j) => (
                <div key={j} style={{
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  borderRadius: '4px',
                  border: '1px solid #e0e0e0',
                  fontSize: '14px',
                }}>
                  String {s.name}: {s.panel_count} panels
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Panel List */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Panel Assignments ({panels.length} total)</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Serial</th>
                <th style={thStyle}>CCA</th>
                <th style={thStyle}>String</th>
                <th style={thStyle}>Position</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(panelsByString).flatMap(([_, stringPanels]) =>
                stringPanels.map(panel => (
                  <tr key={panel.serial}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{panel.label}</td>
                    <td style={tdStyle}>
                      <code style={{ fontSize: '12px', color: '#666' }}>{panel.serial}</code>
                    </td>
                    <td style={tdStyle}>{panel.cca}</td>
                    <td style={tdStyle}>{panel.string}</td>
                    <td style={tdStyle}>{panel.position}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warnings */}
      {panels.length < getTotalPanels() && (
        <div style={warningStyle}>
          <strong>Note:</strong> You have {getTotalPanels() - panels.length} fewer panels discovered than expected.
          This is okay if some panels are offline or not yet installed.
          You can re-run discovery later to add more panels.
        </div>
      )}

      {/* Navigation */}
      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={isSaving ? disabledButtonStyle : primaryButtonStyle}
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
}
