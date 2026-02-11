import type { PanelData } from '../hooks/useWebSocket';

export interface MismatchResult {
  panelId: string;
  power: number;
  median: number;
  variance: number; // percentage
  isMismatched: boolean;
}

export interface StringAnalysis {
  stringId: string;
  median: number;
  panels: MismatchResult[];
  hasMismatch: boolean;
  mismatchedPanels: string[];
  insufficientData?: boolean;
  warningMessage?: string;
}

// Minimum power threshold to filter out noisy low-light periods (FR-6.6)
const MIN_POWER_THRESHOLD = 50;

// Fixed threshold for 2-panel strings (FR-6.6.1)
const TWO_PANEL_THRESHOLD = 30;

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeStringForMismatches(
  panels: PanelData[],
  thresholdPercent: number = 30
): StringAnalysis {
  // Filter to valid panels for analysis (FR-6.6: online, non-null, > 50W)
  const validPanels = panels.filter(p =>
    p.online !== false &&
    p.watts !== null &&
    p.watts !== undefined &&
    p.watts > MIN_POWER_THRESHOLD
  );

  const baseResult = {
    stringId: panels[0]?.string || '',
  };

  // Handle 1-panel case (FR-6.6.2)
  if (validPanels.length < 2) {
    return {
      ...baseResult,
      median: 0,
      panels: panels.map(p => ({
        panelId: p.display_label,
        power: p.watts ?? 0,
        median: 0,
        variance: 0,
        isMismatched: false,
      })),
      hasMismatch: false,
      mismatchedPanels: [],
      insufficientData: true,
    };
  }

  // Handle 2-panel special case (FR-6.6.1)
  // Fixed at 30% because:
  // 1. With only 2 data points, variance is inherently noisier
  // 2. We flag BOTH panels (can't determine which is wrong), so false positives are more disruptive
  // 3. 30% represents a clear mismatch regardless of array conditions
  if (validPanels.length === 2) {
    const [p1, p2] = validPanels;
    const avg = (p1.watts! + p2.watts!) / 2;
    const variance = Math.abs(p1.watts! - p2.watts!) / avg * 100;

    if (variance > TWO_PANEL_THRESHOLD) {
      // Flag BOTH panels - can't determine which is wrong
      return {
        ...baseResult,
        median: avg,
        panels: panels.map(p => ({
          panelId: p.display_label,
          power: p.watts ?? 0,
          median: avg,
          variance: validPanels.some(vp => vp.display_label === p.display_label) ? variance : 0,
          isMismatched: validPanels.some(vp => vp.display_label === p.display_label),
        })),
        hasMismatch: true,
        mismatchedPanels: validPanels.map(p => p.display_label),
        warningMessage: `String has only 2 panels — not all panels are outputting equally. ${p1.watts! < p2.watts! ? p1.display_label : p2.display_label} is producing less, which may be due to shading, soiling, or degradation. The difference may also be temporary.`,
      };
    }

    // Under threshold - no mismatch
    return {
      ...baseResult,
      median: avg,
      panels: panels.map(p => ({
        panelId: p.display_label,
        power: p.watts ?? 0,
        median: avg,
        variance: 0,
        isMismatched: false,
      })),
      hasMismatch: false,
      mismatchedPanels: [],
    };
  }

  // Standard case: 3+ panels
  const powerValues = validPanels.map(p => p.watts!);
  const median = calculateMedian(powerValues);

  const results: MismatchResult[] = panels.map(panel => {
    const power = panel.watts ?? 0;
    const variance = median > 0
      ? Math.abs(power - median) / median * 100
      : 0;
    const isMismatched = panel.online !== false &&
      panel.watts !== null &&
      panel.watts !== undefined &&
      panel.watts > MIN_POWER_THRESHOLD &&
      variance > thresholdPercent;

    return {
      panelId: panel.display_label,
      power,
      median,
      variance,
      isMismatched,
    };
  });

  const mismatchedPanels = results
    .filter(r => r.isMismatched)
    .map(r => r.panelId);

  // Generate warning message per FR-6.5
  let warningMessage: string | undefined;
  if (mismatchedPanels.length === 1) {
    const m = results.find(r => r.isMismatched)!;
    const direction = m.power < median ? 'below' : 'above';
    const explanation = m.power < median
      ? 'This may be due to shading, soiling, or panel degradation, or in some cases a wiring issue.'
      : 'This is likely a temporary measurement variance and may resolve with the next report. If sustained, the panel\'s optimizer or wiring may warrant inspection.';
    warningMessage = `Not all panels are outputting equally. Panel ${m.panelId} shows ${Math.round(m.power)}W, ${direction} the string median of ${Math.round(median)}W. ${explanation}`;
  } else if (mismatchedPanels.length > 1) {
    const lowPanels = results.filter(r => r.isMismatched && r.power < median);
    const highPanels = results.filter(r => r.isMismatched && r.power >= median);
    const parts: string[] = [];
    if (lowPanels.length > 0) {
      parts.push(`${lowPanels.map(p => p.panelId).join(', ')} ${lowPanels.length === 1 ? 'is' : 'are'} below — possible shading, soiling, or degradation`);
    }
    if (highPanels.length > 0) {
      parts.push(`${highPanels.map(p => p.panelId).join(', ')} ${highPanels.length === 1 ? 'is' : 'are'} above — likely temporary, may resolve with next report`);
    }
    warningMessage = `Not all panels are outputting equally relative to the string median (${Math.round(median)}W). ${parts.join('; ')}.`;
  }

  return {
    ...baseResult,
    median,
    panels: results,
    hasMismatch: mismatchedPanels.length > 0,
    mismatchedPanels,
    warningMessage,
  };
}

export { calculateMedian };
