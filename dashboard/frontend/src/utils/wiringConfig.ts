/**
 * Wiring configuration utilities for series-parallel string topology.
 * Computes valid wiring options (factor pairs) and effective wiring defaults.
 */

export interface WiringOption {
  series: number;
  parallel: number;
  label: string;       // e.g., "5S2P"
  description: string; // e.g., "2 parallel groups of 5 in series"
  isDefault: boolean;  // true when P === 1 (all-series)
  isUncommon: boolean;  // true when S === 1 && P > 1 (all-parallel)
}

/**
 * Compute all valid wiring configurations (factor pairs) for a given panel count.
 * Returns options sorted by descending S (series-first ordering).
 */
export function getWiringOptions(panelCount: number): WiringOption[] {
  if (panelCount < 1 || !Number.isInteger(panelCount)) return [];
  const options: WiringOption[] = [];
  for (let s = panelCount; s >= 1; s--) {
    if (panelCount % s === 0) {
      const p = panelCount / s;
      let description: string;
      if (p === 1) description = 'all in series';
      else if (s === 1) description = 'all in parallel';
      else description = `${p} parallel groups of ${s} in series`;

      options.push({
        series: s,
        parallel: p,
        label: `${s}S${p}P`,
        description,
        isDefault: p === 1,
        isUncommon: s === 1 && p > 1,
      });
    }
  }
  return options;
}

/**
 * Returns effective wiring values with defaults applied.
 * Mirrors backend effective_series/effective_parallel properties.
 *
 * Accepts either a full StringConfig or a partial wiring entry from the lookup Map.
 * When called from StringSection (which has the Map entry but not panel_count),
 * only `parallel` is used — `series` requires panel_count for the default.
 */
export function getEffectiveWiring(
  config: { panel_count?: number; series_count?: number | null; parallel_count?: number | null }
): { series: number | null; parallel: number } {
  return {
    series: config.series_count ?? config.panel_count ?? null,
    parallel: Math.max(config.parallel_count ?? 1, 1),
  };
}
