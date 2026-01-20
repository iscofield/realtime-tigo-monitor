/**
 * Wizard step indicator component.
 * Shows progress through the setup wizard steps.
 */

import type { CSSProperties } from 'react';
import type { WizardStep } from '../../types/config';

const STEPS: { id: WizardStep; label: string; shortLabel: string }[] = [
  { id: 'mqtt-config', label: 'MQTT Settings', shortLabel: '1' },
  { id: 'system-topology', label: 'System Setup', shortLabel: '2' },
  { id: 'generate-download', label: 'Generate Config', shortLabel: '3' },
  { id: 'discovery', label: 'Discovery', shortLabel: '4' },
  { id: 'validation', label: 'Validation', shortLabel: '5' },
  { id: 'review-save', label: 'Review & Save', shortLabel: '6' },
];

const containerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '20px 30px',
  borderBottom: '1px solid #e0e0e0',
  backgroundColor: 'white',
  overflowX: 'auto',
};

const stepStyle = (active: boolean, completed: boolean, clickable: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  cursor: clickable ? 'pointer' : 'default',
  opacity: !active && !completed ? 0.5 : 1,
  transition: 'opacity 0.2s',
});

const circleStyle = (active: boolean, completed: boolean): CSSProperties => ({
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  fontWeight: 600,
  backgroundColor: active ? '#1976d2' : completed ? '#4caf50' : '#e0e0e0',
  color: active || completed ? 'white' : '#666',
  transition: 'background-color 0.2s',
});

const labelStyle = (active: boolean): CSSProperties => ({
  fontSize: '12px',
  color: active ? '#1976d2' : '#666',
  fontWeight: active ? 600 : 400,
  whiteSpace: 'nowrap',
});

const connectorStyle = (completed: boolean): CSSProperties => ({
  flex: 1,
  height: '2px',
  backgroundColor: completed ? '#4caf50' : '#e0e0e0',
  margin: '0 8px',
  alignSelf: 'flex-start',
  marginTop: '15px',
  minWidth: '20px',
});

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  furthestStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}

export function WizardStepIndicator({
  currentStep,
  furthestStep,
  onStepClick,
}: WizardStepIndicatorProps) {
  const currentIndex = STEPS.findIndex(s => s.id === currentStep);
  const furthestIndex = STEPS.findIndex(s => s.id === furthestStep);

  return (
    <div style={containerStyle}>
      {STEPS.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = index < furthestIndex || (index === furthestIndex && index < currentIndex);
        const isClickable = index <= furthestIndex + 1;

        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', flex: index < STEPS.length - 1 ? 1 : 0 }}>
            <div
              style={stepStyle(isActive, isCompleted, isClickable)}
              onClick={() => isClickable && onStepClick(step.id)}
              role="button"
              tabIndex={isClickable ? 0 : -1}
              onKeyDown={(e) => {
                if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                  onStepClick(step.id);
                }
              }}
            >
              <div style={circleStyle(isActive, isCompleted)}>
                {isCompleted ? '✓' : step.shortLabel}
              </div>
              <span style={labelStyle(isActive)}>{step.label}</span>
            </div>

            {index < STEPS.length - 1 && (
              <div style={connectorStyle(index < furthestIndex)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
