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

// Build spatial index from positioned panels (buckets in pixel space)
export function buildSpatialIndex(
  panels: EditorPanel[],
  _overlaySize: number,
  excludeSerial?: string,
  imageSize?: { width: number; height: number }
): SpatialIndex {
  const xCenters = new Map<number, EditorPanel[]>();
  const yCenters = new Map<number, EditorPanel[]>();
  const imgWidth = imageSize?.width || 1526;
  const imgHeight = imageSize?.height || 2131;

  for (const panel of panels) {
    if (!panel.position || panel.serial === excludeSerial) continue;

    // Convert percentage to pixels for bucketing
    const pixelX = (panel.position.x_percent / 100) * imgWidth;
    const pixelY = (panel.position.y_percent / 100) * imgHeight;
    const bucketX = Math.round(pixelX / SNAP_THRESHOLD);
    const bucketY = Math.round(pixelY / SNAP_THRESHOLD);

    if (!xCenters.has(bucketX)) xCenters.set(bucketX, []);
    if (!yCenters.has(bucketY)) yCenters.set(bucketY, []);
    xCenters.get(bucketX)!.push(panel);
    yCenters.get(bucketY)!.push(panel);
  }

  return { xCenters, yCenters };
}

// Calculate snap position and guides (all comparisons in pixel space)
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

  // dragPosition is already in pixel space
  const dragX = dragPosition.x;
  const dragY = dragPosition.y;

  // Bucket lookup in pixel space
  const centerXBucket = Math.round(dragX / SNAP_THRESHOLD);
  const centerYBucket = Math.round(dragY / SNAP_THRESHOLD);

  // Check X alignment (vertical guides) - center-to-center in pixels
  for (let b = centerXBucket - 1; b <= centerXBucket + 1; b++) {
    const candidates = spatialIndex.xCenters.get(b) || [];
    for (const panel of candidates) {
      if (panel.serial === draggingPanel.serial || !panel.position) continue;

      const panelX = (panel.position.x_percent / 100) * imageSize.width;
      const xDiff = Math.abs(dragX - panelX);

      if (xDiff < SNAP_THRESHOLD) {
        snappedX = panelX;
        wasSnapped = true;
        const panelY = (panel.position.y_percent / 100) * imageSize.height;
        guides.push({
          type: 'vertical',
          position: panelX,
          start: Math.min(dragY, panelY),
          end: Math.max(dragY + overlaySize, panelY + overlaySize),
        });
        break; // Only snap to one X alignment
      }
    }
  }

  // Check Y alignment (horizontal guides) - center-to-center in pixels
  for (let b = centerYBucket - 1; b <= centerYBucket + 1; b++) {
    const candidates = spatialIndex.yCenters.get(b) || [];
    for (const panel of candidates) {
      if (panel.serial === draggingPanel.serial || !panel.position) continue;

      const panelY = (panel.position.y_percent / 100) * imageSize.height;
      const yDiff = Math.abs(dragY - panelY);

      if (yDiff < SNAP_THRESHOLD) {
        snappedY = panelY;
        wasSnapped = true;
        const panelX = (panel.position.x_percent / 100) * imageSize.width;
        guides.push({
          type: 'horizontal',
          position: panelY,
          start: Math.min(dragX, panelX),
          end: Math.max(dragX + overlaySize, panelX + overlaySize),
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
