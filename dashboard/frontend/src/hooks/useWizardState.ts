/**
 * Wizard state management hook (Phase 1 spec).
 * Handles state persistence to localStorage and step navigation.
 */

import { useState, useCallback, useEffect } from 'react';
import type {
  WizardState,
  WizardStep,
  MQTTConfig,
  SystemConfig,
  DiscoveredPanel,
  MatchResult,
  PersistedWizardState,
} from '../types/config';

const STORAGE_KEY = 'solar-tigo-wizard-state';
const STATE_EXPIRY_DAYS = 7;

// Step order for navigation validation
const STEP_ORDER: WizardStep[] = [
  'mqtt-config',
  'system-topology',
  'generate-download',
  'discovery',
  'validation',
  'review-save',
];

const getStepIndex = (step: WizardStep): number => STEP_ORDER.indexOf(step);

// Initial state
const createInitialState = (): WizardState => ({
  currentStep: 'mqtt-config',
  furthestStep: 'mqtt-config',
  mqttConfig: null,
  systemTopology: null,
  discoveredPanels: {},
  translations: {},
  validationResults: null,
  configDownloaded: false,
});

// Check if persisted state is expired (older than 7 days)
const isStateExpired = (state: PersistedWizardState): boolean => {
  const savedAt = new Date(state.savedAt);
  const now = new Date();
  const daysDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff > STATE_EXPIRY_DAYS;
};

// Load state from localStorage
const loadPersistedState = (): WizardState | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const persisted: PersistedWizardState = JSON.parse(saved);

    // Check version compatibility
    if (persisted.version !== 1) {
      console.warn('Incompatible wizard state version, starting fresh');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    // Check expiry
    if (isStateExpired(persisted)) {
      console.info('Previous setup session expired. Starting fresh.');
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return persisted.state;
  } catch (e) {
    console.warn('Failed to load wizard state:', e);
    return null;
  }
};

// Save state to localStorage
const savePersistedState = (state: WizardState): void => {
  try {
    const persisted: PersistedWizardState = {
      version: 1,
      state,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch (e) {
    console.warn('Failed to save wizard state:', e);
  }
};

// Clear persisted state
const clearPersistedState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear wizard state:', e);
  }
};

export interface UseWizardStateReturn {
  state: WizardState;
  hasPersistedState: boolean;

  // Navigation
  goToStep: (step: WizardStep) => void;
  canGoToStep: (step: WizardStep) => boolean;
  goNext: () => void;
  goBack: () => void;

  // State updates
  setMqttConfig: (config: MQTTConfig) => void;
  setSystemTopology: (topology: SystemConfig) => void;
  setConfigDownloaded: (downloaded: boolean) => void;
  addDiscoveredPanel: (panel: DiscoveredPanel) => void;
  updateDiscoveredPanel: (serial: string, updates: Partial<DiscoveredPanel>) => void;
  clearDiscoveredPanels: () => void;
  setTranslation: (tigoLabel: string, displayLabel: string) => void;
  setValidationResults: (results: MatchResult[]) => void;

  // Persistence
  saveState: () => void;
  clearState: () => void;
  restoreState: () => void;
}

export function useWizardState(): UseWizardStateReturn {
  const [hasPersistedState, setHasPersistedState] = useState(false);
  const [state, setState] = useState<WizardState>(createInitialState);

  // Check for persisted state on mount
  useEffect(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      setHasPersistedState(true);
    }
  }, []);

  // Navigation helpers
  const canGoToStep = useCallback((step: WizardStep): boolean => {
    const targetIndex = getStepIndex(step);
    const furthestIndex = getStepIndex(state.furthestStep);
    // Can go to any step up to furthestStep + 1
    return targetIndex <= furthestIndex + 1;
  }, [state.furthestStep]);

  const goToStep = useCallback((step: WizardStep) => {
    if (!canGoToStep(step)) {
      console.warn(`Cannot navigate to step ${step} - not yet unlocked`);
      return;
    }
    setState(prev => ({
      ...prev,
      currentStep: step,
    }));
  }, [canGoToStep]);

  const goNext = useCallback(() => {
    const currentIndex = getStepIndex(state.currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[currentIndex + 1];
      setState(prev => ({
        ...prev,
        currentStep: nextStep,
        furthestStep: getStepIndex(nextStep) > getStepIndex(prev.furthestStep)
          ? nextStep
          : prev.furthestStep,
      }));
    }
  }, [state.currentStep]);

  const goBack = useCallback(() => {
    const currentIndex = getStepIndex(state.currentStep);
    if (currentIndex > 0) {
      goToStep(STEP_ORDER[currentIndex - 1]);
    }
  }, [state.currentStep, goToStep]);

  // Invalidate downstream state when editing previous steps
  const invalidateDownstream = useCallback((changedStep: WizardStep) => {
    const changedIndex = getStepIndex(changedStep);

    setState(prev => {
      const newState = { ...prev };

      // MQTT config changes affect everything downstream
      if (changedStep === 'mqtt-config') {
        newState.configDownloaded = false;
        newState.discoveredPanels = {};
        newState.validationResults = null;
      }

      // Topology changes affect download, discovery, and validation
      if (changedStep === 'system-topology' || changedStep === 'mqtt-config') {
        newState.configDownloaded = false;
        newState.discoveredPanels = {};
        newState.validationResults = null;
      }

      // Update furthestStep to not exceed the changed step
      const furthestIndex = getStepIndex(prev.furthestStep);
      if (furthestIndex > changedIndex) {
        newState.furthestStep = changedStep;
      }

      return newState;
    });
  }, []);

  // State setters
  const setMqttConfig = useCallback((config: MQTTConfig) => {
    setState(prev => ({
      ...prev,
      mqttConfig: config,
    }));
    invalidateDownstream('mqtt-config');
  }, [invalidateDownstream]);

  const setSystemTopology = useCallback((topology: SystemConfig) => {
    setState(prev => ({
      ...prev,
      systemTopology: topology,
    }));
    invalidateDownstream('system-topology');
  }, [invalidateDownstream]);

  const setConfigDownloaded = useCallback((downloaded: boolean) => {
    setState(prev => ({
      ...prev,
      configDownloaded: downloaded,
    }));
  }, []);

  const addDiscoveredPanel = useCallback((panel: DiscoveredPanel) => {
    setState(prev => ({
      ...prev,
      discoveredPanels: {
        ...prev.discoveredPanels,
        [panel.serial]: panel,
      },
    }));
  }, []);

  const updateDiscoveredPanel = useCallback((serial: string, updates: Partial<DiscoveredPanel>) => {
    setState(prev => {
      const existing = prev.discoveredPanels[serial];
      if (!existing) return prev;

      return {
        ...prev,
        discoveredPanels: {
          ...prev.discoveredPanels,
          [serial]: { ...existing, ...updates },
        },
      };
    });
  }, []);

  const clearDiscoveredPanels = useCallback(() => {
    setState(prev => ({
      ...prev,
      discoveredPanels: {},
      validationResults: null,
    }));
  }, []);

  const setTranslation = useCallback((tigoLabel: string, displayLabel: string) => {
    setState(prev => ({
      ...prev,
      translations: {
        ...prev.translations,
        [tigoLabel]: displayLabel,
      },
    }));
  }, []);

  const setValidationResults = useCallback((results: MatchResult[]) => {
    setState(prev => ({
      ...prev,
      validationResults: results,
    }));
  }, []);

  // Persistence
  const saveState = useCallback(() => {
    savePersistedState(state);
  }, [state]);

  const clearState = useCallback(() => {
    clearPersistedState();
    setState(createInitialState());
    setHasPersistedState(false);
  }, []);

  const restoreState = useCallback(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      setState(persisted);
      setHasPersistedState(false);
    }
  }, []);

  return {
    state,
    hasPersistedState,
    goToStep,
    canGoToStep,
    goNext,
    goBack,
    setMqttConfig,
    setSystemTopology,
    setConfigDownloaded,
    addDiscoveredPanel,
    updateDiscoveredPanel,
    clearDiscoveredPanels,
    setTranslation,
    setValidationResults,
    saveState,
    clearState,
    restoreState,
  };
}
