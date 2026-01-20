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
  return apiFetch<ValidationResult>('/api/config/validate', {
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
