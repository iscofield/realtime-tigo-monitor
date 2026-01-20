/**
 * Step 1: MQTT Configuration (Phase 1 spec FR-3.2).
 * Collects MQTT broker settings with connection test.
 */

import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { testMqttConnection } from '../../../api/config';
import type { MQTTConfig } from '../../../types/config';

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '3fr 1fr',
  gap: '16px',
};

const labelStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 500,
  color: '#333',
};

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  outline: 'none',
};

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
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

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#ccc',
  cursor: 'not-allowed',
};

const testResultStyle = (success: boolean): CSSProperties => ({
  padding: '12px 16px',
  borderRadius: '6px',
  backgroundColor: success ? '#e8f5e9' : '#ffebee',
  color: success ? '#2e7d32' : '#c62828',
  fontSize: '14px',
});

interface MqttConfigStepProps {
  config: MQTTConfig | null;
  onNext: (config: MQTTConfig) => void;
}

export function MqttConfigStep({ config, onNext }: MqttConfigStepProps) {
  const [server, setServer] = useState(config?.server || '');
  const [port, setPort] = useState(config?.port?.toString() || '1883');
  const [username, setUsername] = useState(config?.username || '');
  const [password, setPassword] = useState(config?.password || '');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testPassed, setTestPassed] = useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testMqttConnection({
        server,
        port: parseInt(port, 10),
        username: username || undefined,
        password: password || undefined,
      });

      setTestResult({
        success: result.success,
        message: result.message,
      });
      setTestPassed(result.success);
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : 'Connection test failed',
      });
      setTestPassed(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onNext({
      server,
      port: parseInt(port, 10),
      username: username || undefined,
      password: password || undefined,
    });
  };

  const isValid = server.trim() !== '' && port.trim() !== '';

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>MQTT Broker Settings</h2>
      <p style={{ margin: '0 0 20px', color: '#666' }}>
        Enter your MQTT broker connection details. This is where your Tigo-MQTT service publishes panel data.
      </p>

      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Server Address *</label>
          <input
            type="text"
            value={server}
            onChange={(e) => {
              setServer(e.target.value);
              setTestPassed(false);
            }}
            placeholder="192.168.1.100 or mqtt.example.com"
            style={inputStyle}
            required
          />
          <span style={hintStyle}>IP address or hostname of your MQTT broker</span>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Port *</label>
          <input
            type="number"
            value={port}
            onChange={(e) => {
              setPort(e.target.value);
              setTestPassed(false);
            }}
            placeholder="1883"
            style={inputStyle}
            min={1}
            max={65535}
            required
          />
        </div>
      </div>

      <div style={rowStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setTestPassed(false);
            }}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setTestPassed(false);
            }}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
      </div>

      {testResult && (
        <div style={testResultStyle(testResult.success)}>
          {testResult.success ? '✓ ' : '✗ '}
          {testResult.message}
        </div>
      )}

      <div style={buttonGroupStyle}>
        <button
          type="button"
          onClick={handleTest}
          disabled={!isValid || isTesting}
          style={!isValid || isTesting ? disabledButtonStyle : secondaryButtonStyle}
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>

        <button
          type="submit"
          disabled={!isValid || !testPassed}
          style={!isValid || !testPassed ? disabledButtonStyle : primaryButtonStyle}
        >
          Next: System Topology
        </button>
      </div>

      {!testPassed && isValid && (
        <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
          Please test the connection before proceeding.
        </p>
      )}
    </form>
  );
}
