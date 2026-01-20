/**
 * Step 3: Generate & Download Configs (Phase 1 spec FR-3.4).
 * Generates tigo-mqtt deployment files and provides download.
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { downloadTigoMqttConfig } from '../../../api/config';
import type { MQTTConfig, SystemConfig } from '../../../types/config';

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
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
};

const summaryItemStyle: CSSProperties = {
  padding: '12px',
  backgroundColor: 'white',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
};

const labelStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginBottom: '4px',
};

const valueStyle: CSSProperties = {
  fontSize: '16px',
  fontWeight: 500,
  color: '#333',
};

const downloadAreaStyle: CSSProperties = {
  textAlign: 'center',
  padding: '30px',
  border: '2px dashed #1976d2',
  borderRadius: '8px',
  backgroundColor: '#e3f2fd',
};

const instructionsStyle: CSSProperties = {
  padding: '20px',
  backgroundColor: '#fff3e0',
  borderRadius: '8px',
  border: '1px solid #ffb74d',
};

const codeBlockStyle: CSSProperties = {
  backgroundColor: '#263238',
  color: '#aed581',
  padding: '12px 16px',
  borderRadius: '6px',
  fontFamily: 'monospace',
  fontSize: '13px',
  overflowX: 'auto',
  margin: '8px 0',
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
  backgroundColor: '#1976d2',
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

const downloadButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  fontSize: '18px',
  padding: '16px 32px',
};

const successBadgeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  backgroundColor: '#e8f5e9',
  color: '#2e7d32',
  borderRadius: '20px',
  fontSize: '14px',
  fontWeight: 500,
  marginLeft: '8px',
};

interface GenerateDownloadStepProps {
  mqttConfig: MQTTConfig;
  topology: SystemConfig;
  downloaded: boolean;
  onDownloaded: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function GenerateDownloadStep({
  mqttConfig,
  topology,
  downloaded,
  onDownloaded,
  onNext,
  onBack,
}: GenerateDownloadStepProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      const blob = await downloadTigoMqttConfig(mqttConfig, topology.ccas, []);

      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tigo-mqtt-config.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onDownloaded();
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const getTotalPanels = () => {
    return topology.ccas.reduce((total, cca) =>
      total + cca.strings.reduce((sum, s) => sum + s.panel_count, 0), 0
    );
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Generate & Download Configuration</h2>
      <p style={{ margin: '0', color: '#666' }}>
        Review your configuration and download the tigo-mqtt deployment files.
      </p>

      {/* Configuration Summary */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Configuration Summary</h3>
        <div style={summaryGridStyle}>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>MQTT Broker</div>
            <div style={valueStyle}>{mqttConfig.server}:{mqttConfig.port}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>CCA Devices</div>
            <div style={valueStyle}>{topology.ccas.length}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>Total Strings</div>
            <div style={valueStyle}>{topology.ccas.reduce((sum, cca) => sum + cca.strings.length, 0)}</div>
          </div>
          <div style={summaryItemStyle}>
            <div style={labelStyle}>Expected Panels</div>
            <div style={valueStyle}>{getTotalPanels()}</div>
          </div>
        </div>

        <div style={{ marginTop: '16px' }}>
          {topology.ccas.map((cca, i) => (
            <div key={i} style={{ marginTop: i > 0 ? '12px' : 0 }}>
              <strong>{cca.name}</strong> ({cca.serial_device}):{' '}
              {cca.strings.map(s => `${s.name}×${s.panel_count}`).join(', ')}
            </div>
          ))}
        </div>
      </div>

      {/* Download Area */}
      <div style={downloadAreaStyle}>
        {downloaded ? (
          <>
            <span style={{ fontSize: '48px' }}>✓</span>
            <h3>Configuration Downloaded</h3>
            <span style={successBadgeStyle}>Ready to deploy</span>
          </>
        ) : (
          <>
            <h3 style={{ margin: '0 0 12px' }}>Download Configuration Files</h3>
            <p style={{ margin: '0 0 20px', color: '#666' }}>
              This ZIP contains docker-compose.yml, INI configs, and deployment instructions.
            </p>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              style={isDownloading ? { ...downloadButtonStyle, backgroundColor: '#ccc' } : downloadButtonStyle}
            >
              {isDownloading ? 'Generating...' : 'Download ZIP'}
            </button>
            {downloadError && (
              <p style={{ color: '#c62828', marginTop: '12px' }}>{downloadError}</p>
            )}
          </>
        )}
      </div>

      {/* Deployment Instructions */}
      <div style={instructionsStyle}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Deployment Instructions</h3>
        <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
          <li>Copy the ZIP file to your Raspberry Pi</li>
          <li>Extract the files:
            <pre style={codeBlockStyle}>unzip tigo-mqtt-config.zip</pre>
          </li>
          <li>Copy <code>.env.example</code> to <code>.env</code> and add your MQTT credentials:
            <pre style={codeBlockStyle}>cp .env.example .env{'\n'}nano .env</pre>
          </li>
          <li>Build and start the containers:
            <pre style={codeBlockStyle}>docker compose up -d --build</pre>
          </li>
          <li>Verify the services are running:
            <pre style={codeBlockStyle}>docker compose ps</pre>
          </li>
          <li>Return here and click "Start Discovery" to continue</li>
        </ol>
      </div>

      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!downloaded}
          style={downloaded ? primaryButtonStyle : { ...primaryButtonStyle, backgroundColor: '#ccc', cursor: 'not-allowed' }}
        >
          {downloaded ? 'Next: Discovery' : 'Download config first'}
        </button>
      </div>
    </div>
  );
}
