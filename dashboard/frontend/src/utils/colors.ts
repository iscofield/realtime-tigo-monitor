/**
 * Interpolate between dark green and light green based on percentage.
 * FR-5.4: 0% = #006400 (dark green), 100% = #90EE90 (light green)
 */
export function interpolateColor(percentage: number): string {
  // Clamp to 0-1 range
  const pct = Math.min(Math.max(percentage, 0), 1);

  // Dark green: RGB(0, 100, 0) -> Light green: RGB(144, 238, 144)
  const r = Math.round(0 + (144 - 0) * pct);
  const g = Math.round(100 + (238 - 100) * pct);
  const b = Math.round(0 + (144 - 0) * pct);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Calculate percentage for color gradient based on value and max.
 * FR-5.2: Watts max = 420W, FR-5.3: Voltage max = 50V
 */
export function calculatePercentage(value: number, maxValue: number): number {
  return value / maxValue;
}

// Max values for each mode (FR-5.2, FR-5.3)
export const MAX_WATTS = 420;
export const MAX_VOLTAGE = 50;
