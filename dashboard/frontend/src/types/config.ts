/**
 * Configuration types for multi-user setup (Phase 1 spec).
 * These mirror the backend Pydantic models.
 */

// MQTT broker connection settings
export interface MQTTConfig {
  server: string;
  port: number;
  username?: string;
  password?: string;
}

// A string of panels connected in series
export interface StringConfig {
  name: string;        // 1-2 uppercase letters (A, B, AA)
  panel_count: number;
}

// Configuration for a Tigo CCA device
export interface CCAConfig {
  name: string;           // lowercase alphanumeric + hyphens
  serial_device: string;  // e.g., /dev/ttyACM2
  strings: StringConfig[];
}

// Top-level system configuration
export interface SystemConfig {
  version: number;
  mqtt: MQTTConfig;
  ccas: CCAConfig[];
}

// Panel position as percentages
export interface PanelPosition {
  x_percent: number;
  y_percent: number;
}

// A configured panel with serial and label info
export interface Panel {
  serial: string;
  cca: string;
  string: string;
  tigo_label: string;      // Original Tigo label
  display_label: string;   // User-facing label
  position?: PanelPosition | null;  // Layout position (percentage coordinates)
}

// Legacy panel format (for backward compatibility during Phase 1)
export interface LegacyPanel {
  serial: string;
  cca: string;
  string: string;
  position: number;        // Position in string (1st, 2nd, etc)
  label: string;           // User-facing label
  tigo_label?: string;     // Original Tigo label
}

// A panel discovered via MQTT during setup wizard
export interface DiscoveredPanel {
  serial: string;
  cca: string;
  tigo_label: string;
  watts: number;
  voltage: number;
  discovered_at: string;  // ISO timestamp (added by frontend)
  last_seen_at: string;   // For stale panel detection (added by frontend)
  // Layout position from backup restore (not present during live discovery)
  layout_position?: PanelPosition | null;
}

// WebSocket events emitted during discovery
export interface PanelDiscoveredEvent {
  type: 'panel_discovered';
  data: {
    serial: string;
    cca: string;
    tigo_label: string;
    watts: number;
    voltage: number;
  };
}

export interface PanelUpdatedEvent {
  type: 'panel_updated';
  data: {
    serial: string;
    watts: number;
    voltage: number;
  };
}

export interface ConnectionStatusEvent {
  type: 'connection_status';
  data: {
    status: 'connected' | 'disconnected';
    reason?: string;
  };
}

export interface PingEvent {
  type: 'ping';
}

export type WizardWebSocketEvent =
  | PanelDiscoveredEvent
  | PanelUpdatedEvent
  | ConnectionStatusEvent
  | PingEvent;

// Validation result from backend
export type MatchStatus = 'matched' | 'unmatched' | 'possible_wiring_issue';

export interface MatchResult {
  status: MatchStatus;
  panel?: Panel;
  suggested_label?: string;
  confidence?: 'high' | 'medium' | 'low';
  tigo_label?: string;
  needs_translation?: boolean;
  error?: string;
  reported_cca?: string;
  expected_cca?: string;
  warning?: string;
}

// Wizard step names
export type WizardStep =
  | 'mqtt-config'
  | 'system-topology'
  | 'generate-download'
  | 'discovery'
  | 'validation'
  | 'review-save';

// Wizard state
export interface WizardState {
  currentStep: WizardStep;
  furthestStep: WizardStep;
  mqttConfig: MQTTConfig | null;
  systemTopology: SystemConfig | null;
  discoveredPanels: Record<string, DiscoveredPanel>;
  translations: Record<string, string>;  // tigo_label -> display_label
  validationResults: MatchResult[] | null;
  configDownloaded: boolean;
  // Restore-related fields
  restoredFromBackup: boolean;
  restoreImageToken?: string;
}

// Persisted state wrapper with versioning
export interface PersistedWizardState {
  version: 1;
  state: WizardState;
  savedAt: string;  // ISO timestamp
}

// Config status from backend
export interface ConfigStatusResponse {
  configured: boolean;
  has_panels: boolean;
  legacy_detected: boolean;
  migration_available: boolean;
}

// API error response
export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  details: string[];
}

// MQTT test response
export interface MQTTTestResponse {
  success: boolean;
  error?: string;
  message: string;
}

// Validation response
export interface ValidationSummary {
  total: number;
  matched: number;
  unmatched: number;
  possible_wiring_issues: number;
}

export interface ValidationResponse {
  success: boolean;
  results: MatchResult[];
  summary: ValidationSummary;
}

// Panel match details from validation
export interface MatchedPanel {
  serial: string;
  cca: string;
  tigo_label: string;
}

export interface WiringIssue {
  serial: string;
  tigo_label: string;
  expected_cca: string;
  actual_cca: string;
}

// Detailed validation result from backend
export interface ValidationResult {
  matched: MatchedPanel[];
  unmatched: MatchedPanel[];
  missing: string[];  // Expected labels not found
  wiring_issues: WiringIssue[];
}

// Panels config format
export interface PanelsConfig {
  version: number;
  panels: Panel[];
}

// Layout editor types (Phase 2)

export interface LayoutConfig {
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_hash: string | null;
  aspect_ratio: number | null;
  overlay_size: number;
  last_modified: string | null;
}

export interface LayoutImageMetadata {
  width: number;
  height: number;
  size_bytes: number;
  hash: string;
  aspect_ratio: number;
}

export interface LayoutImageUploadResponse {
  success: boolean;
  metadata: LayoutImageMetadata;
}

// Editor state types
export type EditorMode = 'view' | 'edit';

export interface Point {
  x: number;
  y: number;
}

export interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  position: number;  // x for vertical, y for horizontal
  start: number;
  end: number;
}

export interface SnapResult {
  position: Point;
  guides: AlignmentGuide[];
}

// Draft auto-save
export interface LayoutDraft {
  timestamp: number;
  positions: Record<string, PanelPosition>;
  overlaySize: number;
}

// Edit history for undo/redo
export interface EditHistory {
  states: Record<string, PanelPosition | null>[];
  currentIndex: number;
}

// Backup/Restore types

// Manifest stored in backup ZIP
export interface BackupManifest {
  backup_version: number;
  app_version: string;
  created_at: string;  // ISO timestamp
  panel_count: number;
  has_layout_image: boolean;
  contains_sensitive_data: boolean;
  layout_image_hash?: string;
}

// Data returned from backup restore endpoint
export interface RestoreData {
  success: boolean;
  manifest: BackupManifest;
  system: SystemConfig | null;
  panels: Panel[];
  layout: LayoutConfig | null;
  has_image: boolean;
  image_token?: string;
}

// Image commit response
export interface RestoreImageCommitResponse {
  success: boolean;
  width: number;
  height: number;
  hash: string;
}
