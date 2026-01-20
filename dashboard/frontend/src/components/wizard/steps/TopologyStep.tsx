/**
 * Step 2: System Topology (Phase 1 spec FR-3.3).
 * Collects CCA devices and string configuration.
 */

import { useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import type { MQTTConfig, SystemConfig, CCAConfig, StringConfig } from '../../../types/config';

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const ccaCardStyle: CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: '#fafafa',
};

const ccaHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
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

const smallInputStyle: CSSProperties = {
  ...inputStyle,
  width: '80px',
};

const stringRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '8px 0',
};

const addButtonStyle: CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  backgroundColor: '#e3f2fd',
  color: '#1976d2',
  border: '1px solid #1976d2',
  borderRadius: '6px',
  cursor: 'pointer',
};

const removeButtonStyle: CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  backgroundColor: '#ffebee',
  color: '#c62828',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
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

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
};

interface TopologyStepProps {
  topology: SystemConfig | null;
  mqttConfig: MQTTConfig;
  onNext: (topology: SystemConfig) => void;
  onBack: () => void;
}

export function TopologyStep({ topology, mqttConfig, onNext, onBack }: TopologyStepProps) {
  const [ccas, setCcas] = useState<CCAConfig[]>(
    topology?.ccas || [
      {
        name: 'primary',
        serial_device: '/dev/ttyACM2',
        strings: [{ name: 'A', panel_count: 8 }],
      },
    ]
  );

  const addCca = () => {
    const nextDeviceNum = ccas.length + 2; // Start from ACM2
    setCcas([
      ...ccas,
      {
        name: ccas.length === 0 ? 'primary' : 'secondary',
        serial_device: `/dev/ttyACM${nextDeviceNum}`,
        strings: [{ name: 'A', panel_count: 8 }],
      },
    ]);
  };

  const removeCca = (index: number) => {
    setCcas(ccas.filter((_, i) => i !== index));
  };

  const updateCca = (index: number, updates: Partial<CCAConfig>) => {
    setCcas(ccas.map((cca, i) => (i === index ? { ...cca, ...updates } : cca)));
  };

  const addString = (ccaIndex: number) => {
    const cca = ccas[ccaIndex];
    const existingNames = cca.strings.map(s => s.name);
    // Find next available letter
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const nextName = alphabet.find(l => !existingNames.includes(l)) || 'AA';

    updateCca(ccaIndex, {
      strings: [...cca.strings, { name: nextName, panel_count: 8 }],
    });
  };

  const removeString = (ccaIndex: number, stringIndex: number) => {
    const cca = ccas[ccaIndex];
    if (cca.strings.length <= 1) return; // Must have at least one string
    updateCca(ccaIndex, {
      strings: cca.strings.filter((_, i) => i !== stringIndex),
    });
  };

  const updateString = (ccaIndex: number, stringIndex: number, updates: Partial<StringConfig>) => {
    const cca = ccas[ccaIndex];
    updateCca(ccaIndex, {
      strings: cca.strings.map((s, i) => (i === stringIndex ? { ...s, ...updates } : s)),
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onNext({
      version: 1,
      mqtt: mqttConfig,
      ccas,
    });
  };

  const getTotalPanels = () => {
    return ccas.reduce((total, cca) =>
      total + cca.strings.reduce((sum, s) => sum + s.panel_count, 0), 0
    );
  };

  const isValid = ccas.length > 0 && ccas.every(cca =>
    cca.name.trim() !== '' &&
    cca.serial_device.trim() !== '' &&
    cca.strings.length > 0 &&
    cca.strings.every(s => s.name.trim() !== '' && s.panel_count > 0)
  );

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>System Topology</h2>
      <p style={{ margin: '0 0 20px', color: '#666' }}>
        Define your Tigo CCA devices and the strings of panels connected to each.
      </p>

      {ccas.map((cca, ccaIndex) => (
        <div key={ccaIndex} style={ccaCardStyle}>
          <div style={ccaHeaderStyle}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>CCA {ccaIndex + 1}</h3>
            {ccas.length > 1 && (
              <button
                type="button"
                onClick={() => removeCca(ccaIndex)}
                style={removeButtonStyle}
              >
                Remove CCA
              </button>
            )}
          </div>

          <div style={rowStyle}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Name</label>
              <input
                type="text"
                value={cca.name}
                onChange={(e) => updateCca(ccaIndex, { name: e.target.value.toLowerCase() })}
                placeholder="primary"
                style={inputStyle}
                pattern="[a-z][a-z0-9-]*"
                title="Lowercase letters, numbers, and hyphens. Must start with a letter."
                required
              />
              <span style={hintStyle}>Used in MQTT topics (e.g., taptap/primary/...)</span>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Serial Device</label>
              <input
                type="text"
                value={cca.serial_device}
                onChange={(e) => updateCca(ccaIndex, { serial_device: e.target.value })}
                placeholder="/dev/ttyACM2"
                style={inputStyle}
                pattern="^/dev/(ttyACM|ttyUSB)\d+$"
                title="Must be /dev/ttyACMn or /dev/ttyUSBn"
                required
              />
              <span style={hintStyle}>Serial port on Raspberry Pi</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>Strings</label>

            {cca.strings.map((string, stringIndex) => (
              <div key={stringIndex} style={stringRowStyle}>
                <div style={fieldStyle}>
                  <input
                    type="text"
                    value={string.name}
                    onChange={(e) => updateString(ccaIndex, stringIndex, { name: e.target.value.toUpperCase() })}
                    placeholder="A"
                    style={smallInputStyle}
                    pattern="^[A-Z]{1,2}$"
                    title="1-2 uppercase letters"
                    maxLength={2}
                    required
                  />
                </div>
                <span style={{ color: '#666' }}>:</span>
                <div style={fieldStyle}>
                  <input
                    type="number"
                    value={string.panel_count}
                    onChange={(e) => updateString(ccaIndex, stringIndex, { panel_count: parseInt(e.target.value, 10) || 1 })}
                    style={smallInputStyle}
                    min={1}
                    max={100}
                    required
                  />
                </div>
                <span style={{ color: '#666' }}>panels</span>
                {cca.strings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeString(ccaIndex, stringIndex)}
                    style={removeButtonStyle}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            <button type="button" onClick={() => addString(ccaIndex)} style={{ ...addButtonStyle, marginTop: '8px' }}>
              + Add String
            </button>
          </div>
        </div>
      ))}

      <button type="button" onClick={addCca} style={addButtonStyle}>
        + Add Another CCA
      </button>

      <div style={{ padding: '12px', backgroundColor: '#e3f2fd', borderRadius: '6px' }}>
        <strong>Total Expected Panels:</strong> {getTotalPanels()}
      </div>

      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="submit"
          disabled={!isValid}
          style={isValid ? primaryButtonStyle : { ...primaryButtonStyle, backgroundColor: '#ccc', cursor: 'not-allowed' }}
        >
          Next: Generate Config
        </button>
      </div>
    </form>
  );
}
