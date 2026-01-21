/**
 * Panel mapping components and utilities.
 */

export { DraggablePanel } from './DraggablePanel';
export { DroppableSlot } from './DroppableSlot';
export { StringGroup } from './StringGroup';
export { CCASection } from './CCASection';
export { UnassignedArea } from './UnassignedArea';

export {
  computePanelMapping,
  buildExpectedLabels,
  buildCCAInfo,
  computeCCAInfoWithCounts,
  getCurrentSlotForPanel,
  findPanelInSlot,
  stringHasIssues,
  getExcessPanelsForString,
  UNASSIGNED_MARKER,
} from './computePanelMapping';

export type {
  MappingResult,
  AssignedPanel,
  StringInfo,
  CCAInfo,
} from './computePanelMapping';

export * from './MappingStyles';
