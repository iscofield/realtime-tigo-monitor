/**
 * Step: Panel Serial Numbers entry.
 * Allows users to enter serial numbers for each panel slot
 * defined in the system topology, or skip to use placeholders.
 */

import { useState, useCallback, useEffect, useRef, useMemo, memo } from 'react';
import type { CSSProperties } from 'react';
import type { SystemConfig, Panel } from '../../../types/config';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const ccaCardStyle: CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  padding: '20px',
  backgroundColor: '#fafafa',
};

const stringSectionStyle: CSSProperties = {
  marginTop: '16px',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #e0e0e0',
  fontWeight: 600,
  color: '#333',
};

const tdStyle: CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #f0f0f0',
};

const inputStyle: CSSProperties = {
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  textTransform: 'uppercase',
};

const inputErrorStyle: CSSProperties = {
  ...inputStyle,
  border: '1px solid #c62828',
};

const errorTextStyle: CSSProperties = {
  fontSize: '12px',
  color: '#c62828',
  marginTop: '2px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
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

const destructiveButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#c62828',
  color: 'white',
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  backgroundColor: '#ccc',
  cursor: 'not-allowed',
};

const bannerStyle: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#fff3e0',
  border: '1px solid #ffb74d',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#e65100',
};

const successBannerStyle: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#e8f5e9',
  border: '1px solid #81c784',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#2e7d32',
};

const warningBannerStyle: CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#ffebee',
  border: '1px solid #ef9a9a',
  borderRadius: '6px',
  fontSize: '14px',
  color: '#c62828',
};

const bulkSectionStyle: CSSProperties = {
  marginTop: '16px',
  padding: '16px',
  backgroundColor: '#f5f5f5',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
};

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '80px',
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid #ccc',
  borderRadius: '6px',
  outline: 'none',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  resize: 'vertical',
};

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalContentStyle: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '8px',
  padding: '24px',
  maxWidth: '500px',
  width: '90%',
  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
};

const hintStyle: CSSProperties = {
  fontSize: '12px',
  color: '#666',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERIAL_PATTERN = /^[A-Z0-9][A-Z0-9\-]{2,19}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SerialEntryStepProps {
  topology: SystemConfig;
  serialEntries: Record<string, Record<string, string>> | null;
  onNext: (serials: Record<string, Record<string, string>> | null) => void;
  onBack: () => void;
}

interface SerialInputRowProps {
  label: string;
  value: string;
  error: string | null;
  onChange: (label: string, value: string) => void;
  onBlur: (label: string) => void;
  onKeyDown: (label: string, e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}

// ---------------------------------------------------------------------------
// parseBulkSerials
// ---------------------------------------------------------------------------

/**
 * Parses bulk serial input. Supports two formats:
 *
 * 1. **TSV label-serial pairs** (preferred): Each line is `label\tserial`.
 *    The label (e.g., "F1", "B4") maps the serial to that panel position.
 *
 * 2. **Plain serial list**: One serial per line (or comma-separated).
 *    Serials are assigned sequentially to slots.
 *
 * Returns either a map of label->serial, a flat serial array, or an error.
 */
export function parseBulkSerials(
  input: string,
  expectedCount: number,
  ccaName: string,
  validLabels?: Set<string>
): { serialMap: Record<string, string> } | { serials: string[] } | { error: string } {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length === 0) {
    return { error: 'No serial numbers found. Paste label-serial pairs (one per line, tab-separated) or a plain serial list.' };
  }

  // Detect format: if the first non-empty line contains a tab, treat as TSV
  const isTSV = lines.some(l => l.includes('\t'));

  if (isTSV) {
    // TSV mode: each line is "label\tserial"
    const serialMap: Record<string, string> = {};
    const seenSerials = new Map<string, string>(); // serial -> label (for dup detection)

    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split('\t').map(p => p.trim());
      if (parts.length < 2 || !parts[1]) {
        return { error: `Line ${i + 1}: expected "label<tab>serial" but got "${lines[i]}".` };
      }

      const label = parts[0].toUpperCase();
      const serial = parts[1].toUpperCase();

      // Validate label if we have valid labels
      if (validLabels && !validLabels.has(label)) {
        return { error: `Line ${i + 1}: unknown panel label "${label}". Valid labels for CCA "${ccaName}": ${[...validLabels].sort().join(', ')}.` };
      }

      // Validate serial format
      if (!SERIAL_PATTERN.test(serial)) {
        return { error: `Line ${i + 1}: invalid serial "${serial}". Expected format like 4-C3F2CCZ.` };
      }

      // Check for duplicate labels
      if (serialMap[label] !== undefined) {
        return { error: `Duplicate label "${label}" at lines ${Object.keys(serialMap).indexOf(label) + 1} and ${i + 1}.` };
      }

      // Check for duplicate serials
      const prevLabel = seenSerials.get(serial);
      if (prevLabel !== undefined) {
        return { error: `Duplicate serial "${serial}" for labels "${prevLabel}" and "${label}".` };
      }

      serialMap[label] = serial;
      seenSerials.set(serial, label);
    }

    if (Object.keys(serialMap).length !== expectedCount) {
      return {
        error: `Expected ${expectedCount} serial entries for CCA "${ccaName}", but found ${Object.keys(serialMap).length}.`,
      };
    }

    return { serialMap };
  }

  // Plain list mode: split on commas or newlines
  const tokens = lines
    .flatMap(l => l.split(','))
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0);

  if (tokens.length === 0) {
    return { error: 'No serial numbers found.' };
  }

  if (tokens.length !== expectedCount) {
    return {
      error: `Expected ${expectedCount} serial numbers for CCA "${ccaName}", but found ${tokens.length}.`,
    };
  }

  // Validate each token
  for (let i = 0; i < tokens.length; i++) {
    if (!SERIAL_PATTERN.test(tokens[i])) {
      return {
        error: `Invalid serial at position ${i + 1}: "${tokens[i]}". Expected format like 4-C3F2CCZ.`,
      };
    }
  }

  // Check for duplicates within this batch
  const seen = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    const prev = seen.get(tokens[i]);
    if (prev !== undefined) {
      return {
        error: `Duplicate serial "${tokens[i]}" at positions ${prev + 1} and ${i + 1}.`,
      };
    }
    seen.set(tokens[i], i);
  }

  return { serials: tokens };
}

// ---------------------------------------------------------------------------
// serialEntriesToPanels
// ---------------------------------------------------------------------------

export function serialEntriesToPanels(
  serials: Record<string, Record<string, string>>,
  topology: SystemConfig
): Panel[] {
  const panels: Panel[] = [];

  for (const cca of topology.ccas) {
    const ccaSerials = serials[cca.name] || {};

    for (const str of cca.strings) {
      for (let i = 1; i <= str.panel_count; i++) {
        const label = `${str.name}${i}`;
        const serial = ccaSerials[label];
        if (serial) {
          panels.push({
            serial,
            cca: cca.name,
            string: str.name,
            tigo_label: label,
            display_label: label,
            position: null,
          });
        }
      }
    }
  }

  return panels;
}

// ---------------------------------------------------------------------------
// SerialInputRow (memoized)
// ---------------------------------------------------------------------------

const SerialInputRow = memo(function SerialInputRow({
  label,
  value,
  error,
  onChange,
  onBlur,
  onKeyDown,
  inputRef,
}: SerialInputRowProps) {
  const errorId = `error-${label}`;
  const hasError = error !== null;

  return (
    <tr>
      <td style={tdStyle}>
        <strong>{label}</strong>
      </td>
      <td style={tdStyle}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(label, e.target.value.toUpperCase())}
          onBlur={() => onBlur(label)}
          onKeyDown={(e) => onKeyDown(label, e)}
          style={hasError ? inputErrorStyle : inputStyle}
          maxLength={20}
          aria-label={`Serial number for panel ${label}`}
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? errorId : undefined}
        />
        {hasError && (
          <div id={errorId} style={errorTextStyle}>
            <span aria-hidden="true">{'\u26A0'}</span> {error}
          </div>
        )}
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// ConfirmationModal
// ---------------------------------------------------------------------------

function ConfirmationModal({
  title,
  body,
  confirmLabel,
  confirmStyle,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmStyle?: CSSProperties;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus trap and escape dismiss
  useEffect(() => {
    confirmRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        // Simple two-button focus trap
        if (e.shiftKey) {
          if (document.activeElement === confirmRef.current) {
            e.preventDefault();
            cancelRef.current?.focus();
          }
        } else {
          if (document.activeElement === cancelRef.current) {
            e.preventDefault();
            confirmRef.current?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div style={modalOverlayStyle} onClick={onCancel} role="dialog" aria-modal="true" aria-label={title}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>{title}</h3>
        <p style={{ margin: '0 0 24px', color: '#555', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={secondaryButtonStyle}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={confirmStyle || primaryButtonStyle}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SerialEntryStep({
  topology,
  serialEntries: initialEntries,
  onNext,
  onBack,
}: SerialEntryStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const clearAllButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Build the flat list of all panel labels across all CCAs for ordering
  const panelSlots = useMemo(() => {
    const slots: { ccaName: string; stringName: string; position: number; label: string }[] = [];
    for (const cca of topology.ccas) {
      for (const str of cca.strings) {
        if (str.panel_count <= 0) continue;
        for (let i = 1; i <= str.panel_count; i++) {
          slots.push({
            ccaName: cca.name,
            stringName: str.name,
            position: i,
            label: `${str.name}${i}`,
          });
        }
      }
    }
    return slots;
  }, [topology]);

  const totalPanels = panelSlots.length;

  // Initialize local state for serial values
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => {
    if (initialEntries) return JSON.parse(JSON.stringify(initialEntries));
    const init: Record<string, Record<string, string>> = {};
    for (const cca of topology.ccas) {
      init[cca.name] = {};
      for (const str of cca.strings) {
        for (let i = 1; i <= str.panel_count; i++) {
          init[cca.name][`${str.name}${i}`] = '';
        }
      }
    }
    return init;
  });

  // Blur tracking - which fields have been blurred
  const [blurred, setBlurred] = useState<Set<string>>(() => new Set());

  // Duplicate map ref: serial (uppercase) -> array of qualified labels ("ccaName/label")
  const duplicateMapRef = useRef<Map<string, string[]>>(new Map());

  // Input refs for Enter key navigation and focus management
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Bulk import state per CCA
  const [bulkOpen, setBulkOpen] = useState<Record<string, boolean>>({});
  const [bulkText, setBulkText] = useState<Record<string, string>>({});
  const [bulkError, setBulkError] = useState<Record<string, string | null>>({});
  const [bulkSuccess, setBulkSuccess] = useState<Record<string, string | null>>({});
  const [bulkImporting, setBulkImporting] = useState<Record<string, boolean>>({});
  const [bulkWarning, setBulkWarning] = useState<Record<string, string | null>>({});

  // Modal state
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState<{ ccaName: string; serials: string[] } | null>(null);

  // Focus heading on mount
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Rebuild duplicate map whenever values change
  const rebuildDuplicateMap = useCallback((currentValues: Record<string, Record<string, string>>) => {
    const map = new Map<string, string[]>();
    for (const [ccaName, ccaVals] of Object.entries(currentValues)) {
      for (const [label, val] of Object.entries(ccaVals)) {
        if (val.length > 0) {
          const upper = val.toUpperCase();
          const qualifiedLabel = `${ccaName}/${label}`;
          const existing = map.get(upper);
          if (existing) {
            existing.push(qualifiedLabel);
          } else {
            map.set(upper, [qualifiedLabel]);
          }
        }
      }
    }
    duplicateMapRef.current = map;
  }, []);

  // Initialize duplicate map on mount
  useEffect(() => {
    rebuildDuplicateMap(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute errors for each field
  const getFieldError = useCallback((ccaName: string, label: string, value: string, isBlurred: boolean): string | null => {
    // Only show validation errors after blur
    if (value.length === 0) return null;

    // Duplicate check (always, not just on blur)
    const upper = value.toUpperCase();
    const dups = duplicateMapRef.current.get(upper);
    if (dups && dups.length > 1) {
      const qualifiedLabel = `${ccaName}/${label}`;
      const otherLabels = dups
        .filter(l => l !== qualifiedLabel)
        .map(l => {
          const [otherCca, otherLabel] = l.split('/');
          // Strip CCA prefix if both are in the same CCA
          return otherCca === ccaName ? otherLabel : l;
        })
        .join(', ');
      return `Duplicate \u2014 also entered for ${otherLabels}`;
    }

    if (!isBlurred) return null;

    // Length check
    if (value.length >= 1 && value.length < 4) {
      return 'Serial must be at least 4 characters';
    }

    // Pattern check
    if (!(/^[A-Z0-9\-]*$/).test(value.toUpperCase())) {
      return 'Only letters, numbers, and hyphens allowed';
    }

    return null;
  }, []);

  // Count entered serials
  const enteredCount = useMemo(() => {
    let count = 0;
    for (const ccaVals of Object.values(values)) {
      for (const val of Object.values(ccaVals)) {
        if (val.length > 0) count++;
      }
    }
    return count;
  }, [values]);

  // Check if all fields are valid and filled
  const allValid = useMemo(() => {
    if (enteredCount !== totalPanels) return false;
    for (const [, ccaVals] of Object.entries(values)) {
      for (const [, val] of Object.entries(ccaVals)) {
        if (!SERIAL_PATTERN.test(val.toUpperCase())) return false;
        // Check duplicates
        const upper = val.toUpperCase();
        const dups = duplicateMapRef.current.get(upper);
        if (dups && dups.length > 1) return false;
      }
    }
    return true;
  }, [enteredCount, totalPanels, values]);

  // Handlers
  const handleChange = useCallback((ccaName: string, label: string, value: string) => {
    setValues(prev => {
      const next = { ...prev, [ccaName]: { ...prev[ccaName], [label]: value } };
      rebuildDuplicateMap(next);
      return next;
    });
  }, [rebuildDuplicateMap]);

  const handleBlur = useCallback((qualifiedId: string) => {
    setBlurred(prev => {
      const next = new Set(prev);
      next.add(qualifiedId);
      return next;
    });
  }, []);

  // Enter key navigation
  const handleKeyDown = useCallback((currentLabel: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      // Find next input
      const currentIdx = panelSlots.findIndex(s => `${s.ccaName}/${s.label}` === currentLabel);
      if (currentIdx < panelSlots.length - 1) {
        const nextSlot = panelSlots[currentIdx + 1];
        const nextKey = `${nextSlot.ccaName}/${nextSlot.label}`;
        inputRefs.current.get(nextKey)?.focus();
      } else {
        // Last field - focus Next button
        nextButtonRef.current?.focus();
      }
    }
  }, [panelSlots]);

  // Register input refs
  const setInputRef = useCallback((qualifiedLabel: string) => {
    return (el: HTMLInputElement | null) => {
      if (el) {
        inputRefs.current.set(qualifiedLabel, el);
      } else {
        inputRefs.current.delete(qualifiedLabel);
      }
    };
  }, []);

  // Build valid labels set per CCA
  const validLabelsByCca = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const cca of topology.ccas) {
      const labels = new Set<string>();
      for (const str of cca.strings) {
        for (let i = 1; i <= str.panel_count; i++) {
          labels.add(`${str.name}${i}`);
        }
      }
      map[cca.name] = labels;
    }
    return map;
  }, [topology]);

  // Bulk import handling
  const handleBulkImport = useCallback((ccaName: string) => {
    setBulkImporting(prev => ({ ...prev, [ccaName]: true }));
    setBulkError(prev => ({ ...prev, [ccaName]: null }));
    setBulkSuccess(prev => ({ ...prev, [ccaName]: null }));
    setBulkWarning(prev => ({ ...prev, [ccaName]: null }));

    const text = bulkText[ccaName] || '';
    const cca = topology.ccas.find(c => c.name === ccaName);
    if (!cca) {
      setBulkImporting(prev => ({ ...prev, [ccaName]: false }));
      return;
    }

    const expectedCount = cca.strings.reduce((sum, s) => sum + s.panel_count, 0);
    const result = parseBulkSerials(text, expectedCount, ccaName, validLabelsByCca[ccaName]);

    if ('error' in result) {
      setBulkError(prev => ({ ...prev, [ccaName]: result.error }));
      setBulkImporting(prev => ({ ...prev, [ccaName]: false }));
      return;
    }

    // Normalize to a flat serial array (ordered by panel slots) for applyBulkSerials
    let serials: string[];
    if ('serialMap' in result) {
      // TSV mode: map labels to their slot order
      serials = [];
      for (const str of cca.strings) {
        for (let i = 1; i <= str.panel_count; i++) {
          const label = `${str.name}${i}`;
          serials.push(result.serialMap[label] || '');
        }
      }
    } else {
      serials = result.serials;
    }

    // Check if any existing values will be overwritten
    const existingValues = values[ccaName] || {};
    const hasExisting = Object.values(existingValues).some(v => v.length > 0);

    if (hasExisting) {
      // Show confirmation
      setShowBulkConfirm({ ccaName, serials });
      setBulkImporting(prev => ({ ...prev, [ccaName]: false }));
      return;
    }

    // Apply directly
    applyBulkSerials(ccaName, serials);
  }, [bulkText, topology, values, validLabelsByCca]);

  const applyBulkSerials = useCallback((ccaName: string, serials: string[]) => {
    const cca = topology.ccas.find(c => c.name === ccaName);
    if (!cca) return;

    const newCcaValues: Record<string, string> = {};
    let idx = 0;
    for (const str of cca.strings) {
      for (let i = 1; i <= str.panel_count; i++) {
        const label = `${str.name}${i}`;
        newCcaValues[label] = serials[idx] || '';
        idx++;
      }
    }

    setValues(prev => {
      const next = { ...prev, [ccaName]: newCcaValues };
      rebuildDuplicateMap(next);

      // Check for cross-CCA duplicates
      const crossDups: string[] = [];
      for (const [label, val] of Object.entries(newCcaValues)) {
        if (val.length === 0) continue;
        const upper = val.toUpperCase();
        // Check other CCAs
        for (const [otherCca, otherVals] of Object.entries(next)) {
          if (otherCca === ccaName) continue;
          for (const [otherLabel, otherVal] of Object.entries(otherVals)) {
            if (otherVal.toUpperCase() === upper) {
              crossDups.push(`${val} (${ccaName}/${label} and ${otherCca}/${otherLabel})`);
            }
          }
        }
      }

      if (crossDups.length > 0) {
        setBulkWarning(prev => ({
          ...prev,
          [ccaName]: `Cross-CCA duplicates detected: ${crossDups.join('; ')}`,
        }));
        // Keep section open
      } else {
        // Collapse section, show success
        setBulkOpen(prev => ({ ...prev, [ccaName]: false }));
        setBulkSuccess(prev => ({
          ...prev,
          [ccaName]: `Successfully imported ${serials.length} serial numbers.`,
        }));
        // Focus first serial input of this CCA
        setTimeout(() => {
          const firstSlot = panelSlots.find(s => s.ccaName === ccaName);
          if (firstSlot) {
            inputRefs.current.get(`${ccaName}/${firstSlot.label}`)?.focus();
          }
        }, 100);
      }

      return next;
    });

    // Mark all fields as blurred for validation
    setBlurred(prev => {
      const next = new Set(prev);
      for (const label of Object.keys(values[ccaName] || {})) {
        next.add(`${ccaName}/${label}`);
      }
      return next;
    });

    setBulkImporting(prev => ({ ...prev, [ccaName]: false }));
    setBulkText(prev => ({ ...prev, [ccaName]: '' }));
    setBulkError(prev => ({ ...prev, [ccaName]: null }));
  }, [topology, panelSlots, rebuildDuplicateMap, values]);

  // Skip handler
  const handleSkipConfirm = useCallback(() => {
    setShowSkipModal(false);
    onNext(null);
  }, [onNext]);

  // Clear all handler
  const handleClearConfirm = useCallback(() => {
    setShowClearModal(false);
    const cleared: Record<string, Record<string, string>> = {};
    for (const cca of topology.ccas) {
      cleared[cca.name] = {};
      for (const str of cca.strings) {
        for (let i = 1; i <= str.panel_count; i++) {
          cleared[cca.name][`${str.name}${i}`] = '';
        }
      }
    }
    setValues(cleared);
    rebuildDuplicateMap(cleared);
    setBlurred(new Set());
    setBulkOpen({});
    setBulkText({});
    setBulkError({});
    setBulkSuccess({});
    setBulkWarning({});
    clearAllButtonRef.current?.focus();
  }, [topology, rebuildDuplicateMap]);

  // Next handler
  const handleNext = useCallback(() => {
    onNext(values);
  }, [onNext, values]);

  // Determine which CCAs have panels
  const ccasWithPanels = useMemo(() => {
    return topology.ccas.filter(cca =>
      cca.strings.reduce((sum, s) => sum + s.panel_count, 0) > 0
    );
  }, [topology]);

  const isPartial = enteredCount > 0 && enteredCount < totalPanels;
  const skipDisabled = enteredCount > 0;
  const skipHelperId = 'skip-helper-text';

  return (
    <div style={containerStyle}>
      <h2
        ref={headingRef}
        tabIndex={-1}
        style={{ margin: '0 0 8px', fontSize: '20px', outline: 'none' }}
      >
        Panel Serial Numbers
      </h2>
      <p style={{ margin: '0', color: '#666' }}>
        Enter the serial number for each panel position. Serial numbers are printed on the
        back of each Tigo optimizer (e.g., 4-C3F2CCZ).
      </p>

      {/* Clear All button */}
      {enteredCount > 0 && (
        <div>
          <button
            ref={clearAllButtonRef}
            type="button"
            onClick={() => setShowClearModal(true)}
            style={destructiveButtonStyle}
            aria-label="Clear all serial numbers for all CCAs"
          >
            Clear All ({enteredCount})
          </button>
        </div>
      )}

      {/* Partial entry warning banner */}
      {isPartial && (
        <div style={bannerStyle} role="status">
          Serial numbers must be entered for all {totalPanels} panels, or skipped
          entirely. Currently {enteredCount} of {totalPanels} entered.
        </div>
      )}

      {/* CCA cards */}
      {ccasWithPanels.map((cca) => {
        const ccaPanelCount = cca.strings.reduce((sum, s) => sum + s.panel_count, 0);
        const ccaEnteredCount = Object.values(values[cca.name] || {}).filter(v => v.length > 0).length;
        const isBulkOpenForCca = bulkOpen[cca.name] || false;

        return (
          <div key={cca.name} style={ccaCardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>
                CCA: {cca.name}
              </h3>
              <span style={{ fontSize: '13px', color: '#666' }}>
                {ccaEnteredCount} of {ccaPanelCount} entered
              </span>
            </div>

            {/* Bulk import success message */}
            {bulkSuccess[cca.name] && (
              <div style={successBannerStyle} role="status">
                {bulkSuccess[cca.name]}
              </div>
            )}

            {/* Bulk import section (above manual entry) */}
            <div style={{ marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setBulkOpen(prev => ({ ...prev, [cca.name]: !prev[cca.name] }));
                  setBulkError(prev => ({ ...prev, [cca.name]: null }));
                  setBulkSuccess(prev => ({ ...prev, [cca.name]: null }));
                  setBulkWarning(prev => ({ ...prev, [cca.name]: null }));
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1976d2',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '4px 0',
                  textDecoration: 'underline',
                }}
              >
                {isBulkOpenForCca ? 'Hide Bulk Import' : 'Bulk Import Serials'}
              </button>
            </div>

            {isBulkOpenForCca && (() => {
              // Build a sample placeholder showing first 2 labels
              const sampleLabels: string[] = [];
              for (const str of cca.strings) {
                for (let i = 1; i <= str.panel_count && sampleLabels.length < 2; i++) {
                  sampleLabels.push(`${str.name}${i}`);
                }
                if (sampleLabels.length >= 2) break;
              }
              const samplePlaceholder = sampleLabels
                .map(l => `${l}\t4-C3XXXXX`)
                .join('\n') + '\n...';

              return (
                <div style={bulkSectionStyle}>
                  <textarea
                    value={bulkText[cca.name] || ''}
                    onChange={(e) => setBulkText(prev => ({ ...prev, [cca.name]: e.target.value }))}
                    style={textareaStyle}
                    aria-label={`Paste serial numbers for CCA ${cca.name}`}
                    maxLength={10000}
                    placeholder={samplePlaceholder}
                  />
                  <p style={hintStyle}>
                    Paste tab-separated label-serial pairs, one per line (e.g., "B4  4-C3F2CCY").
                    Or paste a plain list of {ccaPanelCount} serials (one per line or comma-separated).
                  </p>
                  {bulkError[cca.name] && (
                    <div style={{ ...errorTextStyle, marginTop: '8px' }}>
                      <span aria-hidden="true">{'\u26A0'}</span> {bulkError[cca.name]}
                    </div>
                  )}
                  {bulkWarning[cca.name] && (
                    <div style={warningBannerStyle} role="alert">
                      {bulkWarning[cca.name]}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleBulkImport(cca.name)}
                    disabled={bulkImporting[cca.name] || !(bulkText[cca.name] || '').trim()}
                    style={
                      bulkImporting[cca.name] || !(bulkText[cca.name] || '').trim()
                        ? { ...disabledButtonStyle, marginTop: '8px' }
                        : { ...primaryButtonStyle, marginTop: '8px' }
                    }
                  >
                    {bulkImporting[cca.name] ? 'Importing...' : 'Import'}
                  </button>
                </div>
              );
            })()}

            {/* String sections */}
            {cca.strings.map((str) => {
              if (str.panel_count <= 0) return null;

              let stringEnteredCount = 0;
              for (let i = 1; i <= str.panel_count; i++) {
                const label = `${str.name}${i}`;
                if ((values[cca.name]?.[label] || '').length > 0) stringEnteredCount++;
              }

              return (
                <div key={str.name} style={stringSectionStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '14px' }}>String {str.name}</strong>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      {stringEnteredCount} of {str.panel_count} entered
                    </span>
                  </div>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: '80px' }}>Position</th>
                        <th style={thStyle}>Serial Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: str.panel_count }, (_, i) => {
                        const label = `${str.name}${i + 1}`;
                        const qualifiedLabel = `${cca.name}/${label}`;
                        const value = values[cca.name]?.[label] || '';
                        const isBlurred = blurred.has(qualifiedLabel);
                        const error = getFieldError(cca.name, label, value, isBlurred);

                        return (
                          <SerialInputRow
                            key={label}
                            label={label}
                            value={value}
                            error={error}
                            onChange={(lbl, val) => handleChange(cca.name, lbl, val)}
                            onBlur={() => handleBlur(qualifiedLabel)}
                            onKeyDown={(_, e) => handleKeyDown(qualifiedLabel, e)}
                            inputRef={setInputRef(qualifiedLabel)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}

          </div>
        );
      })}

      {/* Button group */}
      <div style={{ ...buttonGroupStyle, alignItems: 'flex-start' }}>
        <button type="button" onClick={onBack} style={secondaryButtonStyle}>
          Back
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
          <button
            ref={nextButtonRef}
            type="button"
            onClick={handleNext}
            disabled={!allValid}
            style={allValid ? primaryButtonStyle : disabledButtonStyle}
          >
            Next: Generate & Download
          </button>
          <button
            type="button"
            onClick={() => setShowSkipModal(true)}
            disabled={skipDisabled}
            style={skipDisabled ? { ...disabledButtonStyle, fontStyle: 'italic' } : { ...secondaryButtonStyle, fontStyle: 'italic' }}
            aria-describedby={skipDisabled ? skipHelperId : undefined}
          >
            Skip — Use Placeholders
          </button>
          {skipDisabled && (
            <span id={skipHelperId} style={hintStyle}>
              Clear all entered serials to use placeholder mode.
            </span>
          )}
        </div>
      </div>

      {/* Skip confirmation modal */}
      {showSkipModal && (
        <ConfirmationModal
          title="Config Will Require Manual Editing"
          body="Without serial numbers, the generated configuration files will contain placeholder values (e.g., PLACEHOLDER_A1). You will need to manually edit the config-*.ini files on your device before taptap can correctly identify your panels. Continue with placeholders?"
          confirmLabel="Continue with Placeholders"
          cancelLabel="Go Back"
          onConfirm={handleSkipConfirm}
          onCancel={() => setShowSkipModal(false)}
        />
      )}

      {/* Clear All confirmation modal */}
      {showClearModal && (
        <ConfirmationModal
          title="Clear All Serial Numbers"
          body={`Clear all ${enteredCount} entered serial numbers? This cannot be undone.`}
          confirmLabel="Clear All"
          confirmStyle={destructiveButtonStyle}
          cancelLabel="Cancel"
          onConfirm={handleClearConfirm}
          onCancel={() => setShowClearModal(false)}
        />
      )}

      {/* Bulk import overwrite confirmation modal */}
      {showBulkConfirm && (
        <ConfirmationModal
          title="Overwrite Existing Serials"
          body={`CCA "${showBulkConfirm.ccaName}" already has serial numbers entered. Importing will overwrite all existing values for this CCA. Continue?`}
          confirmLabel="Overwrite"
          confirmStyle={destructiveButtonStyle}
          cancelLabel="Cancel"
          onConfirm={() => {
            const { ccaName, serials } = showBulkConfirm;
            setShowBulkConfirm(null);
            applyBulkSerials(ccaName, serials);
          }}
          onCancel={() => {
            setShowBulkConfirm(null);
            setBulkImporting(prev => ({ ...prev, [showBulkConfirm.ccaName]: false }));
          }}
        />
      )}
    </div>
  );
}
