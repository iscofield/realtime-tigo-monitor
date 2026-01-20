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
  position: number;
  label: string;           // User-facing label (display_label)
  tigo_label?: string;     // Original Tigo label (optional after migration)
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
