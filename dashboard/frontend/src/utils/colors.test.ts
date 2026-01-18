import { describe, it, expect } from 'vitest';
import { interpolateColor, calculatePercentage, MAX_WATTS, MAX_VOLTAGE } from './colors';

describe('interpolateColor', () => {
  // FR-5.4: Test color gradient requirements
  it('returns dark green rgb(0, 100, 0) at 0%', () => {
    expect(interpolateColor(0)).toBe('rgb(0, 100, 0)');
  });

  it('returns light green rgb(144, 238, 144) at 100%', () => {
    expect(interpolateColor(1)).toBe('rgb(144, 238, 144)');
  });

  it('returns dark green for negative values (clamped)', () => {
    expect(interpolateColor(-0.5)).toBe('rgb(0, 100, 0)');
  });

  it('returns light green for values > 1 (clamped)', () => {
    expect(interpolateColor(1.5)).toBe('rgb(144, 238, 144)');
  });

  it('returns intermediate color at 50%', () => {
    const result = interpolateColor(0.5);
    // At 50%, expect roughly middle values
    // r: 0 + (144 - 0) * 0.5 = 72
    // g: 100 + (238 - 100) * 0.5 = 169
    // b: 0 + (144 - 0) * 0.5 = 72
    expect(result).toBe('rgb(72, 169, 72)');
  });
});

describe('calculatePercentage', () => {
  it('calculates percentage correctly for watts', () => {
    expect(calculatePercentage(210, MAX_WATTS)).toBe(0.5);
    expect(calculatePercentage(420, MAX_WATTS)).toBe(1);
    expect(calculatePercentage(0, MAX_WATTS)).toBe(0);
  });

  it('calculates percentage correctly for voltage', () => {
    expect(calculatePercentage(25, MAX_VOLTAGE)).toBe(0.5);
    expect(calculatePercentage(50, MAX_VOLTAGE)).toBe(1);
    expect(calculatePercentage(0, MAX_VOLTAGE)).toBe(0);
  });

  it('allows values exceeding max (will be clamped by interpolateColor)', () => {
    expect(calculatePercentage(500, MAX_WATTS)).toBeGreaterThan(1);
  });
});

describe('MAX values', () => {
  it('has correct max watts value (FR-5.2)', () => {
    expect(MAX_WATTS).toBe(420);
  });

  it('has correct max voltage value (FR-5.3)', () => {
    expect(MAX_VOLTAGE).toBe(50);
  });
});
