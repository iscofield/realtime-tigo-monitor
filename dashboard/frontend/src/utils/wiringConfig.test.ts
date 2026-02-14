import { describe, it, expect } from 'vitest';
import { getWiringOptions, getEffectiveWiring } from './wiringConfig';

describe('getWiringOptions', () => {
  it('returns empty array for panelCount 0', () => {
    expect(getWiringOptions(0)).toEqual([]);
  });

  it('returns empty array for negative panelCount', () => {
    expect(getWiringOptions(-1)).toEqual([]);
  });

  it('returns empty array for non-integer panelCount', () => {
    expect(getWiringOptions(10.5)).toEqual([]);
  });

  it('returns single option for panelCount 1', () => {
    const options = getWiringOptions(1);
    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({
      series: 1,
      parallel: 1,
      label: '1S1P',
      description: 'all in series',
      isDefault: true,
      isUncommon: false,
    });
  });

  it('returns two options for panelCount 2', () => {
    const options = getWiringOptions(2);
    expect(options).toHaveLength(2);
    expect(options[0].label).toBe('2S1P');
    expect(options[1].label).toBe('1S2P');
  });

  it('returns correct options for prime panelCount 7', () => {
    const options = getWiringOptions(7);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ series: 7, parallel: 1, label: '7S1P' });
    expect(options[1]).toMatchObject({ series: 1, parallel: 7, label: '1S7P' });
  });

  it('returns correct options for composite panelCount 10', () => {
    const options = getWiringOptions(10);
    expect(options).toHaveLength(4);
    expect(options.map(o => o.label)).toEqual(['10S1P', '5S2P', '2S5P', '1S10P']);
  });

  it('returns correct options for composite panelCount 12', () => {
    const options = getWiringOptions(12);
    expect(options).toHaveLength(6);
    expect(options.map(o => o.label)).toEqual([
      '12S1P', '6S2P', '4S3P', '3S4P', '2S6P', '1S12P',
    ]);
  });

  it('orders options by descending S', () => {
    const options = getWiringOptions(12);
    for (let i = 1; i < options.length; i++) {
      expect(options[i].series).toBeLessThan(options[i - 1].series);
    }
  });

  it('marks exactly one option as isDefault (P=1)', () => {
    const options = getWiringOptions(10);
    const defaults = options.filter(o => o.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].parallel).toBe(1);
  });

  it('marks isUncommon only for S=1 and P>1', () => {
    const options = getWiringOptions(10);
    const uncommon = options.filter(o => o.isUncommon);
    expect(uncommon).toHaveLength(1);
    expect(uncommon[0].series).toBe(1);
    expect(uncommon[0].parallel).toBe(10);
  });

  it('does not mark isUncommon for panelCount 1 (S=1, P=1)', () => {
    const options = getWiringOptions(1);
    expect(options[0].isUncommon).toBe(false);
  });

  it('generates correct labels in xSyP format', () => {
    const options = getWiringOptions(8);
    for (const o of options) {
      expect(o.label).toBe(`${o.series}S${o.parallel}P`);
    }
  });

  it('generates correct description for all-series (P=1)', () => {
    const options = getWiringOptions(10);
    expect(options[0].description).toBe('all in series');
  });

  it('generates correct description for all-parallel (S=1)', () => {
    const options = getWiringOptions(10);
    const allParallel = options.find(o => o.series === 1)!;
    expect(allParallel.description).toBe('all in parallel');
  });

  it('generates correct description for mixed (S>1, P>1)', () => {
    const options = getWiringOptions(10);
    const mixed = options.find(o => o.series === 5 && o.parallel === 2)!;
    expect(mixed.description).toBe('2 parallel groups of 5 in series');
  });

  it('maintains invariant S * P === panelCount for all options', () => {
    for (const count of [1, 2, 3, 7, 8, 10, 12, 24, 48]) {
      const options = getWiringOptions(count);
      for (const o of options) {
        expect(o.series * o.parallel).toBe(count);
      }
    }
  });
});

describe('getEffectiveWiring', () => {
  it('returns defaults when all fields undefined', () => {
    const result = getEffectiveWiring({});
    expect(result).toEqual({ series: null, parallel: 1 });
  });

  it('returns defaults when fields are null', () => {
    const result = getEffectiveWiring({ series_count: null, parallel_count: null });
    expect(result).toEqual({ series: null, parallel: 1 });
  });

  it('uses panel_count for series default', () => {
    const result = getEffectiveWiring({ panel_count: 10 });
    expect(result).toEqual({ series: 10, parallel: 1 });
  });

  it('uses explicit series_count over panel_count', () => {
    const result = getEffectiveWiring({ panel_count: 10, series_count: 5 });
    expect(result).toEqual({ series: 5, parallel: 1 });
  });

  it('uses explicit parallel_count', () => {
    const result = getEffectiveWiring({ parallel_count: 2 });
    expect(result).toEqual({ series: null, parallel: 2 });
  });

  it('guards against parallel_count of 0 with Math.max', () => {
    const result = getEffectiveWiring({ parallel_count: 0 });
    expect(result).toEqual({ series: null, parallel: 1 });
  });

  it('guards against negative parallel_count', () => {
    const result = getEffectiveWiring({ parallel_count: -1 });
    expect(result).toEqual({ series: null, parallel: 1 });
  });

  it('returns full effective values when all fields provided', () => {
    const result = getEffectiveWiring({ panel_count: 10, series_count: 5, parallel_count: 2 });
    expect(result).toEqual({ series: 5, parallel: 2 });
  });
});
