/**
 * Setup Wizard main component (Phase 1 spec FR-3).
 * Multi-step wizard for initial configuration of Solar Tigo Viewer.
 */

import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useWizardState } from '../../hooks/useWizardState';
import { getConfigStatus } from '../../api/config';
import { WizardStepIndicator } from './WizardStepIndicator';
import { MqttConfigStep } from './steps/MqttConfigStep';
import { TopologyStep } from './steps/TopologyStep';
import { GenerateDownloadStep } from './steps/GenerateDownloadStep';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { ValidationStep } from './steps/ValidationStep';
import { ReviewSaveStep } from './steps/ReviewSaveStep';
import type { WizardStep } from '../../types/config';

const containerStyle: CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#f5f5f5',
  padding: '20px',
};

const cardStyle: CSSProperties = {
  maxWidth: '900px',
  margin: '0 auto',
  backgroundColor: 'white',
  borderRadius: '8px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  padding: '20px 30px',
  borderBottom: '1px solid #e0e0e0',
  backgroundColor: '#fafafa',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '24px',
  fontWeight: 600,
  color: '#333',
};

const subtitleStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: '14px',
  color: '#666',
};

const contentStyle: CSSProperties = {
  padding: '30px',
};

const resumeDialogStyle: CSSProperties = {
  textAlign: 'center',
  padding: '40px',
};

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  gap: '12px',
  justifyContent: 'center',
  marginTop: '24px',
};

const primaryButtonStyle: CSSProperties = {
  padding: '12px 24px',
  fontSize: '16px',
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

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const wizardState = useWizardState();
  const [isLoading, setIsLoading] = useState(true);
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  // Check config status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await getConfigStatus();
        if (status.configured && status.has_panels) {
          // Already configured, skip wizard
          onComplete();
          return;
        }
      } catch (e) {
        console.error('Failed to check config status:', e);
      }

      // Check for persisted wizard state
      if (wizardState.hasPersistedState) {
        setShowResumeDialog(true);
      }

      setIsLoading(false);
    };

    checkStatus();
  }, [onComplete, wizardState.hasPersistedState]);

  const handleResume = () => {
    wizardState.restoreState();
    setShowResumeDialog(false);
  };

  const handleStartFresh = () => {
    wizardState.clearState();
    setShowResumeDialog(false);
  };

  const handleStepClick = (step: WizardStep) => {
    if (wizardState.canGoToStep(step)) {
      wizardState.goToStep(step);
    }
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={contentStyle}>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (showResumeDialog) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Solar Tigo Viewer Setup</h1>
          </div>
          <div style={resumeDialogStyle}>
            <h2>Welcome Back!</h2>
            <p>You have an unfinished setup session. Would you like to continue where you left off?</p>
            <div style={buttonGroupStyle}>
              <button style={primaryButtonStyle} onClick={handleResume}>
                Resume Setup
              </button>
              <button style={secondaryButtonStyle} onClick={handleStartFresh}>
                Start Over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (wizardState.state.currentStep) {
      case 'mqtt-config':
        return (
          <MqttConfigStep
            config={wizardState.state.mqttConfig}
            onNext={(config) => {
              wizardState.setMqttConfig(config);
              wizardState.saveState();
              wizardState.goNext();
            }}
          />
        );

      case 'system-topology':
        return (
          <TopologyStep
            topology={wizardState.state.systemTopology}
            mqttConfig={wizardState.state.mqttConfig!}
            onNext={(topology) => {
              wizardState.setSystemTopology(topology);
              wizardState.saveState();
              wizardState.goNext();
            }}
            onBack={wizardState.goBack}
          />
        );

      case 'generate-download':
        return (
          <GenerateDownloadStep
            mqttConfig={wizardState.state.mqttConfig!}
            topology={wizardState.state.systemTopology!}
            downloaded={wizardState.state.configDownloaded}
            onDownloaded={() => {
              wizardState.setConfigDownloaded(true);
              wizardState.saveState();
            }}
            onNext={() => {
              wizardState.saveState();
              wizardState.goNext();
            }}
            onBack={wizardState.goBack}
          />
        );

      case 'discovery':
        return (
          <DiscoveryStep
            mqttConfig={wizardState.state.mqttConfig!}
            topology={wizardState.state.systemTopology!}
            discoveredPanels={wizardState.state.discoveredPanels}
            onPanelDiscovered={wizardState.addDiscoveredPanel}
            onPanelUpdated={(serial, updates) => wizardState.updateDiscoveredPanel(serial, updates)}
            onClearPanels={wizardState.clearDiscoveredPanels}
            onNext={() => {
              wizardState.saveState();
              wizardState.goNext();
            }}
            onBack={wizardState.goBack}
          />
        );

      case 'validation':
        return (
          <ValidationStep
            topology={wizardState.state.systemTopology!}
            discoveredPanels={wizardState.state.discoveredPanels}
            translations={wizardState.state.translations}
            onTranslationChange={wizardState.setTranslation}
            onTranslationRemove={wizardState.removeTranslation}
            onResetAllTranslations={wizardState.resetAllTranslations}
            onNext={() => {
              wizardState.saveState();
              wizardState.goNext();
            }}
            onBack={wizardState.goBack}
          />
        );

      case 'review-save':
        return (
          <ReviewSaveStep
            mqttConfig={wizardState.state.mqttConfig!}
            topology={wizardState.state.systemTopology!}
            discoveredPanels={wizardState.state.discoveredPanels}
            translations={wizardState.state.translations}
            onComplete={() => {
              wizardState.clearState();
              onComplete();
            }}
            onBack={wizardState.goBack}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Solar Tigo Viewer Setup</h1>
          <p style={subtitleStyle}>Configure your Tigo solar monitoring system</p>
        </div>

        <WizardStepIndicator
          currentStep={wizardState.state.currentStep}
          furthestStep={wizardState.state.furthestStep}
          onStepClick={handleStepClick}
        />

        <div style={contentStyle}>
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
