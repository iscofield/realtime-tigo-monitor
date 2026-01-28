/**
 * Configuration API functions (Phase 1 spec).
 * Handles communication with backend config endpoints.
 */

import type {
  ConfigStatusResponse,
  MQTTConfig,
  SystemConfig,
  Panel,
  MQTTTestResponse,
  ValidationResult,
  CCAConfig,
  DiscoveredPanel,
  PanelsConfig,
  LayoutConfig,
  LayoutImageUploadResponse,
  PanelPosition,
} from '../types/config';

const API_BASE = import.meta.env.VITE_API_BASE || '';

// Generic fetch wrapper with error handling
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Get configuration status (FR-3.1).
 * Checks if config exists, has panels, and if legacy migration is available.
 */
export async function getConfigStatus(): Promise<ConfigStatusResponse> {
  return apiFetch<ConfigStatusResponse>('/api/config/status');
}

/**
 * Get system configuration.
 */
export async function getSystemConfig(): Promise<SystemConfig> {
  return apiFetch<SystemConfig>('/api/config/system');
}

/**
 * Save system configuration.
 */
export async function saveSystemConfig(config: SystemConfig): Promise<void> {
  await apiFetch('/api/config/system', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

/**
 * Get panels configuration.
 */
export async function getPanelsConfig(): Promise<{ panels: Panel[] }> {
  return apiFetch<{ panels: Panel[] }>('/api/config/panels');
}

/**
 * Save panels configuration.
 */
export async function savePanelsConfig(config: PanelsConfig): Promise<void> {
  await apiFetch('/api/config/panels', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

/**
 * Test MQTT connection (FR-3.2).
 */
export async function testMqttConnection(
  config: MQTTConfig
): Promise<MQTTTestResponse> {
  return apiFetch<MQTTTestResponse>('/api/config/mqtt/test', {
    method: 'POST',
    body: JSON.stringify({
      server: config.server,
      port: config.port,
      username: config.username,
      password: config.password,
    }),
  });
}

/**
 * Generate tigo-mqtt config files as ZIP download (FR-2.4).
 */
export async function downloadTigoMqttConfig(
  mqtt: MQTTConfig,
  ccas: CCAConfig[],
  panels?: Panel[]
): Promise<Blob> {
  const url = `${API_BASE}/api/config/generate-tigo-mqtt`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mqtt, ccas, panels }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Download failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Validate discovered panels against topology (FR-5.1, FR-6.3).
 */
export async function validatePanels(
  topology: SystemConfig,
  discoveredPanels: DiscoveredPanel[]
): Promise<ValidationResult> {
  // Backend returns ValidationResponse format, we transform to ValidationResult
  const response = await apiFetch<{
    success: boolean;
    results: Array<{
      status: 'matched' | 'unmatched' | 'possible_wiring_issue';
      tigo_label?: string;
      reported_cca?: string;
      expected_cca?: string;
      panel?: Panel;
    }>;
    summary: {
      total: number;
      matched: number;
      unmatched: number;
      possible_wiring_issues: number;
    };
  }>('/api/config/validate', {
    method: 'POST',
    body: JSON.stringify({
      topology,
      discovered_panels: discoveredPanels.map(p => ({
        serial: p.serial,
        cca: p.cca,
        tigo_label: p.tigo_label,
        watts: p.watts,
        voltage: p.voltage,
      })),
    }),
  });

  // Transform response to ValidationResult format expected by frontend
  const matched: Array<{ serial: string; cca: string; tigo_label: string }> = [];
  const unmatched: Array<{ serial: string; cca: string; tigo_label: string }> = [];
  const wiring_issues: Array<{ serial: string; tigo_label: string; expected_cca: string; actual_cca: string }> = [];

  for (const result of response.results) {
    const item = {
      serial: result.panel?.serial || '',
      cca: result.reported_cca || '',
      tigo_label: result.tigo_label || '',
    };

    if (result.status === 'matched') {
      matched.push(item);
    } else if (result.status === 'possible_wiring_issue') {
      wiring_issues.push({
        serial: item.serial,
        tigo_label: item.tigo_label,
        expected_cca: result.expected_cca || '',
        actual_cca: result.reported_cca || '',
      });
    } else {
      unmatched.push(item);
    }
  }

  // Calculate missing panels by comparing discovered panels against expected topology
  const expectedLabels = new Set<string>();
  for (const cca of topology.ccas) {
    for (const str of cca.strings) {
      for (let i = 1; i <= str.panel_count; i++) {
        expectedLabels.add(`${str.name}${i}`);
      }
    }
  }

  const discoveredLabels = new Set(discoveredPanels.map(p => p.tigo_label));
  const missing = Array.from(expectedLabels).filter(label => !discoveredLabels.has(label));

  return {
    matched,
    unmatched,
    missing,
    wiring_issues,
  };
}

/**
 * Start panel discovery.
 */
export async function startDiscovery(
  mqttHost: string,
  mqttPort: number,
  mqttUsername?: string,
  mqttPassword?: string,
  topicPrefix?: string
): Promise<void> {
  await apiFetch('/api/discovery/start', {
    method: 'POST',
    body: JSON.stringify({
      mqtt_host: mqttHost,
      mqtt_port: mqttPort,
      mqtt_username: mqttUsername,
      mqtt_password: mqttPassword,
      topic_prefix: topicPrefix || 'taptap',
    }),
  });
}

/**
 * Stop panel discovery.
 */
export async function stopDiscovery(): Promise<{ panels_count: number }> {
  return apiFetch<{ panels_count: number }>('/api/discovery/stop', {
    method: 'POST',
  });
}

/**
 * Get discovered panels.
 */
export async function getDiscoveredPanels(): Promise<{
  panels: Array<{
    serial: string;
    cca: string;
    tigo_label: string;
    watts: number;
    voltage: number;
    discovered_at: string;
    last_seen_at: string;
  }>;
  count: number;
}> {
  return apiFetch('/api/discovery/panels');
}

/**
 * Clear discovered panels.
 */
export async function clearDiscoveredPanels(): Promise<void> {
  await apiFetch('/api/discovery/clear', {
    method: 'POST',
  });
}

/**
 * Migrate from legacy JSON config to YAML.
 */
export async function migrateFromLegacy(
  mqttConfig: MQTTConfig
): Promise<{
  success: boolean;
  message: string;
  system: SystemConfig;
  panels_count: number;
}> {
  return apiFetch('/api/config/migrate', {
    method: 'POST',
    body: JSON.stringify(mqttConfig),
  });
}

// Layout Editor API functions (Phase 2)

/**
 * Get layout configuration.
 */
export async function getLayoutConfig(): Promise<LayoutConfig> {
  return apiFetch<LayoutConfig>('/api/layout');
}

/**
 * Payload for updating layout configuration.
 */
export interface LayoutUpdatePayload {
  overlay_size: number;
  image_scale: number;
}

/**
 * Update layout configuration (overlay size and image scale).
 * BREAKING CHANGE: Now accepts config object instead of single number.
 */
export async function updateLayoutConfig(config: LayoutUpdatePayload): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch (error) {
    // Network error (no response received) - preserve original for debugging
    console.error('Network request failed:', error);
    // ES2022 Error cause - supported by all modern browsers (2022+)
    throw new Error('Connection error. Please check your network.', { cause: error });
  }

  if (!response.ok) {
    let message = 'Failed to update layout config';
    try {
      const error = await response.json();
      // Handle FastAPI array format
      const detail = Array.isArray(error.detail)
        ? error.detail.map((e: { msg: string }) => e.msg).join(', ')
        : error.detail;
      message = detail || message;
    } catch {
      // Non-JSON response (e.g., 502 gateway error)
    }
    throw new Error(message);
  }
}

/**
 * Upload layout image.
 */
export async function uploadLayoutImage(
  file: File
): Promise<LayoutImageUploadResponse> {
  const url = `${API_BASE}/api/layout/image`;
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail?.message || errorData.message || `Upload failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get layout image URL.
 */
export function getLayoutImageUrl(): string {
  return `${API_BASE}/api/layout/image`;
}

/**
 * Delete layout image.
 */
export async function deleteLayoutImage(): Promise<void> {
  await apiFetch('/api/layout/image', {
    method: 'DELETE',
  });
}

/**
 * Use the sample layout image.
 */
export async function useSampleImage(): Promise<LayoutImageUploadResponse> {
  return apiFetch<LayoutImageUploadResponse>('/api/layout/image/sample', {
    method: 'POST',
  });
}

/**
 * Update panel positions.
 */
export async function updatePanelPositions(
  positions: Record<string, PanelPosition | null>
): Promise<void> {
  // Get current panels config
  const { panels } = await getPanelsConfig();

  // Update positions
  const updatedPanels = panels.map(panel => ({
    ...panel,
    position: positions[panel.serial] ?? panel.position ?? null,
  }));

  await apiFetch('/api/config/panels', {
    method: 'PUT',
    body: JSON.stringify({ panels: updatedPanels }),
  });
}

/**
 * Reset configuration to factory defaults.
 * Deletes all config files and optionally the layout image.
 */
export async function resetConfig(deleteImage: boolean = true): Promise<{
  success: boolean;
  message: string;
  deleted: {
    system_yaml: boolean;
    panels_yaml: boolean;
    layout_yaml: boolean;
    layout_image: boolean;
  };
}> {
  const url = `${API_BASE}/api/config/reset?delete_image=${deleteImage}`;
  const response = await fetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Reset failed: ${response.status}`);
  }

  return response.json();
}
