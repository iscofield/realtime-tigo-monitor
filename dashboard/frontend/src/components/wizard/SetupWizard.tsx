/**
 * Setup Wizard main component (Phase 1 spec FR-3).
 * Multi-step wizard for initial configuration of Solar Tigo Viewer.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useWizardState } from '../../hooks/useWizardState';
import { getConfigStatus } from '../../api/config';
import { WizardStepIndicator } from './WizardStepIndicator';
import { WelcomeStep } from './steps/WelcomeStep';
import { MqttConfigStep } from './steps/MqttConfigStep';
import { TopologyStep } from './steps/TopologyStep';
import { GenerateDownloadStep } from './steps/GenerateDownloadStep';
import { DiscoveryStep } from './steps/DiscoveryStep';
import { ValidationStep } from './steps/ValidationStep';
import { ReviewSaveStep } from './steps/ReviewSaveStep';
import type { WizardStep, RestoreData } from '../../types/config';

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

const restoreBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 20px',
  backgroundColor: '#e3f2fd',
  color: '#1565c0',
  fontSize: '13px',
  borderBottom: '1px solid #bbdefb',
};

const restoreBannerIconStyle: CSSProperties = {
  flexShrink: 0,
};

// Steps to skip in restore mode (panel data already in backup)
const RESTORE_SKIP_STEPS: WizardStep[] = ['discovery', 'validation'];

interface SetupWizardProps {
  onComplete: () => void;
  initialRestoreData?: RestoreData;
}

export function SetupWizard({ onComplete, initialRestoreData }: SetupWizardProps) {
  const wizardState = useWizardState();
  const [isLoading, setIsLoading] = useState(true);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  // Check config status on mount
  useEffect(() => {
    const checkStatus = async () => {
      // If we have initial restore data, populate and skip welcome
      if (initialRestoreData) {
        wizardState.populateFromBackup(initialRestoreData);
        setShowWelcome(false);
        setIsLoading(false);
        return;
      }

      // Skip config check if restoring from backup (already populated)
      if (wizardState.state.restoredFromBackup) {
        setShowWelcome(false);
        setIsLoading(false);
        return;
      }

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
        setShowWelcome(false);
      }

      setIsLoading(false);
    };

    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onComplete, initialRestoreData]);

  const handleResume = () => {
    wizardState.restoreState();
    setShowResumeDialog(false);
  };

  const handleStartFresh = () => {
    wizardState.clearState();
    setShowResumeDialog(false);
  };

  // Welcome screen handlers
  const handleFreshSetup = useCallback(() => {
    setShowWelcome(false);
  }, []);

  const handleRestoreFromWelcome = useCallback((data: RestoreData) => {
    wizardState.populateFromBackup(data);
    setShowWelcome(false);
  }, [wizardState]);

  // Step navigation with restore mode skipping
  const handleGoNext = useCallback(() => {
    if (wizardState.state.restoredFromBackup) {
      // Find next non-skipped step
      const STEP_ORDER: WizardStep[] = [
        'mqtt-config',
        'system-topology',
        'generate-download',
        'discovery',
        'validation',
        'review-save',
      ];
      const currentIndex = STEP_ORDER.indexOf(wizardState.state.currentStep);
      let nextIndex = currentIndex + 1;

      while (nextIndex < STEP_ORDER.length && RESTORE_SKIP_STEPS.includes(STEP_ORDER[nextIndex])) {
        nextIndex++;
      }

      if (nextIndex < STEP_ORDER.length) {
        wizardState.goToStep(STEP_ORDER[nextIndex]);
      }
    } else {
      wizardState.goNext();
    }
    wizardState.saveState();
  }, [wizardState]);

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

  // Show welcome screen for initial entry
  if (showWelcome) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <h1 style={titleStyle}>Solar Tigo Viewer Setup</h1>
          </div>
          <div style={contentStyle}>
            <WelcomeStep
              onFreshSetup={handleFreshSetup}
              onRestore={handleRestoreFromWelcome}
            />
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
            onNext={handleGoNext}
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
            restoreImageToken={wizardState.state.restoreImageToken}
            restoreOverlaySize={wizardState.state.restoreOverlaySize}
            restoreImageScale={wizardState.state.restoreImageScale}
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

  // Restore banner component
  const RestoreBanner = () => (
    <div style={restoreBannerStyle}>
      <span style={restoreBannerIconStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      </span>
      <span>Restored from backup - review settings before saving</span>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Solar Tigo Viewer Setup</h1>
          <p style={subtitleStyle}>Configure your Tigo solar monitoring system</p>
        </div>

        {wizardState.state.restoredFromBackup && <RestoreBanner />}

        <WizardStepIndicator
          currentStep={wizardState.state.currentStep}
          furthestStep={wizardState.state.furthestStep}
          onStepClick={handleStepClick}
          restoredFromBackup={wizardState.state.restoredFromBackup}
        />

        <div style={contentStyle}>
          {renderStep()}
        </div>
      </div>
    </div>
  );
}
