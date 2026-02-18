/**
 * Wizard step indicator component.
 * Shows progress through the setup wizard steps.
 */

import type { CSSProperties } from 'react';
import type { WizardStep } from '../../types/config';

const ALL_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'mqtt-config', label: 'MQTT Settings' },
  { id: 'system-topology', label: 'System Setup' },
  { id: 'panel-serials', label: 'Panel Serials' },
  { id: 'generate-download', label: 'Generate Config' },
  { id: 'discovery', label: 'Discovery' },
  { id: 'validation', label: 'Validation' },
  { id: 'review-save', label: 'Review & Save' },
];

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '20px 30px',
  borderBottom: '1px solid #e0e0e0',
  backgroundColor: 'white',
  overflowX: 'auto',
};

const stepItemStyle = (active: boolean, completed: boolean, clickable: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  cursor: clickable ? 'pointer' : 'default',
  opacity: !active && !completed ? 0.5 : 1,
  transition: 'opacity 0.2s',
  flexShrink: 0,
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
  const visibleSteps = ALL_STEPS
    .map((step, index) => ({ ...step, shortLabel: String(index + 1) }));

  const currentIndex = visibleSteps.findIndex(s => s.id === currentStep);
  const furthestIndex = visibleSteps.findIndex(s => s.id === furthestStep);

  return (
    <div style={containerStyle}>
      {visibleSteps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = index < furthestIndex || (index === furthestIndex && index < currentIndex);
        const isClickable = index <= furthestIndex + 1;

        return (
          <div key={step.id} style={{ display: 'contents' }}>
            <div
              style={stepItemStyle(isActive, isCompleted, isClickable)}
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

            {index < visibleSteps.length - 1 && (
              <div style={connectorStyle(index < furthestIndex)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
