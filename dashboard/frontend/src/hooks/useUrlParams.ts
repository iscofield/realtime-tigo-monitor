import { useEffect } from 'react';
import type { DisplayMode } from '../components/PanelOverlay';
import type { TabType } from '../components/TabNavigation';

// Valid parameter values
const VALID_VIEWS: TabType[] = ['layout', 'table', 'editor'];
const VALID_MODES: DisplayMode[] = ['watts', 'voltage', 'sn'];

interface UrlParamState {
  view: TabType | null;
  mode: DisplayMode | null;
}

/**
 * Parses URL parameters for view and mode
 */
function parseUrlParams(): UrlParamState {
  const params = new URLSearchParams(window.location.search);

  const viewParam = params.get('view');
  const modeParam = params.get('mode');

  return {
    view: viewParam && VALID_VIEWS.includes(viewParam as TabType)
      ? (viewParam as TabType)
      : null,
    mode: modeParam && VALID_MODES.includes(modeParam as DisplayMode)
      ? (modeParam as DisplayMode)
      : null,
  };
}

/**
 * Updates URL parameters without adding to browser history
 */
function updateUrlParams(view: TabType, mode: DisplayMode): void {
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('mode', mode);

  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

/**
 * Get initial state from URL parameters with fallbacks to defaults
 */
export function getInitialStateFromUrl(): { view: TabType; mode: DisplayMode } {
  const { view, mode } = parseUrlParams();
  return {
    view: view ?? 'layout',
    mode: mode ?? 'watts',
  };
}

/**
 * Hook to sync view and mode state with URL parameters
 *
 * @param view - Current view state
 * @param mode - Current display mode state
 */
export function useUrlParamsSync(view: TabType, mode: DisplayMode): void {
  // Update URL when state changes
  useEffect(() => {
    updateUrlParams(view, mode);
  }, [view, mode]);
}

/**
 * Hook to handle browser back/forward navigation
 *
 * @param setView - Setter for view state
 * @param setMode - Setter for mode state
 */
export function usePopStateHandler(
  setView: (view: TabType) => void,
  setMode: (mode: DisplayMode) => void
): void {
  useEffect(() => {
    const handlePopState = () => {
      const { view, mode } = parseUrlParams();
      if (view) setView(view);
      if (mode) setMode(mode);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setView, setMode]);
}
