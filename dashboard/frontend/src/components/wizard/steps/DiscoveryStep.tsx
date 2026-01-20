/**
 * Step 4: Discovery Monitoring (Phase 1 spec FR-3.5).
 * Shows real-time panel discovery via WebSocket.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { startDiscovery, stopDiscovery } from '../../../api/config';
import type { MQTTConfig, SystemConfig, DiscoveredPanel, WizardWebSocketEvent } from '../../../types/config';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const statusBarStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 20px',
  backgroundColor: '#e3f2fd',
  borderRadius: '8px',
};

const progressStyle: CSSProperties = {
  marginTop: '8px',
  height: '8px',
  backgroundColor: '#e0e0e0',
  borderRadius: '4px',
  overflow: 'hidden',
};

const progressBarStyle = (percent: number): CSSProperties => ({
  height: '100%',
  width: `${percent}%`,
  backgroundColor: percent >= 100 ? '#4caf50' : '#1976d2',
  transition: 'width 0.3s',
});

const panelGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: '8px',
  padding: '4px',
};

const ccaSectionStyle: CSSProperties = {
  padding: '16px',
  backgroundColor: '#fafafa',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
};

const ccaHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
  paddingBottom: '8px',
  borderBottom: '1px solid #e0e0e0',
};

const ccaStatusBadgeStyle = (hasDiscoveredPanels: boolean): CSSProperties => ({
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  fontSize: '12px',
  fontWeight: 500,
  backgroundColor: hasDiscoveredPanels ? '#e8f5e9' : '#ffebee',
  color: hasDiscoveredPanels ? '#2e7d32' : '#c62828',
});

const panelCardStyle = (discovered: boolean): CSSProperties => ({
  padding: '12px',
  borderRadius: '6px',
  backgroundColor: discovered ? '#e8f5e9' : '#fafafa',
  border: `1px solid ${discovered ? '#4caf50' : '#e0e0e0'}`,
  opacity: discovered ? 1 : 0.5,
});

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

const warningButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#ff9800',
};

interface DiscoveryStepProps {
  mqttConfig: MQTTConfig;
  topology: SystemConfig;
  discoveredPanels: Record<string, DiscoveredPanel>;
  onPanelDiscovered: (panel: DiscoveredPanel) => void;
  onPanelUpdated: (serial: string, updates: Partial<DiscoveredPanel>) => void;
  onClearPanels: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function DiscoveryStep({
  mqttConfig,
  topology,
  discoveredPanels,
  onPanelDiscovered,
  onPanelUpdated,
  onClearPanels,
  onNext,
  onBack,
}: DiscoveryStepProps) {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected' | 'connecting'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Calculate expected panels from topology
  const expectedPanelCount = topology.ccas.reduce((total, cca) =>
    total + cca.strings.reduce((sum, s) => sum + s.panel_count, 0), 0
  );

  const discoveredCount = Object.keys(discoveredPanels).length;
  const progressPercent = expectedPanelCount > 0 ? (discoveredCount / expectedPanelCount) * 100 : 0;

  const connectWebSocket = useCallback(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/discovery`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnectionStatus('connected');
      setError(null);
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data: WizardWebSocketEvent = JSON.parse(event.data);

        if (data.type === 'panel_discovered') {
          const now = new Date().toISOString();
          onPanelDiscovered({
            serial: data.data.serial,
            cca: data.data.cca,
            tigo_label: data.data.tigo_label,
            watts: data.data.watts,
            voltage: data.data.voltage,
            discovered_at: now,
            last_seen_at: now,
          });
        } else if (data.type === 'panel_updated') {
          onPanelUpdated(data.data.serial, {
            watts: data.data.watts,
            voltage: data.data.voltage,
            last_seen_at: new Date().toISOString(),
          });
        } else if (data.type === 'connection_status') {
          if (data.data.status === 'disconnected') {
            setError(`MQTT disconnected: ${data.data.reason || 'Unknown reason'}`);
          }
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      if (isDiscovering && reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        setTimeout(connectWebSocket, delay);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    wsRef.current = ws;
  }, [isDiscovering, onPanelDiscovered, onPanelUpdated]);

  const handleStartDiscovery = async () => {
    setIsDiscovering(true);
    setConnectionStatus('connecting');
    setError(null);

    try {
      await startDiscovery(
        mqttConfig.server,
        mqttConfig.port,
        mqttConfig.username,
        mqttConfig.password
      );
      connectWebSocket();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start discovery');
      setIsDiscovering(false);
      setConnectionStatus('disconnected');
    }
  };

  const handleStopDiscovery = async () => {
    try {
      await stopDiscovery();
    } catch (e) {
      console.error('Failed to stop discovery:', e);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsDiscovering(false);
    setConnectionStatus('disconnected');
  };

  const handleRestart = async () => {
    await handleStopDiscovery();
    onClearPanels();
    await handleStartDiscovery();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopDiscovery().catch(() => {});
    };
  }, []);

  const getProgressMessage = () => {
    if (progressPercent >= 100) return 'All panels discovered!';
    if (progressPercent >= 90) return 'Almost there - most panels found';
    if (progressPercent >= 50) return 'Discovery in progress...';
    if (progressPercent > 0) return 'Discovering panels...';
    return 'Waiting for panels...';
  };

  const getProgressColor = () => {
    if (progressPercent >= 100) return '#4caf50';
    if (progressPercent >= 90) return '#8bc34a';
    if (progressPercent >= 50) return '#ff9800';
    return '#f44336';
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Panel Discovery</h2>
      <p style={{ margin: '0', color: '#666' }}>
        Connect to your MQTT broker and discover panels as they report in.
      </p>

      {/* Status Bar */}
      <div style={statusBarStyle}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>
            {discoveredCount} / {expectedPanelCount}
          </div>
          <div style={{ fontSize: '14px', color: '#666' }}>{getProgressMessage()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '20px',
            backgroundColor: connectionStatus === 'connected' ? '#e8f5e9' : connectionStatus === 'connecting' ? '#fff3e0' : '#ffebee',
            color: connectionStatus === 'connected' ? '#2e7d32' : connectionStatus === 'connecting' ? '#e65100' : '#c62828',
            fontSize: '14px',
          }}>
            {connectionStatus === 'connected' ? '● Connected' : connectionStatus === 'connecting' ? '○ Connecting...' : '○ Disconnected'}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div>
        <div style={progressStyle}>
          <div style={progressBarStyle(progressPercent)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: '#666' }}>
          <span>{Math.round(progressPercent)}% complete</span>
          <span style={{ color: getProgressColor() }}>{getProgressMessage()}</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Discovery Controls */}
      <div style={{ display: 'flex', gap: '12px' }}>
        {!isDiscovering ? (
          <button onClick={handleStartDiscovery} style={primaryButtonStyle}>
            Start Discovery
          </button>
        ) : (
          <>
            <button onClick={handleStopDiscovery} style={secondaryButtonStyle}>
              Stop
            </button>
            <button onClick={handleRestart} style={warningButtonStyle}>
              Restart Discovery
            </button>
          </>
        )}
      </div>

      {/* Panel Grid - Segmented by CCA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {topology.ccas.map(cca => {
          // Get expected panels for this CCA
          const ccaPanels: { label: string }[] = [];
          cca.strings.forEach(string => {
            for (let i = 1; i <= string.panel_count; i++) {
              ccaPanels.push({ label: `${string.name}${i}` });
            }
          });

          // Count discovered panels for this CCA
          const discoveredForCCA = Object.values(discoveredPanels).filter(p => p.cca === cca.name);
          const hasDiscoveredPanels = discoveredForCCA.length > 0;

          return (
            <div key={cca.name} style={ccaSectionStyle}>
              <div style={ccaHeaderStyle}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '16px' }}>{cca.name}</span>
                  <span style={{ marginLeft: '8px', fontSize: '14px', color: '#666' }}>
                    ({cca.serial_device})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: '#666' }}>
                    {discoveredForCCA.length} / {ccaPanels.length} panels
                  </span>
                  <span style={ccaStatusBadgeStyle(hasDiscoveredPanels)}>
                    {hasDiscoveredPanels ? '● Reporting' : '○ No Data'}
                  </span>
                </div>
              </div>
              <div style={panelGridStyle}>
                {ccaPanels.map(({ label }) => {
                  const discovered = discoveredForCCA.find(p => p.tigo_label === label);
                  return (
                    <div key={`${cca.name}-${label}`} style={panelCardStyle(!!discovered)}>
                      <div style={{ fontWeight: 600 }}>{label}</div>
                      {discovered && (
                        <div style={{ marginTop: '4px', fontSize: '12px' }}>
                          <div>{discovered.watts?.toFixed(0) || '—'}W</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#999' }}>
                            {discovered.serial}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={discoveredCount === 0}
          style={discoveredCount > 0 ? primaryButtonStyle : { ...primaryButtonStyle, backgroundColor: '#ccc', cursor: 'not-allowed' }}
        >
          {discoveredCount === 0
            ? 'Discover at least one panel'
            : progressPercent < 50
              ? 'Continue Anyway'
              : 'Next: Validation'}
        </button>
      </div>
    </div>
  );
}
