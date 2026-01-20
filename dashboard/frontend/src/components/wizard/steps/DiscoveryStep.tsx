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

const stringSectionStyle: CSSProperties = {
  marginBottom: '16px',
};

// Panel card styles based on discovery state
type PanelState = 'discovered' | 'missing' | 'excess' | 'expected';

const panelCardStyle = (state: PanelState): CSSProperties => {
  const baseStyle: CSSProperties = {
    padding: '12px',
    borderRadius: '6px',
    position: 'relative',
  };

  switch (state) {
    case 'discovered':
      return {
        ...baseStyle,
        backgroundColor: '#e8f5e9',
        border: '1px solid #4caf50',
      };
    case 'missing':
      return {
        ...baseStyle,
        backgroundColor: '#ffebee',
        border: '1px solid #ef9a9a',
        opacity: 0.7,
      };
    case 'excess':
      return {
        ...baseStyle,
        backgroundColor: '#fff3e0',
        border: '2px dashed #ff9800',
      };
    case 'expected':
    default:
      return {
        ...baseStyle,
        backgroundColor: '#fafafa',
        border: '1px solid #e0e0e0',
        opacity: 0.5,
      };
  }
};

// Style for missing panel X overlay
const missingXStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontSize: '32px',
  color: '#c62828',
  opacity: 0.6,
  pointerEvents: 'none',
};

// Style for excess panel badge
const excessBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: '4px',
  right: '4px',
  fontSize: '10px',
  padding: '2px 6px',
  borderRadius: '10px',
  backgroundColor: '#ff9800',
  color: 'white',
  fontWeight: 500,
};

// Mismatch summary banner style
const mismatchBannerStyle: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#fff3e0',
  border: '1px solid #ffb74d',
  borderRadius: '6px',
  marginTop: '8px',
};

// String header with warning state
const stringHeaderWithWarningStyle = (hasIssues: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: hasIssues ? '#fff3e0' : '#e3f2fd',
  borderRadius: '6px',
  marginBottom: '8px',
  border: hasIssues ? '1px solid #ffb74d' : 'none',
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

/**
 * Extract the string name from a tigo_label (e.g., "A" from "A1", "AA" from "AA12").
 * Returns null if the label doesn't match expected format.
 */
function extractStringName(tigoLabel: string | undefined): string | null {
  if (!tigoLabel) return null;
  const match = tigoLabel.match(/^([A-Za-z]+)/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Extract the position number from a tigo_label (e.g., 1 from "A1", 12 from "AA12").
 * Returns null if the label doesn't match expected format.
 */
function extractPosition(tigoLabel: string | undefined): number | null {
  if (!tigoLabel) return null;
  const match = tigoLabel.match(/^[A-Za-z]+(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Calculate mismatch statistics for display.
 */
interface MismatchStats {
  stringsWithExcess: number;
  stringsWithMissing: number;
  totalExcess: number;
  totalMissing: number;
}

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

  // Calculate mismatch statistics
  const mismatchStats: MismatchStats = (() => {
    let stringsWithExcess = 0;
    let stringsWithMissing = 0;
    let totalExcess = 0;
    let totalMissing = 0;

    topology.ccas.forEach(cca => {
      const discoveredForCCA = Object.values(discoveredPanels).filter(p => p.cca === cca.name);

      cca.strings.forEach(string => {
        const stringNameUpper = string.name.toUpperCase();
        const discoveredForString = discoveredForCCA.filter(p =>
          extractStringName(p.tigo_label) === stringNameUpper
        );

        // Count panels that match expected positions (1 to panel_count)
        let matchedCount = 0;
        let excessCount = 0;

        discoveredForString.forEach(panel => {
          const pos = extractPosition(panel.tigo_label);
          if (pos && pos >= 1 && pos <= string.panel_count) {
            matchedCount++;
          } else {
            excessCount++;
          }
        });

        const missingCount = string.panel_count - matchedCount;

        if (excessCount > 0) {
          stringsWithExcess++;
          totalExcess += excessCount;
        }
        if (missingCount > 0) {
          stringsWithMissing++;
          totalMissing += missingCount;
        }
      });
    });

    return { stringsWithExcess, stringsWithMissing, totalExcess, totalMissing };
  })();

  const hasMismatches = mismatchStats.totalExcess > 0 || mismatchStats.totalMissing > 0;

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

      {/* Mismatch Summary Banner */}
      {hasMismatches && discoveredCount > 0 && (
        <div style={mismatchBannerStyle}>
          <div style={{ fontWeight: 600, marginBottom: '4px', color: '#e65100' }}>
            ⚠️ Panel mapping issues detected
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            {mismatchStats.totalExcess > 0 && (
              <span style={{ marginRight: '16px' }}>
                <span style={{ color: '#ff9800', fontWeight: 500 }}>{mismatchStats.totalExcess} excess</span>
                {' '}panel{mismatchStats.totalExcess !== 1 ? 's' : ''} in {mismatchStats.stringsWithExcess} string{mismatchStats.stringsWithExcess !== 1 ? 's' : ''} (found but not expected)
              </span>
            )}
            {mismatchStats.totalMissing > 0 && (
              <span>
                <span style={{ color: '#c62828', fontWeight: 500 }}>{mismatchStats.totalMissing} missing</span>
                {' '}panel{mismatchStats.totalMissing !== 1 ? 's' : ''} in {mismatchStats.stringsWithMissing} string{mismatchStats.stringsWithMissing !== 1 ? 's' : ''} (expected but not found)
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            These panels may need to be remapped in the next step.
          </div>
        </div>
      )}

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
          // Count discovered panels for this CCA
          const discoveredForCCA = Object.values(discoveredPanels).filter(p => p.cca === cca.name);
          const hasDiscoveredPanels = discoveredForCCA.length > 0;
          const totalPanelsForCCA = cca.strings.reduce((sum, s) => sum + s.panel_count, 0);

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
                    {discoveredForCCA.length} / {totalPanelsForCCA} panels
                  </span>
                  <span style={ccaStatusBadgeStyle(hasDiscoveredPanels)}>
                    {hasDiscoveredPanels ? '● Reporting' : '○ No Data'}
                  </span>
                </div>
              </div>

              {/* Strings within CCA */}
              {cca.strings.map(string => {
                // Get discovered panels for this string (case-insensitive match)
                const stringNameUpper = string.name.toUpperCase();
                const discoveredForString = discoveredForCCA.filter(p =>
                  extractStringName(p.tigo_label) === stringNameUpper
                );

                // Separate panels into expected positions and excess
                const expectedPanels: Array<{ label: string; discovered: DiscoveredPanel | undefined }> = [];
                const excessPanels: DiscoveredPanel[] = [];

                // Build expected panel slots
                for (let i = 1; i <= string.panel_count; i++) {
                  const label = `${string.name}${i}`;
                  const labelUpper = label.toUpperCase();
                  const discovered = discoveredForString.find(p =>
                    p.tigo_label?.toUpperCase() === labelUpper
                  );
                  expectedPanels.push({ label, discovered });
                }

                // Find excess panels (positions beyond expected or non-matching labels)
                discoveredForString.forEach(panel => {
                  const pos = extractPosition(panel.tigo_label);
                  if (!pos || pos > string.panel_count) {
                    excessPanels.push(panel);
                  }
                });

                // Calculate stats for this string
                const matchedCount = expectedPanels.filter(p => p.discovered).length;
                const missingCount = string.panel_count - matchedCount;
                const hasExcess = excessPanels.length > 0;
                const hasMissing = missingCount > 0;
                const hasIssues = hasExcess || hasMissing;

                // String header count display
                const displayedCount = discoveredForString.length;
                const countColor = hasExcess ? '#ff9800' : hasMissing ? '#c62828' : '#666';

                return (
                  <div key={`${cca.name}-${string.name}`} style={stringSectionStyle}>
                    <div style={stringHeaderWithWarningStyle(hasIssues)}>
                      <span style={{ fontWeight: 500 }}>
                        String {string.name}
                        {hasIssues && (
                          <span style={{ marginLeft: '8px', fontSize: '12px', color: '#e65100' }}>
                            {hasExcess && `+${excessPanels.length} excess`}
                            {hasExcess && hasMissing && ', '}
                            {hasMissing && `${missingCount} missing`}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: '13px', color: countColor, fontWeight: hasIssues ? 500 : 400 }}>
                        {displayedCount} / {string.panel_count}
                      </span>
                    </div>
                    <div style={panelGridStyle}>
                      {/* Expected panel slots */}
                      {expectedPanels.map(({ label, discovered }) => {
                        const isMissing = !discovered && discoveredCount > 0;
                        const state: PanelState = discovered ? 'discovered' : isMissing ? 'missing' : 'expected';

                        return (
                          <div key={`${cca.name}-${label}`} style={panelCardStyle(state)}>
                            <div style={{ fontWeight: 600 }}>{label}</div>
                            {discovered ? (
                              <div style={{ marginTop: '4px', fontSize: '12px' }}>
                                <div>{discovered.watts?.toFixed(0) || '—'}W</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#999' }}>
                                  {discovered.serial}
                                </div>
                              </div>
                            ) : isMissing ? (
                              <span style={missingXStyle}>✕</span>
                            ) : null}
                          </div>
                        );
                      })}

                      {/* Excess panels (found but not expected in topology) */}
                      {excessPanels.map(panel => (
                        <div key={`${cca.name}-excess-${panel.serial}`} style={panelCardStyle('excess')}>
                          <span style={excessBadgeStyle}>excess</span>
                          <div style={{ fontWeight: 600 }}>{panel.tigo_label}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px' }}>
                            <div>{panel.watts?.toFixed(0) || '—'}W</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#999' }}>
                              {panel.serial}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
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
