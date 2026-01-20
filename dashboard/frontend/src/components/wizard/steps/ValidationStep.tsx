/**
 * Step 5: Validation & Translations (Phase 1 spec FR-3.6).
 * Validates discovered panels against expected topology and allows label translations.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { validatePanels } from '../../../api/config';
import type { SystemConfig, DiscoveredPanel, ValidationResult, MatchResult } from '../../../types/config';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const summaryCardsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '16px',
};

const summaryCardStyle = (color: string): CSSProperties => ({
  padding: '16px',
  borderRadius: '8px',
  backgroundColor: color,
  textAlign: 'center',
});

const sectionStyle: CSSProperties = {
  padding: '20px',
  backgroundColor: '#fafafa',
  borderRadius: '8px',
  border: '1px solid #e0e0e0',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

const thStyle: CSSProperties = {
  padding: '12px',
  textAlign: 'left',
  borderBottom: '2px solid #e0e0e0',
  backgroundColor: '#f5f5f5',
};

const tdStyle: CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #e0e0e0',
};

const inputStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '4px',
  width: '60px',
};

const selectStyle: CSSProperties = {
  padding: '6px 10px',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '4px',
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

const smallButtonStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: '12px',
  backgroundColor: '#e3f2fd',
  color: '#1976d2',
  border: '1px solid #1976d2',
  borderRadius: '4px',
  cursor: 'pointer',
};

const bulkTranslationStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px',
  backgroundColor: '#fff3e0',
  borderRadius: '8px',
  marginBottom: '16px',
  flexWrap: 'wrap',
};

interface ValidationStepProps {
  topology: SystemConfig;
  discoveredPanels: Record<string, DiscoveredPanel>;
  translations: Record<string, string>;
  validationResults: MatchResult[] | null;
  onTranslationChange: (tigoLabel: string, displayLabel: string) => void;
  onValidationComplete: (results: MatchResult[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function ValidationStep({
  topology,
  discoveredPanels,
  translations,
  validationResults: _validationResults,
  onTranslationChange,
  onValidationComplete,
  onNext,
  onBack,
}: ValidationStepProps) {
  // Note: validationResults is provided by parent but we compute locally for display
  const [localValidation, setLocalValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk translation state
  const [bulkCca, setBulkCca] = useState('');
  const [bulkString, setBulkString] = useState('');
  const [bulkOffset, setBulkOffset] = useState(0);

  // Build expected labels from topology
  const expectedLabels: { cca: string; label: string }[] = [];
  topology.ccas.forEach(cca => {
    cca.strings.forEach(string => {
      for (let i = 1; i <= string.panel_count; i++) {
        expectedLabels.push({ cca: cca.name, label: `${string.name}${i}` });
      }
    });
  });

  // Build MatchResult array from validation result
  const buildMatchResults = useCallback((result: ValidationResult): MatchResult[] => {
    const matchResults: MatchResult[] = [];

    // Add matched panels
    result.matched.forEach(m => {
      matchResults.push({
        status: 'matched',
        tigo_label: m.tigo_label,
        reported_cca: m.cca,
      });
    });

    // Add unmatched panels
    result.unmatched.forEach(u => {
      matchResults.push({
        status: 'unmatched',
        tigo_label: u.tigo_label,
        needs_translation: true,
        reported_cca: u.cca,
      });
    });

    // Add wiring issues
    result.wiring_issues.forEach(w => {
      matchResults.push({
        status: 'possible_wiring_issue',
        tigo_label: w.tigo_label,
        reported_cca: w.actual_cca,
        expected_cca: w.expected_cca,
        warning: `Panel reports from CCA ${w.actual_cca} but expected ${w.expected_cca}`,
      });
    });

    return matchResults;
  }, []);

  // Run validation on mount or when discovered panels change
  useEffect(() => {
    const runValidation = async () => {
      setIsValidating(true);
      setError(null);

      try {
        const panels = Object.values(discoveredPanels);
        const result = await validatePanels(topology, panels);
        setLocalValidation(result);

        const matchResults = buildMatchResults(result);
        onValidationComplete(matchResults);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Validation failed');
      } finally {
        setIsValidating(false);
      }
    };

    if (Object.keys(discoveredPanels).length > 0 && !localValidation) {
      runValidation();
    }
  }, [topology, discoveredPanels, onValidationComplete, buildMatchResults, localValidation]);

  const handleTranslationChange = (tigoLabel: string, displayLabel: string) => {
    onTranslationChange(tigoLabel, displayLabel.toUpperCase());
  };

  const applyBulkTranslation = () => {
    if (!bulkCca || !bulkString) return;

    // Get panels from the selected CCA that need translation
    const ccaPanels = Object.values(discoveredPanels).filter(p => p.cca === bulkCca);

    // Sort by their position number in the Tigo label
    const sortedPanels = ccaPanels.sort((a, b) => {
      const aNum = parseInt(a.tigo_label.replace(/[^0-9]/g, ''), 10) || 0;
      const bNum = parseInt(b.tigo_label.replace(/[^0-9]/g, ''), 10) || 0;
      return aNum - bNum;
    });

    // Apply translations with offset
    sortedPanels.forEach((panel, index) => {
      const newNumber = index + 1 + bulkOffset;
      onTranslationChange(panel.tigo_label, `${bulkString}${newNumber}`);
    });
  };

  const getMatchedCount = () => localValidation?.matched.length || 0;
  const getUnmatchedCount = () => localValidation?.unmatched.length || 0;
  const getMissingCount = () => localValidation?.missing.length || 0;
  const getWiringIssueCount = () => localValidation?.wiring_issues.length || 0;

  const getAllUnique = (list: string[]) => [...new Set(list)];

  // Get display label for a panel (use translation if exists, otherwise tigo_label)
  const getDisplayLabel = (tigoLabel: string): string => {
    return translations[tigoLabel] || tigoLabel;
  };

  if (isValidating) {
    return (
      <div style={containerStyle}>
        <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Validating Panels...</h2>
        <p style={{ color: '#666' }}>Checking discovered panels against your topology configuration.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 8px', fontSize: '20px' }}>Panel Validation</h2>
      <p style={{ margin: '0', color: '#666' }}>
        Review panel matches and correct any label translations needed.
      </p>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div style={summaryCardsStyle}>
        <div style={summaryCardStyle('#e8f5e9')}>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#2e7d32' }}>{getMatchedCount()}</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Matched</div>
        </div>
        <div style={summaryCardStyle('#fff3e0')}>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#e65100' }}>{getUnmatchedCount()}</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Need Translation</div>
        </div>
        <div style={summaryCardStyle('#ffebee')}>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#c62828' }}>{getMissingCount()}</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Not Found</div>
        </div>
        <div style={summaryCardStyle('#e3f2fd')}>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#1565c0' }}>{getWiringIssueCount()}</div>
          <div style={{ fontSize: '14px', color: '#666' }}>Wiring Issues</div>
        </div>
      </div>

      {/* Bulk Translation */}
      {getUnmatchedCount() > 0 && (
        <div style={bulkTranslationStyle}>
          <span style={{ fontWeight: 500 }}>Bulk Translate:</span>
          <select
            value={bulkCca}
            onChange={(e) => setBulkCca(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select CCA</option>
            {topology.ccas.map(cca => (
              <option key={cca.name} value={cca.name}>{cca.name}</option>
            ))}
          </select>
          <span>to String</span>
          <select
            value={bulkString}
            onChange={(e) => setBulkString(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select String</option>
            {getAllUnique(expectedLabels.map(e => e.label.replace(/[0-9]/g, ''))).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span>Offset:</span>
          <input
            type="number"
            value={bulkOffset}
            onChange={(e) => setBulkOffset(parseInt(e.target.value, 10) || 0)}
            style={{ ...inputStyle, width: '50px' }}
            min={0}
          />
          <button onClick={applyBulkTranslation} style={smallButtonStyle}>
            Apply
          </button>
        </div>
      )}

      {/* Panel Translation Table */}
      <div style={sectionStyle}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Panel Assignments</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Serial</th>
                <th style={thStyle}>CCA</th>
                <th style={thStyle}>Tigo Label</th>
                <th style={thStyle}>Display Label</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(discoveredPanels).map(panel => {
                const isMatched = localValidation?.matched.some(m => m.serial === panel.serial);
                const hasWiringIssue = localValidation?.wiring_issues.some(w => w.serial === panel.serial);

                let status = 'unmatched';
                let statusColor = '#e65100';
                if (isMatched) {
                  status = 'matched';
                  statusColor = '#2e7d32';
                } else if (hasWiringIssue) {
                  status = 'wiring issue';
                  statusColor = '#1565c0';
                }

                return (
                  <tr key={panel.serial}>
                    <td style={tdStyle}>
                      <code style={{ fontSize: '12px' }}>{panel.serial}</code>
                    </td>
                    <td style={tdStyle}>{panel.cca}</td>
                    <td style={tdStyle}>{panel.tigo_label}</td>
                    <td style={tdStyle}>
                      <input
                        type="text"
                        value={getDisplayLabel(panel.tigo_label)}
                        onChange={(e) => handleTranslationChange(panel.tigo_label, e.target.value)}
                        style={inputStyle}
                        pattern="^[A-Z]{1,2}[0-9]+$"
                        title="Format: A1, B12, etc."
                      />
                    </td>
                    <td style={{ ...tdStyle, color: statusColor, fontWeight: 500 }}>
                      {status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Missing Panels Warning */}
      {getMissingCount() > 0 && (
        <div style={{ padding: '16px', backgroundColor: '#ffebee', borderRadius: '8px', border: '1px solid #ef9a9a' }}>
          <h4 style={{ margin: '0 0 8px', color: '#c62828' }}>Missing Panels</h4>
          <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#666' }}>
            The following expected panels were not discovered:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {localValidation?.missing.map(label => (
              <span key={label} style={{
                padding: '4px 8px',
                backgroundColor: 'white',
                borderRadius: '4px',
                fontSize: '12px',
                border: '1px solid #ef9a9a',
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={buttonGroupStyle}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          style={primaryButtonStyle}
        >
          Next: Review & Save
        </button>
      </div>
    </div>
  );
}
