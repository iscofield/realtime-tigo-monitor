/**
 * App Router component that handles initial config check
 * and routes between Setup Wizard and Dashboard.
 */

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties, ComponentType } from 'react';
import { getConfigStatus } from '../api/config';
import { SetupWizard } from './wizard/SetupWizard';
import type { RestoreData } from '../types/config';
import type { DashboardProps } from './Dashboard';

const loadingStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
  backgroundColor: '#f5f5f5',
  fontSize: '18px',
  color: '#666',
};

type AppState = 'loading' | 'wizard' | 'dashboard';

export function AppRouter() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [DashboardComponent, setDashboardComponent] = useState<ComponentType<DashboardProps> | null>(null);
  const [restoreData, setRestoreData] = useState<RestoreData | null>(null);
  const [initialTab, setInitialTab] = useState<'editor' | undefined>(undefined);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const status = await getConfigStatus();

        if (status.configured && status.has_panels) {
          // Config exists, load dashboard
          const module = await import('./Dashboard');
          setDashboardComponent(() => module.Dashboard);
          setAppState('dashboard');
        } else {
          // No config, show wizard
          setAppState('wizard');
        }
      } catch (error) {
        // API error - could be first run with no backend config support yet
        // Try to load dashboard anyway (backward compatibility)
        console.warn('Config status check failed, showing dashboard:', error);
        const module = await import('./Dashboard');
        setDashboardComponent(() => module.Dashboard);
        setAppState('dashboard');
      }
    };

    checkConfig();
  }, []);

  const handleWizardComplete = async () => {
    // Wizard completed, go to dashboard with editor tab active
    const module = await import('./Dashboard');
    setDashboardComponent(() => module.Dashboard);
    setRestoreData(null);
    setInitialTab('editor');
    setAppState('dashboard');
  };

  // Handle restore from dashboard settings menu
  const handleRestore = useCallback((data: RestoreData) => {
    setRestoreData(data);
    setAppState('wizard');
  }, []);

  // Handle re-run wizard from dashboard settings menu
  const handleRerunWizard = useCallback(() => {
    setRestoreData(null);
    setAppState('wizard');
  }, []);

  if (appState === 'loading') {
    return (
      <div style={loadingStyle}>
        <span>Loading...</span>
      </div>
    );
  }

  if (appState === 'wizard') {
    return (
      <SetupWizard
        onComplete={handleWizardComplete}
        initialRestoreData={restoreData || undefined}
      />
    );
  }

  if (DashboardComponent) {
    return (
      <DashboardComponent
        onRestore={handleRestore}
        onRerunWizard={handleRerunWizard}
        initialTab={initialTab}
      />
    );
  }

  return null;
}
