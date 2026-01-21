/**
 * Types for the Layout Editor feature (Phase 2).
 */

import type { PanelPosition, AlignmentGuide, Point } from '../../types/config';

// Panel data for editor (minimal version without live data)
export interface EditorPanel {
  serial: string;
  cca: string;
  string: string;
  tigo_label: string;
  display_label: string;
  position: PanelPosition | null;
}

// Spatial index for O(1) snap calculations
export interface SpatialIndex {
  xCenters: Map<number, EditorPanel[]>;
  yCenters: Map<number, EditorPanel[]>;
}

// Snap configuration
export const SNAP_THRESHOLD = 10; // pixels

// Build spatial index from positioned panels
export function buildSpatialIndex(
  panels: EditorPanel[],
  _overlaySize: number,
  excludeSerial?: string
): SpatialIndex {
  const xCenters = new Map<number, EditorPanel[]>();
  const yCenters = new Map<number, EditorPanel[]>();

  for (const panel of panels) {
    if (!panel.position || panel.serial === excludeSerial) continue;

    // Use percentage positions scaled to image coordinates for bucketing
    const centerX = Math.round(panel.position.x_percent / SNAP_THRESHOLD);
    const centerY = Math.round(panel.position.y_percent / SNAP_THRESHOLD);

    if (!xCenters.has(centerX)) xCenters.set(centerX, []);
    if (!yCenters.has(centerY)) yCenters.set(centerY, []);
    xCenters.get(centerX)!.push(panel);
    yCenters.get(centerY)!.push(panel);
  }

  return { xCenters, yCenters };
}

// Calculate snap position and guides
export function calculateSnap(
  draggingPanel: { width: number; height: number; serial?: string },
  dragPosition: Point,
  spatialIndex: SpatialIndex,
  snapEnabled: boolean,
  imageSize: { width: number; height: number },
  overlaySize: number
): { position: Point; guides: AlignmentGuide[]; wasSnapped: boolean } {
  if (!snapEnabled) {
    return { position: dragPosition, guides: [], wasSnapped: false };
  }

  const guides: AlignmentGuide[] = [];
  let snappedX = dragPosition.x;
  let snappedY = dragPosition.y;
  let wasSnapped = false;

  // Convert pixel position to percentage for comparison
  const dragXPercent = (dragPosition.x / imageSize.width) * 100;
  const dragYPercent = (dragPosition.y / imageSize.height) * 100;

  // Bucket lookup
  const centerXBucket = Math.round(dragXPercent / SNAP_THRESHOLD);
  const centerYBucket = Math.round(dragYPercent / SNAP_THRESHOLD);

  // Check X alignment (vertical guides) - center-to-center
  for (let b = centerXBucket - 1; b <= centerXBucket + 1; b++) {
    const candidates = spatialIndex.xCenters.get(b) || [];
    for (const panel of candidates) {
      if (panel.serial === draggingPanel.serial || !panel.position) continue;

      const panelXPercent = panel.position.x_percent;
      const xDiff = Math.abs(dragXPercent - panelXPercent);

      if (xDiff < SNAP_THRESHOLD) {
        snappedX = (panelXPercent / 100) * imageSize.width;
        wasSnapped = true;
        guides.push({
          type: 'vertical',
          position: snappedX,
          start: Math.min(dragPosition.y, (panel.position.y_percent / 100) * imageSize.height),
          end: Math.max(
            dragPosition.y + overlaySize,
            ((panel.position.y_percent / 100) * imageSize.height) + overlaySize
          ),
        });
        break; // Only snap to one X alignment
      }
    }
  }

  // Check Y alignment (horizontal guides) - center-to-center
  for (let b = centerYBucket - 1; b <= centerYBucket + 1; b++) {
    const candidates = spatialIndex.yCenters.get(b) || [];
    for (const panel of candidates) {
      if (panel.serial === draggingPanel.serial || !panel.position) continue;

      const panelYPercent = panel.position.y_percent;
      const yDiff = Math.abs(dragYPercent - panelYPercent);

      if (yDiff < SNAP_THRESHOLD) {
        snappedY = (panelYPercent / 100) * imageSize.height;
        wasSnapped = true;
        guides.push({
          type: 'horizontal',
          position: snappedY,
          start: Math.min(dragPosition.x, (panel.position.x_percent / 100) * imageSize.width),
          end: Math.max(
            dragPosition.x + overlaySize,
            ((panel.position.x_percent / 100) * imageSize.width) + overlaySize
          ),
        });
        break; // Only snap to one Y alignment
      }
    }
  }

  return {
    position: { x: snappedX, y: snappedY },
    guides,
    wasSnapped,
  };
}

// Convert pixel position to percentage
export function pixelToPercent(
  pixelPos: Point,
  imageSize: { width: number; height: number }
): PanelPosition {
  return {
    x_percent: Math.max(0, Math.min(100, (pixelPos.x / imageSize.width) * 100)),
    y_percent: Math.max(0, Math.min(100, (pixelPos.y / imageSize.height) * 100)),
  };
}

// Convert percentage position to pixels
export function percentToPixel(
  percentPos: PanelPosition,
  imageSize: { width: number; height: number }
): Point {
  return {
    x: (percentPos.x_percent / 100) * imageSize.width,
    y: (percentPos.y_percent / 100) * imageSize.height,
  };
}

// String colors for visual grouping
export const STRING_COLORS: Record<string, string> = {
  A: '#4CAF50',
  B: '#2196F3',
  C: '#9C27B0',
  D: '#FF9800',
  E: '#E91E63',
  F: '#00BCD4',
  G: '#8BC34A',
  H: '#FF5722',
  I: '#673AB7',
};

export function getStringColor(stringName: string): string {
  return STRING_COLORS[stringName.toUpperCase()] || '#757575';
}
