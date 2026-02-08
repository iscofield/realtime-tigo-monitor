import { describe, it, expect } from 'vitest';
import { calculateMedian, analyzeStringForMismatches } from './mismatchDetection';
import type { PanelData, Position } from '../hooks/useWebSocket';

const mockPosition: Position = { x_percent: 50, y_percent: 50 };

function createMockPanel(overrides: Partial<PanelData> = {}): PanelData {
  return {
    display_label: 'A1',
    string: 'A',
    system: 'primary',
    sn: 'TEST-SN',
    watts: 100,
    online: true,
    stale: false,
    position: mockPosition,
    ...overrides,
  };
}

describe('calculateMedian', () => {
  it('returns correct median for odd-length arrays', () => {
    expect(calculateMedian([1, 2, 3])).toBe(2);
    expect(calculateMedian([5, 1, 3])).toBe(3);
    expect(calculateMedian([100, 200, 150])).toBe(150);
  });

  it('returns correct median for even-length arrays', () => {
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
    expect(calculateMedian([100, 200])).toBe(150);
  });

  it('returns 0 for empty arrays', () => {
    expect(calculateMedian([])).toBe(0);
  });

  it('handles single element arrays', () => {
    expect(calculateMedian([42])).toBe(42);
  });
});

describe('analyzeStringForMismatches', () => {
  it('returns no mismatches for uniform values', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 100 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.hasMismatch).toBe(false);
    expect(result.mismatchedPanels).toHaveLength(0);
  });

  it('flags outlier at 15% threshold', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 150 }), // 50% above median
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatchedPanels).toContain('A3');
  });

  it('respects configurable threshold (5%)', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 108 }), // 8% above median
    ];

    const result5 = analyzeStringForMismatches(panels, 5);
    expect(result5.hasMismatch).toBe(true);

    const result15 = analyzeStringForMismatches(panels, 15);
    expect(result15.hasMismatch).toBe(false);
  });

  it('respects configurable threshold (30%)', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 125 }), // 25% above median
    ];

    const result20 = analyzeStringForMismatches(panels, 20);
    expect(result20.hasMismatch).toBe(true);

    const result30 = analyzeStringForMismatches(panels, 30);
    expect(result30.hasMismatch).toBe(false);
  });

  it('skips panels with power < 50W', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 40 }),
      createMockPanel({ display_label: 'A2', watts: 45 }),
      createMockPanel({ display_label: 'A3', watts: 10 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.insufficientData).toBe(true);
    expect(result.hasMismatch).toBe(false);
  });

  it('skips offline panels', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100, online: true }),
      createMockPanel({ display_label: 'A2', watts: 100, online: true }),
      createMockPanel({ display_label: 'A3', watts: 500, online: false }), // Offline
    ];

    const result = analyzeStringForMismatches(panels, 15);
    // Should not flag A3 because it's offline
    expect(result.mismatchedPanels).not.toContain('A3');
  });

  it('panel at exactly 50W is excluded from analysis', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 50 }), // Exactly 50W - excluded
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 100 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    // Only 2 valid panels (those > 50W)
    expect(result.panels.filter(p => p.isMismatched)).toHaveLength(0);
  });

  it('panel at 51W is included in analysis', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 51 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 100 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    // A1 at 51W is significantly below median of ~84W - should be flagged
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatchedPanels).toContain('A1');
  });
});

describe('2-panel string handling', () => {
  it('2-panel string with 40% variance flags BOTH panels', () => {
    // |100-150|/125*100 = 40%
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 150 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatchedPanels).toContain('A1');
    expect(result.mismatchedPanels).toContain('A2');
    expect(result.mismatchedPanels).toHaveLength(2);
  });

  it('2-panel string with 20% variance does not flag (under 30% threshold)', () => {
    // |100-120|/110*100 ≈ 18%
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 120 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.hasMismatch).toBe(false);
  });

  it('2-panel string shows appropriate warning message', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 160 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.warningMessage).toContain('only 2 panels');
    expect(result.warningMessage).toContain('not all panels are outputting equally');
  });
});

describe('1-panel string handling', () => {
  it('1-panel string shows insufficient data', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.insufficientData).toBe(true);
    expect(result.hasMismatch).toBe(false);
  });
});

describe('warning message generation', () => {
  it('single mismatch shows panel-specific message', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 200 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.warningMessage).toContain('A3');
    expect(result.warningMessage).toContain('200W');
  });

  it('multiple mismatches lists all panel IDs', () => {
    // Two outliers (A1=100, A2=100) vs median of 300 (from A3, A4, A5)
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 100 }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 300 }),
      createMockPanel({ display_label: 'A4', watts: 300 }),
      createMockPanel({ display_label: 'A5', watts: 300 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.warningMessage).toContain('A1');
    expect(result.warningMessage).toContain('A2');
  });
});

describe('edge cases', () => {
  it('handles all panels at 0W (night)', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 0 }),
      createMockPanel({ display_label: 'A2', watts: 0 }),
      createMockPanel({ display_label: 'A3', watts: 0 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    expect(result.insufficientData).toBe(true);
    expect(result.hasMismatch).toBe(false);
  });

  it('handles null watts values', () => {
    const panels = [
      createMockPanel({ display_label: 'A1', watts: null }),
      createMockPanel({ display_label: 'A2', watts: 100 }),
      createMockPanel({ display_label: 'A3', watts: 100 }),
    ];

    const result = analyzeStringForMismatches(panels, 15);
    // A1 should be excluded from analysis due to null watts
    expect(result.mismatchedPanels).not.toContain('A1');
  });

  it('handles empty panel array', () => {
    const result = analyzeStringForMismatches([], 15);
    expect(result.insufficientData).toBe(true);
    expect(result.panels).toHaveLength(0);
  });

  it('known limitation: majority-wrong case flags the correct panel', () => {
    // FR-6.6.3: This is EXPECTED but INCORRECT behavior
    // When 2 of 3 panels are wrong, median-based detection flags the correct one
    const panels = [
      createMockPanel({ display_label: 'A1', watts: 200 }), // Wrong
      createMockPanel({ display_label: 'A2', watts: 200 }), // Wrong
      createMockPanel({ display_label: 'A3', watts: 100 }), // Correct but flagged
    ];

    const result = analyzeStringForMismatches(panels, 15);
    // This documents the EXPECTED incorrect behavior
    expect(result.hasMismatch).toBe(true);
    expect(result.mismatchedPanels).toContain('A3'); // Correct panel flagged
  });
});
