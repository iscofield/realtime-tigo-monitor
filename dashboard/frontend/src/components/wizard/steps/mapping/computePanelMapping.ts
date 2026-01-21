/**
 * Panel mapping computation helper.
 * Computes the mapping state between discovered panels and expected topology.
 */

import type { SystemConfig, DiscoveredPanel } from '../../../../types/config';

/**
 * Information about a panel assigned to a slot.
 */
export interface AssignedPanel {
  panel: DiscoveredPanel;
  /** True if this assignment came from a translation, false if auto-matched */
  isTranslation: boolean;
}

/** Special translation value meaning "explicitly unassigned by user" */
export const UNASSIGNED_MARKER = '__UNASSIGNED__';

/**
 * Result of computing the panel mapping.
 */
export interface MappingResult {
  /** Map of slot label (e.g., "A1") to assigned panel info */
  assignedSlots: Map<string, AssignedPanel>;
  /** Labels of empty slots that need panels assigned */
  emptySlots: string[];
  /** Panels explicitly unassigned by user (clicked X) */
  unassignedPanels: DiscoveredPanel[];
  /** Excess panels by string name (e.g., "B" -> [B9, B10]) */
  excessPanelsByString: Map<string, DiscoveredPanel[]>;
  /** Summary counts */
  summary: {
    totalExpected: number;
    autoMatched: number;
    userMapped: number;
    empty: number;
    unassigned: number;
    excess: number;
  };
}

/**
 * String info with its expected slots.
 */
export interface StringInfo {
  name: string;
  panelCount: number;
  expectedLabels: string[];
}

/**
 * CCA info with its strings.
 */
export interface CCAInfo {
  name: string;
  serialDevice: string;
  strings: StringInfo[];
  totalExpected: number;
  totalAssigned: number;
}

/**
 * Build the list of expected labels from topology.
 */
export function buildExpectedLabels(topology: SystemConfig): string[] {
  const labels: string[] = [];
  for (const cca of topology.ccas) {
    for (const str of cca.strings) {
      for (let i = 1; i <= str.panel_count; i++) {
        labels.push(`${str.name}${i}`);
      }
    }
  }
  return labels;
}

/**
 * Build CCA info structures from topology.
 */
export function buildCCAInfo(topology: SystemConfig): CCAInfo[] {
  return topology.ccas.map(cca => {
    const strings: StringInfo[] = cca.strings.map(str => ({
      name: str.name,
      panelCount: str.panel_count,
      expectedLabels: Array.from({ length: str.panel_count }, (_, i) => `${str.name}${i + 1}`),
    }));

    const totalExpected = strings.reduce((sum, s) => sum + s.panelCount, 0);

    return {
      name: cca.name,
      serialDevice: cca.serial_device,
      strings,
      totalExpected,
      totalAssigned: 0, // Will be computed later
    };
  });
}

/**
 * Build a map of string name -> panel count from topology.
 */
function buildStringPanelCounts(topology: SystemConfig): Map<string, number> {
  const counts = new Map<string, number>();
  for (const cca of topology.ccas) {
    for (const str of cca.strings) {
      counts.set(str.name, str.panel_count);
    }
  }
  return counts;
}

/**
 * Check if a panel is an "excess" panel (position > expected count for its string).
 */
function isExcessPanel(tigoLabel: string, stringPanelCounts: Map<string, number>): { isExcess: boolean; stringName: string | null } {
  // Match pattern like "B9", "F11", etc.
  const match = tigoLabel.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return { isExcess: false, stringName: null };

  const stringName = match[1];
  const position = parseInt(match[2], 10);
  const expectedCount = stringPanelCounts.get(stringName);

  if (expectedCount === undefined) {
    // String not in topology - treat as excess without a known string
    return { isExcess: true, stringName: null };
  }

  return { isExcess: position > expectedCount, stringName };
}

/**
 * Compute the panel mapping given discovered panels, topology, and translations.
 *
 * @param discoveredPanels - Record of serial -> DiscoveredPanel
 * @param topology - System configuration with CCAs and strings
 * @param translations - Map of tigo_label -> display_label (use UNASSIGNED_MARKER for explicitly unassigned)
 * @returns MappingResult with assigned slots, empty slots, and unassigned panels
 */
export function computePanelMapping(
  discoveredPanels: Record<string, DiscoveredPanel>,
  topology: SystemConfig,
  translations: Record<string, string>
): MappingResult {
  const expectedLabels = new Set(buildExpectedLabels(topology));
  const stringPanelCounts = buildStringPanelCounts(topology);
  const assignedSlots = new Map<string, AssignedPanel>();
  const panelToSlot = new Map<string, string>(); // tigo_label -> assigned slot
  const excessPanelsByString = new Map<string, DiscoveredPanel[]>();

  const panels = Object.values(discoveredPanels);

  // Step 1: Process translations first (user-mapped panels take priority)
  for (const panel of panels) {
    const translatedLabel = translations[panel.tigo_label];

    // Skip if explicitly marked as unassigned
    if (translatedLabel === UNASSIGNED_MARKER) continue;

    if (translatedLabel && expectedLabels.has(translatedLabel)) {
      assignedSlots.set(translatedLabel, {
        panel,
        isTranslation: true,
      });
      panelToSlot.set(panel.tigo_label, translatedLabel);
    }
  }

  // Step 2: Auto-match remaining panels where tigo_label matches an expected slot
  for (const panel of panels) {
    // Skip if already assigned via translation
    if (panelToSlot.has(panel.tigo_label)) continue;

    // Skip if explicitly marked as unassigned
    if (translations[panel.tigo_label] === UNASSIGNED_MARKER) continue;

    // Check if tigo_label directly matches an expected slot
    if (expectedLabels.has(panel.tigo_label) && !assignedSlots.has(panel.tigo_label)) {
      assignedSlots.set(panel.tigo_label, {
        panel,
        isTranslation: false,
      });
      panelToSlot.set(panel.tigo_label, panel.tigo_label);
    }
  }

  // Step 3: Compute empty slots
  const emptySlots: string[] = [];
  for (const label of expectedLabels) {
    if (!assignedSlots.has(label)) {
      emptySlots.push(label);
    }
  }

  // Step 4: Categorize remaining panels as excess or explicitly unassigned
  const unassignedPanels: DiscoveredPanel[] = [];

  for (const panel of panels) {
    // Skip if already assigned to a slot
    if (panelToSlot.has(panel.tigo_label)) continue;

    // Check if explicitly unassigned by user
    if (translations[panel.tigo_label] === UNASSIGNED_MARKER) {
      unassignedPanels.push(panel);
      continue;
    }

    // Check if it's an excess panel
    const { isExcess, stringName } = isExcessPanel(panel.tigo_label, stringPanelCounts);
    if (isExcess && stringName) {
      // Add to excess panels for that string
      if (!excessPanelsByString.has(stringName)) {
        excessPanelsByString.set(stringName, []);
      }
      excessPanelsByString.get(stringName)!.push(panel);
    } else {
      // Not excess and not assigned - goes to unassigned
      // (This handles panels with labels that don't match any string pattern)
      unassignedPanels.push(panel);
    }
  }

  // Sort excess panels by position within each string
  for (const [, panels] of excessPanelsByString) {
    panels.sort((a, b) => {
      const posA = parseInt(a.tigo_label.match(/(\d+)$/)?.[1] || '0', 10);
      const posB = parseInt(b.tigo_label.match(/(\d+)$/)?.[1] || '0', 10);
      return posA - posB;
    });
  }

  // Sort unassigned panels alphabetically by tigo_label
  unassignedPanels.sort((a, b) => a.tigo_label.localeCompare(b.tigo_label, undefined, { numeric: true }));

  // Step 5: Compute summary
  let autoMatched = 0;
  let userMapped = 0;
  for (const [, info] of assignedSlots) {
    if (info.isTranslation) {
      userMapped++;
    } else {
      autoMatched++;
    }
  }

  let excessCount = 0;
  for (const [, panels] of excessPanelsByString) {
    excessCount += panels.length;
  }

  return {
    assignedSlots,
    emptySlots,
    unassignedPanels,
    excessPanelsByString,
    summary: {
      totalExpected: expectedLabels.size,
      autoMatched,
      userMapped,
      empty: emptySlots.length,
      unassigned: unassignedPanels.length,
      excess: excessCount,
    },
  };
}

/**
 * Get the current slot for a panel (either via translation or direct match).
 */
export function getCurrentSlotForPanel(
  tigoLabel: string,
  translations: Record<string, string>,
  expectedLabels: Set<string>
): string | null {
  // Check translation first
  const translated = translations[tigoLabel];
  if (translated && expectedLabels.has(translated)) {
    return translated;
  }

  // Check direct match
  if (expectedLabels.has(tigoLabel)) {
    return tigoLabel;
  }

  return null;
}

/**
 * Find which panel is currently in a slot.
 */
export function findPanelInSlot(
  slotLabel: string,
  discoveredPanels: Record<string, DiscoveredPanel>,
  translations: Record<string, string>
): DiscoveredPanel | null {
  const panels = Object.values(discoveredPanels);

  // Check for panel mapped to this slot via translation
  for (const panel of panels) {
    if (translations[panel.tigo_label] === slotLabel) {
      return panel;
    }
  }

  // Check for panel with direct match (no translation)
  for (const panel of panels) {
    if (panel.tigo_label === slotLabel && !translations[panel.tigo_label]) {
      return panel;
    }
  }

  return null;
}

/**
 * Compute CCA info with assignment counts.
 */
export function computeCCAInfoWithCounts(
  topology: SystemConfig,
  mapping: MappingResult
): CCAInfo[] {
  const ccaInfos = buildCCAInfo(topology);

  for (const cca of ccaInfos) {
    let assigned = 0;
    for (const str of cca.strings) {
      for (const label of str.expectedLabels) {
        if (mapping.assignedSlots.has(label)) {
          assigned++;
        }
      }
    }
    cca.totalAssigned = assigned;
  }

  return ccaInfos;
}

/**
 * Check if a string has any issues (missing or excess panels).
 */
export function stringHasIssues(
  stringInfo: StringInfo,
  mapping: MappingResult,
  discoveredPanels: Record<string, DiscoveredPanel>
): boolean {
  // Check for empty slots in this string
  const hasEmpty = stringInfo.expectedLabels.some(label => !mapping.assignedSlots.has(label));
  if (hasEmpty) return true;

  // Check for excess panels reporting this string (panels like B9, B10 when only B1-B8 expected)
  const panels = Object.values(discoveredPanels);
  const stringPattern = new RegExp(`^${stringInfo.name}(\\d+)$`);

  for (const panel of panels) {
    const match = panel.tigo_label.match(stringPattern);
    if (match) {
      const position = parseInt(match[1], 10);
      if (position > stringInfo.panelCount) {
        return true; // Excess panel found
      }
    }
  }

  return false;
}

/**
 * Get excess panels for a string (panels with higher position than expected).
 * For example, if string B has panel_count=8, B9 and B10 would be excess.
 */
export function getExcessPanelsForString(
  stringInfo: StringInfo,
  discoveredPanels: Record<string, DiscoveredPanel>
): DiscoveredPanel[] {
  const panels = Object.values(discoveredPanels);
  const stringPattern = new RegExp(`^${stringInfo.name}(\\d+)$`);
  const excessPanels: DiscoveredPanel[] = [];

  for (const panel of panels) {
    const match = panel.tigo_label.match(stringPattern);
    if (match) {
      const position = parseInt(match[1], 10);
      if (position > stringInfo.panelCount) {
        excessPanels.push(panel);
      }
    }
  }

  // Sort by position number
  excessPanels.sort((a, b) => {
    const posA = parseInt(a.tigo_label.match(/(\d+)$/)?.[1] || '0', 10);
    const posB = parseInt(b.tigo_label.match(/(\d+)$/)?.[1] || '0', 10);
    return posA - posB;
  });

  return excessPanels;
}
